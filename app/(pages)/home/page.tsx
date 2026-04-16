"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// ─── 더미 데이터 ────────────────────────────────────────────
const dummyData = {
  totalAssets: 87500000,
  coinAssets: 52000000,
  otherAssets: 35500000,
  breakdown: [
    { name: "코인(해외)", value: 35000000, color: "#F59E0B" },
    { name: "코인(국내)", value: 17000000, color: "#3B82F6" },
    { name: "주식",       value: 20000000, color: "#10B981" },
    { name: "현금",       value: 15500000, color: "#8B5CF6" },
  ],
};
// ────────────────────────────────────────────────────────────

function formatKorean(value: number): string {
  const eok = Math.floor(value / 100_000_000);
  const man = Math.floor((value % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${man.toLocaleString()}만원`;
}

export default function HomePage() {
  const { totalAssets, coinAssets, otherAssets, breakdown } = dummyData;
  const total = breakdown.reduce((s, d) => s + d.value, 0);

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
      {/* ── 총 자산 카드 ── */}
      <Card>
        <p className="text-xs text-muted-foreground font-medium mb-1">총 자산</p>
        <p className="text-3xl font-bold tracking-tight text-foreground">
          {formatKorean(totalAssets)}
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          <Row label="코인 투자금" value={formatKorean(coinAssets)} dot="#F59E0B" />
          <Row label="그 외 자산"  value={formatKorean(otherAssets)} dot="#8B5CF6" />
        </div>
      </Card>

      {/* ── 도넛 차트 카드 ── */}
      <Card>
        <p className="text-xs text-muted-foreground font-medium mb-2">자산 구성</p>

        <div className="relative" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                cx="50%"
                cy="50%"
                innerRadius={74}
                outerRadius={108}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {breakdown.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[11px] text-muted-foreground">총 자산</span>
            <span className="text-base font-bold text-foreground leading-tight">
              {formatKorean(totalAssets)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {breakdown.map((item) => {
            const pct = ((item.value / total) * 100).toFixed(1);
            return (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-foreground">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {formatKorean(item.value)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl p-3 shadow-sm border border-border">
      {children}
    </div>
  );
}

function Row({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
