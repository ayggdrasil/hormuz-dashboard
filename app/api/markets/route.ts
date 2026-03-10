import { NextRequest, NextResponse } from "next/server";

import { deriveRecommendedKeywords, fetchRelevantMarkets } from "@/lib/polymarket";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 80;

  try {
    const markets = await fetchRelevantMarkets(Number.isFinite(limit) ? limit : 80);
    const recommendedKeywords = deriveRecommendedKeywords(markets, 12);
    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      count: markets.length,
      markets,
      recommendedKeywords,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
