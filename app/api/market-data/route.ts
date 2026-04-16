import { NextResponse } from "next/server";

// TopBar는 이제 WebSocket을 직접 사용하므로 이 Route는 fallback 용도
export async function GET() {
  try {
    const [coinoneRes, fxRes] = await Promise.all([
      fetch("https://api.coinone.co.kr/public/v2/orderbook/KRW/USDT?size=5", {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KIMP-App/1.0)" },
      }),
      fetch("https://open.er-api.com/v6/latest/USD", {
        cache: "no-store",
      }),
    ]);

    const coinoneText = await coinoneRes.text();
    const fxText      = await fxRes.text();

    console.log("[market-data] Coinone HTTP status:", coinoneRes.status);
    console.log("[market-data] Coinone raw (first 300):", coinoneText.slice(0, 300));
    console.log("[market-data] FX HTTP status:", fxRes.status);

    const coinoneData = JSON.parse(coinoneText);
    const fxData      = JSON.parse(fxText);

    const asks = coinoneData.asks ?? coinoneData.sell_price_array ?? [];
    const bids = coinoneData.bids ?? coinoneData.buy_price_array  ?? [];

    console.log("[market-data] asks[0]:", asks[0]);
    console.log("[market-data] bids[0]:", bids[0]);

    const bestAsk = parseFloat(asks[0]?.price ?? asks[0]?.ask_price ?? "0");
    const bestBid = parseFloat(bids[0]?.price ?? bids[0]?.bid_price ?? "0");
    const usdKrw: number = fxData.rates?.KRW ?? 0;

    console.log("[market-data] 결과 → bestAsk:", bestAsk, "bestBid:", bestBid, "usdKrw:", usdKrw);

    return NextResponse.json({ bestAsk, bestBid, usdKrw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    console.error("[market-data] 오류:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
