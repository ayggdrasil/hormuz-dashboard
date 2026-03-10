import { NextRequest, NextResponse } from "next/server";

import { IntelCategory, IntelEvent } from "@/lib/types";
import { fetchIntelEvents } from "@/lib/intel";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_MS = 55_000;
const CACHE_FETCH_LIMIT = 500;
const MIN_ACCEPTABLE_EVENTS = 80;

let intelCache: {
  updatedAtMs: number;
  events: IntelEvent[];
} = {
  updatedAtMs: 0,
  events: [],
};

function parseCategories(param: string | null): IntelCategory[] {
  if (!param) {
    return [];
  }

  return param
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value): value is IntelCategory =>
      ["attack", "statement", "casualties", "aviation", "port", "war", "oil"].includes(value),
    );
}

function parseSince(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return null;
  }

  return ms;
}

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get("limit");
  const categories = parseCategories(request.nextUrl.searchParams.get("categories"));
  const sinceMs = parseSince(request.nextUrl.searchParams.get("since"));
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 500;

  try {
    const normalizedLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 500));

    if (Date.now() - intelCache.updatedAtMs > CACHE_TTL_MS || intelCache.events.length === 0) {
      const events = await fetchIntelEvents(CACHE_FETCH_LIMIT);
      const shouldKeepPrevious =
        intelCache.events.length >= MIN_ACCEPTABLE_EVENTS && events.length < MIN_ACCEPTABLE_EVENTS;
      if (!shouldKeepPrevious) {
        intelCache = {
          updatedAtMs: Date.now(),
          events,
        };
      }
    }

    const filteredByCategory =
      categories.length > 0
        ? intelCache.events.filter((event) =>
            categories.some((category) => event.categories.includes(category)),
          )
        : intelCache.events;

    const filtered =
      sinceMs === null
        ? filteredByCategory
        : filteredByCategory.filter((event) => Date.parse(event.publishedAt) > sinceMs);
    const ordered = [...filtered].sort((a, b) => {
      const aIsOilSnapshot = a.source === "Stooq" && a.queryBucket === "oil";
      const bIsOilSnapshot = b.source === "Stooq" && b.queryBucket === "oil";
      if (aIsOilSnapshot !== bIsOilSnapshot) {
        return aIsOilSnapshot ? 1 : -1;
      }
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });
    const limited = ordered.slice(0, normalizedLimit);

    return NextResponse.json({
      updatedAt: new Date(intelCache.updatedAtMs).toISOString(),
      mode: sinceMs === null ? "snapshot" : "incremental",
      totalCount: filteredByCategory.length,
      count: limited.length,
      events: limited,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
