"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useUsdtPrices } from "@/lib/usdt-context";
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer
} from "recharts";
import { Plus, Pencil, Trash2, X, Settings, ChevronDown, ChevronUp, Download, Camera } from "lucide-react";
import html2canvas from "html2canvas";

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
  detail_json: {
    contracts: number;
    futures_type?: "domestic" | "overseas";
    fee_stable?: number;
    fee_dollar?: number;
    original_stable?: number;
    original_dollar?: number;
  };
}

interface FormState {
  trade_type:   "open" | "closed";
  futures_type: "domestic" | "overseas";
  stable_price: string;
  dollar_price: string;
  fee_stable:   string;
  fee_dollar:   string;
  amount:       string;
  contracts:    string;
  traded_at:    string;
}

type ChartRange   = "1d" | "3d" | "1w" | "2w" | "1m" | "all" | "custom";
type SummaryRange = "1d" | "3d" | "1w" | "2w" | "1m";

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

function fmtStable(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith(".0") ? String(Math.round(v)) : s;
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

function formatKrwShort(num: number): string {
  if (!num) return "0원";
  const absNum = Math.abs(num);
  const uk = Math.floor(absNum / 100000000);
  const man = Math.floor((absNum % 100000000) / 10000);
  const remainder = Math.floor(absNum % 10000);

  let result = "";
  if (uk > 0) result += `${uk}억 `;
  if (man > 0) result += `${man.toLocaleString()}만`;
  if (uk === 0 && man === 0) result += `${remainder.toLocaleString()}`;

  return (num < 0 ? "-" : "") + result.trim() + "원";
}

function getRangeStart(range: ChartRange | SummaryRange): number {
  const now = Date.now();
  if (range === "1d") return now - 24 * 60 * 60 * 1000;
  if (range === "3d") return now - 3 * 24 * 60 * 60 * 1000;
  if (range === "1w") return now - 7 * 24 * 60 * 60 * 1000;
  if (range === "2w") return now - 14 * 24 * 60 * 60 * 1000;
  if (range === "1m") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

function computeXTicks(range: ChartRange, filteredAll: KimpTrade[]): number[] | undefined {
  const now = Date.now();

  if (range === "all") {
    if (filteredAll.length < 2) return undefined;
    const timestamps = filteredAll.map(t => new Date(t.traded_at).getTime());
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    const span = maxT - minT;
    if (span <= 0) return undefined;
    const ticks: number[] = [];
    for (let i = 0; i <= 5; i++) ticks.push(Math.round(minT + (span * i) / 5));
    return ticks;
  }

  const rangeStart = getRangeStart(range);

  if (range === "1w" || range === "3d" || range === "2w" || range === "1m") {
    const intervalMs = range === "1w" ? 86_400_000 : range === "3d" ? 43_200_000 : range === "2w" ? 2 * 86_400_000 : 5 * 86_400_000;
    const base = new Date(); base.setHours(0, 0, 0, 0);
    let t = base.getTime();
    while (t > rangeStart) t -= intervalMs;
    t += intervalMs;
    const ticks: number[] = [];
    while (t <= now) { ticks.push(t); t += intervalMs; }
    return ticks.length ? ticks : undefined;
  }

  const intervalMs = 4 * 3_600_000;
  const t0 = Math.ceil(rangeStart / intervalMs) * intervalMs;
  const ticks: number[] = [];
  for (let t = t0; t <= now; t += intervalMs) ticks.push(t);
  return ticks.length ? ticks : undefined;
}

function xTickFormatter(range: ChartRange, equalInterval: boolean, filteredAll: KimpTrade[]) {
  const allSpanMs = (() => {
    if (range !== "all" || filteredAll.length < 2) return Infinity;
    const ts = filteredAll.map(t => new Date(t.traded_at).getTime());
    return Math.max(...ts) - Math.min(...ts);
  })();

  return (v: number): string => {
    if (equalInterval) {
      const t = filteredAll[Math.round(v)];
      if (!t) return "";
      const d = new Date(t.traded_at);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    const d = new Date(v);
    if (range === "1d") {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    if (range === "all") {
      return allSpanMs <= 86_400_000
        ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        : `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
}

const CHART_RANGE_LABELS: Record<ChartRange, string> = {
  "1d": "1일", "3d": "3일", "1w": "1주", "2w": "2주", "1m": "1달", "all": "전체", "custom": "직접",
};

function defaultForm(): FormState {
  return {
    trade_type:   "open",
    futures_type: "domestic",
    stable_price: "",
    dollar_price: "",
    fee_stable:   "0",
    fee_dollar:   "0.003",
    amount:       "",
    contracts:    "",
    traded_at:    toDatetimeLocal(new Date().toISOString()),
  };
}

function reverseFee(stableAdj: number, dollarAdj: number, feeStable: number, feeDollar: number, tradeType: "open" | "closed") {
  if (tradeType === "open") {
    return {
      stable: stableAdj / (1 + feeStable / 100),
      dollar: dollarAdj / (1 - feeDollar / 100),
    };
  } else {
    return {
      stable: stableAdj / (1 - feeStable / 100),
      dollar: dollarAdj / (1 + feeDollar / 100),
    };
  }
}

// 수수료 보정 계산
function applyFee(stable: number, dollar: number, feeStable: number, feeDollar: number, tradeType: "open" | "closed") {
  if (tradeType === "open") {
    return {
      stableAdj: stable * (1 + feeStable / 100),
      dollarAdj: dollar * (1 - feeDollar / 100),
    };
  } else {
    return {
      stableAdj: stable * (1 - feeStable / 100),
      dollarAdj: dollar * (1 + feeDollar / 100),
    };
  }
}

interface MarketPoint {
  timestamp: number;
  kimp: number;
  domestic: number;
  overseas: number;
}

// ═══════════════════════════════════════════════════════════════
export default function KimpPage() {
  const { usdt: usdtPrices } = useUsdtPrices();
  const [trades, setTrades]               = useState<KimpTrade[]>([]);
  const [loading, setLoading]             = useState(true);
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [isEditMode, setIsEditMode]       = useState(false);
  const [form, setForm]                   = useState<FormState>(defaultForm());
  const [saving, setSaving]               = useState(false);
  const [chartMode, setChartMode]         = useState<"kimp" | "diff">("kimp");
  const [chartRange, setChartRange]       = useState<ChartRange>("1w");
  const [equalInterval, setEqualInterval] = useState(false);
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [showOptions, setShowOptions]     = useState(false);
  const [showContracts, setShowContracts] = useState(true);
  const [showKimpLabel, setShowKimpLabel] = useState(true);
  const [showTrendLine, setShowTrendLine] = useState(true);
  const [yManual, setYManual]             = useState(false);
  const [yRange, setYRange]               = useState<{
    kimp: { min: string; max: string };
    diff: { min: string; max: string };
  }>({ kimp: { min: "", max: "" }, diff: { min: "", max: "" } });
  const [summaryRange, setSummaryRange]   = useState<SummaryRange>("1w");
  const [listExpanded, setListExpanded]   = useState(true);
  const chartRef                          = useRef<HTMLDivElement>(null);

  // ── 시장 김프 데이터 ──────────────────────────────────────────
  const [marketData, setMarketData] = useState<MarketPoint[]>([]);
  const [viewMode, setViewMode] = useState({ trades: true, market: true });
  const [marketLoading, setMarketLoading] = useState(false);

  const fetchMarketChartData = useCallback(async () => {
    setMarketLoading(true);
    try {
      const res = await fetch(`/api/kimp/chart-data?range=${chartRange}`);
      const data = await res.json();
      if (data.chartData) setMarketData(data.chartData);
    } catch (err) {
      console.error("[fetchMarketChartData] Error:", err);
    } finally {
      setMarketLoading(false);
    }
  }, [chartRange]);

  useEffect(() => {
    fetchMarketChartData();
  }, [fetchMarketChartData]);

  const handleCapture = async () => {
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current, { backgroundColor: "#000" });
      const link = document.createElement("a");
      link.download = `kimp_chart_${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("[Capture Error]", error);
      alert("차트 캡처에 실패했습니다.");
    }
  };




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

  const summaryDays = summaryRange === "1d" ? 1 : summaryRange === "1w" ? 7 : summaryRange === "2w" ? 14 : 30;

  function getContractsSum(ts: KimpTrade[]) {
    return ts.reduce((sum, t) => {
      const raw = t.detail_json?.contracts ?? 0;
      const ft = t.detail_json?.futures_type ?? "domestic";
      const dollar = Number(t.buy_price_usdt ?? 0);
      const displayContracts = ft === "overseas" && dollar > 0
        ? Math.round(KRW_PER_OVERSEAS_CONTRACT / dollar / USDT_PER_DOMESTIC_CONTRACT)
        : raw;
      return sum + displayContracts;
    }, 0);
  }

  const openCountPerDay = getContractsSum(sumOpen) / summaryDays;
  const closedCountPerDay = getContractsSum(sumClosed) / summaryDays;

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
  
  const filteredAll = (() => {
    if (chartRange === "all") return sortedAll;
    if (chartRange === "custom") {
      const s = customRange.start ? new Date(customRange.start).getTime() : 0;
      const e = customRange.end ? new Date(customRange.end + "T23:59:59").getTime() : Infinity;
      return sortedAll.filter(t => {
        const time = new Date(t.traded_at).getTime();
        return time >= s && time <= e;
      });
    }
    return rangeStart > 0
      ? sortedAll.filter(t => new Date(t.traded_at).getTime() >= rangeStart)
      : sortedAll;
  })();

  const allChartPoints = filteredAll.map((t, i) => ({
    x: equalInterval ? i : new Date(t.traded_at).getTime(),
    y: getY(t),
    trade: t,
  }));

  const chartOpen   = allChartPoints.filter(p => p.trade.status === "open");
  const chartClosed = allChartPoints.filter(p => p.trade.status === "closed");

  // 시장 데이터 가공
  const marketChartPoints = marketData.map(d => ({
    x: d.timestamp,
    y: chartMode === "kimp" ? d.kimp : d.domestic - d.overseas,
    isMarket: true,
    detail: d
  }));

  const xDomain = (["dataMin", "dataMax"] as [string, string]);

  const yTickFmt = chartMode === "kimp"
    ? (v: number) => `${v.toFixed(1)}%`
    : (v: number) => `${Math.round(v)}`;

  function setYRangeForMode(field: "min" | "max", value: string) {
    setYRange(prev => ({ ...prev, [chartMode]: { ...prev[chartMode], [field]: value } }));
  }

  const yDomain: [number | "auto", number | "auto"] = (() => {
    if (!yManual) return ["auto", "auto"];
    const r = yRange[chartMode];
    return [
      r.min !== "" ? parseFloat(r.min) : "auto",
      r.max !== "" ? parseFloat(r.max) : "auto",
    ];
  })();

  // ── 커스텀 점 렌더러 ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeShape(color: string): (props: any) => JSX.Element {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function ChartDot(props: any) {
      const { cx, cy, payload } = props;
      const trade = payload?.trade as KimpTrade | undefined;
      const rawContracts: number = trade?.detail_json?.contracts ?? 0;
      const futuresType = trade?.detail_json?.futures_type ?? "domestic";
      const dollar = Number(trade?.buy_price_usdt ?? 0);

      const displayContracts = futuresType === "overseas" && dollar > 0
        ? Math.round(KRW_PER_OVERSEAS_CONTRACT / dollar / USDT_PER_DOMESTIC_CONTRACT)
        : rawContracts;

      const kimpPct  = trade ? calcKimp(trade.sell_price_krw, dollar) : 0;
      const kimpDiff = trade ? trade.sell_price_krw - dollar : 0;
      const kimpSign = kimpPct >= 0 ? "+" : "";
      const kimpLabel = chartMode === "kimp"
        ? `${kimpSign}${kimpPct.toFixed(2)}%`
        : `${kimpSign}${kimpDiff.toFixed(1)}원`;

      return (
        <g>
          <circle cx={cx} cy={cy} r={5} fill={color} stroke="hsl(var(--background))" strokeWidth={1.5} />
          {showContracts && displayContracts >= 1 && (
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight="bold" fill="currentColor" className="fill-foreground">
              {displayContracts}
            </text>
          )}
          {showKimpLabel && trade && (
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill="currentColor" className="fill-foreground">
              {kimpLabel}
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
      const ft = trade.detail_json?.futures_type ?? "domestic";
      const f_stable = trade.detail_json?.fee_stable ?? 0;
      const f_dollar = trade.detail_json?.fee_dollar ?? (ft === "domestic" ? 0.003 : 0.01);
      
      const orig = trade.detail_json?.original_stable !== undefined 
        ? { stable: trade.detail_json.original_stable, dollar: trade.detail_json.original_dollar! }
        : reverseFee(Number(trade.sell_price_krw), Number(trade.buy_price_usdt), f_stable, f_dollar, trade.status);

      setEditingId(trade.id);
      setForm({
        trade_type:   trade.status,
        futures_type: ft,
        stable_price: String(parseFloat(orig.stable.toFixed(1))),
        dollar_price: String(parseFloat(orig.dollar.toFixed(4))),
        fee_stable:   String(f_stable),
        fee_dollar:   String(f_dollar),
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
    const feeStable = parseFloat(form.fee_stable) || 0;
    const feeDollar = parseFloat(form.fee_dollar) || 0;

    const { stableAdj, dollarAdj } = applyFee(stable, dollar, feeStable, feeDollar, form.trade_type);

    const kimp      = calcKimp(stableAdj, dollarAdj);
    const contracts = toNum(form.contracts);
    const amount    = form.futures_type === "overseas" && contracts > 0 && dollar > 0
      ? Math.round(contracts * KRW_PER_OVERSEAS_CONTRACT / dollar)
      : toNum(form.amount);
    const tradedAt  = form.traded_at
      ? new Date(form.traded_at).toISOString()
      : new Date().toISOString();

    setSaving(true);
    console.log("[handleSave] stableAdj:", stableAdj, "dollarAdj:", dollarAdj, "kimp:", kimp, "amount:", amount);
    const payload = {
      status:         form.trade_type,
      coin:           "USDT",
      amount,
      buy_exchange:   "-",
      sell_exchange:  "-",
      sell_price_krw: parseFloat(stableAdj.toFixed(1)),
      buy_price_usdt: parseFloat(dollarAdj.toFixed(4)),
      usdt_rate:      parseFloat(stableAdj.toFixed(1)),
      kimp_rate:      parseFloat(kimp.toFixed(4)),
      profit_krw:     0,
      fee_krw:        0,
      memo:           "",
      detail_json:    {
        contracts,
        futures_type: form.futures_type,
        fee_stable:   feeStable,
        fee_dollar:   feeDollar,
        original_stable: stable,
        original_dollar: dollar,
      },
      traded_at: tradedAt,
    };
    console.log("[handleSave] payload:", JSON.stringify(payload, null, 2));

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

  // ── 엑셀 다운로드 ────────────────────────────────────────────────
  function handleDownloadExcel() {
    if (!confirm("매매 내역을 엑셀(CSV)로 다운로드 하시겠습니까?")) return;
    
    const headers = ["거래일시", "상태", "국내원화가격", "해외달러가격", "김프(%)", "수량", "계약수", "선물종류"];
    const csvRows = [headers.join(",")];
    
    for (const t of trades) {
      const row = [
        fmtTime(t.traded_at),
        t.status === "open" ? "진입" : "청산",
        t.sell_price_krw,
        t.buy_price_usdt,
        calcKimp(t.sell_price_krw, Number(t.buy_price_usdt)).toFixed(2),
        t.amount,
        t.detail_json?.contracts ?? 0,
        t.detail_json?.futures_type === "overseas" ? "해외선물" : "국내선물"
      ];
      csvRows.push(row.join(","));
    }
    
    const csvString = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel Korean support
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `매매내역_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col min-h-full px-3 pt-2 gap-2 pb-24">
      {/* ── 전역 기간 선택기 (상단) ── */}
      <div className="rounded-xl p-1.5 shadow-lg backdrop-blur-md border border-white/10 flex flex-col gap-1.5"
        style={{ background: "linear-gradient(145deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)" }}>
        
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pr-0.5">
            <div className="flex items-center gap-0.5">
              {(["1d", "3d", "1w", "2w"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => { 
                    setChartRange(r); 
                    setSummaryRange(r as SummaryRange); 
                    if (viewMode.market) setEqualInterval(false);
                  }}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                    chartRange === r 
                      ? "bg-foreground text-background shadow-sm" 
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CHART_RANGE_LABELS[r]}
                </button>
              ))}
            </div>

          <div className="flex items-center gap-1 shrink-0">
            <input 
              type="date" 
              value={customRange.start}
              onChange={e => { setCustomRange(prev => ({ ...prev, start: e.target.value })); setChartRange("custom"); }}
              className="bg-background/40 border border-white/5 rounded px-1 py-0.5 text-[9px] text-foreground outline-none"
            />
            <span className="text-[9px] text-muted-foreground">~</span>
            <input 
              type="date" 
              value={customRange.end}
              onChange={e => { setCustomRange(prev => ({ ...prev, end: e.target.value })); setChartRange("custom"); }}
              className="bg-background/40 border border-white/5 rounded px-1 py-0.5 text-[9px] text-foreground outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">

        {/* ── 차트 ── */}
        {trades.length > 0 && (
          <div className="rounded-xl p-2.5 relative shadow-lg backdrop-blur-md border border-white/10"
            style={{ background: "linear-gradient(145deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)" }}>

            {/* 툴바 */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setViewMode(v => ({ ...v, trades: !v.trades }))} 
                  className={tbBtn(viewMode.trades)}
                >
                  매매 기록
                </button>
                <button 
                  onClick={() => setViewMode(v => ({ ...v, market: !v.market }))} 
                  className={tbBtn(viewMode.market)}
                >
                  김프 차트
                </button>
                {marketLoading && <span className="ml-1 text-[9px] text-muted-foreground animate-pulse">로딩중...</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={handleCapture}
                    className="p-1 mr-0.5 rounded transition-colors text-muted-foreground hover:text-foreground"
                    title="차트 캡처"
                  >
                    <Camera size={14} />
                  </button>
                  <button
                    onClick={() => setShowOptions(v => !v)}
                    className={`p-1 mr-0.5 rounded transition-colors ${showOptions ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Settings size={14} />
                  </button>
                  <div className="flex gap-0.5">
                    <button onClick={() => setChartMode("kimp")}         className={tbBtn(chartMode === "kimp")}>%</button>
                    <button onClick={() => setChartMode("diff")}         className={tbBtn(chartMode === "diff")}>원</button>
                    {!viewMode.market && (
                      <button onClick={() => setEqualInterval(v => !v)}    className={tbBtn(equalInterval)}>등간격</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 그래프 */}
            <div ref={chartRef} style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={allChartPoints} margin={{ top: 4, right: 10, bottom: 0, left: -5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="x" type="number"
                    scale={equalInterval ? "linear" : "time"}
                    domain={xDomain}
                    ticks={equalInterval ? undefined : computeXTicks(chartRange, filteredAll)}
                    tickFormatter={xTickFormatter(chartRange, equalInterval, filteredAll)}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="y" type="number" domain={yDomain}
                    tickFormatter={yTickFmt}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false} axisLine={false} width={35}
                  />

                  {viewMode.market && marketChartPoints.length > 0 && (
                    <Line
                      type="monotone"
                      data={marketChartPoints}
                      dataKey="y"
                      stroke="#22D3EE"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      opacity={0.9}
                      name="시장 김프"
                    />
                  )}

                  {viewMode.trades && chartOpen.length > 0 && (
                    <Scatter data={chartOpen} shape={makeShape("#EF4444")} />
                  )}
                  {viewMode.trades && chartClosed.length > 0 && (
                    <Scatter data={chartClosed} shape={makeShape("#3B82F6")} />
                  )}
                  {showTrendLine && viewMode.trades && (
                    <Line type="monotone" data={allChartPoints} dataKey="y" stroke="#9CA3AF" strokeWidth={1} dot={false} activeDot={false} opacity={0.3} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 범례 및 설정은 상단 툴바로 이동됨 */}

            {/* 옵션 패널 */}
            {showOptions && (
              <div
                className="absolute bottom-9 right-3 z-10 border border-border rounded-xl bg-card shadow-lg"
                style={{ width: 180, padding: 12, boxSizing: "border-box", overflow: "hidden" }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", marginBottom: 8 }}>
                  <input type="checkbox" checked={showTrendLine} onChange={e => setShowTrendLine(e.target.checked)}
                    style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <span style={{ fontSize: 12 }}>추세선 표시</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", marginBottom: 8 }}>
                  <input type="checkbox" checked={showContracts} onChange={e => setShowContracts(e.target.checked)}
                    style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <span style={{ fontSize: 12 }}>계약 수 표시</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", marginBottom: 8 }}>
                  <input type="checkbox" checked={showKimpLabel} onChange={e => setShowKimpLabel(e.target.checked)}
                    style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <span style={{ fontSize: 12 }}>김프값 표기</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", marginBottom: yManual ? 6 : 0 }}>
                  <input type="checkbox" checked={yManual} onChange={e => setYManual(e.target.checked)}
                    style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <span style={{ fontSize: 12 }}>Y축 수동 설정</span>
                </label>
                {yManual && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      type="number" step="0.01" placeholder="최소"
                      value={yRange[chartMode].min}
                      onChange={e => setYRangeForMode("min", e.target.value)}
                      style={{
                        width: 0, flex: 1, padding: "3px 5px", fontSize: 11, borderRadius: 6,
                        background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--foreground))", outline: "none",
                      }}
                    />
                    <input
                      type="number" step="0.01" placeholder="최대"
                      value={yRange[chartMode].max}
                      onChange={e => setYRangeForMode("max", e.target.value)}
                      style={{
                        width: 0, flex: 1, padding: "3px 5px", fontSize: 11, borderRadius: 6,
                        background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--foreground))", outline: "none",
                      }}
                    />
                  </div>
                )}
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
            <div className="rounded-xl p-2.5 shadow-lg backdrop-blur-md border border-white/10"
              style={{ background: "linear-gradient(145deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)" }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-foreground font-bold italic opacity-80">SUMMARY STATISTICS</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownloadExcel}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="엑셀 다운로드"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => setListExpanded(v => !v)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title={listExpanded ? "목록 접기" : "목록 펼치기"}
                  >
                    {listExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-background/40 dark:bg-black/20 rounded-xl p-2 border border-white/5 flex flex-col items-center justify-between">
                  <p className="text-[11px] text-muted-foreground mb-1">진입평균</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight mb-2"
                    style={{ color: openAvgKimp === null ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))" }}>
                    {openAvgKimp === null ? "-"
                      : `${openAvgKimp >= 0 ? "+" : ""}${openAvgKimp.toFixed(2)}%`}
                  </p>
                  <div className="w-full flex justify-between items-center text-[9px] text-muted-foreground tabular-nums">
                    <span>
                      {openAvgKimp !== null && usdtPrices ? (() => {
                        const mid = (usdtPrices.bestAsk + usdtPrices.bestBid) / 2;
                        const v = mid * (openAvgKimp / 100);
                        return `${v >= 0 ? "+" : ""}${v.toFixed(1)}원`;
                      })() : "-"}
                    </span>
                    <span>{openCountPerDay.toFixed(1)}계약/일</span>
                  </div>
                </div>
                <div className="bg-background/40 dark:bg-black/20 rounded-xl p-2 border border-white/5 flex flex-col items-center justify-between">
                  <p className="text-[11px] text-muted-foreground mb-1">청산평균</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight mb-2"
                    style={{ color: closedAvgKimp === null ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))" }}>
                    {closedAvgKimp === null ? "-"
                      : `${closedAvgKimp >= 0 ? "+" : ""}${closedAvgKimp.toFixed(2)}%`}
                  </p>
                  <div className="w-full flex justify-between items-center text-[9px] text-muted-foreground tabular-nums">
                    <span>
                      {closedAvgKimp !== null && usdtPrices ? (() => {
                        const mid = (usdtPrices.bestAsk + usdtPrices.bestBid) / 2;
                        const v = mid * (closedAvgKimp / 100);
                        return `${v >= 0 ? "+" : ""}${v.toFixed(1)}원`;
                      })() : "-"}
                    </span>
                    <span>{closedCountPerDay.toFixed(1)}계약/일</span>
                  </div>
                </div>
                <div className="bg-background/40 dark:bg-black/20 rounded-xl p-2 border border-white/5 flex flex-col items-center justify-between">
                  <p className="text-[11px] text-muted-foreground mb-1">순포지션</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight mb-2"
                    style={{ color: netPosition === 0 ? "hsl(var(--foreground))" : "#c084fc" }}>
                    {netPosition > 0 ? "+" : ""}{netPosition.toLocaleString()}
                  </p>
                  <div className="w-full flex justify-between items-center text-[9px] text-muted-foreground tabular-nums">
                    <span>
                      {usdtPrices ? `≈ ${formatKrwShort(Math.round(netPosition * (usdtPrices.bestAsk + usdtPrices.bestBid) / 2))}` : "-"}
                    </span>
                    <span>USDT</span>
                  </div>
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
                    isEditMode={isEditMode}
                    onLongPress={() => setIsEditMode(true)}
                    onEdit={() => { setIsEditMode(false); openSheet(trade); }}
                    onDelete={() => { setIsEditMode(false); handleDelete(trade.id); }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 플로팅 버튼 */}
      <div
        className="fixed left-0 right-0 w-full max-w-md mx-auto pointer-events-none flex"
        style={{
          bottom: "calc(var(--bottomnav-h, 60px) + env(safe-area-inset-bottom) + 16px)",
          paddingLeft: 16, paddingRight: 16,
          zIndex: 50,
          justifyContent: isEditMode ? "center" : "flex-end"
        }}
      >
        {isEditMode ? (
          <button
            onClick={() => setIsEditMode(false)}
            className="pointer-events-auto bg-card border border-border text-foreground px-6 py-2.5 rounded-full shadow-xl font-medium active:opacity-80 transition-opacity text-sm"
          >
            수정 모드 취소
          </button>
        ) : (
          <button
            onClick={() => openSheet()}
            className="pointer-events-auto bg-foreground/40 backdrop-blur-md border border-background/20 text-background active:opacity-80 transition-opacity flex items-center justify-center shadow-xl"
            style={{ width: 44, height: 44, borderRadius: 12, fontSize: 24, fontWeight: 300, lineHeight: 1 }}
          >
            +
          </button>
        )}
      </div>

      {sheetOpen && <div className="fixed inset-0 z-[60] bg-black/50" onClick={closeSheet} />}

      <div
        className={`fixed inset-x-0 bottom-0 z-[70] w-full max-w-md mx-auto bg-card rounded-t-2xl border-t border-x border-border transition-transform duration-300 ease-in-out ${
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

// ─── 이력 행 ────────────────────────────────────────────────────
function TradeRow({ trade, isEditMode, onLongPress, onEdit, onDelete }: {
  trade: KimpTrade; isEditMode: boolean; onLongPress: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const isOpen = trade.status === "open";
  const kimp   = calcKimp(trade.sell_price_krw, Number(trade.buy_price_usdt));
  const diff   = trade.sell_price_krw - Number(trade.buy_price_usdt);
  const sign   = kimp >= 0 ? "+" : "";

  let timer: ReturnType<typeof setTimeout>;
  const handleStart = () => { timer = setTimeout(onLongPress, 800); };
  const handleEnd = () => { clearTimeout(timer); };

  return (
    <div 
      className="relative flex items-center bg-muted/20 hover:bg-muted/40 transition-colors border border-border/30 rounded-lg overflow-hidden h-10 select-none"
      onTouchStart={handleStart} onTouchEnd={handleEnd} onTouchMove={handleEnd}
      onMouseDown={handleStart} onMouseUp={handleEnd} onMouseLeave={handleEnd}
    >
      <div className={`absolute inset-y-0 left-0 right-0 flex items-center gap-1.5 px-2 transition-transform duration-300 ease-in-out ${isEditMode ? "-translate-x-16" : "translate-x-0"}`}>
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
          <span className="text-foreground font-medium">{fmtStable(Number(trade.sell_price_krw))}</span>
          <span className="text-border">|</span>
          <span className="text-muted-foreground">{Number(trade.buy_price_usdt).toFixed(1)}</span>
          <span className="text-border">|</span>
          <span className="font-medium text-foreground">
            {sign}{kimp.toFixed(2)}%
          </span>
          <span className="text-muted-foreground">
            {" "}({diff >= 0 ? "+" : ""}{diff.toFixed(1)}원)
          </span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums shrink-0 text-foreground">
          {Number(trade.amount).toLocaleString()}
        </span>
      </div>

      <div className={`absolute right-0 inset-y-0 flex items-center pr-2 bg-muted/40 backdrop-blur-sm transition-transform duration-300 ease-in-out ${isEditMode ? "translate-x-0" : "translate-x-full"}`}>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Pencil size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
          <Trash2 size={14} />
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

  const stable    = toNum(form.stable_price);
  const dollar    = toNum(form.dollar_price);
  const feeStable = parseFloat(form.fee_stable) || 0;
  const feeDollar = parseFloat(form.fee_dollar) || 0;

  const { stableAdj, dollarAdj } = applyFee(stable, dollar, feeStable, feeDollar, form.trade_type);
  const kimpVal     = calcKimp(stableAdj, dollarAdj);
  const kimpDisplay = fmtKimpDisplay(stableAdj, dollarAdj);

  function handleFuturesTypeChange(ft: "domestic" | "overseas") {
    patch({
      futures_type: ft,
      amount:       "",
      contracts:    "",
      fee_dollar:   ft === "domestic" ? "0.003" : "0.01",
    });
  }

  function calcOverseasAmount(contracts: number, rate: number): string {
    return contracts > 0 && rate > 0
      ? String(Math.round(contracts * KRW_PER_OVERSEAS_CONTRACT / rate))
      : "";
  }

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
      patch({ contracts: v, amount: calcOverseasAmount(n, rate) });
    } else {
      const a = n > 0 ? String(n * USDT_PER_DOMESTIC_CONTRACT) : "";
      patch({ contracts: v, amount: a });
    }
  }

  function handleDollarPriceChange(v: string) {
    if (form.futures_type === "overseas") {
      const rate = toNum(v);
      const contracts = toNum(form.contracts);
      patch({ dollar_price: v, amount: calcOverseasAmount(contracts, rate) });
    } else {
      patch({ dollar_price: v });
    }
  }

  const contractLabel = form.futures_type === "domestic" ? "계약(1만$)" : "계약(2500만원)";

  return (
    <div className="flex flex-col">
      {/* 드래그 핸들 */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border">
        <h2 className="text-base font-bold text-foreground">
          {editingId ? "매매 수정" : "매매 기록"}
        </h2>
        <button onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="px-4 pt-2 pb-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "68vh" }}>

        {/* 1. 진입 / 청산 */}
        <div className="flex gap-2">
          {(["open", "closed"] as const).map(t => (
            <button key={t} onClick={() => patch({ trade_type: t })}
              className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                form.trade_type === t
                  ? t === "open" ? "bg-red-500 text-white" : "bg-blue-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}>
              {t === "open" ? "진입 (매수)" : "청산 (매도)"}
            </button>
          ))}
        </div>

        {/* 2. 국선/해선 pill + 날짜 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* pill switch — 어두운 배경, 선택쪽 약간 밝은 배경 */}
          <div
            style={{
              position: "relative",
              width: 80,
              height: 28,
              flexShrink: 0,
              borderRadius: 20,
              padding: 2,
              boxSizing: "border-box",
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                bottom: 2,
                left: form.futures_type === "domestic" ? 2 : "calc(50% + 1px)",
                width: "calc(50% - 3px)",
                transition: "left 0.2s ease",
                borderRadius: 16,
                background: "hsl(var(--muted))",
              }}
            />
            {(["domestic", "overseas"] as const).map(ft => (
              <button
                key={ft}
                onClick={() => handleFuturesTypeChange(ft)}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: ft === "domestic" ? 0 : "50%",
                  width: "50%",
                  zIndex: 1,
                  fontSize: 11,
                  fontWeight: "bold",
                  borderRadius: 16,
                }}
                className={`transition-colors ${
                  form.futures_type === ft ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {ft === "domestic" ? "국선" : "해선"}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={form.traded_at}
            onChange={e => patch({ traded_at: e.target.value })}
            style={{ flex: 1, minWidth: 0, padding: "5px 10px" }}
            className="bg-muted rounded-xl text-sm text-foreground outline-none border border-transparent focus:border-ring"
          />
        </div>

        {/* 3. 구분선 */}
        <div className="border-t border-border" />

        {/* 4-7. 3컬럼 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: "6px 8px", alignItems: "center" }}>

          {/* 4. 컬럼 헤더 */}
          <div />
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>스테이블 코인</p>
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>원달러 환율</p>

          {/* 5. 가격(원) 행 */}
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>가격(원)</p>
          <GInput value={form.stable_price} onChange={v => patch({ stable_price: v })} inputMode="decimal" step="0.1" />
          <GInput value={form.dollar_price} onChange={handleDollarPriceChange} inputMode="decimal" />

          {/* 6. 수수료율(%) 행 */}
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>수수료율(%)</p>
          <GInput value={form.fee_stable} onChange={v => patch({ fee_stable: v })} inputMode="decimal" />
          <GInput value={form.fee_dollar} onChange={v => patch({ fee_dollar: v })} inputMode="decimal" />

          {/* 7. 금액 행 */}
          <div>
            <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>수량(USDT)</p>
            <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>{contractLabel}</p>
          </div>
          <GInput value={form.amount} onChange={handleAmountChange} inputMode="numeric" />
          <GInput value={form.contracts} onChange={handleContractsChange} inputMode="numeric" />
        </div>

        {/* 김프 실시간 (보정 후) — 값이 있을 때만 */}
        {stable > 0 && dollar > 0 && (
          <div className="bg-muted rounded-xl px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">김프 (수수료 보정)</span>
            <span className={`text-sm font-bold tabular-nums ${
              kimpVal > 0 ? "text-red-500" : kimpVal < 0 ? "text-blue-500" : "text-foreground"
            }`}>
              {kimpDisplay}
            </span>
          </div>
        )}

        {/* 8. 구분선 */}
        <div className="border-t border-border" />

        {/* 9. 취소 / 등록 완료 */}
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-foreground active:opacity-70">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-50 active:opacity-70">
            {saving ? "저장 중..." : editingId ? "수정 완료" : "등록 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GInput({ value, onChange, inputMode, step }: {
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  step?: string;
}) {
  return (
    <input
      inputMode={inputMode}
      step={step}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ padding: "5px 8px" }}
      className="w-full bg-muted rounded-lg text-sm text-foreground placeholder:text-muted-foreground outline-none border border-transparent focus:border-ring tabular-nums"
    />
  );
}
