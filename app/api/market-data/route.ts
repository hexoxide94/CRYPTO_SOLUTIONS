import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [coinoneRes, fxRes] = await Promise.all([
      fetch("https://api.coinone.co.kr/public/v2/orderbook/KRW/USDT?size=1", {
        next: { revalidate: 0 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KIMP-App/1.0)" },
      }),
      fetch("https://open.er-api.com/v6/latest/USD", {
        next: { revalidate: 0 },
      }),
    ]);

    const [coinoneData, fxData] = await Promise.all([
      coinoneRes.json(),
      fxRes.json(),
    ]);

    const bestAsk = parseFloat(coinoneData.asks?.[0]?.price ?? "0");
    const bestBid = parseFloat(coinoneData.bids?.[0]?.price ?? "0");
    const usdKrw: number = fxData.rates?.KRW ?? 0;

    return NextResponse.json({ bestAsk, bestBid, usdKrw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
