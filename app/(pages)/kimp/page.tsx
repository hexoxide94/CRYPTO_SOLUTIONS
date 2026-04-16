"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Plus, Pencil, Trash2, X } from "lucide-react";

// ─── 상수 ──────────────────────────────────────────────────────
const USDT_PER_CONTRACT = 10_000; // 국내선물 1계약 = 10,000 USDT

// ─── 타입 ──────────────────────────────────────────────────────
interface KimpTrade {
  id: number;
  traded_at: string;
  status: "open" | "closed";
  sell_price_krw: number;   // 스테이블 가격 (원)
  buy_price_usdt: number;   // 달러 현물가 ($)
  kimp_rate: number;        // 김프율 (%)
  amount: number;           // USDT 수량
  detail_json: { contracts: number };
}

interface FormState {
  trade_type: "open" | "closed";
  stable_price: string;
  dollar_price: string;
  amount: string;
  contracts: string;
}

const defaultForm = (): FormState => ({
  trade_type: "open",
  stable_price: "",
  dollar_price: "",
  amount: "",
  contracts: "",
});

// ─── 유틸 ──────────────────────────────────────────────────────
const toNum = (s: string) => Number(s.replace(/,/g, "")) || 0;

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function calcKimp(stable: number, dollar: number): number {
  if (!stable || !dollar) return 0;
  return (stable / dollar - 1) * 100;
}

