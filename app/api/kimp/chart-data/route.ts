import { NextResponse } from "next/server";
import { getKisToken, fetchKisHistory, fetchKisMinuteHistory, getKisMarketInfo } from "@/lib/kis";

export const dynamic = "force-dynamic";

interface KisDailyData {
  stck_bsop_date: string;
  futs_prpr: string;
}

interface KisMinuteData {
  data_hour: string;
  futs_prpr: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "1w";

  try {
    const token = await getKisToken();
    if (!token) throw new Error("KIS token failed");

    const { marketCode } = getKisMarketInfo();

    // 1. 기간별 Coinone 및 KIS 파라미터 설정
    let coinoneInterval = "1h";
    let coinoneSize = 200;
    let useMinuteKis = false;

    if (range === "1d") {
      coinoneInterval = "30m";
      coinoneSize = 48;
      useMinuteKis = true;
    } else if (range === "3d") {
      coinoneInterval = "1h";
      coinoneSize = 72;
      useMinuteKis = true;
    } else if (range === "1w") {
      coinoneInterval = "4h";
      coinoneSize = 42;
    } else if (range === "2w") {
      coinoneInterval = "4h";
      coinoneSize = 84;
    } else if (range === "1m") {
      coinoneInterval = "1d";
      coinoneSize = 31;
    } else {
      coinoneInterval = "1d";
      coinoneSize = 200;
    }

    // 2. 병렬 데이터 페칭
    const coinoneUrl = `https://api.coinone.co.kr/public/v2/chart/KRW/USDC?interval=${coinoneInterval}&size=${coinoneSize}`;
    
    const [coinoneRes, kisHistory] = await Promise.all([
      fetch(coinoneUrl, { cache: "no-store" }),
      useMinuteKis 
        ? fetchKisMinuteHistory(token, marketCode) as Promise<KisMinuteData[]>
        : fetchKisHistory(token, marketCode, "D") as Promise<KisDailyData[]>
    ]);

    if (!coinoneRes.ok) throw new Error("Coinone API failed");
    const coinoneData = await coinoneRes.json();
    if (coinoneData.result !== "success") throw new Error("Coinone data error");

    const marketCandles = (coinoneData.chart as { timestamp: string; close: string }[]) || [];
    const kisData = kisHistory || [];

    // 3. 데이터 매칭 및 김프 계산
    const chartData = marketCandles.map((c) => {
      const ts = Number(c.timestamp) * 1000; // 초 단위를 밀리초로 변환
      const domesticPrice = parseFloat(c.close);
      
      let overseasPrice = 0;

      if (useMinuteKis) {
        const targetTime = new Date(ts).getHours() * 100 + new Date(ts).getMinutes();
        const minData = kisData as KisMinuteData[];
        const closest = minData.reduce((prev: KisMinuteData | null, curr: KisMinuteData) => {
          const currTime = parseInt(curr.data_hour.slice(0, 4));
          const prevTime = prev ? parseInt(prev.data_hour.slice(0, 4)) : -1;
          return Math.abs(currTime - targetTime) < Math.abs(prevTime - targetTime) ? curr : prev;
        }, null);
        overseasPrice = closest ? parseFloat(closest.futs_prpr) : 0;
      } else {
        const dailyData = kisData as KisDailyData[];
        const targetDate = new Date(ts).toISOString().split('T')[0].replace(/-/g, '');
        const match = dailyData.find((k) => k.stck_bsop_date === targetDate);
        overseasPrice = match ? parseFloat(match.futs_prpr) : 0;
      }

      // 만약 해외 가격을 못 찾았다면, 전체 데이터 중 가장 가까운 시점의 가격을 폴백으로 사용
      if (!overseasPrice && kisData.length > 0) {
        overseasPrice = parseFloat((kisData[0] as KisDailyData).futs_prpr);
      }

      const kimp = overseasPrice > 0 ? ((domesticPrice / overseasPrice) - 1) * 100 : 0;

      return {
        timestamp: ts,
        kimp: parseFloat(kimp.toFixed(4)),
        domestic: domesticPrice,
        overseas: overseasPrice,
      };
    });

    return NextResponse.json({ chartData });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Chart Data API Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
