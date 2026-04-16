"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CandlestickChart, Bitcoin, PenLine, BarChart2 } from "lucide-react";

const TABS = [
  { href: "/home", label: "홈", icon: Home },
  { href: "/kimp", label: "김프매매", icon: CandlestickChart },
  { href: "/coin-info", label: "코인정보", icon: Bitcoin },
  { href: "/asset-record", label: "자산기록", icon: PenLine },
  { href: "/asset-chart", label: "자산그래프", icon: BarChart2 },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border max-w-[390px] mx-auto w-full"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex" style={{ height: "var(--bottomnav-h, 60px)" }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center justify-center h-full gap-1 transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={24} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[11px] font-medium leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
