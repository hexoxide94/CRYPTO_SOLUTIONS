import { NextResponse } from "next/server";

let lastRate: number | null = null;

export async function GET() {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

    const data = await res.json();
    const rate: number | undefined =
      data?.chart?.result?.[0]?.meta?.regularMarketPrice;

    if (typeof rate === "number" && !isNaN(rate)) {
      lastRate = rate;
      return NextResponse.json({ rate, source: "yahoo" });
    }

    throw new Error("regularMarketPrice 없음");
  } catch (e) {
    console.error("[usd-rate]", e);

    if (lastRate !== null) {
      return NextResponse.json({ rate: lastRate, source: "cached" });
    }

    return NextResponse.json({ error: "rate unavailable" }, { status: 503 });
  }
}
