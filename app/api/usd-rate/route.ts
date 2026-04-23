import { NextResponse } from "next/server";

// ─── 토큰 캐시 ───────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// ─── 마지막 성공 환율 (실패 시 유지) ────────────────────────────────
let lastRate: number | null = null;

// ─── 토큰 발급 ──────────────────────────────────────────────────────
async function fetchToken(): Promise<string | null> {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;
  if (!appkey || !appsecret) {
    console.error("[usd-rate] KIS_APP_KEY 또는 KIS_APP_SECRET 없음");
    return null;
  }

  try {
    const res = await fetch(
      "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
      }
    );
    const data = await res.json();
    const token: string | undefined = data?.access_token;
    if (!token) return null;

    cachedToken = token;
    tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return token;
  } catch (e) {
    console.error("[usd-rate] 토큰 발급 예외:", e);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return (await fetchToken()) ?? cachedToken;
}

// ─── 주야간 판별 및 데이터 소스 결정 ─────────────────────────────────────────
function getMarketStatus(): { div: string; isNight: boolean; label: string } {
  const now = new Date();
  const kstOffset = 9 * 60;
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const kstMin = (utcMin + kstOffset) % (24 * 60);
  const kstDay = new Date(now.getTime() + kstOffset * 60_000).getUTCDay();

  const isWeekday = kstDay >= 1 && kstDay <= 5;
  
  // 주간 세션: 09:00 ~ 15:45
  const isDaytime = kstMin >= 9 * 60 && kstMin < 15 * 60 + 45;
  
  // 야간 세션: 18:00 ~ 익일 05:00
  const isNighttime = kstMin >= 18 * 60 || kstMin < 5 * 60;

  if (isWeekday && isDaytime) {
    return { div: "CF", isNight: false, label: "주간 세션" };
  }
  if (isWeekday && isNighttime) {
    return { div: "CF", isNight: true, label: "야간 세션" };
  }
  
  return { div: "CF", isNight: false, label: "장외 (최종가 조회)" };
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
async function fetchKisRate(token: string): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const { div, label } = getMarketStatus();
  const url = new URL(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price"
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", div);
  url.searchParams.set("FID_INPUT_ISCD", "A75605"); // 달러선물 5월물

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey,
        appsecret,
        tr_id: "FHMIF10000000", 
        custtype: "P",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json();

    if (data?.rt_cd !== "0") {
      console.warn(`[usd-rate] KIS 응답 오류: ${data?.msg1}`);
      return null;
    }

    const price = data?.output1?.futs_prpr;
    if (!price) return null;

    return parseFloat(price);
  } catch (e) {
    console.error("[usd-rate] KIS 조회 예외:", e);
    return null;
  }
}

// ─── 폴백: 외부 환율 API (KIS 실패 시) ────────────────────────────────────────
async function fetchFallbackRate(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const data = await res.json();
    return data?.rates?.KRW ?? null;
  } catch (e) {
    return null;
  }
}

// ─── Route Handler ───────────────────────────────────────────────────
export async function GET() {
  const { label } = getMarketStatus();
  
  const token = await getToken();
  if (token) {
    const kisRate = await fetchKisRate(token);
    if (kisRate !== null) {
      lastRate = kisRate;
      return NextResponse.json({ 
        rate: kisRate, 
        source: "kis", 
        status: label,
        timestamp: new Date().toISOString() 
      });
    }
  }

  const fallback = await fetchFallbackRate();
  if (fallback !== null) {
    lastRate = fallback;
    return NextResponse.json({ 
      rate: fallback, 
      source: "fallback", 
      status: "KIS 실패, 외부 환율 사용" 
    });
  }

  if (lastRate !== null) {
    return NextResponse.json({ 
      rate: lastRate, 
      source: "cached", 
      status: "연결 실패, 마지막 값 유지" 
    });
  }

  return NextResponse.json({ error: "rate unavailable" }, { status: 503 });
}
