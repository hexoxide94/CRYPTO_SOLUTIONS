"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, TrendingUp, AlertCircle, Edit2, Check, RotateCcw, Link2, Link2Off } from "lucide-react";

type StockRef = {
  price: number;
  changePercent: number;
};

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
  references: {
    EWY: StockRef | null;
    MU: StockRef | null;
  };
  items: StockFutureItem[];
};

type ManualOverride = {
  active: boolean;
  price: number;
};

export default function StockFuturesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // KIS WebSocket 실시간 가격 상태
  const [realtimeNxtPrices, setRealtimeNxtPrices] = useState<Record<string, number>>({});
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");

  // 수동 주가 오버라이드 상태 (로컬 스토리지 연동)
  const [manualOverrides, setManualOverrides] = useState<Record<string, ManualOverride>>({});
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 로컬 스토리지에서 수동 오버라이드 값 불러오기
  useEffect(() => {
    const saved = localStorage.getItem("nxt-manual-overrides");
    if (saved) {
      try {
        setManualOverrides(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load manual overrides", e);
      }
    }
  }, []);

  // 수동 오버라이드 상태가 변경될 때마다 로컬 스토리지에 저장
  const saveManualOverrides = (newOverrides: Record<string, ManualOverride>) => {
    setManualOverrides(newOverrides);
    localStorage.setItem("nxt-manual-overrides", JSON.stringify(newOverrides));
  };

  // REST API 데이터 가져오기
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

  // KIS WebSocket 연결 설정
  const connectWebsocket = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    setWsStatus("connecting");

    try {
      const res = await fetch("/api/kis-approval", { method: "POST" });
      if (!res.ok) throw new Error("웹소켓 인증키 발급 실패");
      const { approvalKey } = await res.json();

      const ws = new WebSocket("wss://ops.koreainvestment.com:21000");
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");

        const symbols = ["005930", "000660", "005380"];
        symbols.forEach((symbol) => {
          ws.send(
            JSON.stringify({
              header: {
                approval_key: approvalKey,
                custtype: "P",
                tr_type: "1",
                "content-type": "utf-8",
              },
              body: {
                input: {
                  tr_id: "H0NXASP0",
                  tr_key: symbol,
                },
              },
            })
          );
        });

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                header: {
                  tr_id: "PING",
                  tr_key: "PONG",
                },
              })
            );
          }
        }, 30000);
      };

      ws.onmessage = (ev) => {
        try {
          const message = ev.data;
          const parts = message.split("|");
          
          if (parts.length > 3 && parts[1] === "H0NXASP0") {
            const fields = parts.slice(3);
            const symbol = fields[0];
            
            const askPrice = parseFloat(fields[3]);
            const bidPrice = parseFloat(fields[13]);

            if (askPrice > 0 && bidPrice > 0) {
              const nxtMidPrice = (askPrice + bidPrice) / 2;
              setRealtimeNxtPrices((prev) => ({
                ...prev,
                [symbol]: nxtMidPrice,
              }));
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      };

      ws.onerror = () => {
        setWsStatus("disconnected");
      };

    } catch (err) {
      console.error("KIS WebSocket connection error:", err);
      setWsStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    fetchData();
    connectWebsocket();

    const timer = setInterval(() => {
      fetchData();
    }, 10000);

    return () => {
      clearInterval(timer);
      if (wsRef.current) wsRef.current.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [fetchData, connectWebsocket]);

  const handleStartEdit = (symbol: string, currentVal: number) => {
    setEditingSymbol(symbol);
    setEditPriceVal(currentVal > 0 ? String(currentVal) : "");
  };

  const handleSaveEdit = (symbol: string) => {
    const val = parseFloat(editPriceVal.replace(/,/g, ""));
    if (!isNaN(val) && val > 0) {
      const next = {
        ...manualOverrides,
        [symbol]: { active: true, price: val },
      };
      saveManualOverrides(next);
    }
    setEditingSymbol(null);
  };

  const handleResetOverride = (symbol: string) => {
    const next = { ...manualOverrides };
    delete next[symbol];
    saveManualOverrides(next);
    setEditingSymbol(null);
  };

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
            connectWebsocket();
          }}
          className="mt-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 p-3 pb-20 bg-background max-w-md mx-auto min-h-screen">
      
      {/* ── 상단 헤더 및 시간 정보 ── */}
      <div className="flex items-center justify-between px-1 shrink-0">
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
          <div 
            onClick={() => wsStatus === "disconnected" && connectWebsocket()}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold cursor-pointer transition-all ${
              wsStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : wsStatus === "connecting"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {wsStatus === "connected" ? (
              <>
                <Link2 size={10} />
                <span>NXT 실시간</span>
              </>
            ) : wsStatus === "connecting" ? (
              <>
                <RefreshCw size={10} className="animate-spin" />
                <span>연결중</span>
              </>
            ) : (
              <>
                <Link2Off size={10} />
                <span>정지됨(재연결)</span>
              </>
            )}
          </div>
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString("ko-KR") : ""}
          </span>
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="p-1 rounded bg-card border border-white/5 text-muted-foreground hover:text-foreground transition-all"
            title="새로고침"
          >
            <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── EWY & MU 참고용 지표 바 ── */}
      {data?.references && (
        <div className="grid grid-cols-2 gap-2 bg-card border border-white/5 p-2 rounded-xl text-[10px] shrink-0">
          {/* EWY */}
          <div className="flex justify-between items-center px-1">
            <span className="text-muted-foreground font-semibold">EWY (한국 ETF)</span>
            {data.references.EWY ? (
              <span className="font-mono font-bold text-foreground">
                ${data.references.EWY.price.toFixed(2)}{" "}
                <span className={data.references.EWY.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                  ({data.references.EWY.changePercent >= 0 ? "+" : ""}
                  {data.references.EWY.changePercent.toFixed(2)}%)
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground font-bold">—</span>
            )}
          </div>
          {/* MU */}
          <div className="flex justify-between items-center px-1 border-l border-white/5">
            <span className="text-muted-foreground font-semibold">MU (마이크론)</span>
            {data.references.MU ? (
              <span className="font-mono font-bold text-foreground">
                ${data.references.MU.price.toFixed(2)}{" "}
                <span className={data.references.MU.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                  ({data.references.MU.changePercent >= 0 ? "+" : ""}
                  {data.references.MU.changePercent.toFixed(2)}%)
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground font-bold">—</span>
            )}
          </div>
        </div>
      )}

      {/* ── 3개 종목 카드 ── */}
      <div className="flex flex-col gap-2.5">
        {data?.items.map((item) => {
          const isManual = manualOverrides[item.symbol]?.active;
          const manualPrice = manualOverrides[item.symbol]?.price;
          const wsPrice = realtimeNxtPrices[item.symbol];
          
          let currentStockPrice = item.stockPrice;
          let sourceLabel = "종가/API";

          if (isManual && manualPrice > 0) {
            currentStockPrice = manualPrice;
            sourceLabel = "수동";
          } else if (wsPrice > 0) {
            currentStockPrice = wsPrice;
            sourceLabel = "NXT실시간";
          }

          const discrepancyPercent = currentStockPrice > 0 && item.futuresPrice > 0 && data.usdRate > 0
            ? ((item.futuresPrice * data.usdRate) / currentStockPrice - 1) * 100
            : 0;

          const futuresKrwValue = Math.round(item.futuresPrice * data.usdRate);
          const isPositive = discrepancyPercent >= 0;
          
          const colorClass = isPositive 
            ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.15)]" 
            : "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.15)]";
            
          const bgGradient = isPositive
            ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)"
            : "linear-gradient(135deg, rgba(248,113,113,0.06) 0%, rgba(248,113,113,0.01) 100%)";

          const borderGlow = isPositive ? "border-emerald-500/10" : "border-red-500/10";

          return (
            <div
              key={item.symbol}
              className={`rounded-xl border ${borderGlow} p-3.5 shadow-md backdrop-blur-md relative overflow-hidden transition-all duration-300`}
              style={{ background: bgGradient }}
            >
              {/* 카드 상단: 종목명 및 코드 */}
              <div className="flex justify-between items-baseline mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-extrabold text-foreground leading-tight">{item.name}</span>
                  <span className="text-[8px] text-muted-foreground font-semibold bg-white/5 px-1 py-0.2 rounded font-mono">
                    {item.symbol}
                  </span>
                  <span className={`text-[7.5px] font-bold px-1 rounded-sm ${
                    isManual ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
                  }`}>
                    {sourceLabel}
                  </span>
                </div>
                <span className="text-[8.5px] font-medium text-muted-foreground font-mono">
                  {item.gateContract}
                </span>
              </div>

              {/* 카드 중앙: 괴리율 강조 */}
              <div className="flex flex-col items-center justify-center my-2.5">
                <span className="text-[8px] text-muted-foreground font-medium uppercase tracking-wider">
                  괴리율
                </span>
                <span className={`text-[28px] font-black tracking-tight tabular-nums ${colorClass}`}>
                  {isPositive ? "+" : ""}
                  {discrepancyPercent.toFixed(2)}%
                </span>
              </div>

              {/* 카드 하단: 세부 시세 그리드 */}
              <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-white/5 text-center text-[10px]">
                
                {/* 주가 입력/수정 */}
                <div className="flex flex-col gap-0.5 justify-center items-center">
                  <span className="text-[9px] text-muted-foreground font-medium">국내 주가</span>
                  {editingSymbol === item.symbol ? (
                    <div className="flex items-center gap-0.5 z-10">
                      <input
                        type="text"
                        value={editPriceVal}
                        onChange={(e) => setEditPriceVal(e.target.value)}
                        className="w-[55px] text-center bg-muted border border-primary/50 text-[10px] p-0.2 rounded outline-none font-bold text-foreground font-mono"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(item.symbol);
                          if (e.key === "Escape") setEditingSymbol(null);
                        }}
                      />
                      <button onClick={() => handleSaveEdit(item.symbol)} className="text-emerald-400 p-0.2 hover:bg-emerald-500/10 rounded">
                        <Check size={9} />
                      </button>
                      {isManual && (
                        <button onClick={() => handleResetOverride(item.symbol)} className="text-red-400 p-0.2 hover:bg-red-500/10 rounded">
                          <RotateCcw size={9} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 group">
                      <span className={`font-bold font-mono text-foreground ${isManual ? "text-amber-400" : ""}`}>
                        {currentStockPrice > 0 ? `${currentStockPrice.toLocaleString()}` : "—"}
                      </span>
                      <button
                        onClick={() => handleStartEdit(item.symbol, currentStockPrice)}
                        className="text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100 transition-opacity p-0.2"
                      >
                        <Edit2 size={7} />
                      </button>
                    </div>
                  )}
                </div>

                {/* 선물가 */}
                <div className="flex flex-col gap-0.5 border-x border-white/5 justify-center items-center">
                  <span className="text-[9px] text-muted-foreground font-medium">선물 가격</span>
                  <div className="flex flex-col leading-none">
                    <span className="font-bold text-foreground font-mono">
                      ${item.futuresPrice.toFixed(2)}
                    </span>
                    <span className="text-[8px] text-muted-foreground mt-0.5 font-mono">
                      ({futuresKrwValue.toLocaleString()})
                    </span>
                  </div>
                </div>

                {/* 펀딩비 */}
                <div className="flex flex-col gap-0.5 justify-center items-center">
                  <span className="text-[9px] text-muted-foreground font-medium">펀딩비</span>
                  <span className={`font-bold font-mono ${item.fundingRate >= 0 ? "text-emerald-500" : "text-red-400"}`}>
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
