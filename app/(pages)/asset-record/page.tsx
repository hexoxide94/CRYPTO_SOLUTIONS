"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUsdtPrices } from "@/lib/usdt-context";
import { RefreshCcw, Plus, X, Trash2, Edit2, LayoutList, List } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// ─── 상수 ──────────────────────────────────────────────────────
const BANKS = ["하나은행", "하나은행청약", "국민은행", "신한은행", "카카오뱅크", "케이뱅크", "토스뱅크", "SC제일은행", "우리은행", "우리종금", "농협"];
const PAYS = ["카카오페이", "서울페이", "온누리상품권"];
const SECURITIES = ["하나증권", "신한금융투자", "한국투자증권", "키움증권", "유안타증권", "대신증권", "KB증권", "토스증권", "나무증권", "삼성증권", "미래에셋증권", "유진투자증권", "메리츠증권"];
const PHYSICALS = ["금", "은"];

const OVERSEAS_EXCHANGES = ["BITGET", "BINANCE", "OKX", "BINGX", "DIGIFINEX", "POLYMARKET", "GATE", "KRAKEN", "HTX", "BYBIT"];
const DOMESTIC_EXCHANGES = ["업비트", "빗썸", "코인원", "코빗"];
const FOREIGN_CURRENCY_BANKS = ["토스뱅크", "SC제일은행", "삼성증권"];

const LS_KEY = "asset_snapshot_v3";

// ─── 타입 ──────────────────────────────────────────────────────
interface SnapshotData {
  rates: { usdt: string; usd: string; samsungPrice: string };
  cash: {
    banks: Record<string, string>;
    pays: Record<string, string>;
    securities: Record<string, string>;
    etc: Record<string, string>; // Unified physical and debt
  };
  crypto: {
    overseas: Record<string, string>;
    domesticTotal: Record<string, string>;
    domesticDeposit: Record<string, string>;
    foreignCurrency: Record<string, string>;
    futuresDomestic: string;
    futuresOverseas: string;
  };
  stock: {
    samsung: string;
    overseas: string;
    domestic: string;
    irp: string;
    pension: string;
  };
  calculated?: Record<string, number>;
  kimp?: number;
}

const INITIAL_DATA: SnapshotData = {
  rates: { usdt: "", usd: "", samsungPrice: "" },
  cash: {
    banks: Object.fromEntries(BANKS.map(k => [k, ""])),
    pays: Object.fromEntries(PAYS.map(k => [k, ""])),
    securities: Object.fromEntries(SECURITIES.map(k => [k, ""])),
    etc: { "채무": "", ...Object.fromEntries(PHYSICALS.map(k => [k, ""])) },
  },
  crypto: {
    overseas: Object.fromEntries(OVERSEAS_EXCHANGES.map(k => [k, ""])),
    domesticTotal: Object.fromEntries(DOMESTIC_EXCHANGES.map(k => [k, ""])),
    domesticDeposit: Object.fromEntries(DOMESTIC_EXCHANGES.map(k => [k, ""])),
    foreignCurrency: Object.fromEntries(FOREIGN_CURRENCY_BANKS.map(k => [k, ""])),
    futuresDomestic: "",
    futuresOverseas: "",
  },
  stock: {
    samsung: "8480000",
    overseas: "",
    domestic: "",
    irp: "",
    pension: "",
  }
};

// ─── 유틸 ──────────────────────────────────────────────────────
const toNum = (s: string) => Number(String(s).replace(/,/g, "")) || 0;

function fmtKrw(n: number): string {
  if (!n || isNaN(n)) return "0원";
  if (n < 0) return "-" + fmtKrw(Math.abs(n));
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function fmtNum(val: string) {
  if (!val) return "";
  const num = Number(val.replace(/,/g, ""));
  if (isNaN(num)) return "";
  return num.toLocaleString();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── 컴포넌트 ───────────────────────────────────────────────
interface InputRowProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  suffix?: string;
}

const InputRow = ({ label, value, onChange, placeholder = "0", suffix = "원" }: InputRowProps) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
    <span className="text-xs text-muted-foreground w-28 truncate pr-2" title={label}>{label}</span>
    <div className="flex items-center gap-1.5 flex-1 justify-end">
      <input
        inputMode="numeric"
        value={fmtNum(value)}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full max-w-[120px] bg-transparent text-right text-sm font-medium text-foreground outline-none tabular-nums placeholder:text-muted-foreground/30"
      />
      <span className="text-xs text-muted-foreground/60 w-5">{suffix}</span>
    </div>
  </div>
);

