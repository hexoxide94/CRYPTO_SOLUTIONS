import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "q required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR&quotesCount=10&newsCount=0`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KIMP-App/1.0)" },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) throw new Error(`Yahoo Finance search HTTP ${res.status}`);

    const data = await res.json();
    const quotes: { symbol: string; shortname?: string; longname?: string }[] =
      data?.quotes ?? [];

    // KOSPI(.KS) 또는 KOSDAQ(.KQ) 종목 우선
    const krStock = quotes.find(
      (q) => q.symbol.endsWith(".KS") || q.symbol.endsWith(".KQ")
    );

    if (!krStock) {
      return NextResponse.json(
        { error: "종목을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      symbol: krStock.symbol,
      name: krStock.longname ?? krStock.shortname ?? krStock.symbol,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
