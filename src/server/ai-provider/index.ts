import "server-only";

export type AiProvider = "openrouter" | "cerebras" | "groq";

export type AiChatCompletionParams = Readonly<{
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    repetition_penalty?: number;
}>;

export type AiModelInfo = {
    id: string;
    name: string;
    isFree: boolean;
};

const PROVIDER_URLS: Record<AiProvider, string> = {
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    cerebras: "https://api.cerebras.ai/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
};

// hardcoded model lists for cerebras and groq
export const CEREBRAS_MODELS: AiModelInfo[] = [
    { id: "llama-3.3-70b", name: "Llama 3.3 70B", isFree: false },
    { id: "llama-3.1-8b", name: "Llama 3.1 8B", isFree: false },
    { id: "llama-3.1-70b", name: "Llama 3.1 70B", isFree: false },
    { id: "qwen-3-32b", name: "Qwen 3 32B", isFree: false },
];

export const GROQ_MODELS: AiModelInfo[] = [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", isFree: false },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", isFree: false },
    { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B Versatile", isFree: false },
    { id: "llama3-8b-8192", name: "Llama 3 8B", isFree: false },
    { id: "llama3-70b-8192", name: "Llama 3 70B", isFree: false },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", isFree: false },
    { id: "gemma2-9b-it", name: "Gemma 2 9B", isFree: false },
];

function clampNumber(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}

function normalizeParams(params: AiChatCompletionParams | undefined) {
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

function buildHeaders(provider: AiProvider, apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
    };

    if (provider === "openrouter") {
        const referer = process.env.OPENROUTER_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
        if (referer) {
            headers["http-referer"] = referer;
        }
        headers["x-title"] = process.env.OPENROUTER_APP_TITLE || "website";
    }

    return headers;
}

export async function aiChatCompletionStream(opts: Readonly<{
    provider: AiProvider;
    apiKey: string;
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    params?: AiChatCompletionParams;
}>) {
    const url = PROVIDER_URLS[opts.provider];
    const controller = new AbortController();
    const totalTimeoutMs = 12 * 60 * 1000;
    const idleTimeoutMs = 75_000;
    const totalTimeout = setTimeout(() => controller.abort(), totalTimeoutMs);

    const headers = buildHeaders(opts.provider, opts.apiKey);

    let res: Response | null = null;
    try {
        res = await fetch(url, {
            method: "POST",
            headers,
            signal: controller.signal,
            body: JSON.stringify({
                model: opts.model,
                messages: opts.messages,
                ...normalizeParams(opts.params),
                stream: true,
            }),
        });
    } catch (err: any) {
        clearTimeout(totalTimeout);
        if (err?.name === "AbortError") {
            return { ok: false as const, status: 0, error: `${opts.provider} request timed out` };
        }
        return { ok: false as const, status: 0, error: `could not reach ${opts.provider}` };
    }

    if (!res) {
        clearTimeout(totalTimeout);
        return { ok: false as const, status: 0, error: `could not reach ${opts.provider}` };
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
            `${opts.provider} request failed (${res.status})`;
        clearTimeout(totalTimeout);
        return { ok: false as const, status: res.status, error: message };
    }

    if (!res.body) {
        clearTimeout(totalTimeout);
        return { ok: false as const, status: res.status, error: `${opts.provider} returned empty stream` };
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
                        throw new Error(`${opts.provider} stream timed out`);
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

export function normalizeAiProvider(value: unknown): AiProvider {
    if (value === "cerebras" || value === "groq") {
        return value;
    }
    return "openrouter";
}
