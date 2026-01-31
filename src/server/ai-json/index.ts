import "server-only";

export function removeJsonTrailingCommas(input: string) {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? "";

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < input.length) {
        const next = input[j] ?? "";
        if (next === " " || next === "\n" || next === "\r" || next === "\t") {
          j += 1;
          continue;
        }
        if (next === "}" || next === "]") {
          break;
        }
        j = -1;
        break;
      }
      if (j >= 0) {
        continue;
      }
    }

    out += ch;
  }

  return out;
}

export function escapeJsonStringNewlines(input: string) {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? "";

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }

      out += ch;
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    out += ch;
    if (ch === "\"") {
      inString = true;
    }
  }

  return out;
}

export function extractJsonObjectAt(text: string, startIndex: number) {
  if (startIndex < 0 || startIndex >= text.length || text[startIndex] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i] ?? "";

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { json: text.slice(startIndex, i + 1), endIndex: i };
      }
    }
  }

  return null;
}

export function tryExtractJsonStringValue(text: string, key: string) {
  const needle = `"${key}"`;
  let idx = text.indexOf(needle);
  while (idx >= 0) {
    const colon = text.indexOf(":", idx + needle.length);
    if (colon < 0) {
      return null;
    }
    let i = colon + 1;
    while (i < text.length) {
      const ch = text[i] ?? "";
      if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
        i += 1;
        continue;
      }
      break;
    }
    if (text[i] !== "\"") {
      idx = text.indexOf(needle, idx + needle.length);
      continue;
    }

    let escaped = false;
    for (let j = i + 1; j < text.length; j += 1) {
      const ch = text[j] ?? "";
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        const raw = text.slice(i, j + 1);
        try {
          return JSON.parse(raw) as string;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  return null;
}

export function parseJsonLenient(text: string) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false as const };
  }
  const normalized = escapeJsonStringNewlines(trimmed);
  const repaired = removeJsonTrailingCommas(normalized);
  try {
    return { ok: true as const, value: JSON.parse(repaired) as unknown };
  } catch {
    return { ok: false as const };
  }
}
