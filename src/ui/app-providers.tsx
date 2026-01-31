"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import { CssBaseline, ThemeProvider } from "@mui/material";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { createAppTheme, type ThemeMode } from "@/theme";
import { ThemeModeProvider } from "@/ui/theme-mode";
import { installGlobalClientLogging, setClientLoggingEnabled } from "@/shared/client-logging";
import { NotificationsProvider } from "@/ui/notifications";
import { I18nProvider } from "@/ui/i18n";
import type { UiLanguage } from "@/shared/i18n";

export default function AppProviders({
  mode: initialMode,
  lang,
  loggingEnabled,
  children,
}: Readonly<{
  mode: ThemeMode;
  lang: UiLanguage;
  loggingEnabled: boolean;
  children: ReactNode;
}>) {
  useEffect(() => {
    installGlobalClientLogging();
    setClientLoggingEnabled(loggingEnabled);
  }, [loggingEnabled]);

  const [mode, setMode] = useState<ThemeMode>(initialMode);
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <I18nProvider lang={lang}>
        <ThemeModeProvider value={{ mode, setMode }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <NotificationsProvider>{children}</NotificationsProvider>
          </ThemeProvider>
        </ThemeModeProvider>
      </I18nProvider>
    </AppRouterCacheProvider>
  );
}
