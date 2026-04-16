import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KIMP-App/1.0)" },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;

    if (price == null) {
      return NextResponse.json({ error: "price not found" }, { status: 404 });
    }

    return NextResponse.json({ price, currency: meta.currency ?? "KRW" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
