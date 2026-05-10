"use client";

import { useState } from "react";
import axios from "axios";
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area 
} from "recharts";
import { 
  Upload, Play, AlertCircle, 
  TrendingUp, Activity, Hash, DollarSign 
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

  const runBacktest = async () => {
    if (!file) {
      setError("CSV 파일을 먼저 업로드해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
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

  return (
    <div className="flex flex-col gap-4 p-4 pb-20 max-w-md mx-auto min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Activity className="text-blue-500" />
          김프 백테스팅
        </h1>
      </div>

      {/* Settings Card */}
      <div className="rounded-2xl p-5 shadow-lg backdrop-blur-md border border-white/10 bg-card/40 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Upload size={14} /> CSV 데이터 파일
          </label>
          <div className="relative group">
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`p-3 border-2 border-dashed rounded-xl flex items-center justify-center transition-all ${file ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-white/5 group-hover:border-white/20'}`}>
              <span className="text-sm truncate text-muted-foreground">
                {file ? file.name : "클릭하여 CSV 파일 업로드"}
              </span>
            </div>
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
              <DollarSign size={12} /> 총 투자금액 (원)
            </label>
            <input 
              type="number"
              value={totalInvestment}
              onChange={(e) => setTotalInvestment(Number(e.target.value))}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold tabular-nums outline-none focus:border-blue-500/50 transition-colors"
              placeholder="투자금액 입력"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <SliderItem label="STEP (진입 간격)" value={step} onChange={setStep} min={0.5} max={15} step={0.5} unit="원" />
            <SliderItem label="SPLIT (분할 수)" value={split} onChange={setSplit} min={1} max={20} step={1} unit="분할" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SliderItem label="TARGET (익절)" value={target} onChange={setTarget} min={0.5} max={20} step={0.5} unit="원" />
            <SliderItem label="SLIPPAGE (보정)" value={slippage} onChange={setSlippage} min={0.0} max={0.5} step={0.01} unit="원" />
          </div>
        </div>

        <button 
          onClick={runBacktest}
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Play size={18} fill="currentColor" />
              백테스팅 시작
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Results Dashboard */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="총 수익" value={formatKrw(result.summary.total_profit)} color="text-emerald-500" icon={<TrendingUp size={14}/>} />
            <StatCard label="수익률" value={`${result.summary.roi}%`} color="text-emerald-500" icon={<DollarSign size={14}/>} />
            <StatCard label="거래수" value={`${result.summary.trade_count}회`} color="text-blue-500" icon={<Hash size={14}/>} />
          </div>

          {/* Chart */}
          <div className="rounded-2xl p-4 shadow-lg backdrop-blur-md border border-white/10 bg-card/40 h-[300px]">
            <h3 className="text-xs font-bold text-muted-foreground mb-4">자산 성장 곡선</h3>
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={result.equity_curve}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis 
                  dataKey="time" 
                  hide={true}
                />
                <YAxis 
                  domain={['auto', 'auto']}
                  fontSize={10}
                  tick={{fill: '#888888'}}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v) => `${(v/1000000).toFixed(0)}M`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#888' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => formatKrw(Number(v))}
                />
                <Area type="monotone" dataKey="balance" stroke="#3b82f6" fillOpacity={1} fill="url(#colorBalance)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Trades Table */}
          <div className="rounded-2xl overflow-hidden shadow-lg backdrop-blur-md border border-white/10 bg-card/40">
            <div className="p-3 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-xs font-bold text-muted-foreground">최근 매매 내역 (최대 200건)</h3>
              <span className="text-[10px] text-muted-foreground">완료 {result.summary.completed_trades} / 진행 {result.summary.active_trades_count}</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-white/5 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="p-2 font-medium">시간</th>
                    <th className="p-2 font-medium">진입김프</th>
                    <th className="p-2 font-medium">청산김프</th>
                    <th className="p-2 font-medium">수익</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.trades.map((t, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="p-2 text-muted-foreground leading-tight">
                        <div className="text-[10px]">{t.entry_time.split(' ')[0]}</div>
                        <div>{t.entry_time.split(' ')[1]}</div>
                      </td>
                      <td className="p-2 tabular-nums">{t.buy_price_kimp.toFixed(1)}</td>
                      <td className="p-2 tabular-nums">{t.sell_price_kimp.toFixed(1)}</td>
                      <td className={`p-2 tabular-nums font-bold ${t.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
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

function SliderItem({ label, value, onChange, min, max, step, unit = "", format }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center px-0.5">
        <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
        <span className="text-[11px] font-bold text-foreground">
          {format ? format(value) : `${value.toLocaleString()}${unit}`}
        </span>
      </div>
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
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
    <div className="rounded-xl p-3 shadow-md border border-white/5 bg-white/5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xs font-bold tabular-nums truncate ${color}`}>
        {value}
      </div>
    </div>
  );
}
