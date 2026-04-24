import { NextResponse } from "next/server";

// ─── 토큰 캐시 ───────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// ─── 마지막 성공 환율 (실패 시 유지) ────────────────────────────────
let lastRate: number | null = null;
let lastIcon: string = "";

// ─── 토큰 발급 ──────────────────────────────────────────────────────
async function fetchToken(): Promise<string | null> {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;
  if (!appkey || !appsecret) {
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
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return (await fetchToken()) ?? cachedToken;
}

// ─── 아이콘 및 상태 판별 ───────────────────────────────────────────────
function getMarketSession() {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstNow = new Date(now.getTime() + kstOffset * 60_000);
  const hour = kstNow.getUTCHours();
  const min = kstNow.getUTCMinutes();
  const totalMin = hour * 60 + min;
  
  // 주간 장중: 08:45 ~ 15:45
  if (totalMin >= 8 * 60 + 45 && totalMin < 15 * 60 + 45) {
    return { icon: "☀️", session: "DAY_ACTIVE" };
  }
  // 주간 정산: 15:45 ~ 18:00
  if (totalMin >= 15 * 60 + 45 && totalMin < 18 * 60) {
    return { icon: "☀️", session: "DAY_CLOSE" };
  }
  // 야간 장중: 18:00 ~ 06:00 (다음날)
  if (totalMin >= 18 * 60 || totalMin < 6 * 60) {
    return { icon: "🌙", session: "NIGHT_ACTIVE" };
  }
  // 야간 정산: 06:00 ~ 08:45
  return { icon: "🌙", session: "NIGHT_CLOSE" };
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
async function fetchKisRate(token: string): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  // 주간/야간 모두 A75605 (달러선물 5월물) 코드를 사용합니다.
  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "CF");
  url.searchParams.set("FID_INPUT_ISCD", "A75605");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": appkey,
        "appsecret": appsecret,
        "tr_id": "FHMIF10000000",
        "custtype": "P",
      },
      cache: "no-store",
    });
    const data = await res.json();

    if (data?.rt_cd !== "0") {
      console.error("[KIS API Error]", data?.msg1);
      return null;
    }

    // futs_prpr: 현재가
    const price = data?.output1?.futs_prpr;
    if (!price) return null;

    return parseFloat(price);
  } catch (error) {
    console.error("[KIS Fetch Error]", error);
    return null;
  }
}

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
export async function GET() {
  const { icon, session } = getMarketSession();
  
  const token = await getToken();
  if (token) {
    const kisRate = await fetchKisRate(token);
    if (kisRate !== null) {
      lastRate = kisRate;
      lastIcon = icon;
      return NextResponse.json({ 
        rate: kisRate, 
        icon: icon,
        source: "kis",
        session: session,
        timestamp: new Date().toISOString() 
      });
    }
  }

  // KIS 실패 시 폴백
  const fallback = await fetchFallbackRate();
  if (fallback !== null) {
    lastRate = fallback;
    lastIcon = "⚠️";
    return NextResponse.json({ 
      rate: fallback, 
      icon: "⚠️",
      source: "fallback",
      session: session
    });
  }

  // 캐시된 마지막 값 반환
  if (lastRate !== null) {
    return NextResponse.json({ 
      rate: lastRate, 
      icon: lastIcon,
      source: "cached",
      session: session
    });
  }

  return NextResponse.json({ error: "rate unavailable" }, { status: 503 });
}
