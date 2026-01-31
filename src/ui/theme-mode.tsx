"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { ThemeMode } from "@/theme";

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({
  value,
  children,
}: Readonly<{
  value: ThemeModeContextValue;
  children: ReactNode;
}>) {
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used inside ThemeModeProvider");
  }
  return ctx;
}
