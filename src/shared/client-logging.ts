"use client";

import type { LogLevel } from "@/shared/logging";
import { nowIso, toJsonSafe, truncateString } from "@/shared/logging";

type ClientLogEntry = {
  ts: string;
  source: "client";
  level: LogLevel;
  message: string;
  data?: unknown;
  meta?: {
    href: string;
    pathname: string;
    userAgent: string;
    sessionId: string | null;
  };
};

type OriginalConsole = {
  log: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
};

declare global {
  interface Window {
    __appClientLoggingInstalled?: boolean;
    __appClientLoggingOriginalConsole?: OriginalConsole;
  }
}

const QUEUE_LIMIT = 500;
const FLUSH_BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 800;

let flushTimer: number | null = null;
let flushing = false;
const queue: ClientLogEntry[] = [];
let clientLoggingEnabled = true;

export function setClientLoggingEnabled(enabled: boolean) {
  clientLoggingEnabled = enabled;
  if (!clientLoggingEnabled) {
    queue.splice(0, queue.length);
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  } else {
    scheduleFlush();
  }
}

function getSessionId(): string | null {
  try {
    const key = "app_log_session_id";
    const existing = window.sessionStorage.getItem(key);
    if (existing && existing.trim().length > 0) {
      return existing;
    }
    const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return null;
  }
}

function meta() {
  const href = typeof location?.href === "string" ? location.href : "";
  const pathname = typeof location?.pathname === "string" ? location.pathname : "";
  const userAgent = typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
  return {
    href: truncateString(href, 2000),
    pathname: truncateString(pathname, 500),
    userAgent: truncateString(userAgent, 500),
    sessionId: getSessionId(),
  };
}

function formatMessage(args: unknown[]) {
  if (args.length === 0) {
    return "";
  }
  const first = args[0];
  if (typeof first === "string") {
    return truncateString(first, 4000);
  }
  if (first instanceof Error) {
    const name = first.name ? `${first.name}: ` : "";
    return truncateString(`${name}${first.message}`, 4000);
  }
  try {
    return truncateString(JSON.stringify(toJsonSafe(first)), 4000);
  } catch {
    return truncateString(String(first), 4000);
  }
}

function enqueue(entry: ClientLogEntry) {
  if (!clientLoggingEnabled) {
    return;
  }
  queue.push(entry);
  if (queue.length > QUEUE_LIMIT) {
    queue.splice(0, queue.length - QUEUE_LIMIT);
  }
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer !== null) {
    return;
  }
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function send(entries: ClientLogEntry[]) {
  try {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
      cache: "no-store",
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function flush() {
  if (!clientLoggingEnabled) {
    queue.splice(0, queue.length);
    return;
  }
  if (flushing) {
    return;
  }
  flushing = true;
  try {
    while (queue.length > 0) {
      const entries = queue.splice(0, FLUSH_BATCH_SIZE);
      const ok = await send(entries);
      if (!ok) {
        queue.unshift(...entries);
        if (queue.length > QUEUE_LIMIT) {
          queue.splice(0, queue.length - QUEUE_LIMIT);
        }
        break;
      }
    }
  } finally {
    flushing = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

function enqueueConsole(level: LogLevel, args: unknown[]) {
  enqueue({
    ts: nowIso(),
    source: "client",
    level,
    message: formatMessage(args),
    data: args.length > 0 ? toJsonSafe(args) : undefined,
    meta: meta(),
  });
}

export function installGlobalClientLogging() {
  if (typeof window === "undefined") {
    return;
  }
  if (window.__appClientLoggingInstalled) {
    return;
  }
  window.__appClientLoggingInstalled = true;

  const original: OriginalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };
  window.__appClientLoggingOriginalConsole = original;

  console.log = (...args: any[]) => {
    enqueueConsole("info", args);
    original.log(...args);
  };
  console.info = (...args: any[]) => {
    enqueueConsole("info", args);
    original.info(...args);
  };
  console.warn = (...args: any[]) => {
    enqueueConsole("warn", args);
    original.warn(...args);
  };
  console.error = (...args: any[]) => {
    enqueueConsole("error", args);
    original.error(...args);
  };
  console.debug = (...args: any[]) => {
    enqueueConsole("debug", args);
    original.debug(...args);
  };

  window.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error as any;
    const msg = typeof event.message === "string" ? event.message : "";
    const errMsg = typeof err?.message === "string" ? err.message : "";
    if (
      msg.includes("NEXT_REDIRECT") ||
      errMsg === "NEXT_REDIRECT" ||
      msg.includes("NEXT_NOT_FOUND") ||
      errMsg === "NEXT_NOT_FOUND"
    ) {
      return;
    }
    enqueue({
      ts: nowIso(),
      source: "client",
      level: "error",
      message: truncateString(event.message || "window error", 4000),
      data: toJsonSafe({
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      }),
      meta: meta(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason as any;
    const reasonMsg = typeof reason?.message === "string" ? reason.message : "";
    if (reasonMsg === "NEXT_REDIRECT" || reasonMsg === "NEXT_NOT_FOUND") {
      return;
    }
    enqueue({
      ts: nowIso(),
      source: "client",
      level: "error",
      message: "unhandled promise rejection",
      data: toJsonSafe({ reason: (event as PromiseRejectionEvent).reason }),
      meta: meta(),
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flush();
    }
  });
  window.addEventListener("beforeunload", () => {
    void flush();
  });
}
