"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUsdtPrices } from "@/lib/usdt-context";
import { RefreshCcw } from "lucide-react";

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
    domesticCoin: Record<string, string>;
    domesticDeposit: Record<string, string>;
    foreignCurrency: Record<string, string>;
    futuresDomestic: string;
    futuresOverseas: string;
  };
  stock: {
    overseas: string;
    domestic: string;
    irp: string;
    pension: string;
  };
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
    domesticCoin: Object.fromEntries(DOMESTIC_EXCHANGES.map(k => [k, ""])),
    domesticDeposit: Object.fromEntries(DOMESTIC_EXCHANGES.map(k => [k, ""])),
    foreignCurrency: Object.fromEntries(FOREIGN_CURRENCY_BANKS.map(k => [k, ""])),
    futuresDomestic: "",
    futuresOverseas: "",
  },
  stock: {
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

// ═══════════════════════════════════════════════════════════════
export default function AssetRecordPage() {
  const router = useRouter();
  const { usdt } = useUsdtPrices();
  const [tab, setTab] = useState<"coin" | "stock" | "cash">("coin");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);

  const [data, setData] = useState<SnapshotData>(() => {
    if (typeof window === "undefined") return INITIAL_DATA;
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with initial to avoid missing keys
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
            domesticCoin: { ...INITIAL_DATA.crypto.domesticCoin, ...parsed.crypto?.domesticCoin },
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

  useEffect(() => { fetchRates(); }, [fetchRates]);

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
  rawCash -= toNum(data.cash.debt["채무"]); // 채무는 양수로 입력받아 뺌

  let rawCrypto = 0;
  let coinInvestAmount = 0; // 코인 투자 금액 (국내 코인 + 해외 USDT)
  
  Object.values(data.crypto.overseas).forEach(v => {
    const krw = toNum(v) * usdtRate;
    rawCrypto += krw;
    coinInvestAmount += krw;
  });
  Object.values(data.crypto.domesticCoin).forEach(v => {
    const krw = toNum(v);
    rawCrypto += krw;
    coinInvestAmount += krw;
  });
  Object.values(data.crypto.domesticDeposit).forEach(v => rawCrypto += toNum(v));
  Object.values(data.crypto.foreignCurrency).forEach(v => rawCrypto += toNum(v) * usdRate);
  
  rawCrypto += toNum(data.crypto.futuresDomestic); // 원화 기준 평가액 입력
  rawCrypto += toNum(data.crypto.futuresOverseas) * usdRate; // USD 기준 입력

  let rawStock = 0;
  rawStock += toNum(data.stock.overseas) * usdRate; // USD
  rawStock += toNum(data.stock.domestic);
  rawStock += toNum(data.stock.irp);
  rawStock += toNum(data.stock.pension);

  // ─── 삼성 숏 헷징 보정 ──────────────────────────────────────
  let finalCrypto = rawCrypto;
  let finalStock = rawStock;

  if (samsungPrice > 0) {
    const samsungStockValue = samsungPrice * 53;
    finalCrypto = rawCrypto + samsungStockValue - SAMSUNG_HEDGE_FIXED_VALUE;
    finalStock = rawStock + SAMSUNG_HEDGE_FIXED_VALUE;
  }

  const cryptoStandby = finalCrypto - coinInvestAmount;
  const grandTotal = rawCash + finalCrypto + finalStock;

  // ─── 등록 처리 ────────────────────────────────────────────────
  async function handleConfirm() {
    setSaving(true);
    const detail = {
      ...data,
      samsungHedgeValue: SAMSUNG_HEDGE_FIXED_VALUE,
      samsungPrice: samsungPrice,
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

    const { error } = await supabase.from("asset_snapshots").insert({
      recorded_at: new Date().toISOString(),
      total_amount: grandTotal,
      coin_amount: finalCrypto,
      stock_amount: finalStock,
      cash_amount: rawCash,
      detail_json: detail,
    });

    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    setModal(false);
    router.push("/home");
  }

  // ─── 컴포넌트 유틸 ────────────────────────────────────────────
  interface InputRowProps {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    suffix?: string;
  }

  const InputRow = ({ label, value, onChange, placeholder = "0", suffix = "원" }: InputRowProps) => (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
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

  return (
    <div className="flex flex-col h-full bg-background" style={{ height: "calc(100dvh - var(--topbar-h,48px) - var(--bottomnav-h,60px) - env(safe-area-inset-bottom))" }}>
      
      {/* ── 글로벌 설정 바 ── */}
      <div className="flex px-4 py-3 gap-3 border-b border-border bg-card shrink-0">
        <div className="flex flex-col flex-1 gap-1">
          <span className="text-[10px] text-muted-foreground">USDT 가격</span>
          <div className="flex items-center">
            <input inputMode="numeric" value={fmtNum(data.rates.usdt)} onChange={e => updateRates({ usdt: e.target.value })} className="w-full bg-transparent text-sm font-semibold outline-none" placeholder="0" />
            <span className="text-xs text-muted-foreground ml-1">원</span>
          </div>
        </div>
        <div className="flex flex-col flex-1 gap-1 border-l border-border pl-3">
          <span className="text-[10px] text-muted-foreground">달러 환율</span>
          <div className="flex items-center">
            <input inputMode="numeric" value={fmtNum(data.rates.usd)} onChange={e => updateRates({ usd: e.target.value })} className="w-full bg-transparent text-sm font-semibold outline-none" placeholder="0" />
            <span className="text-xs text-muted-foreground ml-1">원</span>
          </div>
        </div>
        <div className="flex flex-col flex-1 gap-1 border-l border-border pl-3">
          <span className="text-[10px] text-muted-foreground flex items-center justify-between">
            삼성전자가 <button onClick={fetchRates}><RefreshCcw size={10} /></button>
          </span>
          <div className="flex items-center">
            <input inputMode="numeric" value={fmtNum(data.rates.samsungPrice)} onChange={e => updateRates({ samsungPrice: e.target.value })} className="w-full bg-transparent text-sm font-semibold outline-none" placeholder="0" />
            <span className="text-xs text-muted-foreground ml-1">원</span>
          </div>
        </div>
      </div>

      {/* ── 탭 바 ── */}
      <div className="flex border-b border-border bg-card shrink-0 px-2">
        {(["coin", "stock", "cash"] as const).map(t => {
          const label = t === "coin" ? "코인" : t === "stock" ? "주식" : "현금";
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── 입력 영역 ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        
        {/* 코인 탭 */}
        {tab === "coin" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2 flex justify-between">해외 거래소 <span className="text-xs font-normal text-muted-foreground">(USDT 입력)</span></h3>
              {OVERSEAS_EXCHANGES.map(ex => (
                <InputRow key={ex} label={ex} suffix="$" value={data.crypto.overseas[ex]} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, overseas: { ...p.crypto.overseas, [ex]: v } } }))} />
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2 flex justify-between">국내 거래소 <span className="text-xs font-normal text-muted-foreground">(원화 입력)</span></h3>
              {DOMESTIC_EXCHANGES.map(ex => (
                <div key={ex} className="py-2 border-b border-white/5 last:border-0">
                  <div className="text-xs text-muted-foreground mb-2">{ex}</div>
                  <div className="flex items-center gap-4">
                    <InputRow label="코인" value={data.crypto.domesticCoin[ex]} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, domesticCoin: { ...p.crypto.domesticCoin, [ex]: v } } }))} />
                    <InputRow label="예치금" value={data.crypto.domesticDeposit[ex]} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, domesticDeposit: { ...p.crypto.domesticDeposit, [ex]: v } } }))} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2 flex justify-between">외화 잔고 <span className="text-xs font-normal text-muted-foreground">(USD 입력)</span></h3>
              {FOREIGN_CURRENCY_BANKS.map(ex => (
                <InputRow key={ex} label={ex} suffix="$" value={data.crypto.foreignCurrency[ex]} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, foreignCurrency: { ...p.crypto.foreignCurrency, [ex]: v } } }))} />
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2 flex justify-between">선물 <span className="text-xs font-normal text-muted-foreground">(담보금 평가액)</span></h3>
              <InputRow label="국내 선물 (원화)" value={data.crypto.futuresDomestic} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, futuresDomestic: v } }))} />
              <InputRow label="해외 선물 (USD)" suffix="$" value={data.crypto.futuresOverseas} onChange={(v: string) => setData(p => ({ ...p, crypto: { ...p.crypto, futuresOverseas: v } }))} />
            </div>
          </div>
        )}

        {/* 주식 탭 */}
        {tab === "stock" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <InputRow label="해외주식 (USD)" suffix="$" value={data.stock.overseas} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, overseas: v } }))} />
              <InputRow label="국내주식" value={data.stock.domestic} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, domestic: v } }))} />
              <InputRow label="IRP" value={data.stock.irp} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, irp: v } }))} />
              <InputRow label="개인연금" value={data.stock.pension} onChange={(v: string) => setData(p => ({ ...p, stock: { ...p.stock, pension: v } }))} />
            </div>
          </div>
        )}

        {/* 현금 탭 */}
        {tab === "cash" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">은행</h3>
              {BANKS.map(ex => (
                <InputRow key={ex} label={ex} value={data.cash.banks[ex]} onChange={(v: string) => setData(p => ({ ...p, cash: { ...p.cash, banks: { ...p.cash.banks, [ex]: v } } }))} />
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">페이</h3>
              <div className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                서울페이 및 온누리상품권은 액면가를 입력하시면 자동으로 5% 할인된 현금 가치로 총합에 계산됩니다.
              </div>
              {PAYS.map(ex => (
                <InputRow key={ex} label={ex} value={data.cash.pays[ex]} onChange={(v: string) => setData(p => ({ ...p, cash: { ...p.cash, pays: { ...p.cash.pays, [ex]: v } } }))} />
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">증권사 예수금</h3>
              {SECURITIES.map(ex => (
                <InputRow key={ex} label={ex} value={data.cash.securities[ex]} onChange={(v: string) => setData(p => ({ ...p, cash: { ...p.cash, securities: { ...p.cash.securities, [ex]: v } } }))} />
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">기타</h3>
              <InputRow label="채무 (양수로 입력)" value={data.cash.debt["채무"]} onChange={(v: string) => setData(p => ({ ...p, cash: { ...p.cash, debt: { ...p.cash.debt, "채무": v } } }))} />
              {PHYSICALS.map(ex => (
                <InputRow key={ex} label={ex} value={data.cash.physical[ex]} onChange={(v: string) => setData(p => ({ ...p, cash: { ...p.cash, physical: { ...p.cash.physical, [ex]: v } } }))} />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── 요약 및 등록 버튼 ── */}
      <div className="shrink-0 bg-card border-t border-border">
        <div className="px-4 py-3 bg-muted/20">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">코인 (투자 {Math.round(coinInvestAmount/finalCrypto*100 || 0)}% / 대기 {Math.round(cryptoStandby/finalCrypto*100 || 0)}%)</span>
            <span className="text-xs font-semibold text-foreground">{fmtKrw(finalCrypto)}</span>
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">주식 (헷징 편입 +{fmtKrw(SAMSUNG_HEDGE_FIXED_VALUE)})</span>
            <span className="text-xs font-semibold text-foreground">{fmtKrw(finalStock)}</span>
          </div>
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
            <span className="text-xs text-muted-foreground">현금</span>
            <span className="text-xs font-semibold text-foreground">{fmtKrw(rawCash)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-foreground">총 자산</span>
            <span className="text-sm font-bold text-blue-400">{fmtKrw(grandTotal)}</span>
          </div>
        </div>

        <div className="px-4 py-3">
          <button
            onClick={() => setModal(true)}
            className="w-full py-3.5 rounded-xl bg-foreground text-background font-bold text-sm active:scale-[0.98] transition-transform"
          >
            기록 저장하기
          </button>
        </div>
      </div>

      {/* ── 모달 ── */}
      {modal && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setModal(false)} />
          <div className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-40px)] max-w-[340px] bg-card rounded-2xl border border-border p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-foreground mb-4 text-center">자산 기록 저장</h2>
            <div className="space-y-2 mb-6">
              <div className="flex justify-between"><span className="text-muted-foreground text-sm">코인</span><span className="text-foreground text-sm">{fmtKrw(finalCrypto)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground text-sm">주식</span><span className="text-foreground text-sm">{fmtKrw(finalStock)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground text-sm">현금</span><span className="text-foreground text-sm">{fmtKrw(rawCash)}</span></div>
              <div className="pt-3 mt-3 border-t border-border flex justify-between">
                <span className="text-foreground font-bold">총 자산</span>
                <span className="text-blue-400 font-bold">{fmtKrw(grandTotal)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(false)} className="flex-1 py-3 rounded-xl bg-muted text-foreground font-semibold text-sm">취소</button>
              <button onClick={handleConfirm} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm disabled:opacity-50">
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
