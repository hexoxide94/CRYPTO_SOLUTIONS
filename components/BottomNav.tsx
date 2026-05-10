"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CandlestickChart, Bitcoin, PenLine, BarChart2 } from "lucide-react";

const TABS = [
  { href: "/backtest", label: "백테스팅", icon: Activity },
  { href: "/kimp", label: "김프매매", icon: CandlestickChart },
  { href: "/coin-info", label: "코인정보", icon: Bitcoin },
  { href: "/asset-record", label: "자산기록", icon: PenLine },
  { href: "/asset-chart", label: "자산그래프", icon: BarChart2 },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-white/5 w-full max-w-md mx-auto w-full"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex" style={{ height: "var(--bottomnav-h, 60px)" }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center justify-center h-full gap-1 transition-all duration-300 ${
                  active
                    ? "text-foreground drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] scale-[1.03]"
                    : "text-muted-foreground hover:text-foreground/80"
                }`}
              >
                <Icon size={24} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium leading-none tracking-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
