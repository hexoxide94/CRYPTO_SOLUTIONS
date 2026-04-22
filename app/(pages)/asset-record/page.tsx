"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUsdtPrices } from "@/lib/usdt-context";
import { RefreshCcw, Plus, X, Trash2, Edit2 } from "lucide-react";

// ─── 상수 ──────────────────────────────────────────────────────
const BANKS = ["하나은행", "국민은행", "신한은행", "카카오뱅크", "케이뱅크", "토스뱅크", "SC제일은행", "우리은행", "우리종금", "농협"];
const PAYS = ["하나은행청약", "카카오페이", "서울페이", "온누리상품권"];
const SECURITIES = ["하나증권", "신한금융투자", "한국투자증권", "키움증권", "유안타증권", "대신증권", "KB증권", "토스증권", "나무증권", "삼성증권", "미래에셋증권", "유진투자증권", "메리츠증권"];
const PHYSICALS = ["금", "은"];

const OVERSEAS_EXCHANGES = ["BITGET", "BINANCE", "OKX", "BINGX", "DIGIFINEX", "POLYMARKET", "GATE", "KRAKEN", "HTX", "BYBIT"];
const DOMESTIC_EXCHANGES = ["업비트", "빗썸", "코인원", "코빗"];
const FOREIGN_CURRENCY_BANKS = ["토스뱅크", "SC제일은행", "삼성증권"];

const LS_KEY = "asset_snapshot_v3";
const SAMSUNG_HEDGE_FIXED_VALUE = 8480000; // 160,000원 * 53주

