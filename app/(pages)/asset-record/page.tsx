"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── 상수 ──────────────────────────────────────────────────────
const OVERSEAS_EXCHANGES = ["OKX", "BITGET", "BINANCE", "DIGIFINEX", "BYBIT", "BINGX", "POLYMARKET", "직접입력"];
const DOMESTIC_EXCHANGES = ["업비트", "빗썸", "코인원", "코빗", "직접입력"];

const CASH_CATEGORIES = ["은행", "증권사", "페이", "직접입력"];
const CASH_SUBS: Record<string, string[]> = {
  "은행":    ["하나은행", "신한은행", "카카오뱅크", "케이뱅크", "국민은행", "우리은행", "농협", "토스뱅크", "직접입력"],
  "증권사":  ["키움증권", "나무증권", "신한증권", "하나증권", "한국투자", "KB증권", "대신증권", "직접입력"],
  "페이":    ["카카오페이", "네이버페이", "토스", "직접입력"],
  "직접입력": [],
};

// ─── 타입 ──────────────────────────────────────────────────────
interface OverseasEntry { id: string; exchange: string; customExchange: string; usdt: string; }
interface DomesticEntry { id: string; exchange: string; customExchange: string; coinAmount: string; deposit: string; }
interface StockEntry    {
  id: string; symbol: string; qty: string;
  price: number | null; priceCurrency: string; loadingPrice: boolean;
}
interface CashEntry     { id: string; category: string; subcategory: string; customText: string; amount: string; }

// ─── 유틸 ──────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2);
const toNum = (s: string) => Number(s.replace(/,/g, "")) || 0;

