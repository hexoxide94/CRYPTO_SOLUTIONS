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
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return (await fetchToken()) ?? cachedToken;
}

// ─── 아이콘 및 상태 판별 ───────────────────────────────────────────────
function getMarketIcon(): string {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstNow = new Date(now.getTime() + kstOffset * 60_000);
  const kstMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  
  // 주간: 08:45 ~ 18:00 (☀️)
  if (kstMin >= 8 * 60 + 45 && kstMin < 18 * 60) {
    return "☀️";
  }
  // 그 외 야간: (🌙)
  return "🌙";
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
async function fetchKisRate(token: string): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  // 달러 선물(A75605)은 상품선물(CF) 마켓 코드를 사용하며, 
  // 야간에도 동일한 시세 조회 TR(FHMIF10000000)을 통해 현재가를 가져올 수 있습니다.
  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "CF");
  url.searchParams.set("FID_INPUT_ISCD", "A75605");

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
  } catch {
    return null;
  }
}

// ─── 폴백: 외부 환율 API (KIS 실패 시) ────────────────────────────────────────
async function fetchFallbackRate(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const data = await res.json();
    return data?.rates?.KRW ?? null;
  } catch {
    return null;
  }
}

// ─── Route Handler ───────────────────────────────────────────────────
export async function GET() {
  const icon = getMarketIcon();
  
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
        timestamp: new Date().toISOString() 
      });
    }
  }

  const fallback = await fetchFallbackRate();
  if (fallback !== null) {
    lastRate = fallback;
    lastIcon = "⚠️";
    return NextResponse.json({ 
      rate: fallback, 
      icon: "⚠️",
      source: "fallback"
    });
  }

  if (lastRate !== null) {
    return NextResponse.json({ 
      rate: lastRate, 
      icon: lastIcon,
      source: "cached"
    });
  }

  return NextResponse.json({ error: "rate unavailable" }, { status: 503 });
}
