import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
    console.error("[Token Error] API Key/Secret is missing in ENV");
    return null;
  }

  try {
    const res = await fetch(
      "https://openapi.koreainvestment.com/oauth2/tokenP",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
      }
    );
    const data = await res.json();
    const token: string | undefined = data?.access_token;
    if (!token) {
      console.error("[Token Error] Failed to get access_token:", data);
      return null;
    }

    cachedToken = token;
    tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return token;
  } catch (error) {
    console.error("[Token Fetch Error]", error);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return (await fetchToken()) ?? cachedToken;
}

// ─── 아이콘 및 상태 판별 ───────────────────────────────────────────────
function getMarketInfo() {
  const now = new Date();
  // KST (UTC+9) 계산
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = kstNow.getUTCHours();
  const min = kstNow.getUTCMinutes();
  const day = kstNow.getUTCDay(); // 0: 일, 1: 월, ..., 6: 토
  const totalMin = hour * 60 + min;

  // 주간 장중: 월~금 08:45 ~ 15:45
  const isWeekday = day >= 1 && day <= 5;
  const isDayActive = isWeekday && (totalMin >= 8 * 60 + 45 && totalMin < 15 * 60 + 45);
  
  // 야간 장중: 월~금 18:00 ~ 다음날 05:00 (토요일 새벽 05:00 포함)
  const isNightActive = (isWeekday && totalMin >= 18 * 60) || (day >= 2 && day <= 6 && totalMin < 5 * 60);

  let marketCode = "CF";
  let icon = "☀️";
  let session = "DAY_CLOSE";

  if (isDayActive) {
    marketCode = "CF";
    icon = "☀️";
    session = "DAY_ACTIVE";
  } else if (isNightActive) {
    marketCode = "CM";
    icon = "🌙";
    session = "NIGHT_ACTIVE";
  } else {
    // 장외 시간대: 가장 최근에 끝난 장의 코드를 선택
    if (isWeekday && totalMin >= 15 * 60 + 45 && totalMin < 18 * 60) {
      marketCode = "CF";
      icon = "☀️";
      session = "DAY_CLOSE";
    } else {
      marketCode = "CM";
      icon = "🌙";
      session = "NIGHT_CLOSE";
    }
  }

  return { marketCode, icon, session };
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
async function fetchKisRate(token: string, marketCode: string): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const url = new URL("https://openapi.koreainvestment.com/uapi/domestic-futureoption/v1/quotations/inquire-price");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketCode);
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
      console.error("[KIS API Error]", data?.msg1, data?.msg_cd);
      return null;
    }

    const price = data?.output1?.futs_prpr;
    if (!price) {
      console.warn("[KIS Data Warning] Empty price in output1:", data?.output1);
      return null;
    }

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
  const { marketCode, icon, session } = getMarketInfo();
  
  try {
    const token = await getToken();
    if (!token) {
      throw new Error("Failed to authenticate with KIS (Token is null)");
    }

    const kisRate = await fetchKisRate(token, marketCode);
    if (kisRate !== null) {
      lastRate = kisRate;
      lastIcon = icon;
      return NextResponse.json({ 
        rate: kisRate, 
        icon: icon,
        source: "kis",
        session: session,
        marketCode: marketCode,
        timestamp: new Date().toISOString() 
      });
    }

    // KIS 실패 시 폴백
    console.warn("[KIS Fetch Failed] Attempting fallback to er-api...");
    const fallback = await fetchFallbackRate();
    if (fallback !== null) {
      lastRate = fallback;
      lastIcon = "⚠️";
      return NextResponse.json({ 
        rate: fallback, 
        icon: "⚠️",
        source: "fallback",
        session: session,
        marketCode: marketCode
      });
    }

    // 캐시된 마지막 값 반환
    if (lastRate !== null) {
      return NextResponse.json({ 
        rate: lastRate, 
        icon: lastIcon,
        source: "cached",
        session: session,
        marketCode: marketCode
      });
    }

    return NextResponse.json({ 
      error: "rate unavailable",
      diagnostics: {
        token_valid: !!token,
        kis_rate: null,
        fallback_rate: null
      }
    }, { status: 503 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[USD Rate Route Error]", errorMessage);
    return NextResponse.json({ 
      error: errorMessage || "Internal Server Error",
      source: "error_handler"
    }, { status: 500 });
  }
}