function fmtKrw(n: number): string {
  if (!n || isNaN(n)) return "0원";
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  const won = n % 10_000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  if (man > 0 && won > 0) return `${man.toLocaleString()}만 ${won.toLocaleString()}원`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

const newOverseas = (): OverseasEntry  => ({ id: uid(), exchange: OVERSEAS_EXCHANGES[0], customExchange: "", usdt: "" });
const newDomestic = (): DomesticEntry  => ({ id: uid(), exchange: DOMESTIC_EXCHANGES[0], customExchange: "", coinAmount: "", deposit: "" });
const newStock    = (): StockEntry     => ({ id: uid(), symbol: "", qty: "", price: null, priceCurrency: "KRW", loadingPrice: false });
const newCash     = (): CashEntry      => ({ id: uid(), category: "은행", subcategory: "하나은행", customText: "", amount: "" });

const LS_KEY = "asset_record_cash_v2";

// ═══════════════════════════════════════════════════════════════
export default function AssetRecordPage() {
  const router = useRouter();

  // ── 탭 ──────────────────────────────────────────────────────
  const [tab, setTab] = useState<"coin" | "stock" | "cash">("coin");

  // ── USDT 가격 ────────────────────────────────────────────────
  const [usdtPrice, setUsdtPrice] = useState("1482");

  // ── 코인 ────────────────────────────────────────────────────
  const [overseas, setOverseas]           = useState<OverseasEntry[]>([]);
  const [domestic, setDomestic]           = useState<DomesticEntry[]>([]);
  const [overseasOpen, setOverseasOpen]   = useState(true);
  const [domesticOpen, setDomesticOpen]   = useState(true);

  // ── 주식 ────────────────────────────────────────────────────
  const [stocks, setStocks]             = useState<StockEntry[]>([]);
  const [irp, setIrp]                   = useState("");
  const [pension, setPension]           = useState("");
  const [stockOpen, setStockOpen]       = useState(true);
  const [irpOpen, setIrpOpen]           = useState(true);
  const [pensionOpen, setPensionOpen]   = useState(true);

  // ── 현금 ────────────────────────────────────────────────────
  const [cashItems, setCashItems] = useState<CashEntry[]>([]);
  const [cashOpen, setCashOpen]   = useState(true);

  // ── 모달 ────────────────────────────────────────────────────
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);

  // ── localStorage 로드 ────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCashItems(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveCash = useCallback((items: CashEntry[]) => {
    setCashItems(items);
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, []);

  // ── 주식 현재가 조회 ─────────────────────────────────────────
  async function fetchStockPrice(id: string, symbol: string) {
    if (!symbol.trim()) return;
    setStocks(prev => prev.map(s => s.id === id ? { ...s, loadingPrice: true } : s));
    try {
      const res = await fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol.trim())}`);
      const data = await res.json();
      if (data.price != null) {
        setStocks(prev => prev.map(s => s.id === id
          ? { ...s, price: data.price, priceCurrency: data.currency ?? "KRW", loadingPrice: false }
          : s
        ));
      } else {
        setStocks(prev => prev.map(s => s.id === id ? { ...s, loadingPrice: false } : s));
      }
    } catch {
      setStocks(prev => prev.map(s => s.id === id ? { ...s, loadingPrice: false } : s));
    }
  }

  // ── 업데이트 헬퍼 ────────────────────────────────────────────
  const updateOverseas = (id: string, patch: Partial<OverseasEntry>) =>
    setOverseas(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  const updateDomestic = (id: string, patch: Partial<DomesticEntry>) =>
    setDomestic(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  const updateStock = (id: string, patch: Partial<StockEntry>) =>
    setStocks(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  const updateCash = (id: string, patch: Partial<CashEntry>) =>
    saveCash(cashItems.map(e => e.id === id ? { ...e, ...patch } : e));

  // ── 합계 계산 ────────────────────────────────────────────────
  const usdtNum       = toNum(usdtPrice);
  const overseasTotal = overseas.reduce((s, e) => s + toNum(e.usdt) * usdtNum, 0);
  const domesticTotal = domestic.reduce((s, e) => s + toNum(e.coinAmount) + toNum(e.deposit), 0);
  const coinTotal     = overseasTotal + domesticTotal;

  const stockIndivTotal = stocks.reduce((s, e) => {
    if (!e.price) return s;
    const qty = Number(e.qty) || 0;
    return s + e.price * qty * (e.priceCurrency === "USD" ? usdtNum : 1);
  }, 0);
  const irpNum      = toNum(irp);
  const pensionNum  = toNum(pension);
  const stockTotal  = stockIndivTotal + irpNum + pensionNum;
  const cashTotal   = cashItems.reduce((s, e) => s + toNum(e.amount), 0);
  const grandTotal  = coinTotal + stockTotal + cashTotal;

  // ── Supabase 저장 ────────────────────────────────────────────
  async function handleConfirm() {
    setSaving(true);
    const detail = {
      overseas: overseas.map(e => ({
        exchange: e.exchange === "직접입력" ? e.customExchange : e.exchange,
        usdt: toNum(e.usdt),
        usdtPrice: usdtNum,
        krw: toNum(e.usdt) * usdtNum,
      })),
      domestic: domestic.map(e => ({
        exchange: e.exchange === "직접입력" ? e.customExchange : e.exchange,
        coinAmount: toNum(e.coinAmount),
        deposit: toNum(e.deposit),
      })),
      stocks: stocks.map(e => ({
        symbol: e.symbol, qty: Number(e.qty) || 0,
        price: e.price ?? 0, currency: e.priceCurrency,
        amount: e.price ? e.price * (Number(e.qty) || 0) * (e.priceCurrency === "USD" ? usdtNum : 1) : 0,
      })),
      irp: irpNum,
      pension: pensionNum,
      cash: cashItems.map(e => ({
        category: e.category,
        type: e.category === "직접입력"
          ? e.customText
          : e.subcategory === "직접입력"
          ? e.customText
          : e.subcategory,
        amount: toNum(e.amount),
      })),
    };

    const { error } = await supabase.from("asset_snapshots").insert({
      recorded_at:  new Date().toISOString(),
      total_amount: grandTotal,
      coin_amount:  coinTotal,
      stock_amount: stockTotal,
      cash_amount:  cashTotal,
      detail_json:  detail,
    });

    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    setModal(false);
    router.push("/home");
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - var(--topbar-h,48px) - var(--bottomnav-h,60px) - env(safe-area-inset-bottom))" }}
    >
      {/* ── 탭 바 ── */}
      <div className="flex border-b border-border bg-card shrink-0">
        {(["coin", "stock", "cash"] as const).map(t => {
          const label = t === "coin" ? "코인" : t === "stock" ? "주식" : "현금";
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── 탭 콘텐츠 ── */}
      <div className="flex-1 overflow-y-auto px-2 py-2 pb-4">

        {/* ── 코인 탭 ── */}
        {tab === "coin" && (
          <div className="flex flex-col gap-2">

            {/* USDT 가격 카드 */}
            <div className="bg-card border border-border rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">USDT 가격</span>
              <input
                inputMode="numeric"
                value={usdtPrice}
                onChange={e => setUsdtPrice(e.target.value)}
                className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-sm tabular-nums text-right text-foreground outline-none border border-transparent focus:border-ring"
                placeholder="1482"
              />
              <span className="text-xs text-muted-foreground shrink-0">원</span>
            </div>

            {/* 해외 거래소 */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <SectionHeader
                title="해외 거래소"
                total={overseasTotal}
                expanded={overseasOpen}
                onToggle={() => setOverseasOpen(v => !v)}
                onAdd={() => setOverseas(prev => [...prev, newOverseas()])}
              />
              {overseasOpen && (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {overseas.map(e => (
                    <OverseasCard
                      key={e.id} entry={e} usdtNum={usdtNum}
                      onUpdate={p => updateOverseas(e.id, p)}
                      onDelete={() => setOverseas(prev => prev.filter(x => x.id !== e.id))}
                    />
                  ))}
                  {overseas.length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-1">항목이 없습니다.</p>
                  )}
                </div>
              )}
            </div>

            {/* 국내 거래소 */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <SectionHeader
                title="국내 거래소"
                total={domesticTotal}
                expanded={domesticOpen}
                onToggle={() => setDomesticOpen(v => !v)}
                onAdd={() => setDomestic(prev => [...prev, newDomestic()])}
              />
              {domesticOpen && (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {domestic.map(e => (
                    <DomesticCard
                      key={e.id} entry={e}
                      onUpdate={p => updateDomestic(e.id, p)}
                      onDelete={() => setDomestic(prev => prev.filter(x => x.id !== e.id))}
                    />
                  ))}
                  {domestic.length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-1">항목이 없습니다.</p>
                  )}
                </div>
              )}
            </div>

            <TotalsFooter coinTotal={coinTotal} stockTotal={stockTotal} cashTotal={cashTotal} grandTotal={grandTotal} />
          </div>
        )}

        {/* ── 주식 탭 ── */}
        {tab === "stock" && (
          <div className="flex flex-col gap-2">

            {/* 개별 주식 */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <SectionHeader
                title="개별 주식"
                total={stockIndivTotal}
                expanded={stockOpen}
                onToggle={() => setStockOpen(v => !v)}
                onAdd={() => setStocks(prev => [...prev, newStock()])}
              />
              {stockOpen && (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {stocks.map(e => (
                    <StockCard
                      key={e.id} entry={e} usdtNum={usdtNum}
                      onUpdate={p => updateStock(e.id, p)}
                      onDelete={() => setStocks(prev => prev.filter(x => x.id !== e.id))}
                      onFetchPrice={() => fetchStockPrice(e.id, e.symbol)}
                    />
                  ))}
                  {stocks.length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-1">항목이 없습니다.</p>
                  )}
                </div>
              )}
            </div>

            {/* IRP */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <SectionHeader
                title="IRP"
                total={irpNum}
                expanded={irpOpen}
                onToggle={() => setIrpOpen(v => !v)}
              />
              {irpOpen && (
                <div className="mt-1.5">
                  <CompactInput
                    label="총 평가금액 (원)"
                    value={irp} onChange={setIrp}
                    placeholder="0" inputMode="numeric"
                  />
                </div>
              )}
            </div>

            {/* 개인연금 */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <SectionHeader
                title="개인연금"
                total={pensionNum}
                expanded={pensionOpen}
                onToggle={() => setPensionOpen(v => !v)}
              />
              {pensionOpen && (
                <div className="mt-1.5">
                  <CompactInput
                    label="총 평가금액 (원)"
                    value={pension} onChange={setPension}
                    placeholder="0" inputMode="numeric"
                  />
                </div>
              )}
            </div>

            <TotalsFooter coinTotal={coinTotal} stockTotal={stockTotal} cashTotal={cashTotal} grandTotal={grandTotal} />
          </div>
        )}

        {/* ── 현금 탭 ── */}
        {tab === "cash" && (
          <div className="flex flex-col gap-2">

            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <SectionHeader
                title="현금"
                total={cashTotal}
                expanded={cashOpen}
                onToggle={() => setCashOpen(v => !v)}
                onAdd={() => saveCash([...cashItems, newCash()])}
              />
              {cashOpen && (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {cashItems.map(e => (
                    <CashCard
                      key={e.id} entry={e}
                      onUpdate={p => updateCash(e.id, p)}
                      onDelete={() => saveCash(cashItems.filter(x => x.id !== e.id))}
                    />
                  ))}
                  {cashItems.length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-1">항목이 없습니다.</p>
                  )}
                </div>
              )}
            </div>

            <TotalsFooter coinTotal={coinTotal} stockTotal={stockTotal} cashTotal={cashTotal} grandTotal={grandTotal} />
          </div>
        )}
      </div>

      {/* ── 등록 버튼 ── */}
      <div className="shrink-0 px-2 py-2 border-t border-border bg-card">
        <button
          onClick={() => setModal(true)}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold text-sm active:opacity-80 transition-opacity"
        >
          등록
        </button>
      </div>

      {/* ── 확인 모달 ── */}
      {modal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setModal(false)} />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[340px] bg-card rounded-2xl border border-border p-5"
            style={{ maxHeight: "80vh", overflowY: "auto" }}
          >
            <h2 className="text-base font-bold text-foreground mb-4 text-center">등록 확인</h2>
            <div className="flex flex-col gap-2 mb-5">
              <ModalRow label="코인"  value={fmtKrw(coinTotal)} />
              <ModalRow label="주식"  value={fmtKrw(stockTotal)} />
              <ModalRow label="현금"  value={fmtKrw(cashTotal)} />
              <div className="border-t border-border pt-2 mt-1">
                <ModalRow label="총합" value={fmtKrw(grandTotal)} bold />
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center mb-5">
              이 금액으로 등록하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setModal(false)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground">
                취소
              </button>
              <button onClick={handleConfirm} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50">
                {saving ? "저장 중..." : "확인"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 공통 섹션 헤더 (아코디언)
// ═══════════════════════════════════════════════════════════════
function SectionHeader({
  title, total, expanded, onToggle, onAdd,
}: {
  title: string; total?: number; expanded: boolean;
  onToggle: () => void; onAdd?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={onToggle}>
      <span className="text-sm font-semibold text-foreground shrink-0">{title}</span>
      {total !== undefined && total > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums">합계 {fmtKrw(total)}</span>
      )}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {onAdd && (
          <button
            onClick={e => { e.stopPropagation(); onAdd(); }}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <Plus size={11} />추가
          </button>
        )}
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 카드 컴포넌트들
// ═══════════════════════════════════════════════════════════════
function OverseasCard({ entry, usdtNum, onUpdate, onDelete }: {
  entry: OverseasEntry; usdtNum: number;
  onUpdate: (p: Partial<OverseasEntry>) => void; onDelete: () => void;
}) {
  const krw = toNum(entry.usdt) * usdtNum;
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-2">
      <div className="flex items-center gap-1.5">
        <select
          value={entry.exchange}
          onChange={e => onUpdate({ exchange: e.target.value, customExchange: "" })}
          className="w-24 text-xs bg-background border border-border rounded-lg px-1.5 py-1.5 text-foreground outline-none shrink-0"
        >
          {OVERSEAS_EXCHANGES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
        </select>
        <input
          inputMode="decimal"
          value={entry.usdt}
          onChange={e => onUpdate({ usdt: e.target.value })}
          placeholder="총 평가금액"
          className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none tabular-nums text-right"
        />
        <button onClick={onDelete} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-0.5">
          <X size={13} />
        </button>
      </div>
      {entry.exchange === "직접입력" && (
        <input
          value={entry.customExchange}
          onChange={e => onUpdate({ customExchange: e.target.value })}
          placeholder="거래소명 입력"
          className="mt-1.5 w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none"
        />
      )}
      {krw > 0 && (
        <p className="text-[10px] text-muted-foreground text-right mt-0.5 pr-5">≈ {fmtKrw(krw)}</p>
      )}
    </div>
  );
}

function DomesticCard({ entry, onUpdate, onDelete }: {
  entry: DomesticEntry;
  onUpdate: (p: Partial<DomesticEntry>) => void; onDelete: () => void;
}) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-2 flex flex-col gap-1.5">
      {/* 거래소 선택 */}
      <div className="flex items-center gap-1.5">
        <select
          value={entry.exchange}
          onChange={e => onUpdate({ exchange: e.target.value, customExchange: "" })}
          className="flex-1 text-xs bg-background border border-border rounded-lg px-1.5 py-1.5 text-foreground outline-none"
        >
          {DOMESTIC_EXCHANGES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
        </select>
        <button onClick={onDelete} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-0.5">
          <X size={13} />
        </button>
      </div>
      {/* 직접입력 거래소명 */}
      {entry.exchange === "직접입력" && (
        <input
          value={entry.customExchange}
          onChange={e => onUpdate({ customExchange: e.target.value })}
          placeholder="거래소명 입력"
          className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none"
        />
      )}
      {/* 코인 평가금액 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground shrink-0 w-[68px]">코인 평가금액</span>
        <input
          inputMode="numeric"
          value={entry.coinAmount}
          onChange={e => onUpdate({ coinAmount: e.target.value })}
          placeholder="0"
          className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none tabular-nums text-right"
        />
        <span className="text-[10px] text-muted-foreground shrink-0">원</span>
      </div>
      {/* 원화 예치금 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground shrink-0 w-[68px]">원화 예치금</span>
        <input
          inputMode="numeric"
          value={entry.deposit}
          onChange={e => onUpdate({ deposit: e.target.value })}
          placeholder="0"
          className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none tabular-nums text-right"
        />
        <span className="text-[10px] text-muted-foreground shrink-0">원</span>
      </div>
    </div>
  );
}

function StockCard({ entry, usdtNum, onUpdate, onDelete, onFetchPrice }: {
  entry: StockEntry; usdtNum: number;
  onUpdate: (p: Partial<StockEntry>) => void;
  onDelete: () => void;
  onFetchPrice: () => void;
}) {
  const qty    = Number(entry.qty) || 0;
  const amount = entry.price
    ? entry.price * qty * (entry.priceCurrency === "USD" ? usdtNum : 1)
    : 0;

  return (
    <div className="bg-muted/40 border border-border rounded-lg p-2">
      <div className="flex items-center gap-1.5">
        <input
          value={entry.symbol}
          onChange={e => onUpdate({ symbol: e.target.value, price: null })}
          onBlur={onFetchPrice}
          placeholder="005930.KS"
          className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none font-mono"
        />
        <input
          inputMode="numeric"
          value={entry.qty}
          onChange={e => onUpdate({ qty: e.target.value })}
          placeholder="수량"
          className="w-16 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none tabular-nums text-right"
        />
        <button onClick={onDelete} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-0.5">
          <X size={13} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1 px-0.5">
        {entry.loadingPrice ? (
          <span className="text-[10px] text-muted-foreground">현재가 조회 중...</span>
        ) : entry.price != null ? (
          <span className="text-[10px] text-muted-foreground">
            현재가 {entry.price.toLocaleString()}{entry.priceCurrency === "USD" ? "$" : "원"}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">심볼 입력 후 포커스 이동</span>
        )}
        {amount > 0 && (
          <span className="text-[10px] font-semibold text-foreground tabular-nums">{fmtKrw(amount)}</span>
        )}
      </div>
    </div>
  );
}

function CashCard({ entry, onUpdate, onDelete }: {
  entry: CashEntry;
  onUpdate: (p: Partial<CashEntry>) => void; onDelete: () => void;
}) {
  const subs = CASH_SUBS[entry.category] ?? [];
  const isDirectCategory = entry.category === "직접입력";
  const isDirectSub = entry.subcategory === "직접입력";

  function handleCategoryChange(cat: string) {
    const firstSub = CASH_SUBS[cat]?.[0] ?? "";
    onUpdate({ category: cat, subcategory: firstSub, customText: "" });
  }

  return (
    <div className="bg-muted/40 border border-border rounded-lg p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {/* 1단계: 분류 */}
        <select
          value={entry.category}
          onChange={e => handleCategoryChange(e.target.value)}
          className="w-20 text-xs bg-background border border-border rounded-lg px-1.5 py-1.5 text-foreground outline-none shrink-0"
        >
          {CASH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* 2단계: 하위 선택 (분류가 직접입력이 아닐 때) */}
        {!isDirectCategory && (
          <select
            value={entry.subcategory}
            onChange={e => onUpdate({ subcategory: e.target.value, customText: "" })}
            className="flex-1 text-xs bg-background border border-border rounded-lg px-1.5 py-1.5 text-foreground outline-none min-w-0"
          >
            {subs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* 금액 입력 */}
        <input
          inputMode="numeric"
          value={entry.amount}
          onChange={e => onUpdate({ amount: e.target.value })}
          placeholder="금액"
          className="w-28 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none tabular-nums text-right shrink-0"
        />

        <button onClick={onDelete} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-0.5">
          <X size={13} />
        </button>
      </div>

      {/* 직접입력 텍스트 필드 */}
      {(isDirectCategory || isDirectSub) && (
        <input
          value={entry.customText}
          onChange={e => onUpdate({ customText: e.target.value })}
          placeholder="직접 입력"
          className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none"
        />
      )}
    </div>
  );
}

// ─── 단순 입력 (IRP / 개인연금) ────────────────────────────────
function CompactInput({ label, value, onChange, placeholder, inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <input
        inputMode={inputMode} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 text-xs bg-muted border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none tabular-nums text-right"
      />
      <span className="text-[11px] text-muted-foreground shrink-0">원</span>
    </div>
  );
}

// ─── 합계 푸터 ──────────────────────────────────────────────────
function TotalsFooter({ coinTotal, stockTotal, cashTotal, grandTotal }: {
  coinTotal: number; stockTotal: number; cashTotal: number; grandTotal: number;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
      <ModalRow label="코인" value={fmtKrw(coinTotal)} />
      <ModalRow label="주식" value={fmtKrw(stockTotal)} />
      <ModalRow label="현금" value={fmtKrw(cashTotal)} />
      <div className="border-t border-border pt-1.5 mt-0.5">
        <ModalRow label="전체 총합" value={fmtKrw(grandTotal)} bold />
      </div>
    </div>
  );
}

function ModalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-xs ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`text-xs tabular-nums ${bold ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
