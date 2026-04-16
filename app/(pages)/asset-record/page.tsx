"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── 상수 ────────────────────────────────────────────────────
const USDT_PRICE_DEFAULT = 1482;

const OVERSEAS_EXCHANGES = ["OKX", "BITGET", "BINANCE", "DIGIFINEX", "POLYMARKET", "BYBIT", "BINGX"];
const DOMESTIC_EXCHANGES = ["업비트", "빗썸", "코인원", "코빗"];
const CASH_TYPES         = ["카카오뱅크", "하나은행", "국민은행", "현금", "빚", "직접입력"];

// ─── 타입 ────────────────────────────────────────────────────
interface OverseasEntry  { id: string; exchange: string; usdt: string; }
interface DomesticEntry  { id: string; exchange: string; coinAmount: string; deposit: string; }
interface StockEntry     { id: string; name: string; qty: string; amount: string; }
interface CashEntry      { id: string; label: string; type: string; customType: string; amount: string; }

const uid = () => Math.random().toString(36).slice(2);

const newOverseas  = (): OverseasEntry  => ({ id: uid(), exchange: OVERSEAS_EXCHANGES[0], usdt: "" });
const newDomestic  = (): DomesticEntry  => ({ id: uid(), exchange: DOMESTIC_EXCHANGES[0], coinAmount: "", deposit: "" });
const newStock     = (): StockEntry     => ({ id: uid(), name: "", qty: "", amount: "" });
const newCash      = (): CashEntry      => ({ id: uid(), label: "", type: CASH_TYPES[0], customType: "", amount: "" });

