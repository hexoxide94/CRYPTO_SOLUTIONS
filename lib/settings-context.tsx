"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type KimpMode = "auto" | "percent" | "krw";
export type UsdSymbol = "A75605" | "A75606";

interface SettingsContextType {
  kimpMode: KimpMode;
  setKimpMode: (mode: KimpMode) => void;
  usdSymbol: UsdSymbol;
  setUsdSymbol: (symbol: UsdSymbol) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [kimpMode, setKimpMode] = useState<KimpMode>("auto");
  const [usdSymbol, setUsdSymbol] = useState<UsdSymbol>("A75605");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedKimpMode = localStorage.getItem("kimpMode") as KimpMode;
    const savedUsdSymbol = localStorage.getItem("usdSymbol") as UsdSymbol;
    if (savedKimpMode) setKimpMode(savedKimpMode);
    if (savedUsdSymbol) setUsdSymbol(savedUsdSymbol);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("kimpMode", kimpMode);
    }
  }, [kimpMode, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("usdSymbol", usdSymbol);
    }
  }, [usdSymbol, mounted]);

  return (
    <SettingsContext.Provider value={{ kimpMode, setKimpMode, usdSymbol, setUsdSymbol }}>
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
