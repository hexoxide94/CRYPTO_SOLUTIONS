"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

interface MarketData {
  bestAsk: number;
  bestBid: number;
  usdKrw: number;
}

export default function TopBar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market-data");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.error) setData(json);
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // KIMP: 매수 하단호가 기준
  const kimpPct =
    data && data.usdKrw > 0
      ? (data.bestBid / data.usdKrw - 1) * 100
      : null;
  const kimpDiff =
    data && data.usdKrw > 0 ? data.bestBid - data.usdKrw : null;

  const kimpColor =
    kimpPct == null
      ? "text-muted-foreground"
      : kimpPct > 0
      ? "text-emerald-500"
      : kimpPct < 0
      ? "text-red-400"
      : "text-foreground";

  const sign = kimpPct != null && kimpPct >= 0 ? "+" : "";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border flex items-center px-3 max-w-[390px] mx-auto w-full"
      style={{ height: "var(--topbar-h, 48px)" }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">

        {/* KIMP */}
        <div className="flex flex-col justify-center shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium leading-none mb-[2px]">
            KIMP
          </span>
          {kimpPct != null && kimpDiff != null ? (
            <>
              <span className={`text-[11px] font-bold leading-none tabular-nums ${kimpColor}`}>
                {sign}{kimpPct.toFixed(2)}%
              </span>
              <span className={`text-[9px] font-bold leading-none tabular-nums mt-[1px] ${kimpColor}`}>
                {sign}{kimpDiff.toFixed(1)}원
              </span>
            </>
          ) : (
            <span className="text-[11px] font-bold leading-none text-muted-foreground">—</span>
          )}
        </div>

        <Sep />

        {/* USDT: 매도상단호가 / 매수하단호가 */}
        <div className="flex flex-col justify-center shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium leading-none mb-[2px]">
            USDT
          </span>
          <span className="text-[11px] font-bold leading-none tabular-nums text-foreground">
            {data
              ? `${Math.round(data.bestAsk).toLocaleString()} / ${Math.round(data.bestBid).toLocaleString()}`
              : "— / —"}
          </span>
        </div>

        <Sep />

        {/* USD/KRW */}
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium leading-none">USD</span>
          <span className="text-[11px] font-bold leading-none tabular-nums text-foreground">
            {data ? data.usdKrw.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "—"}
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
  );
}

function Sep() {
  return (
    <span className="text-[10px] text-border select-none shrink-0">|</span>
  );
}
