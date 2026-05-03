"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, ChevronDown } from "lucide-react";
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
  const { usdt, setUsdt }         = useUsdtPrices(); // Note: Variable name 'usdt' is kept for context consistency but holds USDC data
  const [usdKrw, setUsdKrw]       = useState<number | null>(null);
  const [usdIcon, setUsdIcon]       = useState<string>("☀️");
  const [usdStatus, setUsdStatus] = useState<"loading" | "ok" | "error">("loading");
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<"percent" | "krw">("percent");

  const wsRef      = useRef<WebSocket | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef  = useRef(true);

  // ── 환율 (USD Futures) ────────────────────────────────────────
  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("/api/usd-rate");
      if (!res.ok) { setUsdStatus("error"); return; }
      const data = await res.json();
      if (typeof data?.rate === "number") {
        setUsdKrw(data.rate);
        if (data.icon) setUsdIcon(data.icon);
        setUsdStatus("ok");
      } else {
        setUsdStatus("error");
      }
    } catch {
      setUsdStatus("error");
    }
  }, []);

  // ── Coinone WebSocket (USDC) ──────────────────────────────────
  const connectWs = useCallback(() => {
    if (!activeRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(COINONE_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        request_type: "SUBSCRIBE",
        channel: "ORDERBOOK",
        format: "DEFAULT",
        topic: { quote_currency: "KRW", target_currency: "USDC" },
      }));
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ request_type: "PING" }));
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = async (ev) => {
      try {
        const raw = ev.data instanceof Blob ? await ev.data.text() : ev.data;
        const d = JSON.parse(raw);
        if (d.response_type !== "DATA" || d.channel !== "ORDERBOOK") return;

        const { bids, asks } = d.data ?? {};
        if (!bids?.length || !asks?.length) return;

        const sortedAsks = [...asks].reverse();
        const bestBid = parseFloat(bids[0].price);
        const bestAsk = parseFloat(sortedAsks[0].price);
        setUsdt({ bestBid, bestAsk });
      } catch {}
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (!activeRef.current) return;
      retryRef.current = setTimeout(connectWs, RECONNECT_DELAY_MS);
    };
  }, [setUsdt]);

  // ── 5초마다 단위 전환 ──────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayMode(prev => prev === "percent" ? "krw" : "percent");
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    setMounted(true);
    connectWs();
    fetchFx();
    const fxTimer = setInterval(fetchFx, FX_POLL_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      clearInterval(fxTimer);
      if (pingRef.current) clearInterval(pingRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connectWs, fetchFx]);

  // ── KIMP 계산 (USDC 기준) ──────────────────────────────────────
  let kimp = { askPct: "", bidPct: "", askKrw: "", bidKrw: "", color: "text-muted-foreground" };
  if (usdt && usdKrw) {
    const ap = (usdt.bestAsk / usdKrw - 1) * 100;
    const bp = (usdt.bestBid / usdKrw - 1) * 100;
    const ak = usdt.bestAsk - usdKrw;
    const bk = usdt.bestBid - usdKrw;

    const sign = (v: number) => v >= 0 ? "+" : "";
    kimp = {
      askPct: `${sign(ap)}${ap.toFixed(2)}%`,
      bidPct: `${sign(bp)}${bp.toFixed(2)}%`,
      askKrw: `${sign(ak)}${ak.toFixed(1)}원`,
      bidKrw: `${sign(bk)}${bk.toFixed(1)}원`,
      color: ap > 0 ? "text-emerald-500" : ap < 0 ? "text-red-400" : "text-foreground"
    };
  }

  if (!mounted) return <div className="h-[48px]" />;

  return (
    <>
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-kimp-flip {
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border flex items-center px-3 w-full max-w-md mx-auto cursor-pointer hover:bg-muted/50 transition-all active:scale-[0.98]"
        style={{ height: "var(--topbar-h, 48px)" }}
        onClick={(e) => {
          const isDarkBtn = (e.target as HTMLElement).closest('button[aria-label="다크모드 토글"]');
          if (isDarkBtn) return;
          setIsAlertOpen(v => !v);
        }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* KP (Kimp) */}
          <div className="flex items-center shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium leading-none mr-1.5">KP</span>
            <div className="w-[110px] flex items-center overflow-hidden h-[14px] relative">
              {usdt && usdKrw ? (
                <div key={displayMode} className="animate-kimp-flip absolute inset-0 flex items-center">
                  <span className={`text-[11px] font-bold leading-none tabular-nums truncate ${kimp.color}`}>
                    {displayMode === "percent" 
                      ? `${kimp.askPct} / ${kimp.bidPct}`
                      : `${kimp.askKrw} / ${kimp.bidKrw}`
                    }
                  </span>
                </div>
              ) : (
                <span className="text-[11px] font-bold leading-none text-muted-foreground">—</span>
              )}
            </div>
          </div>

          <Sep />

          {/* USDC (©) */}
          <div className="flex items-center shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium leading-none mr-1.5">©</span>
            <div className="w-[72px] flex items-center h-[14px]">
              <span className="text-[11px] font-bold leading-none tabular-nums text-foreground">
                {usdt ? `${Math.round(usdt.bestAsk)} / ${Math.round(usdt.bestBid)}` : "—"}
              </span>
            </div>
          </div>

          <Sep />

          {/* USD ($) */}
          <div className="flex items-center shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium leading-none mr-1.5">$</span>
            <div className="flex items-center gap-1.5 h-[14px]">
              <span className="text-[11px] font-bold leading-none tabular-nums text-foreground">
                {usdStatus === "ok" ? usdKrw!.toFixed(1) : "---"}
              </span>
              {usdIcon === "🌙" ? (
                <Moon size={10} className="text-indigo-400 fill-indigo-400/20 translate-y-[-0.5px]" />
              ) : (
                <Sun size={11} className="text-amber-400 fill-amber-400/20 translate-y-[-0.5px]" />
              )}
            </div>
          </div>

          <div className="ml-auto pr-0.5">
            <ChevronDown size={12} className={`text-muted-foreground transition-transform duration-300 ${isAlertOpen ? "rotate-180" : ""}`} />
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setTheme(theme === "dark" ? "light" : "dark");
          }}
          className="ml-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          aria-label="다크모드 토글"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>
      <AlertPanel isOpen={isAlertOpen} onClose={() => setIsAlertOpen(false)} />
    </>
  );
}

function Sep() {
  return <span className="text-[10px] text-border select-none shrink-0 mx-0.5">|</span>;
}
