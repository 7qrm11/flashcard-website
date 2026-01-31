"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { Box, IconButton, Paper, Typography } from "@mui/material";

import { IconClose } from "@/ui/icons";
import { useI18n } from "@/ui/i18n";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

type Notification = {
  id: string;
  severity: NotificationSeverity;
  message: string;
  createdAtMs: number;
  autoHideMs: number | null;
  onDismiss: (() => void) | null;
};

type NotifyInput = {
  id?: string;
  severity?: NotificationSeverity;
  message: string;
  autoHideMs?: number | null;
  onDismiss?: (() => void) | null;
};

type NotificationsContextValue = {
  notify: (input: NotifyInput) => string;
  dismiss: (id: string) => void;
  notifyError: (message: string) => string;
  notifySuccess: (message: string) => string;
  notifyInfo: (message: string) => string;
  notifyWarning: (message: string) => string;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function defaultAutoHide(severity: NotificationSeverity) {
  if (severity === "error") {
    return null;
  }
  if (severity === "warning") {
    return 10_000;
  }
  return 6_000;
}

function severityColor(severity: NotificationSeverity) {
  if (severity === "success") {
    return "success.main";
  }
  if (severity === "warning") {
    return "warning.main";
  }
  if (severity === "error") {
    return "error.main";
  }
  return "info.main";
}

export function NotificationsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => {
      const existing = prev.find((n) => n.id === id) ?? null;
      if (existing?.onDismiss) {
        try {
          existing.onDismiss();
        } catch {
          // ignore
        }
      }
      return prev.filter((n) => n.id !== id);
    });
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (input: NotifyInput) => {
      const severity = input.severity ?? "info";
      const id = input.id ?? makeId();
      const autoHideMs = input.autoHideMs === undefined ? defaultAutoHide(severity) : input.autoHideMs;

      const next: Notification = {
        id,
        severity,
        message: input.message,
        createdAtMs: Date.now(),
        autoHideMs,
        onDismiss: input.onDismiss ?? null,
      };

      setItems((prev) => [...prev.filter((n) => n.id !== id), next].slice(-5));

      if (autoHideMs !== null) {
        const existing = timers.current.get(id);
        if (existing) {
          window.clearTimeout(existing);
          timers.current.delete(id);
        }
        const timer = window.setTimeout(() => dismiss(id), autoHideMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, []);

  const value = useMemo<NotificationsContextValue>(() => {
    return {
      notify,
      dismiss,
      notifyError: (message) => notify({ severity: "error", message }),
      notifySuccess: (message) => notify({ severity: "success", message }),
      notifyInfo: (message) => notify({ severity: "info", message }),
      notifyWarning: (message) => notify({ severity: "warning", message }),
    };
  }, [dismiss, notify]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <Box
        sx={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: (theme) => theme.zIndex.snackbar,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          width: { xs: "calc(100vw - 32px)", sm: 380 },
          maxWidth: "calc(100vw - 32px)",
          pointerEvents: "none",
        }}
      >
        {items.map((n) => (
          <Paper
            elevation={4}
            key={n.id}
            sx={{
              position: "relative",
              p: 1.5,
              pr: 5.5,
              borderLeft: "4px solid",
              borderLeftColor: severityColor(n.severity),
              pointerEvents: "auto",
            }}
          >
            <IconButton
              aria-label={t("aria.close_notification")}
              onClick={() => dismiss(n.id)}
              size="small"
              sx={{ position: "absolute", top: 6, right: 6 }}
            >
              <IconClose fontSize="small" />
            </IconButton>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {t(n.message)}
            </Typography>
          </Paper>
        ))}
      </Box>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
