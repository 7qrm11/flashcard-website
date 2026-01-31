"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { t as translate, type UiLanguage } from "@/shared/i18n";

type I18nContextValue = {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  lang: initialLang,
  children,
}: Readonly<{ lang: UiLanguage; children: ReactNode }>) {
  const [lang, setLang] = useState<UiLanguage>(initialLang);

  useEffect(() => {
    setLang(initialLang);
  }, [initialLang]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

