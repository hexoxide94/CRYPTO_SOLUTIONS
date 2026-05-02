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

// ─── 아이콘 및 상태 판별 ───────────────────────────────────────────────
export function getKisMarketInfo() {
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
export async function fetchKisRate(token: string, marketCode: string): Promise<number | null> {
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;

  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price");
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
