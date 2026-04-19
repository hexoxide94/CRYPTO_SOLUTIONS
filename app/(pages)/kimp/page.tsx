"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Customized,
} from "recharts";
import { Plus, Pencil, Trash2, X, Settings, ChevronDown, ChevronUp } from "lucide-react";

// ─── 상수 ──────────────────────────────────────────────────────
const USDT_PER_DOMESTIC_CONTRACT  = 10_000;
const KRW_PER_OVERSEAS_CONTRACT   = 25_000_000;

// ─── 타입 ──────────────────────────────────────────────────────
interface KimpTrade {
  id: number;
  traded_at: string;
  status: "open" | "closed";
  sell_price_krw: number;
  buy_price_usdt: number;
  kimp_rate: number;
  amount: number;
  detail_json: { contracts: number; futures_type?: "domestic" | "overseas" };
}

interface FormState {
  trade_type:   "open" | "closed";
  futures_type: "domestic" | "overseas";
  stable_price: string;
  dollar_price: string;
  amount:       string;
  contracts:    string;
  traded_at:    string;
}

type ChartRange   = "1h" | "1d" | "1w" | "1m" | "all";
type SummaryRange = "1d" | "1w" | "1m";

// ─── 유틸 ──────────────────────────────────────────────────────
const toNum = (s: string) => Number(s.replace(/,/g, "")) || 0;

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

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
  const pct  = calcKimp(stable, dollar);
  const diff = stable - dollar;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}% (${sign}${diff.toFixed(1)}원)`;
}

function getRangeStart(range: ChartRange | SummaryRange): number {
  const now = Date.now();
  if (range === "1h") return now - 60 * 60 * 1000;
  if (range === "1d") return now - 24 * 60 * 60 * 1000;
  if (range === "1w") return now - 7 * 24 * 60 * 60 * 1000;
  if (range === "1m") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

function computeXTicks(range: ChartRange, now: number): number[] | undefined {
  if (range === "all") return undefined;
  const rangeStart = getRangeStart(range);

  if (range === "1w" || range === "1m") {
    const intervalMs = range === "1w" ? 86_400_000 : 5 * 86_400_000;
    const base = new Date(); base.setHours(0, 0, 0, 0);
    let t = base.getTime();
    while (t > rangeStart) t -= intervalMs;
    t += intervalMs;
    const ticks: number[] = [];
    while (t <= now) { ticks.push(t); t += intervalMs; }
    return ticks.length ? ticks : undefined;
  }

  const intervalMs = range === "1h" ? 10 * 60_000 : 4 * 3_600_000;
  const t0 = Math.ceil(rangeStart / intervalMs) * intervalMs;
  const ticks: number[] = [];
  for (let t = t0; t <= now; t += intervalMs) ticks.push(t);
  return ticks.length ? ticks : undefined;
}

function xTickFormatter(range: ChartRange, equalInterval: boolean, filteredAll: KimpTrade[]) {
  return (v: number): string => {
    if (equalInterval) {
      const t = filteredAll[Math.round(v)];
      if (!t) return "";
      const d = new Date(t.traded_at);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    const d = new Date(v);
    if (range === "1h" || range === "1d") {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
}

const CHART_RANGE_LABELS: Record<ChartRange, string> = {
  "1h": "1시간", "1d": "1일", "1w": "1주", "1m": "1달", "all": "전체",
};

function defaultForm(): FormState {
  return {
    trade_type:   "open",
    futures_type: "domestic",
    stable_price: "",
    dollar_price: "",
    amount:       "",
    contracts:    "",
    traded_at:    toDatetimeLocal(new Date().toISOString()),
  };
}

// ═══════════════════════════════════════════════════════════════
export default function KimpPage() {
  const [trades, setTrades]               = useState<KimpTrade[]>([]);
  const [loading, setLoading]             = useState(true);
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [form, setForm]                   = useState<FormState>(defaultForm());
  const [saving, setSaving]               = useState(false);
  const [chartMode, setChartMode]         = useState<"kimp" | "diff">("kimp");
  const [chartRange, setChartRange]       = useState<ChartRange>("all");
  const [equalInterval, setEqualInterval] = useState(false);
  const [showOptions, setShowOptions]     = useState(false);
  const [showContracts, setShowContracts] = useState(false);
  const [showLine, setShowLine]           = useState(false);
  const [summaryRange, setSummaryRange]   = useState<SummaryRange>("1d");
  const [listExpanded, setListExpanded]   = useState(true);

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

  // ── 기간 요약 ────────────────────────────────────────────────
  const summaryStart  = getRangeStart(summaryRange);
  const summaryTrades = summaryStart > 0
    ? trades.filter(t => new Date(t.traded_at).getTime() >= summaryStart)
    : trades;
  const sumOpen   = summaryTrades.filter(t => t.status === "open");
  const sumClosed = summaryTrades.filter(t => t.status === "closed");

  function weightedAvgKimp(ts: KimpTrade[]): number | null {
    const totalAmt = ts.reduce((s, t) => s + Number(t.amount), 0);
    if (!totalAmt) return null;
    return ts.reduce((s, t) => s + calcKimp(t.sell_price_krw, Number(t.buy_price_usdt)) * Number(t.amount), 0) / totalAmt;
  }
  const openAvgKimp   = weightedAvgKimp(sumOpen);
  const closedAvgKimp = weightedAvgKimp(sumClosed);

  // ── 차트 데이터 ─────────────────────────────────────────────
  const getY = (t: KimpTrade) =>
    chartMode === "kimp"
      ? calcKimp(t.sell_price_krw, Number(t.buy_price_usdt))
      : t.sell_price_krw - Number(t.buy_price_usdt);

  const rangeStart  = getRangeStart(chartRange);
  const sortedAll   = [...trades].sort(
    (a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime()
  );
  const filteredAll = rangeStart > 0
    ? sortedAll.filter(t => new Date(t.traded_at).getTime() >= rangeStart)
    : sortedAll;

  const allChartPoints = filteredAll.map((t, i) => ({
    x: equalInterval ? i : new Date(t.traded_at).getTime(),
    y: getY(t),
    trade: t,
  }));

  const chartOpen   = allChartPoints.filter(p => p.trade.status === "open");
  const chartClosed = allChartPoints.filter(p => p.trade.status === "closed");

  const xDomain = equalInterval
    ? ([0, Math.max(filteredAll.length - 1, 1)] as [number, number])
    : (["dataMin - 3600000", "dataMax + 3600000"] as [string, string]);

  const yTickFmt = chartMode === "kimp"
    ? (v: number) => `${v.toFixed(1)}%`
    : (v: number) => `${Math.round(v)}`;

  // ── 커스텀 점 렌더러 ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeShape(color: string): (props: any) => JSX.Element {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function ChartDot(props: any) {
      const { cx, cy, payload } = props;
      const contracts: number = payload?.trade?.detail_json?.contracts ?? 0;
      return (
        <g>
          <circle cx={cx} cy={cy} r={5} fill={color} />
          {showContracts && contracts > 1 && (
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight="bold"
              fill="hsl(var(--foreground))">
              {contracts}
            </text>
          )}
        </g>
      );
    };
  }

  // ── 공통 툴바 버튼 스타일 ────────────────────────────────────
  const tbBtn = (active: boolean) =>
    `px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  // ── 시트 ────────────────────────────────────────────────────
  function openSheet(trade?: KimpTrade) {
    if (trade) {
      setEditingId(trade.id);
      setForm({
        trade_type:   trade.status,
        futures_type: trade.detail_json?.futures_type ?? "domestic",
        stable_price: String(trade.sell_price_krw),
        dollar_price: String(Number(trade.buy_price_usdt)),
        amount:       String(Number(trade.amount)),
        contracts:    String(trade.detail_json?.contracts ?? 0),
        traded_at:    toDatetimeLocal(trade.traded_at),
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
    const tradedAt  = form.traded_at
      ? new Date(form.traded_at).toISOString()
      : new Date().toISOString();

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
      detail_json:    { contracts, futures_type: form.futures_type },
      traded_at:      tradedAt,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("kimp_trades").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("kimp_trades").insert(payload));
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
          <p className={`text-lg font-bold tabular-nums ${
            netPosition > 0 ? "text-red-500" : netPosition < 0 ? "text-blue-500" : "text-foreground"
          }`}>
            {netPosition > 0 ? "+" : ""}{netPosition.toLocaleString()}
            <span className="text-sm font-normal ml-1 text-muted-foreground">USDT</span>
          </p>
        </div>

        {/* ── 차트 ── */}
        {trades.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3 relative">

            {/* 툴바 */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex gap-0.5">
                {(["1h", "1d", "1w", "1m", "all"] as const).map(r => (
                  <button key={r} onClick={() => setChartRange(r)} className={tbBtn(chartRange === r)}>
                    {CHART_RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
              <div className="flex gap-0.5">
                <button onClick={() => setChartMode("kimp")}         className={tbBtn(chartMode === "kimp")}>%</button>
                <button onClick={() => setChartMode("diff")}         className={tbBtn(chartMode === "diff")}>원</button>
                <button onClick={() => setEqualInterval(v => !v)}    className={tbBtn(equalInterval)}>등간격</button>
              </div>
            </div>

            {/* 그래프 */}
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="x" type="number"
                    scale={equalInterval ? "linear" : "time"}
                    domain={xDomain}
                    ticks={equalInterval ? undefined : computeXTicks(chartRange, Date.now())}
                    tickFormatter={xTickFormatter(chartRange, equalInterval, filteredAll)}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="y" type="number" domain={["auto", "auto"]}
                    tickFormatter={yTickFmt}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false} axisLine={false} width={40}
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
                          <p className="text-muted-foreground">환율: <span className="text-foreground">{Number(t.buy_price_usdt).toFixed(2)}</span></p>
                          <p className="text-muted-foreground">김프: <span className={kimp >= 0 ? "text-red-500" : "text-blue-500"}>{kimp >= 0 ? "+" : ""}{kimp.toFixed(2)}%</span></p>
                          <p className="text-muted-foreground">차이: <span className="text-foreground">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}원</span></p>
                          <p className="text-muted-foreground">수량: <span className="text-foreground">{Number(t.amount).toLocaleString()}</span></p>
                        </div>
                      );
                    }}
                  />
                  {showLine && allChartPoints.length > 1 && (
                    <Customized
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      component={(cp: any) => {
                        const xs = Object.values(cp.xAxisMap ?? {})[0] as { scale?: (v: number) => number } | undefined;
                        const ys = Object.values(cp.yAxisMap ?? {})[0] as { scale?: (v: number) => number } | undefined;
                        if (!xs?.scale || !ys?.scale) return null;
                        const pts = allChartPoints.map(p => `${xs.scale!(p.x)},${ys.scale!(p.y)}`).join(" ");
                        return <polyline points={pts} fill="none" stroke="rgba(200,200,200,0.25)" strokeWidth={1} />;
                      }}
                    />
                  )}
                  {chartOpen.length > 0 && (
                    <Scatter data={chartOpen} shape={makeShape("#EF4444")}
                      onClick={(d) => openSheet((d as unknown as { trade: KimpTrade }).trade)} />
                  )}
                  {chartClosed.length > 0 && (
                    <Scatter data={chartClosed} shape={makeShape("#3B82F6")}
                      onClick={(d) => openSheet((d as unknown as { trade: KimpTrade }).trade)} />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* 범례 + 설정 */}
            <div className="flex items-center justify-between mt-1">
              <div className="flex gap-3">
                <LegendDot color="#EF4444" label="진입" />
                <LegendDot color="#3B82F6" label="청산" />
              </div>
              <button
                onClick={() => setShowOptions(v => !v)}
                className={`p-1 rounded transition-colors ${showOptions ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Settings size={14} />
              </button>
            </div>

            {/* 옵션 패널 — absolute 우하단, width 고정 */}
            {showOptions && (
              <div
                className="absolute bottom-9 right-3 z-10 border border-border rounded-xl bg-card shadow-lg"
                style={{ width: 160, padding: 12, boxSizing: "border-box", overflow: "hidden" }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", marginBottom: 8 }}>
                  <input type="checkbox" checked={showContracts} onChange={e => setShowContracts(e.target.checked)}
                    style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <span style={{ fontSize: 12 }}>계약 수 표시</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer" }}>
                  <input type="checkbox" checked={showLine} onChange={e => setShowLine(e.target.checked)}
                    style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <span style={{ fontSize: 12 }}>연결선 표시</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* ── 매매 이력 ── */}
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">불러오는 중...</p>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-muted-foreground">등록된 매매 이력이 없습니다.</p>
            <button onClick={() => openSheet()}
              className="px-5 py-2.5 rounded-xl bg-muted border border-border text-sm font-semibold text-foreground flex items-center gap-1.5 active:opacity-70 transition-opacity">
              <Plus size={14} />현재 보유 포지션 입력
            </button>
          </div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1">
                  {(["1d", "1w", "1m"] as const).map(r => (
                    <button key={r} onClick={() => setSummaryRange(r)} className={tbBtn(summaryRange === r)}>
                      {r === "1d" ? "최근 1일" : r === "1w" ? "최근 1주" : "최근 1달"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setListExpanded(v => !v)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title={listExpanded ? "목록 접기" : "목록 펼치기"}
                >
                  {listExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">진입 평균 김프</p>
                  <p className={`text-sm font-bold tabular-nums ${
                    openAvgKimp === null ? "text-muted-foreground"
                    : openAvgKimp >= 0 ? "text-red-500" : "text-blue-500"
                  }`}>
                    {openAvgKimp === null ? "-"
                      : `${openAvgKimp >= 0 ? "+" : ""}${openAvgKimp.toFixed(2)}%`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">청산 평균 김프</p>
                  <p className={`text-sm font-bold tabular-nums ${
                    closedAvgKimp === null ? "text-muted-foreground"
                    : closedAvgKimp >= 0 ? "text-red-500" : "text-blue-500"
                  }`}>
                    {closedAvgKimp === null ? "-"
                      : `${closedAvgKimp >= 0 ? "+" : ""}${closedAvgKimp.toFixed(2)}%`}
                  </p>
                </div>
              </div>
            </div>

            {/* 이력 목록 */}
            {listExpanded && (
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
          </>
        )}
      </div>

      {/* 하단 버튼 */}
      <div
        className="fixed left-0 right-0 max-w-[390px] mx-auto px-2 py-2 bg-background/95 backdrop-blur border-t border-border"
        style={{ bottom: "calc(var(--bottomnav-h, 60px) + env(safe-area-inset-bottom))" }}
      >
        <button onClick={() => openSheet()}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold text-sm flex items-center justify-center gap-1.5 active:opacity-80 transition-opacity">
          <Plus size={15} />매매 기록
        </button>
      </div>

      {sheetOpen && <div className="fixed inset-0 z-[60] bg-black/50" onClick={closeSheet} />}

      <div
        className={`fixed inset-x-0 bottom-0 z-[70] max-w-[390px] mx-auto bg-card rounded-t-2xl border-t border-x border-border transition-transform duration-300 ease-in-out ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <SheetForm
          form={form} setForm={setForm} saving={saving}
          editingId={editingId} onSave={handleSave} onClose={closeSheet}
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

// ─── 이력 행 ────────────────────────────────────────────────────
function TradeRow({ trade, onEdit, onDelete }: {
  trade: KimpTrade; onEdit: () => void; onDelete: () => void;
}) {
  const isOpen = trade.status === "open";
  const kimp   = calcKimp(trade.sell_price_krw, Number(trade.buy_price_usdt));
  const sign   = kimp >= 0 ? "+" : "";

  return (
    <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-2 py-2">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
        isOpen
          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
      }`}>
        {isOpen ? "진입" : "청산"}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-[58px]">
        {fmtTime(trade.traded_at)}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1 text-[10px] tabular-nums overflow-hidden">
        <span className="text-foreground font-medium">{trade.sell_price_krw.toLocaleString()}</span>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">{Number(trade.buy_price_usdt).toFixed(1)}</span>
        <span className="text-border">|</span>
        <span className={kimp >= 0 ? "text-red-500 font-medium" : "text-blue-500 font-medium"}>
          {sign}{kimp.toFixed(2)}%
        </span>
      </div>
      <span className="text-[10px] font-semibold tabular-nums shrink-0 text-foreground">
        {Number(trade.amount).toLocaleString()}
      </span>
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

  const stable     = toNum(form.stable_price);
  const dollar     = toNum(form.dollar_price);
  const kimpVal    = calcKimp(stable, dollar);
  const kimpDisplay = fmtKimpDisplay(stable, dollar);

  function handleAmountChange(v: string) {
    const n = toNum(v);
    if (form.futures_type === "overseas") {
      const rate = toNum(form.dollar_price);
      const c = rate > 0 && n > 0 ? String(Math.floor(n * rate / KRW_PER_OVERSEAS_CONTRACT)) : "";
      patch({ amount: v, contracts: c });
    } else {
      const c = n >= USDT_PER_DOMESTIC_CONTRACT ? String(Math.floor(n / USDT_PER_DOMESTIC_CONTRACT)) : "";
      patch({ amount: v, contracts: c });
    }
  }

  function handleContractsChange(v: string) {
    const n = toNum(v);
    if (form.futures_type === "overseas") {
      const rate = toNum(form.dollar_price);
      const a = rate > 0 && n > 0 ? String(Math.round(n * KRW_PER_OVERSEAS_CONTRACT / rate)) : "";
      patch({ contracts: v, amount: a });
    } else {
      const a = n > 0 ? String(n * USDT_PER_DOMESTIC_CONTRACT) : "";
      patch({ contracts: v, amount: a });
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-base font-bold text-foreground">
          {editingId ? "매매 수정" : "매매 기록"}
        </h2>
        <button onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="px-4 pt-3 pb-4 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "68vh" }}>

        {/* 진입 / 청산 */}
        <div className="flex gap-2">
          {(["open", "closed"] as const).map(t => (
            <button key={t} onClick={() => patch({ trade_type: t })}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                form.trade_type === t
                  ? t === "open" ? "bg-red-500 text-white" : "bg-blue-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}>
              {t === "open" ? "진입 (매수)" : "청산 (매도)"}
            </button>
          ))}
        </div>

        {/* 국선/해선 + 거래 시간 (한 줄) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["domestic", "overseas"] as const).map(ft => (
            <button key={ft}
              onClick={() => patch({ futures_type: ft, amount: "", contracts: "" })}
              style={{ width: 70, flexShrink: 0 }}
              className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                form.futures_type === ft ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}>
              {ft === "domestic" ? "국선" : "해선"}
            </button>
          ))}
          <input
            type="datetime-local"
            value={form.traded_at}
            onChange={e => patch({ traded_at: e.target.value })}
            style={{ flex: 1, minWidth: 0 }}
            className="bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none border border-transparent focus:border-ring"
          />
        </div>

        {/* 스테이블 코인 / 원달러 환율 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FLabel>스테이블 코인</FLabel>
            <FInput value={form.stable_price} onChange={v => patch({ stable_price: v })} inputMode="numeric" />
          </div>
          <div>
            <FLabel>원달러 환율</FLabel>
            <FInput value={form.dollar_price} onChange={v => patch({ dollar_price: v })} inputMode="decimal" />
          </div>
        </div>

        {/* 김프 실시간 */}
        {stable > 0 && dollar > 0 && (
          <div className="bg-muted rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">김프</span>
            <span className={`text-sm font-bold tabular-nums ${
              kimpVal > 0 ? "text-red-500" : kimpVal < 0 ? "text-blue-500" : "text-foreground"
            }`}>
              {kimpDisplay}
            </span>
          </div>
        )}

        {/* 수량 / 계약 수 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FLabel>수량 (USDT)</FLabel>
            <FInput value={form.amount} onChange={handleAmountChange} inputMode="numeric" />
          </div>
          <div>
            <FLabel>
              {form.futures_type === "domestic"
                ? "계약 수 (1계약=10,000$)"
                : "계약 수 (1계약=2,500만원)"}
            </FLabel>
            <FInput value={form.contracts} onChange={handleContractsChange} inputMode="numeric" />
          </div>
        </div>

        {/* 해선 계약가치 안내 */}
        {form.futures_type === "overseas" && dollar > 0 && toNum(form.contracts) > 0 && (
          <p className="text-[10px] text-muted-foreground">
            1계약 ≈ {Math.round(KRW_PER_OVERSEAS_CONTRACT / dollar).toLocaleString()}달러
            · {toNum(form.contracts)}계약 ≈ {toNum(form.amount).toLocaleString()}달러
          </p>
        )}

        {/* 저장 버튼 */}
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

function FInput({ value, onChange, inputMode }: {
  value: string; onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      inputMode={inputMode} value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-transparent focus:border-ring tabular-nums"
    />
  );
}
