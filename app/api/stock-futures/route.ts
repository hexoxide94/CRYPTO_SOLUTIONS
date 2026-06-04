import { NextResponse } from "next/server";
import { getKisToken, getKisMarketInfo, fetchKisRate, fetchKisStockPrice } from "@/lib/kis";
import { getFuturesMonths } from "@/lib/futures";

export const dynamic = "force-dynamic";

async function fetchFallbackRate(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const data = await res.json();
    return data?.rates?.KRW ?? null;
  } catch (error) {
    console.error("[Fallback USD Fetch Error]", error);
    return null;
  }
}

async function fetchYahooStockPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KIMP-App/1.0)" },
        next: { revalidate: 10 } // 10 seconds cache
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch (error) {
    console.error(`[Yahoo Stock Fetch Error] ${symbol}:`, error);
    return null;
  }
}

async function fetchYahooStockData(symbol: string): Promise<{ price: number; changePercent: number } | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KIMP-App/1.0)" },
        next: { revalidate: 30 } // 30 seconds cache
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? 0;
    const prevClose = meta?.chartPreviousClose ?? 0;
    const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    return { price, changePercent };
  } catch (error) {
    console.error(`[Yahoo Stock Data Fetch Error] ${symbol}:`, error);
    return null;
  }
}

async function fetchGateTickers(): Promise<Record<string, { last: number; fundingRate: number }> | null> {
  try {
    const res = await fetch("https://api.gateio.ws/api/v4/futures/usdt/tickers", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result: Record<string, { last: number; fundingRate: number }> = {};
    if (Array.isArray(data)) {
      data.forEach((ticker: { contract: string; last?: string; funding_rate?: string }) => {
        if (["SAMSUNG_USDT", "SKHYNIX_USDT", "HYUNDAI_USDT"].includes(ticker.contract)) {
          result[ticker.contract] = {
            last: parseFloat(ticker.last ?? "0"),
            fundingRate: parseFloat(ticker.funding_rate ?? "0"),
          };
        }
      });
    }
    return result;
  } catch (error) {
    console.error("[Gate Tickers Fetch Error]:", error);
    return null;
  }
}

export async function GET() {
  const { marketCode } = getKisMarketInfo();
  const usdSymbol = getFuturesMonths().currentSymbol;

  try {
    // 1. KIS 토큰 가져오기
    const token = await getKisToken();

    // 2. 환율 가져오기
    let usdRate: number | null = null;
    if (token) {
      usdRate = await fetchKisRate(token, marketCode, usdSymbol);
    }
    if (usdRate === null) {
      usdRate = await fetchFallbackRate();
    }
    if (usdRate === null) {
      usdRate = 1380; // 최종 폴백 값
    }

    // 3. 국내 주가 및 Gate 선물 시세 병렬 조회
    const stocksToFetch = [
      { name: "삼성전자", kisSymbol: "005930", yahooSymbol: "005930.KS", contract: "SAMSUNG_USDT" },
      { name: "SK하이닉스", kisSymbol: "000660", yahooSymbol: "000660.KS", contract: "SKHYNIX_USDT" },
      { name: "현대차", kisSymbol: "005380", yahooSymbol: "005380.KS", contract: "HYUNDAI_USDT" }
    ];

    const [gateTickers, ewyData, muData, ...stockPrices] = await Promise.all([
      fetchGateTickers(),
      fetchYahooStockData("EWY"),
      fetchYahooStockData("MU"),
      ...stocksToFetch.map(async (s) => {
        let price: number | null = null;
        if (token) {
          price = await fetchKisStockPrice(token, s.kisSymbol);
        }
        if (price === null) {
          // KIS 실패 시 Yahoo Finance 폴백
          price = await fetchYahooStockPrice(s.yahooSymbol);
        }
        return price;
      })
    ]);

    const items = stocksToFetch.map((s, idx) => {
      const stockPrice = stockPrices[idx] ?? 0;
      const ticker = gateTickers?.[s.contract];
      const futuresPrice = ticker?.last ?? 0;
      const fundingRate = ticker?.fundingRate ?? 0;

      // 괴리율 계산: (선물 가격 * 환율 / 실제 주가) - 1
      const discrepancy = stockPrice > 0 && futuresPrice > 0 && usdRate !== null
        ? (futuresPrice * usdRate) / stockPrice - 1
        : 0;

      return {
        name: s.name,
        symbol: s.kisSymbol,
        gateContract: s.contract,
        stockPrice,
        futuresPrice,
        fundingRate,
        discrepancy
      };
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      usdRate,
      references: {
        EWY: ewyData,
        MU: muData
      },
      items
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
