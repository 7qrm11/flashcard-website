export type LogLevel = "debug" | "info" | "warn" | "error";

export type JsonSafe =
  | null
  | boolean
  | number
  | string
  | JsonSafe[]
  | { [key: string]: JsonSafe };

export function nowIso() {
  return new Date().toISOString();
}

export function truncateString(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, Math.max(0, maxLength - 1)) + "…";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function toJsonSafe(
  value: unknown,
  opts?: Readonly<{
    maxDepth?: number;
    maxStringLength?: number;
    maxArrayLength?: number;
    maxObjectKeys?: number;
  }>,
): JsonSafe {
  const maxDepth = Math.max(0, opts?.maxDepth ?? 4);
  const maxStringLength = Math.max(0, opts?.maxStringLength ?? 4000);
  const maxArrayLength = Math.max(0, opts?.maxArrayLength ?? 50);
  const maxObjectKeys = Math.max(0, opts?.maxObjectKeys ?? 50);

  const seen = new WeakSet<object>();

  const visit = (input: unknown, depthLeft: number): JsonSafe => {
    if (input === null) {
      return null;
    }
    if (input === undefined) {
      return "[undefined]";
    }

    if (typeof input === "string") {
      return truncateString(input, maxStringLength);
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        return String(input);
      }
      return input;
    }
    if (typeof input === "boolean") {
      return input;
    }
    if (typeof input === "bigint") {
      return `${input}n`;
    }
    if (typeof input === "symbol") {
      return String(input);
    }
    if (typeof input === "function") {
      const name = (input as Function).name;
      return name ? `[function ${name}]` : "[function]";
    }

    if (input instanceof Error) {
      return {
        name: truncateString(input.name, 200),
        message: truncateString(input.message, maxStringLength),
        stack: truncateString(String(input.stack ?? ""), maxStringLength),
      };
    }

    if (input instanceof Date) {
      const time = input.getTime();
      if (Number.isFinite(time)) {
        return input.toISOString();
      }
      return String(input);
    }

    if (Array.isArray(input)) {
      if (depthLeft <= 0) {
        return `[array(${input.length})]`;
      }
      const out: JsonSafe[] = [];
      const take = Math.min(input.length, maxArrayLength);
      for (let i = 0; i < take; i += 1) {
        out.push(visit(input[i], depthLeft - 1));
      }
      if (take < input.length) {
        out.push(`…(${input.length - take} more)`);
      }
      return out;
    }

    if (!isPlainObject(input)) {
      const name =
        (input as any)?.constructor && typeof (input as any).constructor?.name === "string"
          ? (input as any).constructor.name
          : "object";
      return `[${name}]`;
    }

    if (seen.has(input)) {
      return "[circular]";
    }
    seen.add(input);

    if (depthLeft <= 0) {
      const name =
        (input as any)?.constructor && typeof (input as any).constructor?.name === "string"
          ? (input as any).constructor.name
          : "object";
      return `[${name}]`;
    }

    let keys: string[] = [];
    try {
      keys = Object.keys(input);
    } catch {
      return "[unserializable]";
    }

    const out: Record<string, JsonSafe> = {};
    const take = Math.min(keys.length, maxObjectKeys);
    for (let i = 0; i < take; i += 1) {
      const key = keys[i] as string | undefined;
      if (!key) {
        continue;
      }
      try {
        out[key] = visit((input as any)[key], depthLeft - 1);
      } catch {
        out[key] = "[unserializable]";
      }
    }

    if (take < keys.length) {
      out._moreKeys = `…(${keys.length - take} more)`;
    }

    return out;
  };

  return visit(value, maxDepth);
}
