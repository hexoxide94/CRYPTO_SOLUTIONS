/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";

type OrderbookEntry = { price: number; qty: number };
type OrderbookData = {
  asks: OrderbookEntry[]; // sorted descending (highest at top, lowest at bottom)
  bids: OrderbookEntry[]; // sorted descending (highest at top, lowest at bottom)
};
type ExchangeData = Record<string, OrderbookData>;

type Market = { exchange: "upbit" | "bithumb" | "coinone"; coin: string };

const fetchProxy = async (url: string) => {
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error("Proxy error");
  return res.json();
};

export default function CoinInfoPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedPairs, setSelectedPairs] = useState<Market[]>([]);
  const [isPairsLoaded, setIsPairsLoaded] = useState(false);

  // 로컬 스토리지에서 선택된 쌍 불러오기
  useEffect(() => {
    const saved = localStorage.getItem("coin-info-pairs");
    if (saved) {
      try {
        setSelectedPairs(JSON.parse(saved));
      } catch (e) {
        console.error("로컬 스토리지 파싱 에러", e);
      }
    } else {
      setSelectedPairs([
        { exchange: "upbit", coin: "BTC" },
        { exchange: "bithumb", coin: "BTC" },
      ]);
    }
    setIsPairsLoaded(true);
  }, []);

  // 선택된 쌍이 변경될 때마다 로컬 스토리지에 저장
  useEffect(() => {
    if (isPairsLoaded) {
      localStorage.setItem("coin-info-pairs", JSON.stringify(selectedPairs));
    }
  }, [selectedPairs, isPairsLoaded]);

  const [data, setData] = useState<{ upbit: ExchangeData; bithumb: ExchangeData; coinone: ExchangeData }>({
    upbit: {}, bithumb: {}, coinone: {},
  });
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");

  // 마켓 목록 불러오기 (한 번만)
  useEffect(() => {
    let mounted = true;
    const loadMarkets = async () => {
      const list: Market[] = [];
      try {
        const uRes = await fetchProxy("https://api.upbit.com/v1/market/all");
        uRes.forEach((m: any) => {
          if (m.market.startsWith("KRW-")) list.push({ exchange: "upbit", coin: m.market.replace("KRW-", "") });
        });
      } catch (e) { console.error("Upbit market load err", e); }
      
      try {
        const bRes = await fetchProxy("https://api.bithumb.com/public/ticker/ALL_KRW");
        if (bRes.status === "0000") {
          Object.keys(bRes.data).filter(k => k !== "date").forEach(k => list.push({ exchange: "bithumb", coin: k }));
        }
      } catch (e) { console.error("Bithumb market load err", e); }

      try {
        const cRes = await fetchProxy("https://api.coinone.co.kr/public/v2/ticker_new/KRW");
        if (cRes.result === "success") {
          cRes.tickers.forEach((t: any) => list.push({ exchange: "coinone", coin: t.target_currency.toUpperCase() }));
        }
      } catch (e) { console.error("Coinone market load err", e); }
      
      if (mounted) setMarkets(list);
    };
    loadMarkets();
    return () => { mounted = false; };
  }, []);

  // 호가 폴링
  useEffect(() => {
    let active = true;

    const poll = async () => {
      const upbitCoins = Array.from(new Set(["USDT", "USDC", ...selectedPairs.filter(p => p.exchange === "upbit").map(p => p.coin)]));
      const bithumbCoins = Array.from(new Set(["USDT", "USDC", ...selectedPairs.filter(p => p.exchange === "bithumb").map(p => p.coin)]));
      const coinoneCoins = Array.from(new Set(["USDT", "USDC", ...selectedPairs.filter(p => p.exchange === "coinone").map(p => p.coin)]));

      const nextData = { upbit: {} as ExchangeData, bithumb: {} as ExchangeData, coinone: {} as ExchangeData };

      // Upbit (한 번에 요청 가능)
      if (upbitCoins.length > 0) {
        try {
          const m = upbitCoins.map(c => `KRW-${c}`).join(",");
          const res = await fetchProxy(`https://api.upbit.com/v1/orderbook?markets=${m}`);
          res.forEach((d: any) => {
            const coin = d.market.replace("KRW-", "");
            const asks = d.orderbook_units.map((u: any) => ({ price: u.ask_price, qty: u.ask_size })).slice(0, 4).reverse();
            const bids = d.orderbook_units.map((u: any) => ({ price: u.bid_price, qty: u.bid_size })).slice(0, 4);
            nextData.upbit[coin] = { asks, bids };
          });
        } catch {}
      }

      // Bithumb
      await Promise.all(bithumbCoins.map(async c => {
        try {
          const res = await fetchProxy(`https://api.bithumb.com/public/orderbook/${c}_KRW`);
          if (res.status === "0000" && res.data) {
            const asks = res.data.asks.map((u: any) => ({ price: parseFloat(u.price), qty: parseFloat(u.quantity) })).slice(0, 4).reverse();
            const bids = res.data.bids.map((u: any) => ({ price: parseFloat(u.price), qty: parseFloat(u.quantity) })).slice(0, 4);
            nextData.bithumb[c] = { asks, bids };
          }
        } catch {}
      }));

      // Coinone
      await Promise.all(coinoneCoins.map(async c => {
        try {
          const res = await fetchProxy(`https://api.coinone.co.kr/public/v2/orderbook/KRW/${c.toUpperCase()}`);
          if (res.result === "success") {
            const asks = res.asks.map((u: any) => ({ price: parseFloat(u.price), qty: parseFloat(u.qty) })).slice(0, 4).reverse();
            const bids = res.bids.map((u: any) => ({ price: parseFloat(u.price), qty: parseFloat(u.qty) })).slice(0, 4);
            nextData.coinone[c] = { asks, bids };
          }
        } catch {}
      }));

      if (active) setData(nextData);
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [selectedPairs]);

  const addPair = (m: Market) => {
    if (selectedPairs.length < 4) {
      if (!selectedPairs.some(p => p.exchange === m.exchange && p.coin === m.coin)) {
        setSelectedPairs([...selectedPairs, m]);
      }
    }
    setShowSearch(false);
    setSearch("");
  };

  const removePair = (idx: number) => {
    setSelectedPairs(prev => prev.filter((_, i) => i !== idx));
  };

  const filteredMarkets = markets.filter(m => m.coin.includes(search) && !selectedPairs.some(p => p.exchange === m.exchange && p.coin === m.coin));

  return (
    <div className="relative flex flex-col h-full bg-background overflow-hidden p-2"
         style={{ height: "calc(100vh - var(--topbar-h, 48px) - var(--bottomnav-h, 60px))" }}>
      
      {/* ── 요약 바 (USDT, USDC) ── */}
      <div className="rounded-xl p-2.5 relative shadow-lg backdrop-blur-md border border-white/10 shrink-0 mb-3"
           style={{ background: "linear-gradient(145deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)" }}>
        <div className="grid grid-cols-4 text-center text-[10px] text-muted-foreground mb-1.5 font-medium">
          <div></div>
          <div>COINONE</div>
          <div>UPBIT</div>
          <div>BITHUMB</div>
        </div>
        {(["USDT", "USDC"] as const).map(coin => (
          <div key={coin} className="grid grid-cols-4 text-center text-[10px] tabular-nums items-center py-1 border-t border-white/5 first:border-none">
            <div className="text-left text-foreground font-bold flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${coin === "USDT" ? "bg-emerald-500" : "bg-blue-500"}`} />
              {coin}
            </div>
            <div><SummaryBidAsk data={data.coinone[coin]} /></div>
            <div><SummaryBidAsk data={data.upbit[coin]} /></div>
            <div><SummaryBidAsk data={data.bithumb[coin]} /></div>
          </div>
        ))}
      </div>

      {/* ── 개별 호가창 그리드 ── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        <div className="grid grid-cols-2 gap-2">
          {selectedPairs.map((pair, idx) => (
            <OrderbookCard key={idx} pair={pair} data={data[pair.exchange][pair.coin]} onRemove={() => removePair(idx)} />
          ))}
          {selectedPairs.length < 4 && (
            <button 
              onClick={() => setShowSearch(true)} 
              className="flex items-center justify-center border-2 border-dashed border-border rounded-xl h-[280px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <div className="flex flex-col items-center gap-2">
                <Plus size={24} />
                <span className="text-[10px] font-medium">코인 추가</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* ── 검색 모달 ── */}
      {showSearch && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowSearch(false)}>
          <div className="bg-card w-full max-w-[320px] rounded-xl border border-white/10 p-4 flex flex-col max-h-[80vh] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm">KRW 마켓 코인 추가</h3>
              <button onClick={() => setShowSearch(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18}/>
              </button>
            </div>
            <input 
              type="text" placeholder="코인 심볼 검색 (예: BTC)" 
              value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
              className="bg-muted border border-border rounded-lg p-2 text-sm mb-3 outline-none focus:border-primary transition-colors text-foreground uppercase"
            />
            {markets.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">마켓 목록을 불러오는 중...</p>
            ) : (
              <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-1">
                {filteredMarkets.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-4">검색 결과가 없습니다.</p>
                ) : (
                  filteredMarkets.map(m => (
                    <button key={`${m.exchange}-${m.coin}`} onClick={() => addPair(m)} 
                      className="flex justify-between items-center px-3 py-2.5 hover:bg-muted rounded-lg transition-colors text-sm border border-transparent hover:border-border text-left">
                      <span className="font-bold text-foreground">{m.coin}</span>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">{m.exchange}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryBidAsk({ data }: { data?: OrderbookData }) {
  if (!data || !data.asks.length || !data.bids.length) return <span className="text-muted-foreground">— / —</span>;
  const ask = data.asks[data.asks.length - 1].price;
  const bid = data.bids[0].price;
  return (
    <div className="flex items-center justify-center whitespace-nowrap">
      <span className="text-red-500">{bid.toLocaleString()}</span>
      <span className="text-muted-foreground mx-1">/</span>
      <span className="text-blue-500">{ask.toLocaleString()}</span>
    </div>
  );
}

function OrderbookCard({ pair, data, onRemove }: { pair: Market; data?: OrderbookData; onRemove: () => void }) {
  const exLabel = pair.exchange === "upbit" ? "UPBIT" : pair.exchange === "bithumb" ? "BITHUMB" : "COINONE";
  return (
    <div className="bg-card rounded-xl border border-white/5 shadow-md flex flex-col overflow-hidden relative">
      <button onClick={onRemove} className="absolute top-2 right-2 text-muted-foreground hover:text-red-400 transition-colors z-10 bg-background/50 rounded-full p-0.5">
        <X size={12} />
      </button>
      <div className="px-2.5 py-2 border-b border-white/5 bg-muted/30">
        <div className="text-[11px] font-extrabold leading-tight tracking-tight text-foreground">{pair.coin} <span className="text-[9px] font-normal text-muted-foreground">/ KRW</span></div>
        <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">{exLabel}</div>
      </div>
      <div className="flex-1 flex flex-col p-1.5 justify-center">
        {/* Asks (매도) */}
        <div className="flex flex-col gap-0.5 mb-1.5">
          {data && data.asks.length > 0 ? data.asks.map((ask, i) => (
            <div key={i} className="flex justify-between items-center px-1.5 py-1 bg-blue-500/10 rounded">
              <span className="text-blue-500 font-semibold text-[11px] tabular-nums">{ask.price.toLocaleString()}</span>
              <span className="text-muted-foreground text-[8.5px] tabular-nums">{ask.qty.toLocaleString(undefined, {maximumFractionDigits:4})}</span>
            </div>
          )) : (
            <div className="flex items-center justify-center h-[90px] text-[10px] text-muted-foreground">로딩 중...</div>
          )}
        </div>
        {/* Bids (매수) */}
        <div className="flex flex-col gap-0.5">
          {data && data.bids.length > 0 && data.bids.map((bid, i) => (
            <div key={i} className="flex justify-between items-center px-1.5 py-1 bg-red-500/10 rounded">
              <span className="text-red-500 font-semibold text-[11px] tabular-nums">{bid.price.toLocaleString()}</span>
              <span className="text-muted-foreground text-[8.5px] tabular-nums">{bid.qty.toLocaleString(undefined, {maximumFractionDigits:4})}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