function fmtKimpDisplay(stable: number, dollar: number): string {
  if (!stable || !dollar) return "-";
  const pct = calcKimp(stable, dollar);
  const diff = stable - dollar;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}% (${sign}${diff.toFixed(1)}원)`;
}

// ═══════════════════════════════════════════════════════════════
export default function KimpPage() {
  const [trades, setTrades]         = useState<KimpTrade[]>([]);
  const [loading, setLoading]       = useState(true);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [form, setForm]             = useState<FormState>(defaultForm());
  const [saving, setSaving]         = useState(false);
  const [chartMode, setChartMode]   = useState<"kimp" | "diff">("kimp");

  // ── 데이터 로드 ──────────────────────────────────────────────
  const fetchTrades = useCallback(async () => {
    const { data, error } = await supabase
      .from("kimp_trades")
      .select("id, traded_at, status, sell_price_krw, buy_price_usdt, kimp_rate, amount, detail_json")
      .order("traded_at", { ascending: false });
    if (!error && data) setTrades(data as KimpTrade[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  // ── 요약 ────────────────────────────────────────────────────
  const openTotal   = trades.filter(t => t.status === "open").reduce((s, t) => s + Number(t.amount), 0);
  const closedTotal = trades.filter(t => t.status === "closed").reduce((s, t) => s + Number(t.amount), 0);
  const netPosition = openTotal - closedTotal;

  // ── 차트 데이터 ─────────────────────────────────────────────
  const getY = (t: KimpTrade) =>
    chartMode === "kimp"
      ? calcKimp(t.sell_price_krw, Number(t.buy_price_usdt))
      : t.sell_price_krw - Number(t.buy_price_usdt);

  const chartOpen   = trades.filter(t => t.status === "open")
    .map(t => ({ x: new Date(t.traded_at).getTime(), y: getY(t), trade: t }));
  const chartClosed = trades.filter(t => t.status === "closed")
    .map(t => ({ x: new Date(t.traded_at).getTime(), y: getY(t), trade: t }));

  const yTickFmt = chartMode === "kimp"
    ? (v: number) => `${v.toFixed(1)}%`
    : (v: number) => `${Math.round(v)}`;

  // ── 시트 ────────────────────────────────────────────────────
  function openSheet(trade?: KimpTrade) {
    if (trade) {
      setEditingId(trade.id);
      setForm({
        trade_type:   trade.status,
        stable_price: String(trade.sell_price_krw),
        dollar_price: String(Number(trade.buy_price_usdt)),
        amount:       String(Number(trade.amount)),
        contracts:    String(trade.detail_json?.contracts ?? Math.floor(Number(trade.amount) / USDT_PER_CONTRACT)),
      });
    } else {
      setEditingId(null);
      setForm(defaultForm());
    }
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
    setForm(defaultForm());
  }

  // ── 저장 ────────────────────────────────────────────────────
  async function handleSave() {
    const stable    = toNum(form.stable_price);
    const dollar    = toNum(form.dollar_price);
    const kimp      = calcKimp(stable, dollar);
    const amount    = toNum(form.amount);
    const contracts = toNum(form.contracts);

    setSaving(true);
    const payload = {
      status:         form.trade_type,
      coin:           "USDT",
      amount,
      buy_exchange:   "-",
      sell_exchange:  "-",
      sell_price_krw: stable,
      buy_price_usdt: dollar,
      usdt_rate:      stable,
      kimp_rate:      parseFloat(kimp.toFixed(4)),
      profit_krw:     0,
      fee_krw:        0,
      memo:           "",
      detail_json:    { contracts },
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("kimp_trades").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("kimp_trades").insert({
        ...payload, traded_at: new Date().toISOString(),
      }));
    }

    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    closeSheet();
    fetchTrades();
  }

  // ── 삭제 ────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("kimp_trades").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    fetchTrades();
  }

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-2 py-2 flex flex-col gap-2 pb-24">

        {/* ── 순포지션 카드 ── */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-0.5">순포지션</p>
          <p className={`text-2xl font-bold tabular-nums ${
            netPosition > 0 ? "text-red-500" : netPosition < 0 ? "text-blue-500" : "text-foreground"
          }`}>
            {netPosition > 0 ? "+" : ""}{netPosition.toLocaleString()}
            <span className="text-base font-normal ml-1 text-muted-foreground">USDT</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            진입 {openTotal.toLocaleString()} − 청산 {closedTotal.toLocaleString()}
          </p>
        </div>

        {/* ── 차트 ── */}
        {trades.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3">
            {/* 헤더: 제목 + 토글 */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground font-medium">
                {chartMode === "kimp" ? "김프율 추이 (%)" : "스테이블−달러 차이값 (원)"}
              </p>
              <div className="flex rounded-lg overflow-hidden border border-border">
                {(["kimp", "diff"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      chartMode === m
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "kimp" ? "김프%" : "차이값"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    scale="time"
                    domain={["dataMin - 3600000", "dataMax + 3600000"]}
                    tickFormatter={(v) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="y"
                    type="number"
                    domain={["auto", "auto"]}
                    tickFormatter={yTickFmt}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const t = payload[0].payload.trade as KimpTrade;
                      const kimp = calcKimp(t.sell_price_krw, Number(t.buy_price_usdt));
                      const diff = t.sell_price_krw - Number(t.buy_price_usdt);
                      return (
                        <div className="bg-card border border-border rounded-lg p-2 shadow-md text-xs space-y-0.5">
                          <p className="font-semibold text-foreground">{fmtTime(t.traded_at)}</p>
                          <p className="text-muted-foreground">스테이블: <span className="text-foreground">{t.sell_price_krw.toLocaleString()}원</span></p>
                          <p className="text-muted-foreground">달러: <span className="text-foreground">${Number(t.buy_price_usdt).toFixed(2)}</span></p>
                          <p className="text-muted-foreground">김프: <span className={kimp >= 0 ? "text-emerald-500" : "text-red-400"}>{kimp >= 0 ? "+" : ""}{kimp.toFixed(2)}%</span></p>
                          <p className="text-muted-foreground">차이: <span className="text-foreground">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}원</span></p>
                          <p className="text-muted-foreground">수량: <span className="text-foreground">{Number(t.amount).toLocaleString()} USDT</span></p>
                        </div>
                      );
                    }}
                  />
                  {chartOpen.length > 0 && (
                    <Scatter data={chartOpen} fill="#EF4444" onClick={(d: any) => openSheet(d.trade)} />
                  )}
                  {chartClosed.length > 0 && (
                    <Scatter data={chartClosed} fill="#3B82F6" onClick={(d: any) => openSheet(d.trade)} />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 mt-1 justify-end">
              <LegendDot color="#EF4444" label="진입" />
              <LegendDot color="#3B82F6" label="청산" />
            </div>
          </div>
        )}

        {/* ── 매매 이력 ── */}
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">불러오는 중...</p>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-muted-foreground">등록된 매매 이력이 없습니다.</p>
            <button
              onClick={() => openSheet()}
              className="px-5 py-2.5 rounded-xl bg-muted border border-border text-sm font-semibold text-foreground flex items-center gap-1.5 active:opacity-70 transition-opacity"
            >
              <Plus size={14} />
              현재 보유 포지션 입력
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {trades.map((trade) => (
              <TradeRow
                key={trade.id}
                trade={trade}
                onEdit={() => openSheet(trade)}
                onDelete={() => handleDelete(trade.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 하단 등록 버튼 ── */}
      <div
        className="fixed left-0 right-0 max-w-[390px] mx-auto px-2 py-2 bg-background/95 backdrop-blur border-t border-border"
        style={{ bottom: "calc(var(--bottomnav-h, 60px) + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => openSheet()}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold text-sm flex items-center justify-center gap-1.5 active:opacity-80 transition-opacity"
        >
          <Plus size={15} />
          매매 등록
        </button>
      </div>

      {/* ── 오버레이 ── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50" onClick={closeSheet} />
      )}

      {/* ── Bottom Sheet ── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[70] max-w-[390px] mx-auto bg-card rounded-t-2xl border-t border-x border-border transition-transform duration-300 ease-in-out ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <SheetForm
          form={form}
          setForm={setForm}
          saving={saving}
          editingId={editingId}
          onSave={handleSave}
          onClose={closeSheet}
        />
      </div>
    </div>
  );
}

// ─── 범례 점 ────────────────────────────────────────────────────
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── 컴팩트 이력 행 ─────────────────────────────────────────────
function TradeRow({
  trade, onEdit, onDelete,
}: { trade: KimpTrade; onEdit: () => void; onDelete: () => void }) {
  const isOpen = trade.status === "open";
  const kimp   = calcKimp(trade.sell_price_krw, Number(trade.buy_price_usdt));
  const sign   = kimp >= 0 ? "+" : "";

  return (
    <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-2 py-2">
      {/* 뱃지 */}
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
        isOpen
          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
      }`}>
        {isOpen ? "진입" : "청산"}
      </span>

      {/* 시각 */}
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-[58px]">
        {fmtTime(trade.traded_at)}
      </span>

      {/* 가격·김프 (flex-1) */}
      <div className="flex-1 min-w-0 flex items-center gap-1 text-[10px] tabular-nums overflow-hidden">
        <span className="text-foreground font-medium">{trade.sell_price_krw.toLocaleString()}</span>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">${Number(trade.buy_price_usdt).toFixed(1)}</span>
        <span className="text-border">|</span>
        <span className={kimp >= 0 ? "text-emerald-500 font-medium" : "text-red-400 font-medium"}>
          {sign}{kimp.toFixed(2)}%
        </span>
      </div>

      {/* 수량 */}
      <span className="text-[10px] font-semibold tabular-nums shrink-0 text-foreground">
        {Number(trade.amount).toLocaleString()}U
      </span>

      {/* 버튼 */}
      <div className="flex shrink-0">
        <button onClick={onEdit}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Pencil size={12} />
        </button>
        <button onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Bottom Sheet 폼 ────────────────────────────────────────────