interface DynamicGroupProps {
  type: string;
  title?: string;
  keys: string[];
  dataObj: Record<string, string>;
  updateFn: (key: string, val: string) => void;
  suffix?: string;
  visibleKeys: Record<string, boolean>;
  showKey: (k: string) => void;
}

const DynamicGroup = ({ type, title, keys, dataObj, updateFn, suffix = "원", visibleKeys, showKey }: DynamicGroupProps) => {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customKey, setCustomKey] = useState("");

  const allKeys = Array.from(new Set([...keys, ...Object.keys(dataObj)]));
  const visible = allKeys.filter((k: string) => toNum(dataObj[k]) > 0 || visibleKeys[`${type}_${k}`] || (!keys.includes(k) && dataObj[k] !== undefined));
  const hidden = keys.filter((k: string) => toNum(dataObj[k]) === 0 && !visibleKeys[`${type}_${k}`]);

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
      {title && <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>}
      <div className="space-y-1">
        {visible.map((k: string) => (
          <InputRow key={k} label={k} suffix={suffix} value={dataObj[k]} onChange={(v) => updateFn(k, v)} />
        ))}
      </div>
      <div className="mt-3 pt-2 border-t border-white/5 flex justify-end items-center gap-2">
        {isCustomMode ? (
          <div className="flex items-center gap-1.5 w-full">
            <input
              autoFocus
              className="flex-1 bg-muted text-xs text-foreground px-2 py-1.5 rounded-lg outline-none border border-white/5"
              placeholder="항목 이름"
              value={customKey}
              onChange={e => setCustomKey(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customKey.trim()) {
                  updateFn(customKey.trim(), "0");
                  setCustomKey("");
                  setIsCustomMode(false);
                }
              }}
            />
            <button 
              onClick={() => {
                if (customKey.trim()) {
                  updateFn(customKey.trim(), "0");
                  setCustomKey("");
                  setIsCustomMode(false);
                }
              }}
              className="bg-foreground text-background text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
            >
              추가
            </button>
            <button onClick={() => setIsCustomMode(false)} className="text-[10px] text-muted-foreground px-1">취소</button>
          </div>
        ) : (
          <select
            className="bg-muted text-xs text-muted-foreground px-2 py-1.5 rounded-lg outline-none cursor-pointer"
            value=""
            onChange={e => {
              if (e.target.value === "__custom__") {
                setIsCustomMode(true);
              } else if (e.target.value) {
                showKey(`${type}_${e.target.value}`);
              }
            }}
          >
            <option value="" disabled>+ 항목 추가</option>
            {hidden.map((k: string) => <option key={k} value={k}>{k}</option>)}
            <option value="__custom__">+ 직접 입력</option>
          </select>
        )}
      </div>
    </div>
  );
};

interface DomesticGroupProps {
  keys: string[];
  totalObj: Record<string, string>;
  depObj: Record<string, string>;
  updateTotal: (k: string, v: string) => void;
  updateDep: (k: string, v: string) => void;
  visibleKeys: Record<string, boolean>;
  showKey: (k: string) => void;
}