// ─── 타입 ──────────────────────────────────────────────────────
interface SnapshotData {
  rates: { usdt: string; usd: string; samsungPrice: string };
  cash: {
    banks: Record<string, string>;
    pays: Record<string, string>;
    debt: Record<string, string>;
    securities: Record<string, string>;
    physical: Record<string, string>;
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
  calculated?: any;
  kimp?: number;
}

const INITIAL_DATA: SnapshotData = {
  rates: { usdt: "", usd: "", samsungPrice: "" },
  cash: {
    banks: Object.fromEntries(BANKS.map(k => [k, ""])),
    pays: Object.fromEntries(PAYS.map(k => [k, ""])),
    debt: { "채무": "" },
    securities: Object.fromEntries(SECURITIES.map(k => [k, ""])),
    physical: Object.fromEntries(PHYSICALS.map(k => [k, ""])),
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
  const won = n % 10_000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  if (man > 0 && won > 0) return `${man.toLocaleString()}만 ${won.toLocaleString()}원`;
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
    <span className="text-xs text-muted-foreground w-28">{label}</span>
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
  const visible = keys.filter((k: string) => toNum(dataObj[k]) > 0 || visibleKeys[`${type}_${k}`]);
  const hidden = keys.filter((k: string) => toNum(dataObj[k]) === 0 && !visibleKeys[`${type}_${k}`]);

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
      {title && <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>}
      <div className="space-y-1">
        {visible.map((k: string) => (
          <InputRow key={k} label={k} suffix={suffix} value={dataObj[k]} onChange={(v) => updateFn(k, v)} />
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/5 text-right">
          <select
            className="bg-muted text-xs text-muted-foreground px-2 py-1.5 rounded-lg outline-none cursor-pointer"
            value=""
            onChange={e => { if (e.target.value) showKey(`${type}_${e.target.value}`) }}
          >
            <option value="" disabled>+ 항목 추가</option>
            {hidden.map((k: string) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}
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

  function handleEdit(snap: SnapshotRecord) {
    if (snap.detail_json) {
      setData({ ...INITIAL_DATA, ...snap.detail_json });
    }
    setEditingId(snap.id);
    setIsFormOpen(true);
  }

  function handleAddNew() {
    setData(INITIAL_DATA);
    setEditingId(null);
    setIsFormOpen(true);
  }

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
            debt: { ...INITIAL_DATA.cash.debt, ...parsed.cash?.debt },
            securities: { ...INITIAL_DATA.cash.securities, ...parsed.cash?.securities },
            physical: { ...INITIAL_DATA.cash.physical, ...parsed.cash?.physical },
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
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (isFormOpen) {
      fetchRates();
    }
  }, [isFormOpen, fetchRates]);

  useEffect(() => {
    if (usdt?.bestAsk && !data.rates.usdt) {
      updateRates({ usdt: String(Math.floor(usdt.bestAsk)) });
    }
  }, [usdt, data.rates.usdt]);

  // ─── 계산 로직 ────────────────────────────────────────────────
  const usdtRate = toNum(data.rates.usdt);
  const usdRate = toNum(data.rates.usd);
  const samsungPrice = toNum(data.rates.samsungPrice);

  let rawCash = 0;
  Object.values(data.cash.banks).forEach(v => rawCash += toNum(v));
  Object.values(data.cash.securities).forEach(v => rawCash += toNum(v));
  Object.values(data.cash.physical).forEach(v => rawCash += toNum(v));
  Object.entries(data.cash.pays).forEach(([k, v]) => {
    if (k === "서울페이" || k === "온누리상품권") rawCash += toNum(v) * 0.95;
    else rawCash += toNum(v);
  });
  rawCash -= toNum(data.cash.debt["채무"]);

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

  // ─── 삼성 숏 헷징 보정 ──────────────────────────────────────
  let finalCrypto = rawCrypto;
  const finalStock = rawStock;

  if (samsungPrice > 0) {
    const samsungStockValue = samsungPrice * 53;
    finalCrypto = rawCrypto + samsungStockValue - toNum(data.stock.samsung);
  }

  const cryptoStandby = finalCrypto - coinInvestAmount;
  const grandTotal = rawCash + finalCrypto + finalStock;

  // ─── 등록 처리 ────────────────────────────────────────────────
  async function handleConfirm() {
    setSaving(true);
    const kimpPercent = usdRate > 0 ? ((usdtRate / usdRate) - 1) * 100 : 0;
    const detail = {
      ...data,
      samsungHedgeValue: SAMSUNG_HEDGE_FIXED_VALUE,
      samsungPrice: samsungPrice,
      kimp: kimpPercent,
      calculated: {
        rawCash,
        rawCrypto,
        rawStock,
        finalCrypto,
        finalStock,
        coinInvestAmount,
        cryptoStandby
      }
    };

    if (editingId) {
      const { error } = await supabase.from("asset_snapshots").update({
        total_amount: Math.round(grandTotal),
        coin_amount: Math.round(finalCrypto),
        stock_amount: Math.round(finalStock),
        cash_amount: Math.round(rawCash),
        detail_json: detail,
      }).eq("id", editingId);

      setSaving(false);
      if (error) { alert("수정 실패: " + error.message); return; }
    } else {
      const { error } = await supabase.from("asset_snapshots").insert({
        recorded_at: new Date().toISOString(),
        total_amount: Math.round(grandTotal),
        coin_amount: Math.round(finalCrypto),
        stock_amount: Math.round(finalStock),
        cash_amount: Math.round(rawCash),
        detail_json: detail,
      });

      setSaving(false);
      if (error) { alert("저장 실패: " + error.message); return; }
    }

    setModal(false);
    setIsFormOpen(false);
    setEditingId(null);
    fetchSnapshots();
  }

  async function handleDelete(id: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("asset_snapshots").delete().eq("id", id);
    if (!error) fetchSnapshots();
  }

  // ─── 다이나믹 렌더 컴포넌트 ──────────────────────────────────
  const showKey = (k: string) => setVisibleKeys(p => ({ ...p, [k]: true }));

  // ─── 화면 렌더링 ────────────────────────────────────────────
  return (
    <div className="relative flex flex-col min-h-full">
      {!isFormOpen ? (
        <div className="flex-1 px-3 py-3 flex flex-col gap-3 pb-24">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">불러오는 중...</p>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-sm text-muted-foreground">등록된 자산 기록이 없습니다.</p>
            </div>
          ) : (
            snapshots.map(snap => (
              <div key={snap.id} className="bg-card border border-border rounded-xl p-4 shadow-sm relative group">
                <div className="absolute top-4 right-4 flex gap-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(snap)} className="hover:text-blue-400"><Edit2 size={14} /></button>
                  <button onClick={() => handleDelete(snap.id)} className="hover:text-red-400"><Trash2 size={14} /></button>
                </div>
                <div className="flex justify-between items-center mb-4 pr-16">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md w-fit">{fmtTime(snap.recorded_at)}</span>
                    {snap.detail_json?.kimp !== undefined && snap.detail_json.rates?.usdt && (
                      <span className="text-[10px] font-medium text-muted-foreground/80 pl-0.5">
                        테더: {fmtNum(snap.detail_json.rates.usdt)} | 김프: {snap.detail_json.kimp > 0 ? "+" : ""}{snap.detail_json.kimp.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-blue-400 shrink-0">{fmtKrw(snap.total_amount)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center justify-center py-2 px-1 bg-muted/30 rounded-lg border border-white/5 h-full text-center">
                    <span className="text-[10px] text-muted-foreground mb-0.5">코인</span>
                    <span className="text-xs font-semibold text-foreground mb-1">{fmtKrw(snap.coin_amount)}</span>
                    <span className="text-[9px] text-muted-foreground/60 whitespace-nowrap">
                      투자 {snap.detail_json?.calculated?.coinInvestAmount ? Math.round(snap.detail_json.calculated.coinInvestAmount / snap.coin_amount * 100) : 0}% / 대기 {snap.detail_json?.calculated?.cryptoStandby ? Math.round(snap.detail_json.calculated.cryptoStandby / snap.coin_amount * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-2 px-1 bg-muted/30 rounded-lg border border-white/5 h-full text-center">
                    <span className="text-[10px] text-muted-foreground mb-0.5">주식</span>
                    <span className="text-xs font-semibold text-foreground mb-1">{fmtKrw(snap.stock_amount)}</span>
                    <span className="text-[9px] text-transparent">.</span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-2 px-1 bg-muted/30 rounded-lg border border-white/5 h-full text-center">
                    <span className="text-[10px] text-muted-foreground mb-0.5">현금</span>
                    <span className="text-xs font-semibold text-foreground mb-1">{fmtKrw(snap.cash_amount)}</span>
                    <span className="text-[9px] text-transparent">.</span>
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="fixed left-0 right-0 w-full max-w-md mx-auto pointer-events-none flex"
            style={{ bottom: "calc(var(--bottomnav-h, 60px) + env(safe-area-inset-bottom) + 16px)", paddingLeft: 16, paddingRight: 16, zIndex: 40, justifyContent: "flex-end" }}>
            <button onClick={handleAddNew}
              className="pointer-events-auto bg-foreground text-background px-5 py-3 rounded-full shadow-xl font-bold flex items-center gap-2 active:scale-95 transition-transform text-sm">
              <Plus size={16} strokeWidth={3} />
              새 기록 추가
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-[60] bg-background w-full max-w-md mx-auto flex flex-col shadow-2xl"
             style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          
          <div className="flex flex-col h-full overflow-hidden">
            {/* 상단 콤팩트 헤더 */}
            <div className="flex flex-col border-b border-border bg-card shrink-0 px-3 py-2 pt-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">새 자산 기록</h2>
                <button onClick={() => { setIsFormOpen(false); setEditingId(null); }} className="p-1 bg-muted rounded-full text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex flex-1 items-center justify-between bg-muted/30 px-2 py-1.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-muted-foreground">USDT</span>
                  <input inputMode="numeric" value={fmtNum(data.rates.usdt)} onChange={e => updateRates({usdt: e.target.value})} className="w-12 bg-transparent text-xs font-semibold outline-none text-right tabular-nums" placeholder="0" />
                </div>
                <div className="flex flex-1 items-center justify-between bg-muted/30 px-2 py-1.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-muted-foreground">USD</span>
                  <input inputMode="numeric" value={fmtNum(data.rates.usd)} onChange={e => updateRates({usd: e.target.value})} className="w-12 bg-transparent text-xs font-semibold outline-none text-right tabular-nums" placeholder="0" />
                </div>
                <div className="flex flex-1 items-center justify-between bg-muted/30 px-2 py-1.5 rounded-lg border border-white/5">
                  <span className="text-[10px] text-muted-foreground flex gap-1 items-center">
                    삼성 <button onClick={fetchRates} className="active:rotate-180 transition-transform"><RefreshCcw size={8}/></button>
                  </span>
                  <input inputMode="numeric" value={fmtNum(data.rates.samsungPrice)} onChange={e => updateRates({samsungPrice: e.target.value})} className="w-14 bg-transparent text-xs font-semibold outline-none text-right tabular-nums" placeholder="0" />
                </div>
              </div>
            </div>

            {/* 탭 바 */}
            <div className="flex border-b border-border bg-card shrink-0">
              {(["coin", "stock", "cash"] as const).map(t => {
                const label = t === "coin" ? "코인" : t === "stock" ? "주식" : "현금";
                return (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                      tab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground/80"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* 서브 탭 바 */}
            {tab === "coin" && (
              <div className="flex gap-2 px-3 py-2 bg-muted/10 shrink-0 overflow-x-auto scrollbar-hide border-b border-border">
                {[
                  { id: "overseas", label: "해외 거래소" },
                  { id: "domestic", label: "국내 거래소" },
                  { id: "foreign", label: "외화 잔고" },
                  { id: "futures", label: "선물" }
                ].map(t => (
                  <button key={t.id} onClick={() => setCoinTab(t.id as "overseas" | "domestic" | "foreign" | "futures")}
                    className={`px-3 py-1.5 text-[11px] rounded-full whitespace-nowrap transition-colors ${coinTab === t.id ? "bg-foreground text-background font-bold shadow-md" : "bg-muted text-muted-foreground border border-white/5"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {tab === "cash" && (
              <div className="flex gap-2 px-3 py-2 bg-muted/10 shrink-0 overflow-x-auto scrollbar-hide border-b border-border">
                {[
                  { id: "banks", label: "은행" },
                  { id: "pays", label: "페이" },
                  { id: "securities", label: "증권사" },
                  { id: "etc", label: "기타" }
                ].map(t => (
                  <button key={t.id} onClick={() => setCashTab(t.id as "banks" | "pays" | "securities" | "etc")}
                    className={`px-3 py-1.5 text-[11px] rounded-full whitespace-nowrap transition-colors ${cashTab === t.id ? "bg-foreground text-background font-bold shadow-md" : "bg-muted text-muted-foreground border border-white/5"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* 입력 영역 */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              
              {tab === "coin" && (
                <div className="space-y-4 pb-10">
                  {coinTab === "overseas" && (
                    <DynamicGroup type="ovs" title="해외 거래소 (USDT)" keys={OVERSEAS_EXCHANGES} dataObj={data.crypto.overseas} suffix="$"
                      updateFn={(k:string,v:string) => setData(p => ({ ...p, crypto: { ...p.crypto, overseas: { ...p.crypto.overseas, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />
                  )}
                  {coinTab === "domestic" && <DomesticGroup keys={DOMESTIC_EXCHANGES} totalObj={data.crypto.domesticTotal} depObj={data.crypto.domesticDeposit} updateTotal={(k,v) => setData(p => ({ ...p, crypto: { ...p.crypto, domesticTotal: { ...p.crypto.domesticTotal, [k]: v } } }))} updateDep={(k,v) => setData(p => ({ ...p, crypto: { ...p.crypto, domesticDeposit: { ...p.crypto.domesticDeposit, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />}
                  {coinTab === "foreign" && (
                    <DynamicGroup type="for" title="외화 잔고 (USD)" keys={FOREIGN_CURRENCY_BANKS} dataObj={data.crypto.foreignCurrency} suffix="$"
                      updateFn={(k:string,v:string) => setData(p => ({ ...p, crypto: { ...p.crypto, foreignCurrency: { ...p.crypto.foreignCurrency, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />
                  )}
                  {coinTab === "futures" && (
                    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
                      <h3 className="text-sm font-bold text-foreground mb-3">선물 (담보금 평가액)</h3>
                      <div className="space-y-1">
                        <InputRow label="국내 선물" value={data.crypto.futuresDomestic} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, futuresDomestic: v } }))} />
                        <InputRow label="해외 선물" suffix="$" value={data.crypto.futuresOverseas} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, futuresOverseas: v } }))} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "stock" && (
                <div className="space-y-4 pb-10">
                  <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
                    <div className="space-y-1">
                      <InputRow label="자사주" value={data.stock.samsung} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, samsung: v } }))} />
                      <InputRow label="해외주식 (USD)" suffix="$" value={data.stock.overseas} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, overseas: v } }))} />
                      <InputRow label="국내주식" value={data.stock.domestic} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, domestic: v } }))} />
                      <InputRow label="IRP" value={data.stock.irp} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, irp: v } }))} />
                      <InputRow label="개인연금" value={data.stock.pension} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, pension: v } }))} />
                    </div>
                  </div>
                </div>
              )}

              {tab === "cash" && (
                <div className="space-y-4 pb-10">
                  {cashTab === "banks" && (
                    <DynamicGroup type="bnk" title="은행" keys={BANKS} dataObj={data.cash.banks}
                      updateFn={(k:string,v:string) => setData(p => ({ ...p, cash: { ...p.cash, banks: { ...p.cash.banks, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />
                  )}
                  {cashTab === "pays" && (
                    <>
                      <div className="text-[10px] text-muted-foreground mb-2 px-1 leading-relaxed">
                        서울페이 및 온누리상품권은 액면가를 입력 시 5% 할인된 현금 가치로 반영
                      </div>
                      <DynamicGroup type="pay" title="페이" keys={PAYS} dataObj={data.cash.pays}
                        updateFn={(k:string,v:string) => setData(p => ({ ...p, cash: { ...p.cash, pays: { ...p.cash.pays, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />
                    </>
                  )}
                  {cashTab === "securities" && (
                    <DynamicGroup type="sec" title="증권사 예수금" keys={SECURITIES} dataObj={data.cash.securities}
                      updateFn={(k:string,v:string) => setData(p => ({ ...p, cash: { ...p.cash, securities: { ...p.cash.securities, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />
                  )}
                  {cashTab === "etc" && (
                    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
                      <h3 className="text-sm font-bold text-foreground mb-3">기타</h3>
                      <div className="space-y-1">
                        <InputRow label="채무 (양수로 입력)" value={data.cash.debt["채무"]} onChange={(v: string) => setData(p => ({ ...p, cash: { ...p.cash, debt: { ...p.cash.debt, "채무": v } } }))} />
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/5">
                        <DynamicGroup type="phy" title="실물 자산" keys={PHYSICALS} dataObj={data.cash.physical}
                          updateFn={(k:string,v:string) => setData(p => ({ ...p, cash: { ...p.cash, physical: { ...p.cash.physical, [k]: v } } }))} visibleKeys={visibleKeys} showKey={showKey} />
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* ── 요약 및 등록 버튼 ── */}
            <div className="shrink-0 bg-card border-t border-border">
              <div className="px-4 py-3 bg-muted/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-muted-foreground">코인 (투자 {Math.round(coinInvestAmount/finalCrypto*100 || 0)}% / 대기 {Math.round(cryptoStandby/finalCrypto*100 || 0)}%)</span>
                  <span className="text-xs font-semibold text-foreground">{fmtKrw(finalCrypto)}</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-muted-foreground">주식</span>
                  <span className="text-xs font-semibold text-foreground">{fmtKrw(finalStock)}</span>
                </div>
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
                  <span className="text-[11px] text-muted-foreground">현금</span>
                  <span className="text-xs font-semibold text-foreground">{fmtKrw(rawCash)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-foreground">총 자산</span>
                  <span className="text-sm font-bold text-blue-400">{fmtKrw(grandTotal)}</span>
                </div>
              </div>

              <div className="px-3 py-2.5">
                <button
                  onClick={() => setModal(true)}
                  className="w-full py-3 rounded-xl bg-foreground text-background font-bold text-sm active:scale-[0.98] transition-transform shadow-lg"
                >
                  기록 저장하기
                </button>
              </div>
            </div>

            {/* ── 확인 모달 ── */}
            {modal && (
              <>
                <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setModal(false)} />
                <div className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-40px)] max-w-[320px] bg-card rounded-2xl border border-border p-5 shadow-2xl">
                  <h2 className="text-base font-bold text-foreground mb-4 text-center">자산 기록 저장</h2>
                  <div className="space-y-2 mb-6 bg-muted/20 p-3 rounded-xl border border-white/5">
                    <div className="flex justify-between"><span className="text-muted-foreground text-xs">코인</span><span className="text-foreground text-xs font-medium">{fmtKrw(finalCrypto)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground text-xs">주식</span><span className="text-foreground text-xs font-medium">{fmtKrw(finalStock)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground text-xs">현금</span><span className="text-foreground text-xs font-medium">{fmtKrw(rawCash)}</span></div>
                    <div className="pt-2 mt-2 border-t border-border flex justify-between">
                      <span className="text-foreground font-bold text-sm">총 자산</span>
                      <span className="text-blue-400 font-bold text-sm">{fmtKrw(grandTotal)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground font-semibold text-xs">취소</button>
                    <button onClick={handleConfirm} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-500 text-white font-semibold text-xs disabled:opacity-50">
                      {saving ? "저장 중..." : "저장하기"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
