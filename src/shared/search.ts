export function normalizeSearchParam(
  value: string | string[] | undefined,
  maxLen = 120,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

export function toPgLikePattern(value: string) {
  if (!value) {
    return "";
  }
  const escaped = value.replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

