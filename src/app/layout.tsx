import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import AppProviders from "@/ui/app-providers";
import { getCurrentUser } from "@/server/auth";
import type { ThemeMode } from "@/theme";
import { normalizeUiLanguage, UI_LANGUAGE_COOKIE } from "@/shared/i18n";

import "./globals.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const THEME_MODE_COOKIE = "theme_mode";

export const metadata: Metadata = {
  title: "website",
  description: "nextjs + postgres",
};

function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === "dark") {
    return "dark";
  }
  return "light";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getCurrentUser();
  const mode: ThemeMode = user?.themeMode ?? normalizeThemeMode(cookies().get(THEME_MODE_COOKIE)?.value);
  const loggingEnabled = user?.loggingEnabled ?? false;
  const lang = user?.uiLanguage ?? normalizeUiLanguage(cookies().get(UI_LANGUAGE_COOKIE)?.value);

  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css"
          crossOrigin="anonymous"
        />
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"
          crossOrigin="anonymous"
        />
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <AppProviders lang={lang} mode={mode} loggingEnabled={loggingEnabled}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
