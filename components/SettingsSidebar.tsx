"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, X, Percent, Coins, CalendarDays, ArrowRightLeft } from "lucide-react";
import { useSettings, KimpMode } from "@/lib/settings-context";
import { cn } from "@/lib/utils";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsSidebar({ isOpen, onClose }: SettingsSidebarProps) {
  const { theme, setTheme } = useTheme();
  const { kimpMode, setKimpMode, usdSymbol, setUsdSymbol, futuresInfo } = useSettings();

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 z-[101] w-[280px] bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-out flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-[56px] px-4 flex items-center justify-between border-b border-border">
          <span className="font-bold text-lg">설정</span>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          
          {/* Theme Setting */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">테마 설정</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                  theme === "light" 
                    ? "bg-primary/10 border-primary text-primary font-medium" 
                    : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                <Sun size={18} />
                <span>라이트</span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                  theme === "dark" 
                    ? "bg-primary/10 border-primary text-primary font-medium" 
                    : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                <Moon size={18} />
                <span>다크</span>
              </button>
            </div>
          </section>

          {/* Kimp Display Mode */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">김프 표시 모드</h3>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {kimpMode === "auto" ? "자동 전환" : kimpMode === "percent" ? "% 고정" : "원 고정"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "auto", label: "자동", icon: ArrowRightLeft },
                { id: "percent", label: "%", icon: Percent },
                { id: "krw", label: "원", icon: Coins },
              ].map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setKimpMode(mode.id as KimpMode)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all",
                      kimpMode === mode.id 
                        ? "bg-primary/10 border-primary text-primary font-medium" 
                        : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon size={18} />
                    <span className="text-xs">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* USD Futures Symbol */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">달러 선물 월물 선택</h3>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {futuresInfo && usdSymbol === futuresInfo.nextSymbol ? "차월물" : "당월물"}
              </span>
            </div>
            {futuresInfo ? (
              <div className="space-y-2">
                <button
                  onClick={() => setUsdSymbol(futuresInfo.currentSymbol)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                    usdSymbol === futuresInfo.currentSymbol 
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-medium" 
                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <CalendarDays size={18} />
                    <div className="text-left">
                      <p className="text-sm font-semibold">{futuresInfo.currentSymbol}</p>
                      <p className="text-[10px] opacity-70">{futuresInfo.currentLabel} (당월물)</p>
                    </div>
                  </div>
                  {usdSymbol === futuresInfo.currentSymbol && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                </button>

                <button
                  onClick={() => setUsdSymbol(futuresInfo.nextSymbol)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                    usdSymbol === futuresInfo.nextSymbol 
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-medium" 
                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <CalendarDays size={18} />
                    <div className="text-left">
                      <p className="text-sm font-semibold">{futuresInfo.nextSymbol}</p>
                      <p className="text-[10px] opacity-70">{futuresInfo.nextLabel} (차월물)</p>
                    </div>
                  </div>
                  {usdSymbol === futuresInfo.nextSymbol && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground py-4">계산 중...</div>
            )}
            <p className="text-[10px] text-muted-foreground px-1 leading-relaxed">
              * 만기일(매월 세 번째 월요일 11:30 AM KST)이 지나면 자동으로 다음 월물로 롤오버됩니다.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20">
          <p className="text-[10px] text-center text-muted-foreground">
            CRYPTO SOLUTIONS v1.2.0
          </p>
        </div>
      </aside>
    </>
  );
}
