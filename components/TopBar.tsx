"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useUsdtPrices } from "@/lib/usdt-context";
import AlertPanel from "./AlertPanel";

// ─── 상수 ────────────────────────────────────────────────────────
const COINONE_WS_URL = "wss://stream.coinone.co.kr";
const PING_INTERVAL_MS = 25 * 60 * 1000; // 25분
const RECONNECT_DELAY_MS = 3_000;
const FX_POLL_INTERVAL_MS = 30_000;

// ════════════════════════════════════════════════════════════════
export default function TopBar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted]     = useState(false);
  const { usdt, setUsdt }         = useUsdtPrices();
  const [usdKrw, setUsdKrw]       = useState<number | null>(null);
  const [usdIcon, setUsdIcon]     = useState<string>("");
  const [usdStatus, setUsdStatus] = useState<"loading" | "ok" | "error">("loading");
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const wsRef      = useRef<WebSocket | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef  = useRef(true); // 언마운트 시 재연결 방지

  // ── USD/KRW 환율 (한국투자증권 API, 서버사이드 프록시) ─────────────
  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("/api/usd-rate");
      if (!res.ok) { setUsdStatus("error"); return; }
      const data = await res.json();
      if (typeof data?.rate === "number") {
        setUsdKrw(data.rate);
        setUsdIcon(data.icon || "");
        setUsdStatus("ok");
      } else {
        setUsdStatus("error");
      }
    } catch {
      setUsdStatus("error");
    }
  }, []);

  // ── Coinone WebSocket (ver1.0과 동일한 방식) ────────────────────
  const connectWs = useCallback(() => {
    if (!activeRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log("[TopBar] Coinone WS 연결 시도:", COINONE_WS_URL);
    const ws = new WebSocket(COINONE_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[TopBar] Coinone WS 연결 성공");

      // USDT ORDERBOOK 구독
      const sub = {
        request_type: "SUBSCRIBE",
        channel: "ORDERBOOK",
        format: "DEFAULT",
        topic: { quote_currency: "KRW", target_currency: "USDT" },
      };
      ws.send(JSON.stringify(sub));
      console.log("[TopBar] ORDERBOOK 구독 전송:", sub);

      // PING 유지
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ request_type: "PING" }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = async (ev) => {
      try {
        const raw: string =
          ev.data instanceof Blob
            ? await (ev.data as Blob).text()
            : (ev.data as string);
        const d = JSON.parse(raw);

        // PONG 등 비데이터 메시지 무시
        if (d.response_type !== "DATA") return;
        if (d.channel !== "ORDERBOOK") return;

        const { bids, asks } = d.data ?? {};
        if (!bids?.length || !asks?.length) return;

        // ver1.0과 동일: asks는 WS에서 내림차순으로 오므로 reverse → asks[0]=최우선매도
        const sortedAsks: { price: string }[] = [...asks].reverse();
        const bestBid = parseFloat(bids[0].price);
        const bestAsk = parseFloat(sortedAsks[0].price);

        console.log("[TopBar] USDT 호가 수신 — bid:", bestBid, "/ ask:", bestAsk);
        setUsdt({ bestBid, bestAsk });
      } catch (e) {
        console.error("[TopBar] WS 메시지 파싱 오류:", e);
      }
    };

    ws.onerror = (e) => {
      console.error("[TopBar] Coinone WS 오류:", e);
    };

    ws.onclose = (ev) => {
      if (pingRef.current) clearInterval(pingRef.current);
      console.warn("[TopBar] Coinone WS 연결 종료 — code:", ev.code, "reason:", ev.reason);
      if (!activeRef.current) return;
      // 자동 재연결
      retryRef.current = setTimeout(() => {
        console.log("[TopBar] Coinone WS 재연결 시도...");
        connectWs();
      }, RECONNECT_DELAY_MS);
    };
  }, [setUsdt]); // wsRef/pingRef/retryRef/activeRef는 ref이므로 의존성 불필요

  useEffect(() => {
    activeRef.current = true;
    setMounted(true);

    // WebSocket 연결 + 환율 조회
    connectWs();
    fetchFx();
    const fxTimer = setInterval(fetchFx, FX_POLL_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      clearInterval(fxTimer);
      if (pingRef.current)  clearInterval(pingRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connectWs, fetchFx]);

  // ── KIMP 계산 ───────────────────────────────────────────────────
  const kimpPct  = usdt && usdKrw ? (usdt.bestBid / usdKrw - 1) * 100 : null;
  const kimpDiff = usdt && usdKrw ? usdt.bestBid - usdKrw : null;

  const kimpColor =
    kimpPct == null      ? "text-muted-foreground"
    : kimpPct > 0        ? "text-emerald-500"
    : kimpPct < 0        ? "text-red-400"
    :                      "text-foreground";
  const sign = kimpPct != null && kimpPct >= 0 ? "+" : "";

  // ── 렌더 ────────────────────────────────────────────────────────
  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border flex items-center px-3 w-full max-w-md mx-auto w-full cursor-pointer hover:bg-muted/30 transition-colors"
        style={{ height: "var(--topbar-h, 48px)" }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button[aria-label="다크모드 토글"]')) return;
          setIsAlertOpen(v => !v);
        }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">

        {/* KIMP */}
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium leading-none">KIMP</span>
          {kimpPct != null && kimpDiff != null ? (
            <span className={`text-[11px] font-bold leading-none tabular-nums ${kimpColor}`}>
              {sign}{kimpPct.toFixed(2)}% ({sign}{kimpDiff.toFixed(1)}원)
            </span>
          ) : (
            <span className="text-[11px] font-bold leading-none text-muted-foreground">—</span>
          )}
        </div>

        <Sep />

        {/* USDT: 매도상단호가 / 매수하단호가 */}
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium leading-none">USDT</span>
          <span className="text-[11px] font-bold leading-none tabular-nums text-foreground">
            {usdt
              ? `${Math.round(usdt.bestAsk).toLocaleString()} / ${Math.round(usdt.bestBid).toLocaleString()}`
              : "— / —"}
          </span>
        </div>

        <Sep />

        {/* USD/KRW */}
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium leading-none">USD {usdIcon}</span>
          <span className="text-[11px] font-bold leading-none tabular-nums text-foreground">
            {usdStatus === "loading"
              ? "---"
              : usdStatus === "error"
              ? "N/A"
              : usdKrw!.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

      </div>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="ml-2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        aria-label="다크모드 토글"
      >
        {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
      <AlertPanel isOpen={isAlertOpen} onClose={() => setIsAlertOpen(false)} />
    </>
  );
}

function Sep() {
  return (
    <span className="text-[10px] text-border select-none shrink-0">|</span>
  );
}
