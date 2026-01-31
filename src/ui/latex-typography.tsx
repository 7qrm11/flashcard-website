"use client";

import type { TypographyProps } from "@mui/material";
import { Typography } from "@mui/material";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    renderMathInElement?: (element: HTMLElement, options?: any) => void;
  }
}

type LatexTypographyProps = Omit<TypographyProps, "children"> & {
  text: string;
};

const KATEX_OPTIONS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "\\(", right: "\\)", display: false },
    { left: "$", right: "$", display: false },
  ],
  throwOnError: false,
  strict: "ignore",
};

export default function LatexTypography({ text, sx, ...props }: LatexTypographyProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    el.textContent = text;

    const render = window.renderMathInElement;
    if (typeof render === "function") {
      try {
        render(el, KATEX_OPTIONS);
      } catch {
        // ignore
      }
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const renderNow = window.renderMathInElement;
      if (typeof renderNow === "function") {
        window.clearInterval(timer);
        try {
          renderNow(el, KATEX_OPTIONS);
        } catch {
          // ignore
        }
        return;
      }
      if (attempts >= 25) {
        window.clearInterval(timer);
      }
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, [text]);

  return (
    <Typography
      {...props}
      ref={ref as any}
      sx={[
        { whiteSpace: "pre-wrap", wordBreak: "break-word" },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
