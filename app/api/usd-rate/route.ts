import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { getKisToken, getKisMarketInfo, fetchKisRate } from "@/lib/kis";

// ─── 토큰 캐시 ───────────────────────────────────────────────────────
// (moved to lib/kis.ts)

// ─── 마지막 성공 환율 (실패 시 유지) ────────────────────────────────
let lastRate: number | null = null;
let lastIcon: string = "";

// ─── 폴백: 외부 환율 API (KIS 실패 시) ────────────────────────────────────────
async function fetchFallbackRate(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const data = await res.json();
    return data?.rates?.KRW ?? null;
  } catch (error) {
    console.error("[Fallback Fetch Error]", error);
    return null;
  }
}

// ─── Route Handler ───────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "A75605";
  
  const { marketCode, icon, session } = getKisMarketInfo();

  try {
    const token = await getKisToken();
    if (token) {
      const kisRate = await fetchKisRate(token, marketCode, symbol);
      if (kisRate !== null) {
        lastRate = kisRate;
        lastIcon = icon;
        return NextResponse.json({
          rate: kisRate,
          icon: icon,
          source: "kis",
          session: session,
          marketCode: marketCode,
          symbol: symbol,
          timestamp: new Date().toISOString()
        });
      }
    }

    // KIS 실패 시 (토큰 없거나 호출 실패) 폴백 시도
    console.warn("[KIS Failed] Attempting fallback to er-api...");
    const fallback = await fetchFallbackRate();
    if (fallback !== null) {
      lastRate = fallback;
      lastIcon = "⚠️";
      return NextResponse.json({
        rate: fallback,
        icon: "⚠️",
        source: "fallback",
        session: session,
        marketCode: marketCode
      });
    }

    // 캐시된 마지막 값 반환
    if (lastRate !== null) {
      return NextResponse.json({
        rate: lastRate,
        icon: lastIcon,
        source: "cached",
        session: session,
        marketCode: marketCode
      });
    }

    return NextResponse.json({
      error: "rate unavailable",
      diagnostics: {
        token_present: !!token,
        kis_rate: null,
        fallback_rate: null
      }
    }, { status: 503 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[USD Rate Route Error]", errorMessage);
    return NextResponse.json({
      error: errorMessage || "Internal Server Error",
      source: "error_handler"
    }, { status: 500 });
  }
}
