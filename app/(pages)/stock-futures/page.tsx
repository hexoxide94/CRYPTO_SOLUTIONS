"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, TrendingUp, AlertCircle, HelpCircle, Edit2, Check, RotateCcw, Link2, Link2Off } from "lucide-react";

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
    // 이전 연결 정리
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    setWsStatus("connecting");

    try {
      // 1. 서버로부터 approval_key 발급 받기
      const res = await fetch("/api/kis-approval", { method: "POST" });
      if (!res.ok) throw new Error("웹소켓 인증키 발급 실패");
      const { approvalKey } = await res.json();

      // 2. KIS 실시간 시세 WebSocket 연결 (웹 브라우저 mixed content 차단 방지를 위해 wss 사용)
      const ws = new WebSocket("wss://ops.koreainvestment.com:21000");
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");

        // 3. 3개 종목 실시간 호가 (H0NXASP0) 구독 신청
        const symbols = ["005930", "000660", "005380"];
        symbols.forEach((symbol) => {
          ws.send(
            JSON.stringify({
              header: {
                approval_key: approvalKey,
                custtype: "P",
                tr_type: "1", // 1: 등록
                "content-type": "utf-8",
              },
              body: {
                input: {
                  tr_id: "H0NXASP0", // 국내주식 실시간호가 (NXT)
                  tr_key: symbol,
                },
              },
            })
          );
        });

        // 4. 주기적 하트비트(PING) 전송으로 세션 유지 (30초 간격)
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
          // KIS 실시간 웹소켓 형식은 파이프(|) 구분자 문자열
          const message = ev.data;
          const parts = message.split("|");
          
          if (parts.length > 3 && parts[1] === "H0NXASP0") {
            const fields = parts.slice(3);
            const symbol = fields[0]; // 종목코드
            
            // 인덱스 3: 매도호가1 (ASKP1), 인덱스 13: 매수호가1 (BIDP1)
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

    // 10초 간격으로 백엔드 API 폴링 (Gate.io 가격 및 환율 업데이트 용도)
    const timer = setInterval(() => {
      fetchData();
    }, 10000);

    return () => {
      clearInterval(timer);
      if (wsRef.current) wsRef.current.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [fetchData, connectWebsocket]);

  // 수동 가격 등록 수정 핸들러
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
    <div className="flex flex-col gap-2 p-2 bg-background max-w-md mx-auto min-h-screen">
      
      {/* ── 상단 헤더 및 시간 정보 ── */}
      <div className="flex items-center justify-between px-1 shrink-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={15} className="text-primary" />
            <h2 className="text-xs font-extrabold text-foreground">주식 선물 괴리율 (NXT 연동)</h2>
          </div>
          <span className="text-[9px] text-muted-foreground mt-0.5">
            기준 환율: <span className="font-bold text-foreground">${data?.usdRate?.toFixed(1)}원</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 웹소켓 연결 상태 표시 */}
          <div 
            onClick={() => wsStatus === "disconnected" && connectWebsocket()}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold cursor-pointer transition-all ${
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

      {/* ── 3개 종목 카드 (압축적 뷰) ── */}
      <div className="flex flex-col gap-2">
        {data?.items.map((item) => {
          // 실시간 가격 적용 순위: 
          // 1. 수동 지정 가격
          // 2. KIS 실시간 웹소켓 NXT 가격
          // 3. 백엔드 API KIS 정규장/Yahoo 가격
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
          
          const colorClass = isPositive ? "text-emerald-400" : "text-red-400";
          const bgGradient = isPositive
            ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)"
            : "linear-gradient(135deg, rgba(248,113,113,0.06) 0%, rgba(248,113,113,0.01) 100%)";

          const borderGlow = isPositive ? "border-emerald-500/10" : "border-red-500/10";

          return (
            <div
              key={item.symbol}
              className={`rounded-xl border ${borderGlow} p-2.5 shadow-md backdrop-blur-md relative overflow-hidden transition-all duration-300`}
              style={{ background: bgGradient }}
            >
              {/* 카드 레이아웃: 가로 압축 그리드 */}
              <div className="flex items-center justify-between gap-2">
                
                {/* 1. 종목 영역 */}
                <div className="flex flex-col w-[28%] shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] font-extrabold text-foreground leading-tight truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider bg-white/5 px-1 py-0.2 rounded font-mono">
                      {item.symbol}
                    </span>
                    <span className={`text-[7.5px] font-bold px-1 rounded-sm ${
                      isManual ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
                    }`}>
                      {sourceLabel}
                    </span>
                  </div>
                </div>

                {/* 2. 괴리율 강조 영역 (폰트 크기 축소하여 압축) */}
                <div className="flex flex-col items-center justify-center w-[30%] shrink-0 border-l border-white/5">
                  <span className="text-[8px] text-muted-foreground font-medium uppercase tracking-wider leading-none">
                    괴리율
                  </span>
                  <span className={`text-[20px] font-black tracking-tight tabular-nums leading-none mt-1 ${colorClass}`}>
                    {isPositive ? "+" : ""}
                    {discrepancyPercent.toFixed(2)}%
                  </span>
                </div>

                {/* 3. 시세 및 상세 데이터 영역 (가로형) */}
                <div className="flex flex-col gap-1 w-[42%] text-[10px] pl-1.5 border-l border-white/5">
                  
                  {/* 주가 입력/수정 */}
                  <div className="flex justify-between items-center text-[10px] h-[16px]">
                    <span className="text-muted-foreground">주가</span>
                    {editingSymbol === item.symbol ? (
                      <div className="flex items-center gap-1 z-10">
                        <input
                          type="text"
                          value={editPriceVal}
                          onChange={(e) => setEditPriceVal(e.target.value)}
                          className="w-[50px] text-right bg-muted border border-primary/50 text-[10px] p-0.5 rounded outline-none font-bold text-foreground font-mono"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(item.symbol);
                            if (e.key === "Escape") setEditingSymbol(null);
                          }}
                        />
                        <button onClick={() => handleSaveEdit(item.symbol)} className="text-emerald-400 p-0.5 hover:bg-emerald-500/10 rounded">
                          <Check size={10} />
                        </button>
                        {isManual && (
                          <button onClick={() => handleResetOverride(item.symbol)} className="text-red-400 p-0.5 hover:bg-red-500/10 rounded">
                            <RotateCcw size={10} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span className={`font-bold font-mono text-foreground ${isManual ? "text-amber-400" : ""}`}>
                          {currentStockPrice > 0 ? `${currentStockPrice.toLocaleString()}` : "—"}
                        </span>
                        <button
                          onClick={() => handleStartEdit(item.symbol, currentStockPrice)}
                          className="text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100 transition-opacity p-0.5"
                        >
                          <Edit2 size={8} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 선물가 */}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">선물</span>
                    <span className="font-bold text-foreground font-mono">
                      ${item.futuresPrice.toFixed(2)}
                      <span className="text-[8px] text-muted-foreground font-normal ml-1">
                        ({futuresKrwValue.toLocaleString()})
                      </span>
                    </span>
                  </div>

                  {/* 펀딩비 */}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">펀딩비</span>
                    <span className={`font-bold font-mono ${item.fundingRate >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {(item.fundingRate * 100).toFixed(4)}%
                    </span>
                  </div>

                </div>

              </div>

            </div>
          );
        })}
      </div>

      {/* ── 하단 설명 문구 (한 줄 압축) ── */}
      <div className="px-1 text-[8.5px] leading-tight text-muted-foreground/60 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-0.5">
          <HelpCircle size={10} className="text-muted-foreground/50" />
          <span>NXT 시간 외 거래 정지 시, 주가 옆의 연필 아이콘(<Edit2 size={6} className="inline" />)을 눌러 수동 시세를 입력할 수 있습니다.</span>
        </span>
      </div>

    </div>
  );
}
