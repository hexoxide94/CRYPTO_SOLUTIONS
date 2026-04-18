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
    console.log("[usd-rate] 토큰 발급 요청...");
    const res = await fetch(
      "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
      }
    );
    const data = await res.json();
    console.log(`[usd-rate] 토큰 응답 status:${res.status} rt_cd:${data?.rt_cd ?? "-"}`);
    const token: string | undefined = data?.access_token;
    if (!token) return null;

    cachedToken = token;
    tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    console.log("[usd-rate] 토큰 발급 성공");
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

// ─── 주야간 판별 ─────────────────────────────────────────────────────
function getMarketDiv(): { div: string; label: string } {
  const now = new Date();
  const kstOffset = 9 * 60;
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const kstMin = (utcMin + kstOffset) % (24 * 60);
  const kstDay = new Date(now.getTime() + kstOffset * 60_000).getUTCDay();

  const isWeekday = kstDay >= 1 && kstDay <= 5;
  // 주간: 09:00~15:45 / 야간: 18:00~익일 05:00
  const isDaytime  = kstMin >= 9 * 60 && kstMin < 15 * 60 + 45;
  const isNighttime = kstMin >= 18 * 60 || kstMin < 5 * 60;

  if (isWeekday && isDaytime)   return { div: "F",  label: "주간선물" };
  if (isWeekday && isNighttime) return { div: "NF", label: "야간선물" };
  return { div: "F", label: "장외(주간코드로 최종가 시도)" };
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
async function fetchKisRate(token: string): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const { div, label } = getMarketDiv();
  const url = new URL(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price"
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", div);
  url.searchParams.set("FID_INPUT_ISCD", "DLF");

  console.log(`[usd-rate] KIS 조회 [${label}] ${url.toString()}`);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey,
        appsecret,
        tr_id: "FHKIF03010100",
        custtype: "P",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json();
    console.log(`[usd-rate] KIS 응답 status:${res.status} rt_cd:${data?.rt_cd} msg:${data?.msg1}`);

    if (data?.rt_cd !== "0") {
      console.warn("[usd-rate] KIS rt_cd 비정상, 폴백 시도");
      return null;
    }

    const raw: string | undefined =
      data?.output?.stck_prpr ?? data?.output?.last ?? data?.output?.prpr;
    console.log(`[usd-rate] KIS 현재가 필드: ${raw}`);
    if (!raw) return null;

    const rate = parseFloat(raw);
    return isNaN(rate) ? null : rate;
  } catch (e) {
    console.error("[usd-rate] KIS 조회 예외:", e);
    return null;
  }
}

// ─── 폴백: open.er-api.com ───────────────────────────────────────────
async function fetchFallbackRate(): Promise<number | null> {
  try {
    console.log("[usd-rate] 폴백 환율 조회 (open.er-api.com)...");
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const data = await res.json();
    const krw: number | undefined = data?.rates?.KRW;
    if (krw) console.log(`[usd-rate] 폴백 환율: ${krw}`);
    return krw ?? null;
  } catch (e) {
    console.error("[usd-rate] 폴백 환율 예외:", e);
    return null;
  }
}

// ─── Route Handler ───────────────────────────────────────────────────
export async function GET() {
  console.log("[usd-rate] GET 요청 수신");

  // 1. KIS 달러선물 시도
  const token = await getToken();
  if (token) {
    const kisRate = await fetchKisRate(token);
    if (kisRate !== null) {
      lastRate = kisRate;
      return NextResponse.json({ rate: kisRate, source: "kis", cached: false });
    }
  }

  // 2. 폴백: open.er-api.com
  const fallback = await fetchFallbackRate();
  if (fallback !== null) {
    lastRate = fallback;
    return NextResponse.json({ rate: fallback, source: "fallback", cached: false });
  }

  // 3. 이전 캐싱값 유지
  if (lastRate !== null) {
    return NextResponse.json({ rate: lastRate, source: "cached", cached: true });
  }

  return NextResponse.json({ error: "rate unavailable" }, { status: 503 });
}
