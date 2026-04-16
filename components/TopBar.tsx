"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

const DUMMY = {
  kimp: "3.2%",
  usdt: "1,482",
  usd: "1,480",
  usdcUsdt: "0.9998",
};

export default function TopBar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border flex items-center px-3 max-w-[390px] mx-auto w-full"
      style={{ height: "var(--topbar-h, 48px)" }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Chip label="KIMP" value={DUMMY.kimp} valueColor="text-emerald-500" />
        <Sep />
        <Chip label="USDT" value={DUMMY.usdt} />
        <Sep />
        <Chip label="USD" value={DUMMY.usd} />
        <Sep />
        <Chip label="USDC" value={DUMMY.usdcUsdt} />
      </div>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="ml-2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        aria-label="다크모드 토글"
      >
        {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}

function Sep() {
  return (
    <span className="text-[10px] text-border select-none shrink-0">|</span>
  );
}

function Chip({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-baseline gap-0.5 shrink-0">
      <span className="text-[10px] text-muted-foreground font-medium leading-none">
        {label}
      </span>
      <span
        className={`text-[11px] font-bold leading-none tabular-nums ${
          valueColor ?? "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
