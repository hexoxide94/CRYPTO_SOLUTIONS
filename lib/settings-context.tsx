"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getFuturesMonths, FuturesMonthInfo } from "./futures";

export type KimpMode = "auto" | "percent" | "krw";

interface SettingsContextType {
  kimpMode: KimpMode;
  setKimpMode: (mode: KimpMode) => void;
  usdSymbol: string;
  setUsdSymbol: (symbol: string) => void;
  futuresInfo: FuturesMonthInfo | null;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [kimpMode, setKimpMode] = useState<KimpMode>("auto");
  const [usdSymbol, setUsdSymbol] = useState<string>("");
  const [futuresInfo, setFuturesInfo] = useState<FuturesMonthInfo | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedKimpMode = localStorage.getItem("kimpMode") as KimpMode;
    const info = getFuturesMonths();
    setFuturesInfo(info);
    
    let savedUsdSymbol = localStorage.getItem("usdSymbol");
    // If the saved symbol is not the current or next active month (e.g. expired A75605), reset it (automatic rollover)
    if (!savedUsdSymbol || (savedUsdSymbol !== info.currentSymbol && savedUsdSymbol !== info.nextSymbol)) {
      savedUsdSymbol = info.currentSymbol;
    }
    
    if (savedKimpMode) setKimpMode(savedKimpMode);
    setUsdSymbol(savedUsdSymbol);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("kimpMode", kimpMode);
    }
  }, [kimpMode, mounted]);

  useEffect(() => {
    if (mounted && usdSymbol) {
      localStorage.setItem("usdSymbol", usdSymbol);
    }
  }, [usdSymbol, mounted]);

  return (
    <SettingsContext.Provider value={{ kimpMode, setKimpMode, usdSymbol, setUsdSymbol, futuresInfo }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