// ─── 금액 포맷 ────────────────────────────────────────────────
function formatKorean(n: number): string {
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
const num = (s: string) => Number(s.replace(/,/g, "")) || 0;

// ─── localStorage 키 ─────────────────────────────────────────
const LS_KEY = "asset_record_cash";

// ═══════════════════════════════════════════════════════════
export default function AssetRecordPage() {
  const router = useRouter();
  const [tab, setTab]           = useState<"coin" | "stock" | "cash">("coin");
  const [usdtPrice, setUsdtPrice] = useState(String(USDT_PRICE_DEFAULT));
  const [overseas, setOverseas] = useState<OverseasEntry[]>([]);
  const [domestic, setDomestic] = useState<DomesticEntry[]>([]);
  const [stocks, setStocks]     = useState<StockEntry[]>([]);
  const [irp, setIrp]           = useState("");
  const [pension, setPension]   = useState("");
  const [cashItems, setCashItems] = useState<CashEntry[]>([]);
  const [modal, setModal]       = useState(false);
  const [saving, setSaving]     = useState(false);

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

  // ── 합계 계산 ──────────────────────────────────────────────
  const coinTotal = (() => {
    const o = overseas.reduce((s, e) => s + num(e.usdt) * num(usdtPrice), 0);
    const d = domestic.reduce((s, e) => s + num(e.coinAmount) + num(e.deposit), 0);
    return o + d;
  })();
  const stockTotal = stocks.reduce((s, e) => s + num(e.amount), 0)
    + num(irp) + num(pension);
  const cashTotal  = cashItems.reduce((s, e) => s + num(e.amount), 0);
  const grandTotal = coinTotal + stockTotal + cashTotal;

  // ── Supabase 저장 ──────────────────────────────────────────
  async function handleConfirm() {
    setSaving(true);
    const detail = {
      overseas: overseas.map((e) => ({
        exchange: e.exchange,
        usdt: num(e.usdt),
        usdtPrice: num(usdtPrice),
        krw: num(e.usdt) * num(usdtPrice),
      })),
      domestic: domestic.map((e) => ({
        exchange: e.exchange,
        coinAmount: num(e.coinAmount),
        deposit: num(e.deposit),
      })),
      stocks: stocks.map((e) => ({ name: e.name, qty: num(e.qty), amount: num(e.amount) })),
      irp: num(irp),
      pension: num(pension),
      cash: cashItems.map((e) => ({
        label: e.label,
        type: e.type === "직접입력" ? e.customType : e.type,
        amount: num(e.amount),
      })),
    };
    const { error } = await supabase.from("asset_snapshots").insert({
      recorded_at:   new Date().toISOString(),
      total_amount:  grandTotal,
      coin_amount:   coinTotal,
      stock_amount:  stockTotal,
      cash_amount:   cashTotal,
      detail_json:   detail,
    });
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    setModal(false);
    router.push("/home");
  }

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: "calc(100dvh - var(--topbar-h, 48px) - var(--bottomnav-h, 60px) - env(safe-area-inset-bottom))",
      }}
    >
      {/* ── 탭 ── */}
      <div className="flex border-b border-border bg-card shrink-0">
        {(["coin", "stock", "cash"] as const).map((t) => {
          const label = t === "coin" ? "코인" : t === "stock" ? "주식" : "현금";
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── 탭 내용 ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-6">
        {tab === "coin"  && (
          <CoinTab
            overseas={overseas}
            setOverseas={setOverseas}
            domestic={domestic}
            setDomestic={setDomestic}
            usdtPrice={usdtPrice}
            setUsdtPrice={setUsdtPrice}
          />
        )}
        {tab === "stock" && (
          <StockTab
            stocks={stocks}
            setStocks={setStocks}
            irp={irp}
            setIrp={setIrp}
            pension={pension}
            setPension={setPension}
          />
        )}
        {tab === "cash"  && <CashTab items={cashItems} setItems={saveCash} />}
      </div>

      {/* ── 하단 고정 등록 버튼 ── */}
      <div className="shrink-0 px-3 py-3 border-t border-border bg-card">
        <button
          onClick={() => setModal(true)}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold text-sm active:opacity-80 transition-opacity"
        >
          등록
        </button>
      </div>

      {/* ── 확인 모달 (중앙 팝업) ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="bg-card w-full max-w-[340px] rounded-2xl border border-border p-5"
            style={{ maxHeight: "80vh", overflowY: "auto" }}
          >
            <h2 className="text-base font-bold text-foreground mb-4 text-center">등록 확인</h2>
            <div className="flex flex-col gap-2 mb-5">
              <SummaryRow label="코인 합계"  value={formatKorean(coinTotal)} />
              <SummaryRow label="주식 합계"  value={formatKorean(stockTotal)} />
              <SummaryRow label="현금 합계"  value={formatKorean(cashTotal)} />
              <div className="border-t border-border pt-2 mt-1">
                <SummaryRow label="총합" value={formatKorean(grandTotal)} bold />
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center mb-5">
              이 금액으로 등록하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(false)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "저장 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 코인 탭
// ═══════════════════════════════════════════════════════════
function CoinTab({
  overseas, setOverseas, domestic, setDomestic, usdtPrice, setUsdtPrice,
}: {
  overseas: OverseasEntry[];    setOverseas: (v: OverseasEntry[]) => void;
  domestic: DomesticEntry[];    setDomestic: (v: DomesticEntry[]) => void;
  usdtPrice: string;            setUsdtPrice: (v: string) => void;
}) {
  const updateO = (id: string, patch: Partial<OverseasEntry>) =>
    setOverseas(overseas.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const updateD = (id: string, patch: Partial<DomesticEntry>) =>
    setDomestic(domestic.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="flex flex-col gap-4">
      {/* 해외 */}
      <Section
        title="해외 거래소"
        onAdd={() => setOverseas([...overseas, newOverseas()])}
        headerExtra={
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">USDT</span>
            <input
              inputMode="numeric"
              value={usdtPrice}
              onChange={(e) => setUsdtPrice(e.target.value)}
              className="w-[68px] bg-muted rounded-lg px-2 py-1 text-xs text-foreground tabular-nums outline-none border border-transparent focus:border-ring text-right"
              placeholder={String(USDT_PRICE_DEFAULT)}
            />
            <span className="text-[11px] text-muted-foreground">원</span>
          </div>
        }
      >
        {overseas.map((e) => {
          const krw = num(e.usdt) * num(usdtPrice);
          return (
            <EntryCard key={e.id} onDelete={() => setOverseas(overseas.filter((x) => x.id !== e.id))}>
              <Select
                value={e.exchange}
                options={OVERSEAS_EXCHANGES}
                onChange={(v) => updateO(e.id, { exchange: v })}
              />
              <div className="mt-2">
                <LabeledInput
                  label="USDT 수량"
                  value={e.usdt}
                  onChange={(v) => updateO(e.id, { usdt: v })}
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              {krw > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5 text-right">
                  ≈ {formatKorean(krw)}
                </p>
              )}
            </EntryCard>
          );
        })}
      </Section>

      {/* 국내 */}
      <Section
        title="국내 거래소"
        onAdd={() => setDomestic([...domestic, newDomestic()])}
      >
        {domestic.map((e) => (
          <EntryCard key={e.id} onDelete={() => setDomestic(domestic.filter((x) => x.id !== e.id))}>
            <Select
              value={e.exchange}
              options={DOMESTIC_EXCHANGES}
              onChange={(v) => updateD(e.id, { exchange: v })}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <LabeledInput
                label="코인 평가금(원)"
                value={e.coinAmount}
                onChange={(v) => updateD(e.id, { coinAmount: v })}
                placeholder="0"
                inputMode="numeric"
              />
              <LabeledInput
                label="원화 예치금(원)"
                value={e.deposit}
                onChange={(v) => updateD(e.id, { deposit: v })}
                placeholder="0"
                inputMode="numeric"
              />
            </div>
          </EntryCard>
        ))}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 주식 탭
// ═══════════════════════════════════════════════════════════
function StockTab({
  stocks, setStocks, irp, setIrp, pension, setPension,
}: {
  stocks: StockEntry[]; setStocks: (v: StockEntry[]) => void;
  irp: string; setIrp: (v: string) => void;
  pension: string; setPension: (v: string) => void;
}) {
  const update = (id: string, patch: Partial<StockEntry>) =>
    setStocks(stocks.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="flex flex-col gap-4">
      <Section title="개인주식" onAdd={() => setStocks([...stocks, newStock()])}>
        {stocks.map((e) => (
          <EntryCard key={e.id} onDelete={() => setStocks(stocks.filter((x) => x.id !== e.id))}>
            <LabeledInput
              label="종목명"
              value={e.name}
              onChange={(v) => update(e.id, { name: v })}
              placeholder="삼성전자"
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <LabeledInput
                label="수량"
                value={e.qty}
                onChange={(v) => update(e.id, { qty: v })}
                placeholder="0"
                inputMode="numeric"
              />
              <LabeledInput
                label="평가금액(원)"
                value={e.amount}
                onChange={(v) => update(e.id, { amount: v })}
                placeholder="0"
                inputMode="numeric"
              />
            </div>
          </EntryCard>
        ))}
      </Section>

      <Section title="IRP">
        <div className="bg-card border border-border rounded-xl p-3">
          <LabeledInput
            label="총 평가금액(원)"
            value={irp}
            onChange={setIrp}
            placeholder="0"
            inputMode="numeric"
          />
        </div>
      </Section>

      <Section title="개인연금">
        <div className="bg-card border border-border rounded-xl p-3">
          <LabeledInput
            label="총 평가금액(원)"
            value={pension}
            onChange={setPension}
            placeholder="0"
            inputMode="numeric"
          />
        </div>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 현금 탭
// ═══════════════════════════════════════════════════════════
function CashTab({
  items, setItems,
}: {
  items: CashEntry[]; setItems: (v: CashEntry[]) => void;
}) {
  const update = (id: string, patch: Partial<CashEntry>) =>
    setItems(items.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="flex flex-col gap-4">
      <Section title="현금·예금" onAdd={() => setItems([...items, newCash()])}>
        {items.map((e) => (
          <EntryCard key={e.id} onDelete={() => setItems(items.filter((x) => x.id !== e.id))}>
            <LabeledInput
              label="분류명"
              value={e.label}
              onChange={(v) => update(e.id, { label: v })}
              placeholder="비상금"
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">계좌/종류</p>
                <Select
                  value={e.type}
                  options={CASH_TYPES}
                  onChange={(v) => update(e.id, { type: v })}
                />
                {e.type === "직접입력" && (
                  <input
                    className="mt-1 w-full bg-muted rounded-lg px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-transparent focus:border-ring"
                    placeholder="직접 입력"
                    value={e.customType}
                    onChange={(ev) => update(e.id, { customType: ev.target.value })}
                  />
                )}
              </div>
              <LabeledInput
                label="금액(원)"
                value={e.amount}
                onChange={(v) => update(e.id, { amount: v })}
                placeholder="0"
                inputMode="numeric"
              />
            </div>
          </EntryCard>
        ))}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 공통 UI 컴포넌트
// ═══════════════════════════════════════════════════════════
function Section({
  title, onAdd, children, headerExtra,
}: {
  title: string;
  onAdd?: () => void;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground shrink-0">{title}</h3>
          {headerExtra}
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted shrink-0"
          >
            <Plus size={13} />
            추가
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function EntryCard({
  children, onDelete,
}: {
  children: React.ReactNode; onDelete: () => void;
}) {
  return (
    <div className="relative bg-card border border-border rounded-xl p-3">
      <button
        onClick={onDelete}
        className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="삭제"
      >
        <X size={15} />
      </button>
      <div className="pr-5">{children}</div>
    </div>
  );
}

function Select({
  value, options, onChange,
}: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-muted rounded-lg px-2.5 py-2 text-sm text-foreground outline-none border border-transparent focus:border-ring appearance-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function LabeledInput({
  label, value, onChange, placeholder, inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <input
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-muted rounded-lg px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-transparent focus:border-ring tabular-nums"
      />
    </div>
  );
}

function SummaryRow({
  label, value, bold,
}: {
  label: string; value: string; bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
