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
  } catch (e) {
    console.error("[usd-rate] 토큰 발급 예외:", e);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return (await fetchToken()) ?? cachedToken;
}

// ─── 세션 및 아이콘 판별 ───────────────────────────────────────────────
// 주간: 08:45 ~ 15:45 (☀️)
// 주간이후: 15:45 ~ 18:00 (☀️ 종가)
// 야간: 18:00 ~ 06:00 (🌙)
// 야간이후: 06:00 ~ 08:45 (🌙 종가)
function getSessionInfo(): { 
  div: string; 
  tr_id: string; 
  url: string; 
  icon: string; 
  label: string; 
} {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstNow = new Date(now.getTime() + kstOffset * 60_000);
  const kstMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const kstDay = kstNow.getUTCDay(); // 0(일)~6(토)

  const isWeekend = kstDay === 0 || kstDay === 6;

  // 세션 판별
  if (isWeekend) {
    return {
      div: "CF",
      tr_id: "FHMIF10000000",
      url: "/uapi/domestic-futureoption/v1/quotations/inquire-price",
      icon: "🌙",
      label: "주말 (야간 종가)",
    };
  }

  // 주간: 08:45 ~ 15:45
  if (kstMin >= 8 * 60 + 45 && kstMin < 15 * 60 + 45) {
    return {
      div: "CF",
      tr_id: "FHMIF10000000",
      url: "/uapi/domestic-futureoption/v1/quotations/inquire-price",
      icon: "☀️",
      label: "주간 세션",
    };
  }
  
  // 주간 이후: 15:45 ~ 18:00
  if (kstMin >= 15 * 60 + 45 && kstMin < 18 * 60) {
    return {
      div: "CF",
      tr_id: "FHMIF10000000",
      url: "/uapi/domestic-futureoption/v1/quotations/inquire-price",
      icon: "☀️",
      label: "주간 종료 (종가)",
    };
  }

  // 야간: 18:00 ~ 06:00 (익일 포함)
  if (kstMin >= 18 * 60 || kstMin < 6 * 60) {
    return {
      div: "N", // 야간 세션 마켓 코드
      tr_id: "FHCKF04010100", // 야간 선물 현재가 조회
      url: "/uapi/domestic-futureoption/v1/quotations/ngt-inquire-price",
      icon: "🌙",
      label: "야간 세션",
    };
  }

  // 야간 이후: 06:00 ~ 08:45
  return {
    div: "N",
    tr_id: "FHCKF04010100",
    url: "/uapi/domestic-futureoption/v1/quotations/ngt-inquire-price",
    icon: "🌙",
    label: "야간 종료 (종가)",
  };
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
async function fetchKisRate(token: string): Promise<{ rate: number; icon: string } | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const { div, tr_id, url, icon, label } = getSessionInfo();
  
  const targetUrl = new URL(`https://openapi.koreainvestment.com:9443${url}`);
  targetUrl.searchParams.set("FID_COND_MRKT_DIV_CODE", div);
  targetUrl.searchParams.set("FID_INPUT_ISCD", "A75605");

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey,
        appsecret,
        tr_id: tr_id,
        custtype: "P",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json();

    if (data?.rt_cd !== "0") {
      console.warn(`[usd-rate] KIS 응답 오류 [${label}]: ${data?.msg1}`);
      return null;
    }

    // 야간 현재가와 주간 현재가의 데이터 구조가 약간 다를 수 있음
    // 주간: output1.futs_prpr
    // 야간: output.futs_prpr (또는 stck_prpr)
    const price = data?.output1?.futs_prpr || data?.output?.futs_prpr || data?.output?.stck_prpr;
    if (!price) {
        console.warn(`[usd-rate] 가격 필드 없음 [${label}]:`, data?.output1 || data?.output);
        return null;
    }

    return { rate: parseFloat(price), icon };
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
  const token = await getToken();
  if (token) {
    const kisData = await fetchKisRate(token);
    if (kisData !== null) {
      lastRate = kisData.rate;
      lastIcon = kisData.icon;
      return NextResponse.json({ 
        rate: kisData.rate, 
        icon: kisData.icon,
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
      source: "fallback", 
      status: "KIS 실패" 
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