function SheetForm({
  form, setForm, saving, editingId, onSave, onClose,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean;
  editingId: number | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  const stable = toNum(form.stable_price);
  const dollar = toNum(form.dollar_price);
  const kimpVal = calcKimp(stable, dollar);
  const kimpDisplay = fmtKimpDisplay(stable, dollar);

  function handleAmountChange(v: string) {
    const n = toNum(v);
    const c = n >= USDT_PER_CONTRACT ? String(Math.floor(n / USDT_PER_CONTRACT)) : "";
    patch({ amount: v, contracts: c });
  }

  function handleContractsChange(v: string) {
    const n = toNum(v);
    const a = n > 0 ? String(n * USDT_PER_CONTRACT) : "";
    patch({ contracts: v, amount: a });
  }

  return (
    <div className="flex flex-col">
      {/* 핸들 */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-base font-bold text-foreground">
          {editingId ? "매매 수정" : "매매 등록"}
        </h2>
        <button onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* 폼 */}
      <div className="px-4 pt-3 pb-4 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "68vh" }}>

        {/* 진입 / 청산 토글 */}
        <div className="flex gap-2">
          {(["open", "closed"] as const).map(t => (
            <button
              key={t}
              onClick={() => patch({ trade_type: t })}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                form.trade_type === t
                  ? t === "open" ? "bg-red-500 text-white" : "bg-blue-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {t === "open" ? "진입 (매수)" : "청산 (매도)"}
            </button>
          ))}
        </div>

        {/* 가격 2열 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FLabel>스테이블 가격 (원)</FLabel>
            <FInput value={form.stable_price} onChange={v => patch({ stable_price: v })} placeholder="1482" inputMode="numeric" />
          </div>
          <div>
            <FLabel>달러 현물가 ($)</FLabel>
            <FInput value={form.dollar_price} onChange={v => patch({ dollar_price: v })} placeholder="1476.3" inputMode="decimal" />
          </div>
        </div>

        {/* 김프 실시간 표시 */}
        {stable > 0 && dollar > 0 && (
          <div className="bg-muted rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">김프</span>
            <span className={`text-sm font-bold tabular-nums ${
              kimpVal > 0 ? "text-emerald-500" : kimpVal < 0 ? "text-red-400" : "text-foreground"
            }`}>
              {kimpDisplay}
            </span>
          </div>
        )}

        {/* 수량 / 계약 수 연동 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FLabel>수량 (USDT)</FLabel>
            <FInput value={form.amount} onChange={handleAmountChange} placeholder="10000" inputMode="numeric" />
          </div>
          <div>
            <FLabel>계약 수 (1계약=10,000U)</FLabel>
            <FInput value={form.contracts} onChange={handleContractsChange} placeholder="1" inputMode="numeric" />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground active:opacity-70">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-50 active:opacity-70">
            {saving ? "저장 중..." : editingId ? "수정 완료" : "등록 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-muted-foreground mb-1">{children}</p>;
}

function FInput({ value, onChange, placeholder, inputMode }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      inputMode={inputMode} value={value}
      onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-transparent focus:border-ring tabular-nums"
    />
  );
}
