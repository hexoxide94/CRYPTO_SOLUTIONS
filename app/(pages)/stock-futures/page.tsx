"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, TrendingUp, AlertCircle, HelpCircle } from "lucide-react";

type StockFutureItem = {
  name: string;
  symbol: string;
  gateContract: string;
  stockPrice: number;
  futuresPrice: number;
  fundingRate: number;
  discrepancy: number;
};

type ApiResponse = {
  timestamp: string;
  usdRate: number;
  items: StockFutureItem[];
};

export default function StockFuturesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // KST 영업 시간 판별 (오전 8시 ~ 오후 8시)
  const isKstActiveHours = () => {
    const now = new Date();
    // UTC 시간을 KST(UTC+9)로 변환
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTime.getUTCHours();
    const day = kstTime.getUTCDay(); // 0: 일요일, 6: 토요일
    
    // 주말 제외하고 오전 8시(8) ~ 오후 8시(20) 직전까지
    const isWeekend = day === 0 || day === 6;
    return !isWeekend && hour >= 8 && hour < 20;
  };

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch("/api/stock-futures");
      if (!res.ok) {
        throw new Error("시세를 불러오는 데 실패했습니다.");
      }
      const json: ApiResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // 활성 시간에는 5초, 비활성 시간에는 60초 폴링
    const getInterval = () => (isKstActiveHours() ? 5000 : 60000);
    
    let timerId = setTimeout(function tick() {
      fetchData().then(() => {
        timerId = setTimeout(tick, getInterval());
      });
    }, getInterval());

    return () => clearTimeout(timerId);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <RefreshCw className="animate-spin text-primary" size={28} />
        <p className="text-muted-foreground text-sm font-medium">실시간 주식선물 시세 조회 중...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-6 text-center gap-3">
        <AlertCircle className="text-red-500" size={32} />
        <p className="text-foreground text-sm font-semibold">오류 발생</p>
        <p className="text-muted-foreground text-xs">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="mt-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 pb-20 bg-background max-w-md mx-auto min-h-screen">
      
      {/* ── 상단 헤더 및 시간 정보 ── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={16} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground">주식 선물 괴리율</h2>
          </div>
          <span className="text-[10px] text-muted-foreground mt-0.5">
            기준 환율: <span className="font-bold text-foreground">${data?.usdRate?.toFixed(1)}원</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString("ko-KR") : ""}
          </span>
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className={`p-1.5 rounded-lg bg-card border border-white/5 text-muted-foreground hover:text-foreground transition-all ${
              isRefreshing ? "opacity-50" : ""
            }`}
            title="새로고침"
          >
            <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── 안내 가이드 ── */}
      <div className="flex gap-2 items-start bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-[10px] leading-relaxed text-muted-foreground mb-1">
        <HelpCircle size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-foreground">괴리율 계산식: </span>
          <code className="text-blue-300 font-mono bg-blue-500/10 px-1 py-0.5 rounded">(Gate.io 선물가격 * 환율 / 국내주가) - 1</code>
          <p className="mt-1">
            * 한국 시장 활성 시간(평일 08:00 ~ 20:00)에는 5초 간격으로 실시간 조회하며, 그 외 시간에는 최종 종가 기준으로 유지(60초 간격 조회)됩니다.
          </p>
        </div>
      </div>

      {/* ── 3개 종목 카드 ── */}
      <div className="flex flex-col gap-3">
        {data?.items.map((item) => {
          const discrepancyPercent = item.discrepancy * 100;
          const futuresKrwValue = Math.round(item.futuresPrice * data.usdRate);
          const isPositive = discrepancyPercent >= 0;
          
          // 색상 테마 결정
          const colorClass = isPositive 
            ? "text-emerald-500 drop-shadow-[0_0_12px_rgba(16,185,129,0.2)]" 
            : "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.2)]";
            
          const bgGradient = isPositive
            ? "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)"
            : "linear-gradient(135deg, rgba(248,113,113,0.08) 0%, rgba(248,113,113,0.02) 100%)";

          const borderGlow = isPositive
            ? "border-emerald-500/10"
            : "border-red-500/10";

          return (
            <div
              key={item.symbol}
              className={`rounded-2xl border ${borderGlow} p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.01]`}
              style={{ background: bgGradient }}
            >
              {/* 카드 상단: 종목명 및 코드 */}
              <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[15px] font-extrabold text-foreground">{item.name}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded">
                    {item.symbol}
                  </span>
                </div>
                <span className="text-[9.5px] font-medium text-muted-foreground tracking-wider font-mono">
                  {item.gateContract}
                </span>
              </div>

              {/* 카드 중앙: 괴리율 강조 */}
              <div className="flex flex-col items-center justify-center my-4">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  괴리율
                </span>
                <span className={`text-[36px] font-black tracking-tight tabular-nums ${colorClass}`}>
                  {isPositive ? "+" : ""}
                  {discrepancyPercent.toFixed(2)}%
                </span>
              </div>

              {/* 카드 하단: 세부 시세 그리드 */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-center">
                
                {/* 주가 */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-muted-foreground font-medium">국내 주가</span>
                  <span className="text-[11.5px] font-bold text-foreground tabular-nums">
                    {item.stockPrice > 0 ? `${item.stockPrice.toLocaleString()}원` : "—"}
                  </span>
                </div>

                {/* 선물가 */}
                <div className="flex flex-col gap-0.5 border-x border-white/5">
                  <span className="text-[9px] text-muted-foreground font-medium">선물 가격</span>
                  <div className="flex flex-col leading-none">
                    <span className="text-[11.5px] font-bold text-foreground tabular-nums">
                      ${item.futuresPrice.toFixed(2)}
                    </span>
                    <span className="text-[8.5px] text-muted-foreground mt-0.5 tabular-nums">
                      ({futuresKrwValue.toLocaleString()}원)
                    </span>
                  </div>
                </div>

                {/* 펀딩비 */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-muted-foreground font-medium">펀딩비</span>
                  <span className={`text-[11.5px] font-bold tabular-nums ${
                    item.fundingRate >= 0 ? "text-emerald-500" : "text-red-400"
                  }`}>
                    {(item.fundingRate * 100).toFixed(4)}%
                  </span>
                </div>

              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
