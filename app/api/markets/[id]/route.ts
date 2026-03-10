import { NextRequest, NextResponse } from "next/server";

import { fetchMarketDetail } from "@/lib/polymarket";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const market = await fetchMarketDetail(id);

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    return NextResponse.json({ updatedAt: new Date().toISOString(), market });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
