import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getKisToken, getKisMarketInfo, fetchKisRate } from "@/lib/kis";

export const dynamic = "force-dynamic";

// 텔레그램 알림 발송 함수
async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error("[Telegram] 환경변수 누락");
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Telegram] 전송 실패: ${error}`);
  }
}

export async function GET(request: Request) {
  // 1. Cron 인증 검증
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error("[KIMP Alerts] 인증 실패: CRON_SECRET 불일치");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. 활성화된 알림 가져오기 (캐시 방지를 위해 랜덤 쿼리 추가 효과)
    console.log(`[KIMP Alerts] 작업 시작: ${new Date().toISOString()}`);
    const { data: alerts, error } = await supabase
      .from("kimp_alerts")
      .select("*")
      .eq("enabled", true)
      .neq("id", "cache-buster-" + Date.now()); // 캐시 방지용 무의미한 조건

    if (error) {
      console.error("[KIMP Alerts] DB 조회 에러:", error);
      return NextResponse.json({ error: "DB Error" }, { status: 500 });
    }

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ message: "활성화된 알림 없음" });
    }

    // 3. 한투 API USD 환율 조회
    const { marketCode } = getKisMarketInfo();
    const token = await getKisToken();
    if (!token) {
      return NextResponse.json({ error: "KIS Token 발급 실패" }, { status: 500 });
    }
    const usd = await fetchKisRate(token, marketCode);
    if (!usd) {
      return NextResponse.json({ error: "KIS USD 조회 실패" }, { status: 500 });
    }

    // 4. 코인원 REST API USDC 호가 조회 (TopBar와 동일 기준)
    const coinoneRes = await fetch("https://api.coinone.co.kr/public/v2/orderbook/KRW/USDC", { cache: "no-store" });
    if (!coinoneRes.ok) {
      return NextResponse.json({ error: "Coinone API 실패" }, { status: 500 });
    }
    const coinoneData = await coinoneRes.json();
    if (coinoneData.result !== "success" || !coinoneData.bids?.[0] || !coinoneData.asks?.[0]) {
      return NextResponse.json({ error: "Coinone 데이터 이상" }, { status: 500 });
    }
    
    const bestBid = parseFloat(coinoneData.bids[0].price);
    const bestAsk = parseFloat(coinoneData.asks[0].price);

    // 5. 각각의 김프 계산 (매수/매도 호가 기준)
    const kimpPctBid = (bestBid / usd - 1) * 100;
    const kimpDiffBid = bestBid - usd;
    const kimpPctAsk = (bestAsk / usd - 1) * 100;
    const kimpDiffAsk = bestAsk - usd;
    
    const now = Date.now();
    let triggeredCount = 0;

    // 6. 각 알림 조건 검사
    for (const alert of alerts) {
      // 쿨다운 검사
      if (alert.last_triggered_at) {
        const lastTriggered = new Date(alert.last_triggered_at).getTime();
        const intervalMs = (alert.interval_minutes || 5) * 60 * 1000;
        if (now - lastTriggered < intervalMs) continue;
      }

      const targetValue = Number(alert.value);
      let conditionMet = false;
      let currentPct = 0;
      let currentDiff = 0;

      if (alert.condition_type === "gte") {
        currentPct = kimpPctBid;
        currentDiff = kimpDiffBid;
        conditionMet = (alert.type === "percent" ? kimpPctBid : kimpDiffBid) >= targetValue;
      } else {
        currentPct = kimpPctAsk;
        currentDiff = kimpDiffAsk;
        conditionMet = (alert.type === "percent" ? kimpPctAsk : kimpDiffAsk) <= targetValue;
      }

      if (conditionMet) {
        // 1회성인 경우 발송 전에 먼저 DB에서 끈다 (중복 발송 방지)
        if (!alert.is_recurring) {
          const { error: updErr } = await supabase
            .from("kimp_alerts")
            .update({ enabled: false, last_triggered_at: new Date().toISOString() })
            .eq("id", alert.id);
          if (updErr) {
            console.error(`[KIMP Alerts] 비활성화 실패 (ID: ${alert.id}):`, updErr);
            continue; // DB 업데이트 실패 시 발송하지 않음 (안전제일)
          }
        } else {
          // 반복 알림인 경우 시간만 갱신
          await supabase
            .from("kimp_alerts")
            .update({ last_triggered_at: new Date().toISOString() })
            .eq("id", alert.id);
        }

        // 메시지 발송
        const signPct = currentPct >= 0 ? "+" : "";
        const signKrw = currentDiff >= 0 ? "+" : "";
        const indicator = alert.condition_type === "gte" ? "▲" : "▼";
        const unit = alert.type === "percent" ? "%" : "원";
        const shortId = alert.id.substring(0, 4);
        const msg = `KP ${signPct}${currentPct.toFixed(2)}% / ${signKrw}${currentDiff.toFixed(1)}원 (${targetValue}${unit}${indicator}) [ID:${shortId}]`;
        
        await sendTelegramAlert(msg);
        triggeredCount++;
      }
    }

    return NextResponse.json({ success: true, bestBid, bestAsk, usd, triggeredCount });

  } catch (error) {
    console.error("[KIMP Alerts] 서버 에러:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
