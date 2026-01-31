import "server-only";

import type { LogLevel } from "@/shared/logging";
import { nowIso, toJsonSafe } from "@/shared/logging";

function write(level: LogLevel, line: string) {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function serverLog(level: LogLevel, message: string, data?: unknown) {
  const payload = {
    ts: nowIso(),
    source: "server",
    level,
    message,
    data: data === undefined ? undefined : toJsonSafe(data),
  };
  write(level, JSON.stringify(payload));
}

