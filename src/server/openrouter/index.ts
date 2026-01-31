import "server-only";

type RawOpenRouterModelsResponse =
  | { data?: unknown; models?: unknown }
  | unknown;

export type OpenRouterModelInfo = {
  id: string;
  name: string;
  isFree: boolean;
  supportedParameters: string[];
};

export type OpenRouterChatCompletionParams = Readonly<{
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
}>;

type RawModel = {
  id?: unknown;
  name?: unknown;
  pricing?: unknown;
  supported_parameters?: unknown;
  supportedParameters?: unknown;
};

type RawPricing = {
  prompt?: unknown;
  completion?: unknown;
  input?: unknown;
  output?: unknown;
};

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

declare global {
  // eslint-disable-next-line no-var
  var __openRouterModelsCache:
    | { fetchedAtMs: number; models: OpenRouterModelInfo[] }
    | undefined;
}

function parsePricingNumber(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
}

function parseIsFree(pricing: RawPricing | null) {
  const promptNum = parsePricingNumber(pricing?.prompt ?? pricing?.input);
  const completionNum = parsePricingNumber(pricing?.completion ?? pricing?.output);
  return (
    Number.isFinite(promptNum) &&
    Number.isFinite(completionNum) &&
    promptNum === 0 &&
    completionNum === 0
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeChatCompletionParams(params: OpenRouterChatCompletionParams | undefined) {
  const temperature =
    typeof params?.temperature === "number"
      ? clampNumber(params.temperature, 0, 5)
      : undefined;

  const top_p =
    typeof params?.top_p === "number" ? clampNumber(params.top_p, 0, 1) : undefined;

  const top_k =
    typeof params?.top_k === "number"
      ? Math.max(0, Math.floor(clampNumber(params.top_k, 0, 1_000_000)))
      : undefined;

  const max_tokens =
    typeof params?.max_tokens === "number"
      ? Math.max(1, Math.floor(clampNumber(params.max_tokens, 1, 1_000_000)))
      : undefined;

  const frequency_penalty =
    typeof params?.frequency_penalty === "number"
      ? clampNumber(params.frequency_penalty, -2, 2)
      : undefined;

  const presence_penalty =
    typeof params?.presence_penalty === "number"
      ? clampNumber(params.presence_penalty, -2, 2)
      : undefined;

  const repetition_penalty =
    typeof params?.repetition_penalty === "number"
      ? clampNumber(params.repetition_penalty, 0, 10)
      : undefined;

  return {
    ...(temperature === undefined ? null : { temperature }),
    ...(top_p === undefined ? null : { top_p }),
    ...(top_k === undefined ? null : { top_k }),
    ...(max_tokens === undefined ? null : { max_tokens }),
    ...(frequency_penalty === undefined ? null : { frequency_penalty }),
    ...(presence_penalty === undefined ? null : { presence_penalty }),
    ...(repetition_penalty === undefined ? null : { repetition_penalty }),
  };
}

export async function getOpenRouterModels(opts: Readonly<{ freeOnly: boolean }>) {
  const cacheTtlMs = 5 * 60 * 1000;
  const cached = global.__openRouterModelsCache;
  if (cached && Date.now() - cached.fetchedAtMs < cacheTtlMs) {
    return {
      ok: true as const,
      models: opts.freeOnly ? cached.models.filter((m) => m.isFree) : cached.models,
    };
  }

  const res = await fetch(MODELS_URL, { method: "GET", cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) {
    return { ok: false as const, error: "could not load openrouter models" };
  }

  const json = (await res.json().catch(() => null)) as RawOpenRouterModelsResponse | null;
  const rawList = isObject(json) && Array.isArray((json as any).data)
    ? ((json as any).data as unknown[])
    : isObject(json) && Array.isArray((json as any).models)
      ? ((json as any).models as unknown[])
      : [];

  const models: OpenRouterModelInfo[] = [];
  for (const item of rawList) {
    if (!isObject(item)) {
      continue;
    }
    const model = item as RawModel;
    const id = typeof model.id === "string" ? model.id : null;
    if (!id) {
      continue;
    }
    const name = typeof model.name === "string" && model.name.trim().length > 0 ? model.name : id;

    const pricing = isObject(model.pricing) ? (model.pricing as RawPricing) : null;
    const isFree = parseIsFree(pricing);
    const supportedRaw = (model as any).supported_parameters ?? (model as any).supportedParameters ?? null;
    const supportedParameters = Array.isArray(supportedRaw)
      ? supportedRaw.map((p) => String(p)).filter((p) => p.trim().length > 0)
      : [];

    models.push({ id, name, isFree, supportedParameters });
  }

  models.sort((a, b) => {
    if (a.isFree !== b.isFree) {
      return a.isFree ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  global.__openRouterModelsCache = { fetchedAtMs: Date.now(), models };
  return {
    ok: true as const,
    models: opts.freeOnly ? models.filter((m) => m.isFree) : models,
  };
}

export async function openRouterChatCompletion(opts: Readonly<{
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  params?: OpenRouterChatCompletionParams;
}>) {
  const controller = new AbortController();
  const timeoutMs = 3 * 60 * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.apiKey}`,
    "content-type": "application/json",
  };

  const referer = process.env.OPENROUTER_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (referer) {
    headers["http-referer"] = referer;
  }
  headers["x-title"] = process.env.OPENROUTER_APP_TITLE || "website";

  let res: Response | null = null;
  try {
    res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        ...normalizeChatCompletionParams(opts.params),
      }),
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false as const, status: 0, error: "openrouter request timed out" };
    }
    return { ok: false as const, status: 0, error: "could not reach openrouter" };
  } finally {
    clearTimeout(timeout);
  }

  if (!res) {
    return { ok: false as const, status: 0, error: "could not reach openrouter" };
  }

  const rawText = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      (typeof json?.error === "string" ? json.error : null) ??
      (typeof json?.error?.message === "string" ? json.error.message : null) ??
      `openrouter request failed (${res.status})`;
    return { ok: false as const, status: res.status, error: message };
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    return { ok: false as const, status: res.status, error: "openrouter returned empty response" };
  }

  return { ok: true as const, content };
}

export async function openRouterChatCompletionStream(opts: Readonly<{
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  params?: OpenRouterChatCompletionParams;
}>) {
  const controller = new AbortController();
  const totalTimeoutMs = 12 * 60 * 1000;
  const idleTimeoutMs = 75_000;
  const totalTimeout = setTimeout(() => controller.abort(), totalTimeoutMs);

  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.apiKey}`,
    "content-type": "application/json",
  };

  const referer = process.env.OPENROUTER_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (referer) {
    headers["http-referer"] = referer;
  }
  headers["x-title"] = process.env.OPENROUTER_APP_TITLE || "website";

  let res: Response | null = null;
  try {
    res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        ...normalizeChatCompletionParams(opts.params),
        stream: true,
      }),
    });
  } catch (err: any) {
    clearTimeout(totalTimeout);
    if (err?.name === "AbortError") {
      return { ok: false as const, status: 0, error: "openrouter request timed out" };
    }
    return { ok: false as const, status: 0, error: "could not reach openrouter" };
  }

  if (!res) {
    clearTimeout(totalTimeout);
    return { ok: false as const, status: 0, error: "could not reach openrouter" };
  }

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }
    const message =
      (typeof json?.error === "string" ? json.error : null) ??
      (typeof json?.error?.message === "string" ? json.error.message : null) ??
      `openrouter request failed (${res.status})`;
    clearTimeout(totalTimeout);
    return { ok: false as const, status: res.status, error: message };
  }

  if (!res.body) {
    clearTimeout(totalTimeout);
    return { ok: false as const, status: res.status, error: "openrouter returned empty stream" };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  async function* stream() {
    let buffer = "";
    try {
      while (true) {
        let readRes: ReadableStreamReadResult<Uint8Array>;
        let idleTimeout: ReturnType<typeof setTimeout> | null = null;
        try {
          idleTimeout = setTimeout(() => controller.abort(), idleTimeoutMs);
          readRes = await reader.read();
        } catch (err: any) {
          if (err?.name === "AbortError") {
            throw new Error("openrouter stream timed out");
          }
          throw err;
        } finally {
          if (idleTimeout !== null) {
            clearTimeout(idleTimeout);
          }
        }

        const { value, done } = readRes;
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const nl = buffer.indexOf("\n");
          if (nl < 0) {
            break;
          }
          const rawLine = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);

          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (!line.startsWith("data:")) {
            continue;
          }
          const data = line.slice(5).trim();
          if (data.length === 0) {
            continue;
          }
          if (data === "[DONE]") {
            return;
          }

          let json: any = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = null;
          }

          const content =
            (typeof json?.choices?.[0]?.delta?.content === "string"
              ? json.choices[0].delta.content
              : null) ??
            (typeof json?.choices?.[0]?.message?.content === "string"
              ? json.choices[0].message.content
              : null);

          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
        }
      }
    } finally {
      clearTimeout(totalTimeout);
      await reader.cancel().catch(() => null);
    }
  }

  return { ok: true as const, stream: stream() };
}
