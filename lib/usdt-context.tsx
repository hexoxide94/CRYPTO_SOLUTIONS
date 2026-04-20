"use client";
import { createContext, useContext, useState } from "react";

interface UsdtPrices {
  bestAsk: number;
  bestBid: number;
}

interface UsdtContextType {
  usdt: UsdtPrices | null;
  setUsdt: (prices: UsdtPrices | null) => void;
}

const UsdtContext = createContext<UsdtContextType>({ usdt: null, setUsdt: () => {} });

export function UsdtProvider({ children }: { children: React.ReactNode }) {
  const [usdt, setUsdt] = useState<UsdtPrices | null>(null);
  return <UsdtContext.Provider value={{ usdt, setUsdt }}>{children}</UsdtContext.Provider>;
}

export function useUsdtPrices() {
  return useContext(UsdtContext);
}