const DomesticGroup = ({ keys, totalObj, depObj, updateTotal, updateDep, visibleKeys, showKey }: DomesticGroupProps) => {
  const visible = keys.filter(k => toNum(totalObj[k]) > 0 || toNum(depObj[k]) > 0 || visibleKeys[`dom_${k}`]);
  const hidden = keys.filter(k => toNum(totalObj[k]) === 0 && toNum(depObj[k]) === 0 && !visibleKeys[`dom_${k}`]);

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
      <h3 className="text-sm font-bold text-foreground mb-3 flex justify-between">국내 거래소</h3>
      {visible.map(k => (
        <div key={k} className="py-2 mb-2 border-b border-white/5 last:border-0 last:mb-0">
          <div className="text-xs font-semibold text-muted-foreground mb-2">{k}</div>
          <div className="flex flex-col gap-1 pl-2">
            <InputRow label="총액" value={totalObj[k]} onChange={v => updateTotal(k, v)} />
            <InputRow label="예치금" value={depObj[k]} onChange={v => updateDep(k, v)} />
          </div>
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/5 text-right">
          <select className="bg-muted text-xs text-muted-foreground px-2 py-1.5 rounded-lg outline-none cursor-pointer" value="" onChange={e => { if (e.target.value) showKey(`dom_${e.target.value}`) }}>
            <option value="" disabled>+ 거래소 추가</option>
            {hidden.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
export default function AssetRecordPage() {
  const { usdt } = useUsdtPrices();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"compact" | "detail">("detail");

  interface SnapshotRecord {
    id: string;
    recorded_at: string;
    total_amount: number;
    coin_amount: number;
    stock_amount: number;
    cash_amount: number;
    detail_json?: SnapshotData;
  }
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [tab, setTab] = useState<"coin" | "stock" | "cash">("coin");
  const [coinTab, setCoinTab] = useState<"overseas" | "domestic" | "foreign" | "futures">("overseas");
  const [cashTab, setCashTab] = useState<"banks" | "pays" | "securities" | "etc">("banks");
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);

  const [data, setData] = useState<SnapshotData>(() => {
    if (typeof window === "undefined") return INITIAL_DATA;
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          rates: { ...INITIAL_DATA.rates, ...parsed.rates },
          cash: {
            banks: { ...INITIAL_DATA.cash.banks, ...parsed.cash?.banks },
            pays: { ...INITIAL_DATA.cash.pays, ...parsed.cash?.pays },
            securities: { ...INITIAL_DATA.cash.securities, ...parsed.cash?.securities },
            etc: { ...INITIAL_DATA.cash.etc, ...parsed.cash?.etc, ...(parsed.cash?.debt && parsed.cash?.physical ? { ...parsed.cash.debt, ...parsed.cash.physical } : {}) },
          },
          crypto: {
            overseas: { ...INITIAL_DATA.crypto.overseas, ...parsed.crypto?.overseas },
            domesticTotal: { ...INITIAL_DATA.crypto.domesticTotal, ...(parsed.crypto?.domesticTotal || parsed.crypto?.domesticCoin) },
            domesticDeposit: { ...INITIAL_DATA.crypto.domesticDeposit, ...parsed.crypto?.domesticDeposit },
            foreignCurrency: { ...INITIAL_DATA.crypto.foreignCurrency, ...parsed.crypto?.foreignCurrency },
            futuresDomestic: parsed.crypto?.futuresDomestic || "",
            futuresOverseas: parsed.crypto?.futuresOverseas || "",
          },
          stock: { ...INITIAL_DATA.stock, ...parsed.stock },
        };
      }
    } catch { /* ignore */ }
    return INITIAL_DATA;
  });

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }, [data]);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    const { data: dbData } = await supabase
      .from("asset_snapshots")
      .select("*")
      .order("recorded_at", { ascending: false });
    if (dbData) setSnapshots(dbData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const updateRates = (patch: Partial<SnapshotData["rates"]>) => {
    setData(prev => ({ ...prev, rates: { ...prev.rates, ...patch } }));
  };

  const fetchRates = useCallback(async () => {
    try {
      const r1 = await fetch('/api/usd-rate').then(res => res.json());
      if (r1.rate) updateRates({ usd: String(Math.floor(r1.rate)) });
      const r2 = await fetch('/api/stock-price?symbol=005930.KS').then(res => res.json());
      if (r2.price) updateRates({ samsungPrice: String(r2.price) });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isFormOpen) fetchRates();
  }, [isFormOpen, fetchRates]);

  useEffect(() => {
    if (usdt?.bestAsk && !data.rates.usdt) {
      updateRates({ usdt: String(Math.floor(usdt.bestAsk)) });
    }
  }, [usdt, data.rates.usdt]);

  const showKey = (k: string) => setVisibleKeys(p => ({ ...p, [k]: true }));

  function handleEdit(snap: SnapshotRecord) {
    if (snap.detail_json) {
      setData({ ...INITIAL_DATA, ...snap.detail_json });
    }
    setEditingId(snap.id);
    setIsFormOpen(true);
  }

  function handleAddNew() {
    if (snapshots.length > 0 && snapshots[0].detail_json) {
      const prev = snapshots[0].detail_json;
      setData({ 
        ...INITIAL_DATA, 
        ...prev,
        cash: {
          ...INITIAL_DATA.cash,
          ...prev.cash,
          etc: {
            ...INITIAL_DATA.cash.etc,
            ...prev.cash?.etc,
            ...(prev.cash && "debt" in prev.cash ? (prev.cash as unknown as { debt?: Record<string, string> }).debt : {}),
            ...(prev.cash && "physical" in prev.cash ? (prev.cash as unknown as { physical?: Record<string, string> }).physical : {})
          }
        },
        rates: INITIAL_DATA.rates 
      });
    } else {
      setData(INITIAL_DATA);
    }
    setEditingId(null);
    setIsFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("asset_snapshots").delete().eq("id", id);
    if (!error) fetchSnapshots();
  }

  // ─── 계산 로직 ────────────────────────────────────────────────
  const usdtRate = toNum(data.rates.usdt);
  const usdRate = toNum(data.rates.usd);
  const samsungPrice = toNum(data.rates.samsungPrice);

  let rawCash = 0;
  Object.values(data.cash.banks).forEach(v => rawCash += toNum(v));
  Object.values(data.cash.securities).forEach(v => rawCash += toNum(v));
  Object.entries(data.cash.pays).forEach(([k, v]) => {
    if (k === "서울페이" || k === "온누리상품권") rawCash += toNum(v) * 0.95;
    else rawCash += toNum(v);
  });
  Object.entries(data.cash.etc).forEach(([k, v]) => {
    if (k === "채무") rawCash -= toNum(v);
    else rawCash += toNum(v);
  });

  let rawCrypto = 0;
  let coinInvestAmount = 0;
  Object.values(data.crypto.overseas).forEach(v => {
    const krw = toNum(v) * usdtRate;
    rawCrypto += krw;
    coinInvestAmount += krw;
  });
  Object.entries(data.crypto.domesticTotal).forEach(([k, v]) => {
    const total = toNum(v);
    const deposit = toNum(data.crypto.domesticDeposit[k]);
    rawCrypto += total;
    coinInvestAmount += Math.max(0, total - deposit);
  });
  Object.values(data.crypto.foreignCurrency).forEach(v => rawCrypto += toNum(v) * usdRate);
  rawCrypto += toNum(data.crypto.futuresDomestic);
  rawCrypto += toNum(data.crypto.futuresOverseas) * usdRate;

  let rawStock = 0;
  rawStock += toNum(data.stock.overseas) * usdRate;
  rawStock += toNum(data.stock.domestic);
  rawStock += toNum(data.stock.irp);
  rawStock += toNum(data.stock.pension);
  rawStock += toNum(data.stock.samsung);

  let finalCrypto = rawCrypto;
  const finalStock = rawStock;
  if (samsungPrice > 0) {
    const samsungStockValue = samsungPrice * 53;
    finalCrypto = rawCrypto + samsungStockValue - toNum(data.stock.samsung);
  }
  const cryptoStandby = finalCrypto - coinInvestAmount;
  const grandTotal = rawCash + finalCrypto + finalStock;

  async function handleConfirm() {
    setSaving(true);
    const kimpPercent = usdRate > 0 ? ((usdtRate / usdRate) - 1) * 100 : 0;
    const detail = {
      ...data,
      samsungPrice,
      kimp: kimpPercent,
      calculated: { rawCash, rawCrypto, rawStock, finalCrypto, finalStock, coinInvestAmount, cryptoStandby }
    };

    const payload = {
      total_amount: Math.round(grandTotal),
      coin_amount: Math.round(finalCrypto),
      stock_amount: Math.round(finalStock),
      cash_amount: Math.round(rawCash),
      detail_json: detail,
    };

    const { error } = editingId 
      ? await supabase.from("asset_snapshots").update(payload).eq("id", editingId)
      : await supabase.from("asset_snapshots").insert({ ...payload, recorded_at: new Date().toISOString() });

    setSaving(false);
    if (error) { alert("처리 실패: " + error.message); return; }
    setModal(false); setIsFormOpen(false); setEditingId(null); fetchSnapshots();
  }

  // ─── 화면 렌더링 ────────────────────────────────────────────
  return (
    <div className="relative flex flex-col min-h-full">
      {!isFormOpen ? (
        <div className="flex-1 px-3 py-3 flex flex-col gap-3 pb-24">
          <div className="flex justify-between items-center mb-1 px-1">
            <h1 className="text-sm font-bold text-foreground opacity-80">자산 기록 목록</h1>
            <div className="flex bg-muted/50 p-1 rounded-lg border border-white/5">
              <button onClick={() => setViewMode("compact")} className={`p-1.5 rounded-md transition-all ${viewMode === "compact" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}><List size={14} /></button>
              <button onClick={() => setViewMode("detail")} className={`p-1.5 rounded-md transition-all ${viewMode === "detail" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}><LayoutList size={14} /></button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">불러오는 중...</p>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-sm text-muted-foreground">등록된 자산 기록이 없습니다.</p>
            </div>
          ) : (
            snapshots.map(snap => {
              const detail = snap.detail_json;
              const kimp = detail?.kimp ?? 0;
              const debt = toNum(detail?.cash?.etc?.["채무"] || "0");
              const grossAsset = snap.total_amount + debt;

              const coin = detail?.calculated?.finalCrypto || snap.coin_amount;
              const stock = detail?.calculated?.finalStock || snap.stock_amount;
              const grossCash = (detail?.calculated?.rawCash || snap.cash_amount) + debt;
              const outerData = [{ name: "코인", value: coin, color: "#0ea5e9" }, { name: "주식", value: stock, color: "#a855f7" }, { name: "현금", value: grossCash, color: "#f59e0b" }];
              const innerData = [{ name: "부채", value: debt, color: "#ef4444" }, { name: "순자산", value: snap.total_amount, color: "#10b981" }];

              const outerMaxIdx = outerData.reduce((max, x, i, arr) => x.value > arr[max].value ? i : max, 0);
              const innerMaxIdx = innerData.reduce((max, x, i, arr) => x.value > arr[max].value ? i : max, 0);

              if (viewMode === "compact") {
                const d = new Date(snap.recorded_at);
                const dateStr = `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
                return (
                  <div key={snap.id} className="bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm flex items-center justify-between group relative">
                    <div className="flex items-center gap-4">
                      <span className="text-[11px] font-bold text-muted-foreground w-12">{dateStr}</span>
                      <div className="h-3 w-[1px] bg-border" />
                      <span className={`text-[10px] font-medium w-12 text-center ${kimp > 0 ? "text-red-400" : "text-blue-400"}`}>{kimp > 0 ? "+" : ""}{kimp.toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-foreground">{fmtKrw(snap.total_amount)}</span>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(snap)} className="text-muted-foreground hover:text-blue-400"><Edit2 size={12} /></button>
                        <button onClick={() => handleDelete(snap.id)} className="text-muted-foreground hover:text-red-400"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={snap.id} className="bg-card border border-border rounded-xl p-3 shadow-sm relative group">
                  <div className="absolute top-3.5 right-4 flex gap-3 text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={() => handleEdit(snap)} className="hover:text-blue-400"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(snap.id)} className="hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                  
                  <div className="flex justify-between items-start mb-3 pr-14">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md w-fit">{fmtTime(snap.recorded_at)}</span>
                      <span className="text-[9px] font-medium text-muted-foreground/80 pl-0.5">김프: <span className={kimp > 0 ? "text-red-400" : "text-blue-400"}>{kimp > 0 ? "+" : ""}{kimp.toFixed(2)}%</span></span>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-muted-foreground">총 자산 (순자산)</div>
                      <div className="text-sm font-black text-blue-400 tracking-tight">{fmtKrw(snap.total_amount)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* 좌측 3줄 텍스트 (코인 통합) */}
                    <div className="w-1/2 flex flex-col gap-1.5">
                      <div className="flex flex-col py-1 px-2 bg-muted/30 rounded-lg border border-white/5">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[8px] text-muted-foreground">코인 총계</span>
                          <span className="text-[8px] font-bold text-muted-foreground/70">
                            {detail?.calculated?.coinInvestAmount ? Math.round(detail.calculated.coinInvestAmount/snap.coin_amount*100) : 0}% / {detail?.calculated?.cryptoStandby ? Math.round(detail.calculated.cryptoStandby/snap.coin_amount*100) : 0}%
                          </span>
                        </div>
                        <span className="text-xs font-bold text-foreground">{fmtKrw(snap.coin_amount)}</span>
                      </div>
                      <div className="flex flex-col py-1 px-2 bg-muted/30 rounded-lg border border-white/5">
                        <span className="text-[8px] text-muted-foreground mb-0.5">주식 총액</span>
                        <span className="text-xs font-bold text-foreground">{fmtKrw(snap.stock_amount)}</span>
                      </div>
                      <div className="flex flex-col py-1 px-2 bg-muted/30 rounded-lg border border-white/5">
                        <span className="text-[8px] text-muted-foreground mb-0.5">현금 총액 (순수)</span>
                        <span className="text-xs font-bold text-foreground">{fmtKrw(snap.cash_amount)}</span>
                      </div>
                    </div>

                    {/* 우측 이중 도넛 차트 */}
                    <div className="w-1/2 flex flex-col items-center">
                      <div className="w-full h-[110px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={outerData} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}
                              label={({ index, percent }: { index?: number; percent?: number }) => index === outerMaxIdx ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""}
                              labelLine={false}
                            >
                              {outerData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                            </Pie>
                            <Pie
                              data={innerData} cx="50%" cy="50%" innerRadius={20} outerRadius={32} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}
                              label={({ index, percent }: { index?: number; percent?: number }) => index === innerMaxIdx ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""}
                              labelLine={false}
                            >
                              {innerData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col -mt-1">
                          <span className="text-[7px] text-muted-foreground font-bold uppercase tracking-tighter">Gross</span>
                          <span className="text-[9px] font-black text-foreground">{Math.round(grossAsset/1000000)}M</span>
                        </div>
                      </div>
                      {/* 범례 */}
                      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 mt-1 px-2">
                        {[{n:"코인",c:"#0ea5e9"},{n:"주식",c:"#a855f7"},{n:"현금",c:"#f59e0b"},{n:"부채",c:"#ef4444"},{n:"순자산",c:"#10b981"}].map(l => (
                          <div key={l.n} className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:l.c}} />
                            <span className="text-[7px] text-muted-foreground/80">{l.n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div className="fixed left-0 right-0 w-full max-w-md mx-auto pointer-events-none flex" style={{ bottom: "calc(var(--bottomnav-h, 60px) + env(safe-area-inset-bottom) + 16px)", paddingLeft: 16, paddingRight: 16, zIndex: 40, justifyContent: "flex-end" }}>
            <button onClick={handleAddNew} className="pointer-events-auto bg-foreground text-background px-5 py-3 rounded-full shadow-xl font-bold flex items-center gap-2 active:scale-95 transition-transform text-sm"><Plus size={16} strokeWidth={3} />새 기록 추가</button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-[60] bg-background w-full max-w-md mx-auto flex flex-col shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-2.5"><h2 className="text-sm font-bold text-foreground">자산 기록</h2><div className="flex items-center gap-2 bg-muted/40 px-2 py-1 rounded-lg border border-white/5"><div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-muted-foreground/70 leading-none">USDT/USD</span><div className="flex items-center gap-1"><input inputMode="numeric" value={fmtNum(data.rates.usdt)} onChange={e => updateRates({usdt: e.target.value})} className="w-9 bg-transparent text-[11px] font-bold outline-none text-right tabular-nums text-foreground/90" /><span className="text-[9px] text-muted-foreground/40">/</span><input inputMode="numeric" value={fmtNum(data.rates.usd)} onChange={e => updateRates({usd: e.target.value})} className="w-9 bg-transparent text-[11px] font-bold outline-none text-left tabular-nums text-foreground/90" /></div></div><div className="w-[1px] h-2.5 bg-white/10" /><div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-muted-foreground/70 leading-none">삼성</span><input inputMode="numeric" value={fmtNum(data.rates.samsungPrice)} onChange={e => updateRates({samsungPrice: e.target.value})} className="w-12 bg-transparent text-[11px] font-bold outline-none text-right tabular-nums text-foreground/90" /><button onClick={fetchRates} className="active:rotate-180 transition-transform text-muted-foreground/60 hover:text-foreground"><RefreshCcw size={10}/></button></div></div></div>
              <button onClick={() => { setIsFormOpen(false); setEditingId(null); }} className="p-1.5 bg-muted/50 rounded-full text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
            </div>
            <div className="flex border-b border-border bg-card shrink-0">{(["coin", "stock", "cash"] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground/80"}`}>{t === "coin" ? "코인" : t === "stock" ? "주식" : "현금"}</button>)}</div>
            {tab === "coin" && (
              <div className="flex gap-2 px-3 py-2 bg-muted/10 shrink-0 overflow-x-auto scrollbar-hide border-b border-border">
                {[{ id: "overseas", label: "해외 거래소" }, { id: "domestic", label: "국내 거래소" }, { id: "foreign", label: "외화 잔고" }, { id: "futures", label: "선물" }].map(t => (
                  <button key={t.id} onClick={() => setCoinTab(t.id as "overseas" | "domestic" | "foreign" | "futures")} className={`px-3 py-1.5 text-[11px] rounded-full whitespace-nowrap transition-colors ${coinTab === t.id ? "bg-foreground text-background font-bold shadow-md" : "bg-muted text-muted-foreground border border-white/5"}`}>{t.label}</button>
                ))}
              </div>
            )}
            {tab === "cash" && (
              <div className="flex gap-2 px-3 py-2 bg-muted/10 shrink-0 overflow-x-auto scrollbar-hide border-b border-border">
                {[{ id: "banks", label: "은행" }, { id: "pays", label: "페이" }, { id: "securities", label: "증권사" }, { id: "etc", label: "실물 및 부채" }].map(t => (
                  <button key={t.id} onClick={() => setCashTab(t.id as "banks" | "pays" | "securities" | "etc")} className={`px-3 py-1.5 text-[11px] rounded-full whitespace-nowrap transition-colors ${cashTab === t.id ? "bg-foreground text-background font-bold shadow-md" : "bg-muted text-muted-foreground border border-white/5"}`}>{t.label}</button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {tab === "coin" && (
                <div className="space-y-4 pb-10">
                  {coinTab === "overseas" && <DynamicGroup type="ovs" title="해외 거래소 (USDT)" keys={OVERSEAS_EXCHANGES} dataObj={data.crypto.overseas} suffix="$" updateFn={(k,v) => setData(p => ({ ...p, crypto: { ...p.crypto, overseas: { ...p.crypto.overseas, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                  {coinTab === "domestic" && <DomesticGroup keys={DOMESTIC_EXCHANGES} totalObj={data.crypto.domesticTotal} depObj={data.crypto.domesticDeposit} updateTotal={(k,v) => setData(p => ({ ...p, crypto: { ...p.crypto, domesticTotal: { ...p.crypto.domesticTotal, [k]: v } } }))} updateDep={(k,v) => setData(p => ({ ...p, crypto: { ...p.crypto, domesticDeposit: { ...p.crypto.domesticDeposit, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                  {coinTab === "foreign" && <DynamicGroup type="for" title="외화 잔고 (USD)" keys={FOREIGN_CURRENCY_BANKS} dataObj={data.crypto.foreignCurrency} suffix="$" updateFn={(k,v) => setData(p => ({ ...p, crypto: { ...p.crypto, foreignCurrency: { ...p.crypto.foreignCurrency, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                  {coinTab === "futures" && <div className="bg-card border border-border rounded-xl p-3 shadow-sm"><h3 className="text-sm font-bold text-foreground mb-3">선물 (담보금 평가액)</h3><div className="space-y-1"><InputRow label="국내 선물" value={data.crypto.futuresDomestic} onChange={v => setData(p => ({ ...p, crypto: { ...p.crypto, futuresDomestic: v } }))} /><InputRow label="해외 선물" suffix="$" value={data.crypto.futuresOverseas} onChange={v => setData(p => ({ ...p, crypto: { ...p.crypto, futuresOverseas: v } }))} /></div></div>}
                </div>
              )}
              {tab === "stock" && (
                <div className="space-y-4 pb-10">
                  <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
                    <div className="space-y-1">
                      <InputRow label="자사주" value={data.stock.samsung} onChange={v => setData(p => ({ ...p, stock: { ...p.stock, samsung: v } }))} />
                      <InputRow label="해외주식 (USD)" suffix="$" value={data.stock.overseas} onChange={v => setData(p => ({ ...p, stock: { ...p.stock, overseas: v } }))} />
                      <InputRow label="국내주식" value={data.stock.domestic} onChange={v => setData(p => ({ ...p, stock: { ...p.stock, domestic: v } }))} />
                      <InputRow label="IRP" value={data.stock.irp} onChange={v => setData(p => ({ ...p, stock: { ...p.stock, irp: v } }))} />
                      <InputRow label="개인연금" value={data.stock.pension} onChange={v => setData(p => ({ ...p, stock: { ...p.stock, pension: v } }))} />
                    </div>
                  </div>
                </div>
              )}
              {tab === "cash" && (
                <div className="space-y-4 pb-10">
                  {cashTab === "banks" && <DynamicGroup type="bnk" title="은행" keys={BANKS} dataObj={data.cash.banks} updateFn={(k,v) => setData(p => ({ ...p, cash: { ...p.cash, banks: { ...p.cash.banks, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                  {cashTab === "pays" && <><div className="text-[10px] text-muted-foreground mb-2 px-1 leading-relaxed">서울페이 및 온누리상품권은 액면가를 입력 시 5% 할인된 현금 가치로 반영</div><DynamicGroup type="pay" title="페이" keys={PAYS} dataObj={data.cash.pays} updateFn={(k,v) => setData(p => ({ ...p, cash: { ...p.cash, pays: { ...p.cash.pays, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} /></>}
                  {cashTab === "securities" && <DynamicGroup type="sec" title="증권사 예수금" keys={SECURITIES} dataObj={data.cash.securities} updateFn={(k,v) => setData(p => ({ ...p, cash: { ...p.cash, securities: { ...p.cash.securities, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                  {cashTab === "etc" && <DynamicGroup type="etc" title="실물 및 부채" keys={["채무", ...PHYSICALS]} dataObj={data.cash.etc} updateFn={(k,v) => setData(p => ({ ...p, cash: { ...p.cash, etc: { ...p.cash.etc, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                </div>
              )}
            </div>
            <div className="bg-card border-t border-border px-4 py-4 shrink-0 flex items-center justify-between gap-4">
              <div className="flex-1 bg-muted/30 p-3 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-1 pb-1 border-b border-border/40"><span className="text-[10px] text-muted-foreground">코인</span><span className="text-[11px] font-semibold text-foreground">{fmtKrw(finalCrypto)}</span></div>
                <div className="flex justify-between items-center mb-1 pb-1 border-b border-border/40"><span className="text-[10px] text-muted-foreground">주식</span><span className="text-[11px] font-semibold text-foreground">{fmtKrw(finalStock)}</span></div>
                <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-border/40"><span className="text-[10px] text-muted-foreground">현금</span><span className="text-[11px] font-semibold text-foreground">{fmtKrw(rawCash)}</span></div>
                <div className="flex justify-between items-center"><span className="text-xs font-bold text-foreground">총 자산</span><span className="text-xs font-bold text-blue-400">{fmtKrw(grandTotal)}</span></div>
              </div>
              <div className="px-4 py-4"><button onClick={() => setModal(true)} className="h-16 w-24 rounded-xl bg-foreground text-background font-bold text-sm active:scale-[0.96] transition-transform shadow-lg flex flex-col items-center justify-center gap-1"><span>기록</span><span>저장</span></button></div>
            </div>
          </div>
          {modal && (
            <><div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setModal(false)} /><div className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-40px)] max-w-[320px] bg-card rounded-2xl border border-border p-5 shadow-2xl"><h2 className="text-base font-bold text-foreground mb-4 text-center">자산 기록 저장</h2><div className="space-y-2 mb-6 bg-muted/20 p-3 rounded-xl border border-white/5"><div className="flex justify-between"><span className="text-muted-foreground text-xs">코인</span><span className="text-foreground text-xs font-medium">{fmtKrw(finalCrypto)}</span></div><div className="flex justify-between"><span className="text-muted-foreground text-xs">주식</span><span className="text-foreground text-xs font-medium">{fmtKrw(finalStock)}</span></div><div className="flex justify-between"><span className="text-muted-foreground text-xs">현금</span><span className="text-foreground text-xs font-medium">{fmtKrw(rawCash)}</span></div><div className="pt-2 mt-2 border-t border-border flex justify-between"><span className="text-foreground font-bold text-sm">총 자산</span><span className="text-blue-400 font-bold text-sm">{fmtKrw(grandTotal)}</span></div></div><div className="flex gap-2"><button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground font-semibold text-xs">취소</button><button onClick={handleConfirm} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-500 text-white font-semibold text-xs disabled:opacity-50">{saving ? "저장 중..." : "저장하기"}</button></div></div></>
          )}
        </div>
      )}
    </div>
  );
}
