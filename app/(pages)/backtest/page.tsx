"use client";

import { useState } from "react";
import axios from "axios";
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area 
} from "recharts";
import { 
  Upload, Play, AlertCircle, 
  TrendingUp, Hash, DollarSign, Download
} from "lucide-react";

// --- Types ---
interface BacktestSummary {
  total_profit: number;
  roi: number;
  trade_count: number;
  completed_trades: number;
  active_trades_count: number;
  final_balance: number;
}

interface BacktestResult {
  summary: BacktestSummary;
  equity_curve: { time: string; balance: number }[];
  trades: {
    entry_time: string;
    exit_time: string;
    buy_price_kimp: number;
    sell_price_kimp: number;
    profit: number;
    status: string;
  }[];
}

// --- Utility Functions ---
const formatKrw = (val: number) => {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(val);
};

export default function BacktestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"balance" | "roi">("balance");

  // --- Parameters ---
  const [totalInvestment, setTotalInvestment] = useState(150000000);
  const [step, setStep] = useState(1.0);
  const [split, setSplit] = useState(10);
  const [target, setTarget] = useState(2.0);
  const [slippage, setSlippage] = useState(0.2);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const formatWithCommas = (val: number) => {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const handleInvestmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, "");
    const num = Number(raw);
    if (!isNaN(num)) setTotalInvestment(num);
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    formData.append("total_investment", totalInvestment.toString());
    formData.append("step", step.toString());
    formData.append("split", split.toString());
    formData.append("target", target.toString());
    formData.append("slippage", slippage.toString());

    try {
      const res = await axios.post("/api/backtest", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setResult(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || "백테스팅 중 오류가 발생했습니다.");
      } else {
        setError("백테스팅 중 예상치 못한 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!result || !result.trades.length) return;
    
    const headers = ["진입시간", "청산시간", "진입김프", "청산김프", "수익(원)"];
    const rows = result.trades.map(t => [
      t.entry_time,
      t.exit_time,
      t.buy_price_kimp,
      t.sell_price_kimp,
      t.profit
    ]);
    
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `backtest_result_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getChartData = () => {
    if (!result) return [];
    if (chartMode === "balance") return result.equity_curve;
    return result.equity_curve.map(point => ({
      ...point,
      roi: ((point.balance - totalInvestment) / totalInvestment * 100)
    }));
  };

  return (
    <div className="flex flex-col gap-3 p-3 pb-20 max-w-md mx-auto min-h-full">
      {/* Settings Card */}
      <div className="rounded-xl p-4 shadow-lg backdrop-blur-md border border-white/10 bg-card/40 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
              <Upload size={10} /> 데이터 (CSV)
            </label>
            <div className="relative group h-[38px]">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`h-full px-3 border border-dashed rounded-lg flex items-center justify-center transition-all ${file ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-white/10 bg-white/5'}`}>
                <span className="text-[10px] truncate text-muted-foreground font-medium">
                  {file ? file.name : "history_01 (기본)"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
              <DollarSign size={10} /> 총 투자금액 (원)
            </label>
            <input 
              type="text"
              value={formatWithCommas(totalInvestment)}
              onChange={handleInvestmentChange}
              className="w-full h-[38px] px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-bold tabular-nums outline-none focus:border-indigo-500/50 transition-colors"
              placeholder="투자금액"
            />
          </div>
        </div>

        {/* Parameters */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <SliderItem label="STEP (진입 간격)" value={step} onChange={setStep} min={0.1} max={15} step={0.1} unit="원" accentColor="accent-indigo-500" />
            <SliderItem label="SPLIT (분할 수)" value={split} onChange={setSplit} min={1} max={20} step={1} unit="분할" accentColor="accent-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SliderItem label="TARGET (익절)" value={target} onChange={setTarget} min={0.1} max={20} step={0.1} unit="원" accentColor="accent-indigo-500" />
            <SliderItem label="SLIPPAGE (보정)" value={slippage} onChange={setSlippage} min={0.0} max={0.5} step={0.01} unit="원" accentColor="accent-indigo-500" />
          </div>
        </div>

        <button 
          onClick={runBacktest}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 mt-0.5"
        >
          {loading ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Play size={14} fill="currentColor" />
              백테스팅 시작
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] flex items-center gap-2">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* Results Dashboard */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="총 수익" value={formatKrw(result.summary.total_profit)} color="text-emerald-400" icon={<TrendingUp size={12}/>} />
            <StatCard label="수익률" value={`${result.summary.roi}%`} color="text-emerald-400" icon={<DollarSign size={12}/>} />
            <StatCard label="거래수" value={`${result.summary.trade_count}회`} color="text-orange-400" icon={<Hash size={12}/>} />
          </div>

          {/* Chart */}
          <div className="rounded-xl p-3 shadow-lg backdrop-blur-md border border-white/10 bg-card/40 h-[260px] relative">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">자산 곡선</h3>
              <div className="flex bg-white/5 rounded-md p-0.5 border border-white/5">
                <button 
                  onClick={() => setChartMode("balance")}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-sm transition-all ${chartMode === "balance" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
                >
                  원
                </button>
                <button 
                  onClick={() => setChartMode("roi")}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-sm transition-all ${chartMode === "roi" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
                >
                  %
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height="85%">
              <AreaChart data={getChartData()} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartMode === "balance" ? "#6366f1" : "#10b981"} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={chartMode === "balance" ? "#6366f1" : "#10b981"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="time" hide={true} />
                <YAxis 
                  domain={['auto', 'auto']}
                  fontSize={9}
                  tick={{fill: '#888888'}}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  tickFormatter={(v) => chartMode === "balance" ? `${(v/1000000).toFixed(0)}M` : `${v.toFixed(1)}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '10px', fontSize: '10px', padding: '8px' }}
                  itemStyle={{ color: '#fff', padding: '2px 0' }}
                  labelStyle={{ color: '#888', marginBottom: '4px' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => chartMode === "balance" ? formatKrw(Number(v)) : `${Number(v).toFixed(2)}%`}
                />
                <Area 
                  type="monotone" 
                  dataKey={chartMode === "balance" ? "balance" : "roi"} 
                  stroke={chartMode === "balance" ? "#6366f1" : "#10b981"} 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#colorBalance)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Trades Table */}
          <div className="rounded-xl overflow-hidden shadow-lg backdrop-blur-md border border-white/10 bg-card/40">
            <div className="p-2.5 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">최근 매매 내역</h3>
                <button 
                  onClick={downloadCsv}
                  className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-all"
                  title="CSV 다운로드"
                >
                  <Download size={12} />
                </button>
              </div>
              <span className="text-[9px] text-muted-foreground font-medium">완료 {result.summary.completed_trades} / 진행 {result.summary.active_trades_count}</span>
            </div>
            <div className="max-h-[250px] overflow-y-auto no-scrollbar">
              <table className="w-full text-[10px] text-left">
                <thead className="bg-white/5 text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="p-2 font-semibold">시간</th>
                    <th className="p-2 font-semibold">진입김프</th>
                    <th className="p-2 font-semibold">청산김프</th>
                    <th className="p-2 font-semibold text-right">수익</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.trades.map((t, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="p-2 text-muted-foreground leading-tight">
                        <div className="text-[9px]">{t.entry_time.split(' ')[0]}</div>
                        <div>{t.entry_time.split(' ')[1]}</div>
                      </td>
                      <td className="p-2 tabular-nums">{t.buy_price_kimp.toFixed(1)}</td>
                      <td className="p-2 tabular-nums">{t.sell_price_kimp.toFixed(1)}</td>
                      <td className={`p-2 tabular-nums font-bold text-right ${t.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.profit >= 0 ? '+' : ''}{t.profit.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {result.trades.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">기록된 매매가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SliderItem({ label, value, onChange, min, max, step, unit = "", format, accentColor = "accent-blue-500" }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  accentColor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center px-0.5">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">{label}</span>
        <span className="text-[10px] font-bold text-foreground">
          {format ? format(value) : `${value.toLocaleString()}${unit}`}
        </span>
      </div>
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer ${accentColor}`}
      />
    </div>
  );
}

function StatCard({ label, value, color, icon }: {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-3 shadow-md border border-white/5 bg-white/5 flex flex-col items-center gap-1.5 text-center">
      <div className="flex items-center gap-1.5 text-muted-foreground opacity-70">
        {icon}
        <span className="text-[8px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-[13px] font-extrabold tabular-nums truncate ${color}`}>
        {value}
      </div>
    </div>
  );
}
