// ─── 토큰 캐시 ───────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// ─── 토큰 발급 ──────────────────────────────────────────────────────
export async function fetchKisToken(): Promise<string | null> {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;
  if (!appkey || !appsecret) {
    console.error("[Token Error] API Key/Secret is missing in ENV");
    return null;
  }

  try {
    const res = await fetch(
      "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        },
        body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
      }
    );
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error("[Token Error] HTTP Status:", res.status, errorData);
      return null;
    }

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

export async function getKisToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return (await fetchKisToken()) ?? cachedToken;
}

// ─── 공휴일 목록 (하드코딩) ──────────────────────────────────────────
const KOREAN_HOLIDAYS = [
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날
  "2026-03-02", // 삼일절 대체공휴일
  "2026-05-05", // 어린이날
  "2026-05-25", // 부처님오신날 대체공휴일
  "2026-06-03", // 지방선거
  "2026-08-17", // 광복절 대체공휴일
  "2026-09-24", "2026-09-25", "2026-09-28", // 추석
  "2026-10-05", // 개천절 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25"  // 기독탄신일
];

// ─── 아이콘 및 상태 판별 ───────────────────────────────────────────────
export function getKisMarketInfo() {
  const now = new Date();
  // KST (UTC+9) 계산
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = kstNow.getUTCHours();
  const min = kstNow.getUTCMinutes();
  const day = kstNow.getUTCDay(); // 0: 일, 1: 월, ..., 6: 토
  const totalMin = hour * 60 + min;
  
  const yyyy = kstNow.getUTCFullYear();
  const mm = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstNow.getUTCDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  
  const isHoliday = KOREAN_HOLIDAYS.includes(todayStr);

  // 주간 장중: 월~금 08:45 ~ 15:45
  const isWeekday = day >= 1 && day <= 5 && !isHoliday;
  const isDayActive = isWeekday && (totalMin >= 8 * 60 + 45 && totalMin < 15 * 60 + 45);

  // 야간 장중: 평일(공휴일 포함) 18:00 ~ 다음날 05:00 (휴일 다음날 새벽 05:00)
  // 참고: 한국거래소 파생상품 야간시장은 글로벌 시장 연동이므로, 한국 휴일이라도 열릴 수 있음 (하지만 보통 같이 쉼). 
  // 여기서는 사용자의 요구에 맞게, 주말이나 공휴일에는 직전 야간 종가를 부르도록 CM/NIGHT_CLOSE로 설정.
  const isNightActive = (!isHoliday && day >= 1 && day <= 5 && totalMin >= 18 * 60) || 
                        (day >= 2 && day <= 6 && totalMin < 5 * 60);

  let marketCode = "CF";
  let fidCondMrktDivCode = "J";
  let icon = "☀️";
  let session = "DAY_CLOSE";

  if (isHoliday || day === 0 || day === 6) {
    marketCode = "CM";
    fidCondMrktDivCode = "N";
    icon = "🌙";
    session = "NIGHT_CLOSE";
  } else if (isDayActive) {
    marketCode = "CF";
    fidCondMrktDivCode = "J";
    icon = "☀️";
    session = "DAY_ACTIVE";
  } else if (isNightActive) {
    marketCode = "CM";
    fidCondMrktDivCode = "N";
    icon = "🌙";
    session = "NIGHT_ACTIVE";
  } else {
    if (totalMin >= 15 * 60 + 45 && totalMin < 18 * 60) {
      marketCode = "CF";
      fidCondMrktDivCode = "J";
      icon = "☀️";
      session = "DAY_CLOSE";
    } else {
      marketCode = "CM";
      fidCondMrktDivCode = "N";
      icon = "🌙";
      session = "NIGHT_CLOSE";
    }
  }

  return { marketCode, fidCondMrktDivCode, icon, session };
}

// ─── KIS 달러선물 조회 ───────────────────────────────────────────────
export async function fetchKisRate(token: string, marketCode: string, symbol: string = "A75605"): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketCode);
  url.searchParams.set("FID_INPUT_ISCD", symbol);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": appkey,
        "appsecret": appsecret,
        "tr_id": "FHMIF10000000",
        "custtype": "P",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
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

// ─── KIS 달러선물 과거 데이터 조회 (Daily) ───────────────────────────
export async function fetchKisHistory(token: string, marketCode: string, symbol: string = "A75605", periodCode: "D" | "W" | "M" = "D"): Promise<unknown> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-daily-chartprice");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketCode);
  url.searchParams.set("FID_INPUT_ISCD", symbol); // USD Futures
  url.searchParams.set("FID_PERIOD_DIV_CODE", periodCode);
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": appkey,
        "appsecret": appsecret,
        "tr_id": "FHKIF01010100",
        "custtype": "P",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      cache: "no-store",
    });
    const data = await res.json();

    if (data?.rt_cd !== "0") {
      console.error("[KIS History API Error]", data?.msg1, data?.msg_cd);
      return null;
    }

    return data.output2; // 일별 시세 배열
  } catch (error) {
    console.error("[KIS History Fetch Error]", error);
    return null;
  }
}

// ─── KIS 달러선물 과거 데이터 조회 (Minute) ──────────────────────────
export async function fetchKisMinuteHistory(token: string, marketCode: string, symbol: string = "A75605"): Promise<unknown> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-time-itemchartprice");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketCode);
  url.searchParams.set("FID_INPUT_ISCD", symbol); // USD Futures
  url.searchParams.set("FID_ETC_CLS_CODE", "");
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": appkey,
        "appsecret": appsecret,
        "tr_id": "FHKIF01010200", // Domestic Futures Minute Chart
        "custtype": "P",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      cache: "no-store",
    });
    const data = await res.json();

    if (data?.rt_cd !== "0") {
      console.error("[KIS Minute History API Error]", data?.msg1, data?.msg_cd);
      return null;
    }

    return data.output2; // 분별 시세 배열
  } catch (error) {
    console.error("[KIS Minute History Fetch Error]", error);
    return null;
  }
}
