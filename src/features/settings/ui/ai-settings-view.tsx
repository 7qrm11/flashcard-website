"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Box,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Slider,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import {
  normalizeOpenrouterFlashcardPrompt,
  normalizeOpenrouterSystemPrompt,
} from "@/shared/openrouter-defaults";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

type OpenRouterModel = { id: string; name: string; isFree: boolean; supportedParameters: string[] };

type OpenRouterParams = {
  temperature: number | null;
  top_p: number | null;
  top_k: number | null;
  max_tokens: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  repetition_penalty: number | null;
};

type OpenRouterSettings = {
  apiKey: string;
  model: string;
  onlyFreeModels: boolean;
  systemPrompt: string;
  flashcardPrompt: string;
  languageLockEnabled: boolean;
  params: OpenRouterParams;
};

const OPENROUTER_AUTOSAVE_DEBOUNCE_MS = 600;

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeParams(raw: unknown): OpenRouterParams {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as any) : {};

  const temperature = (() => {
    if (obj.temperature === null) {
      return null;
    }
    if (obj.temperature === undefined) {
      return null;
    }
    const v = Number(obj.temperature);
    return Number.isFinite(v) ? clampNumber(v, 0, 5) : null;
  })();

  const topP = (() => {
    if (obj.top_p === null) {
      return null;
    }
    if (obj.top_p === undefined) {
      return null;
    }
    const v = Number(obj.top_p);
    return Number.isFinite(v) ? clampNumber(v, 0, 1) : null;
  })();

  const topK = (() => {
    if (obj.top_k === null) {
      return null;
    }
    if (obj.top_k === undefined) {
      return null;
    }
    const v = Math.floor(Number(obj.top_k));
    return Number.isFinite(v) ? Math.max(0, v) : null;
  })();

  const maxTokens = (() => {
    if (obj.max_tokens === null) {
      return null;
    }
    if (obj.max_tokens === undefined) {
      return null;
    }
    const v = Math.floor(Number(obj.max_tokens));
    return Number.isFinite(v) ? Math.max(1, v) : null;
  })();

  const frequencyPenalty = (() => {
    if (obj.frequency_penalty === null) {
      return null;
    }
    if (obj.frequency_penalty === undefined) {
      return null;
    }
    const v = Number(obj.frequency_penalty);
    return Number.isFinite(v) ? clampNumber(v, -2, 2) : null;
  })();

  const presencePenalty = (() => {
    if (obj.presence_penalty === null) {
      return null;
    }
    if (obj.presence_penalty === undefined) {
      return null;
    }
    const v = Number(obj.presence_penalty);
    return Number.isFinite(v) ? clampNumber(v, -2, 2) : null;
  })();

  const repetitionPenalty = (() => {
    if (obj.repetition_penalty === null) {
      return null;
    }
    if (obj.repetition_penalty === undefined) {
      return null;
    }
    const v = Number(obj.repetition_penalty);
    return Number.isFinite(v) ? clampNumber(v, 0, 10) : null;
  })();

  return {
    temperature,
    top_p: topP,
    top_k: topK,
    max_tokens: maxTokens,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
    repetition_penalty: repetitionPenalty,
  };
}

function paramsEqual(a: OpenRouterParams, b: OpenRouterParams) {
  const eq = (x: number | null, y: number | null) => {
    if (x === null && y === null) {
      return true;
    }
    if (x === null || y === null) {
      return false;
    }
    return Math.abs(x - y) < 1e-9;
  };

  return (
    eq(a.temperature, b.temperature) &&
    eq(a.top_p, b.top_p) &&
    eq(a.top_k, b.top_k) &&
    eq(a.max_tokens, b.max_tokens) &&
    eq(a.frequency_penalty, b.frequency_penalty) &&
    eq(a.presence_penalty, b.presence_penalty) &&
    eq(a.repetition_penalty, b.repetition_penalty)
  );
}

function logSliderToValue(slider: number, min: number, max: number) {
  const t = clampNumber(slider, 0, 100) / 100;
  const scaled = min * Math.pow(max / min, t);
  return Math.round(scaled);
}

function valueToLogSlider(value: number, min: number, max: number) {
  const v = clampNumber(value, min, max);
  const t = Math.log(v / min) / Math.log(max / min);
  return Math.round(clampNumber(t, 0, 1) * 100);
}

function logSliderToValueWithZero(slider: number, min: number, max: number) {
  const s = clampNumber(slider, 0, 100);
  if (s <= 0) {
    return 0;
  }
  const t = (s - 1) / 99;
  const scaled = min * Math.pow(max / min, t);
  return Math.round(scaled);
}

function valueToLogSliderWithZero(value: number, min: number, max: number) {
  const v = clampNumber(value, 0, max);
  if (v <= 0) {
    return 0;
  }
  const vv = clampNumber(v, min, max);
  const t = Math.log(vv / min) / Math.log(max / min);
  return Math.round(1 + clampNumber(t, 0, 1) * 99);
}

export default function AiSettingsView({
  openrouterApiKey,
  openrouterModel,
  openrouterOnlyFreeModels,
  openrouterSystemPrompt,
  openrouterFlashcardPrompt,
  openrouterParams,
  aiLanguageLockEnabled,
}: Readonly<{
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterOnlyFreeModels: boolean;
  openrouterSystemPrompt: string;
  openrouterFlashcardPrompt: string;
  openrouterParams: unknown;
  aiLanguageLockEnabled: boolean;
}>) {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t } = useI18n();

  const [orApiKey, setOrApiKey] = useState(openrouterApiKey);
  const [orModel, setOrModel] = useState(openrouterModel);
  const [orOnlyFree, setOrOnlyFree] = useState(openrouterOnlyFreeModels);
  const [orSystemPrompt, setOrSystemPrompt] = useState(openrouterSystemPrompt);
  const [orFlashcardPrompt, setOrFlashcardPrompt] = useState(openrouterFlashcardPrompt);
  const [orLanguageLockEnabled, setOrLanguageLockEnabled] = useState(aiLanguageLockEnabled);
  const [orParams, setOrParams] = useState<OpenRouterParams>(() => normalizeParams(openrouterParams));

  const [saved, setSaved] = useState<OpenRouterSettings>(() => ({
    apiKey: openrouterApiKey.trim(),
    model: openrouterModel.trim(),
    onlyFreeModels: openrouterOnlyFreeModels,
    systemPrompt: normalizeOpenrouterSystemPrompt(openrouterSystemPrompt),
    flashcardPrompt: normalizeOpenrouterFlashcardPrompt(openrouterFlashcardPrompt),
    languageLockEnabled: aiLanguageLockEnabled,
    params: normalizeParams(openrouterParams),
  }));

  const prevProps = useRef<OpenRouterSettings>({
    apiKey: openrouterApiKey,
    model: openrouterModel,
    onlyFreeModels: openrouterOnlyFreeModels,
    systemPrompt: openrouterSystemPrompt,
    flashcardPrompt: openrouterFlashcardPrompt,
    languageLockEnabled: aiLanguageLockEnabled,
    params: normalizeParams(openrouterParams),
  });

  const saveTimer = useRef<number | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const saveId = useRef(0);

  const [orModels, setOrModels] = useState<OpenRouterModel[]>([]);
  const [orModelsLoading, setOrModelsLoading] = useState(false);
  const [orModelsError, setOrModelsError] = useState<string | null>(null);
  const [orSaving, setOrSaving] = useState(false);
  const [orError, setOrError] = useState<string | null>(null);

  useEffect(() => {
    if (orModelsError) {
      notifyError(orModelsError);
    }
  }, [notifyError, orModelsError]);

  useEffect(() => {
    if (orError) {
      notifyError(orError);
    }
  }, [notifyError, orError]);

  useEffect(() => {
    const prev = prevProps.current;
    const next = {
      apiKey: openrouterApiKey,
      model: openrouterModel,
      onlyFreeModels: openrouterOnlyFreeModels,
      systemPrompt: openrouterSystemPrompt,
      flashcardPrompt: openrouterFlashcardPrompt,
      languageLockEnabled: aiLanguageLockEnabled,
      params: normalizeParams(openrouterParams),
    } satisfies OpenRouterSettings;

    prevProps.current = next;
    setSaved({
      apiKey: next.apiKey.trim(),
      model: next.model.trim(),
      onlyFreeModels: next.onlyFreeModels,
      systemPrompt: normalizeOpenrouterSystemPrompt(next.systemPrompt),
      flashcardPrompt: normalizeOpenrouterFlashcardPrompt(next.flashcardPrompt),
      languageLockEnabled: next.languageLockEnabled,
      params: next.params,
    });

    setOrApiKey((curr) => (curr === prev.apiKey ? next.apiKey : curr));
    setOrModel((curr) => (curr === prev.model ? next.model : curr));
    setOrOnlyFree((curr) => (curr === prev.onlyFreeModels ? next.onlyFreeModels : curr));
    setOrSystemPrompt((curr) => (curr === prev.systemPrompt ? next.systemPrompt : curr));
    setOrFlashcardPrompt((curr) => (curr === prev.flashcardPrompt ? next.flashcardPrompt : curr));
    setOrLanguageLockEnabled((curr) => (curr === prev.languageLockEnabled ? next.languageLockEnabled : curr));
    setOrParams((curr) => (paramsEqual(curr, prev.params) ? next.params : curr));
  }, [
    openrouterApiKey,
    openrouterFlashcardPrompt,
    openrouterModel,
    openrouterOnlyFreeModels,
    openrouterParams,
    openrouterSystemPrompt,
    aiLanguageLockEnabled,
  ]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (saveController.current) {
        saveController.current.abort();
        saveController.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOrModelsError(null);
    setOrModelsLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/openrouter/models?freeOnly=${orOnlyFree ? "1" : "0"}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) {
            setOrModelsError(data?.error ?? "errors.could_not_load_models");
          }
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | { models?: OpenRouterModel[] }
          | null;
        const models = Array.isArray(data?.models) ? data!.models! : [];
        if (cancelled) {
          return;
        }
        setOrModels(models);
      } catch {
        if (!cancelled) {
          setOrModelsError("errors.could_not_load_models");
        }
      } finally {
        if (!cancelled) {
          setOrModelsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orOnlyFree]);

  const normalized = useMemo<OpenRouterSettings>(() => {
    return {
      apiKey: orApiKey.trim(),
      model: orModel.trim(),
      onlyFreeModels: orOnlyFree,
      systemPrompt: normalizeOpenrouterSystemPrompt(orSystemPrompt),
      flashcardPrompt: normalizeOpenrouterFlashcardPrompt(orFlashcardPrompt),
      languageLockEnabled: orLanguageLockEnabled,
      params: normalizeParams(orParams),
    };
  }, [orApiKey, orFlashcardPrompt, orLanguageLockEnabled, orModel, orOnlyFree, orParams, orSystemPrompt]);

  const dirty = useMemo(() => {
    return (
      normalized.apiKey !== saved.apiKey ||
      normalized.model !== saved.model ||
      normalized.onlyFreeModels !== saved.onlyFreeModels ||
      normalized.systemPrompt !== saved.systemPrompt ||
      normalized.flashcardPrompt !== saved.flashcardPrompt ||
      normalized.languageLockEnabled !== saved.languageLockEnabled ||
      !paramsEqual(normalized.params, saved.params)
    );
  }, [normalized, saved]);

  useEffect(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty) {
      return;
    }
    if (normalized.apiKey.length > 512 || normalized.model.length > 128) {
      return;
    }
    if (normalized.systemPrompt.length > 8000 || normalized.flashcardPrompt.length > 8000) {
      return;
    }

    saveTimer.current = window.setTimeout(() => {
      void saveOpenrouter();
    }, OPENROUTER_AUTOSAVE_DEBOUNCE_MS);
  }, [dirty, normalized]);

  async function saveOpenrouter() {
    setOrError(null);
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const snapshot = {
      apiKey: orApiKey,
      model: orModel,
      onlyFreeModels: orOnlyFree,
      systemPrompt: orSystemPrompt,
      flashcardPrompt: orFlashcardPrompt,
      languageLockEnabled: orLanguageLockEnabled,
      params: orParams,
    } satisfies OpenRouterSettings;

    const apiKey = snapshot.apiKey.trim();
    const model = snapshot.model.trim();
    const systemPrompt = normalizeOpenrouterSystemPrompt(snapshot.systemPrompt);
    const flashcardPrompt = normalizeOpenrouterFlashcardPrompt(snapshot.flashcardPrompt);
    const params = normalizeParams(snapshot.params);

    if (apiKey.length > 512) {
      setOrError("errors.api_key_too_long");
      return;
    }
    if (model.length > 128) {
      setOrError("errors.invalid_model");
      return;
    }
    if (systemPrompt.length > 8000 || flashcardPrompt.length > 8000) {
      setOrError("errors.prompt_too_long");
      return;
    }

    const nextSaveId = saveId.current + 1;
    saveId.current = nextSaveId;
    if (saveController.current) {
      saveController.current.abort();
    }
    const controller = new AbortController();
    saveController.current = controller;

    setOrSaving(true);
    try {
      const selectedModel = orModels.find((m) => m.id === model) ?? null;
      const supportedSet =
        selectedModel && selectedModel.supportedParameters.length > 0
          ? new Set(selectedModel.supportedParameters)
          : null;
      const supports = (key: keyof OpenRouterParams) => {
        if (!supportedSet) {
          return true;
        }
        return supportedSet.has(String(key));
      };

      const paramsPatch: Record<string, number | null> = {};
      (Object.keys(params) as Array<keyof OpenRouterParams>).forEach((key) => {
        if (!supports(key)) {
          return;
        }
        paramsPatch[String(key)] = params[key];
      });

      const res = await fetch("/api/settings/openrouter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey,
          model,
          onlyFreeModels: snapshot.onlyFreeModels,
          systemPrompt,
          flashcardPrompt,
          languageLockEnabled: snapshot.languageLockEnabled,
          params: paramsPatch,
        }),
      });
      if (nextSaveId !== saveId.current) {
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setOrError(data?.error ?? "common.could_not_save");
        return;
      }
      setSaved({
        apiKey,
        model,
        onlyFreeModels: snapshot.onlyFreeModels,
        systemPrompt,
        flashcardPrompt,
        languageLockEnabled: snapshot.languageLockEnabled,
        params,
      });
      setOrApiKey((curr) => (curr === snapshot.apiKey ? apiKey : curr));
      setOrModel((curr) => (curr === snapshot.model ? model : curr));
      setOrSystemPrompt((curr) => (curr === snapshot.systemPrompt ? systemPrompt : curr));
      setOrFlashcardPrompt((curr) =>
        curr === snapshot.flashcardPrompt ? flashcardPrompt : curr,
      );
      setOrLanguageLockEnabled((curr) =>
        curr === snapshot.languageLockEnabled ? snapshot.languageLockEnabled : curr,
      );
      setOrParams((curr) => (paramsEqual(curr, snapshot.params) ? params : curr));
      router.refresh();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      if (nextSaveId !== saveId.current) {
        return;
      }
      setOrError("common.could_not_save");
    } finally {
      if (nextSaveId === saveId.current) {
        setOrSaving(false);
        saveController.current = null;
      }
    }
  }

  return (
    <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t("settings.ai_deck_creation")}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label={t("settings.openrouter_api_key")}
          onChange={(e) => setOrApiKey(e.target.value)}
          type="password"
          value={orApiKey}
        />
        <FormControlLabel
          control={<Switch checked={orOnlyFree} onChange={(e) => setOrOnlyFree(e.target.checked)} />}
          label={t("settings.show_only_free_models")}
        />
        <TextField
          label={t("settings.model")}
          select
          value={orModel.trim()}
          onChange={(e) => setOrModel(e.target.value)}
          disabled={orModelsLoading}
          helperText={
            orModelsLoading ? t("settings.loading_models") : t("settings.choose_model")
          }
        >
          <MenuItem value="">{t("common.none")}</MenuItem>
          {orModel.trim().length > 0 && !orModels.some((m) => m.id === orModel.trim()) ? (
            <MenuItem value={orModel.trim()}>
              {orModel.trim()} {t("settings.model_tag_custom")}
            </MenuItem>
          ) : null}
          {orModels.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
              {m.isFree ? ` ${t("settings.model_tag_free")}` : ""}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t("settings.system_prompt")}
          multiline
          minRows={3}
          onChange={(e) => setOrSystemPrompt(e.target.value)}
          value={orSystemPrompt}
        />
        <TextField
          label={t("settings.flashcard_creation_guide")}
          multiline
          minRows={4}
          onChange={(e) => setOrFlashcardPrompt(e.target.value)}
          value={orFlashcardPrompt}
        />
        <FormControlLabel
          control={
            <Switch
              checked={orLanguageLockEnabled}
              onChange={(e) => setOrLanguageLockEnabled(e.target.checked)}
            />
          }
          label={t("settings.language_lock")}
        />
        <Divider sx={{ my: 1 }} />
        <Typography variant="subtitle1">{t("settings.llm_parameters")}</Typography>
        {(() => {
          const selected = orModels.find((m) => m.id === orModel.trim()) ?? null;
          const supportedSet = selected ? new Set(selected.supportedParameters) : null;
          const supports = (key: string) => {
            if (!supportedSet) {
              return false;
            }
            return supportedSet.has(key);
          };

          const tokenMin = 1;
          const tokenMax = 1_000_000;

          const controls: Array<
            Readonly<{
              key: keyof OpenRouterParams;
              label: string;
              kind: "linear" | "log";
              min: number;
              max: number;
              step: number;
              defaultValue: number;
              helper: string;
              disabled?: boolean;
            }>
          > = [
            {
              key: "temperature",
              label: t("settings.temperature"),
              kind: "linear",
              min: 0,
              max: 5,
              step: 0.01,
              defaultValue: 0.7,
              helper: t("hint.range", { min: 0, max: 5 }),
            },
            {
              key: "top_p",
              label: t("settings.top_p"),
              kind: "linear",
              min: 0,
              max: 1,
              step: 0.01,
              defaultValue: 1,
              helper: t("hint.range", { min: 0, max: 1 }),
            },
            {
              key: "top_k",
              label: t("settings.top_k"),
              kind: "log",
              min: 1,
              max: 1_000_000,
              step: 1,
              defaultValue: 1,
              helper: t("hint.range", { min: 0, max: "1,000,000" }),
            },
            {
              key: "max_tokens",
              label: t("settings.max_tokens"),
              kind: "log",
              min: tokenMin,
              max: tokenMax,
              step: 1,
              defaultValue: tokenMin,
              helper: t("hint.range", { min: 1, max: tokenMax.toLocaleString() }),
            },
            {
              key: "frequency_penalty",
              label: t("settings.frequency_penalty"),
              kind: "linear",
              min: -2,
              max: 2,
              step: 0.01,
              defaultValue: 0,
              helper: t("hint.range_to", { min: -2, max: 2 }),
            },
            {
              key: "presence_penalty",
              label: t("settings.presence_penalty"),
              kind: "linear",
              min: -2,
              max: 2,
              step: 0.01,
              defaultValue: 0,
              helper: t("hint.range_to", { min: -2, max: 2 }),
            },
            {
              key: "repetition_penalty",
              label: t("settings.repetition_penalty"),
              kind: "linear",
              min: 0,
              max: 10,
              step: 0.01,
              defaultValue: 1,
              helper: t("hint.range_to", { min: 0, max: 10 }),
            },
          ];

          const visible = controls.filter((c) => supports(String(c.key)));
          if (visible.length === 0) {
            return (
              <Typography color="text.secondary" variant="body2">
                {t("settings.no_params_for_model")}
              </Typography>
            );
          }

          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {visible.map((c) => {
                const value = orParams[c.key];
                const displayValue = (() => {
                  if (value === null) {
                    return c.defaultValue;
                  }
                  if (c.key === "top_k") {
                    return clampNumber(value, 0, c.max);
                  }
                  return clampNumber(value, c.min, c.max);
                })();

                const sliderValue =
                  c.kind === "log"
                    ? c.key === "top_k"
                      ? valueToLogSliderWithZero(displayValue, c.min, c.max)
                      : valueToLogSlider(displayValue, c.min, c.max)
                    : displayValue;

                return (
                  <Box key={String(c.key)} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                      <Typography variant="subtitle2">{c.label}</Typography>
                      <TextField
                        inputProps={{ inputMode: "decimal" }}
                        label={t("common.value")}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          setOrParams((prev) => {
                            const next = { ...prev };
                            if (raw.length === 0) {
                              next[c.key] = null;
                              return next;
                            }
                            const parsed = Number(raw);
                            if (!Number.isFinite(parsed)) {
                              return prev;
                            }
                            const normalizedValue =
                              c.key === "top_k" || c.key === "max_tokens"
                                ? Math.floor(parsed)
                                : parsed;
                            const clamped =
                              c.key === "max_tokens"
                                ? Math.max(1, Math.floor(clampNumber(normalizedValue, c.min, c.max)))
                                : c.key === "top_k"
                                  ? Math.max(0, Math.floor(clampNumber(normalizedValue, 0, c.max)))
                                : clampNumber(normalizedValue, c.min, c.max);
                            next[c.key] = clamped;
                            return next;
                          });
                        }}
                        value={
                          value === null
                            ? ""
                            : c.key === "top_k" || c.key === "max_tokens"
                              ? String(Math.floor(value))
                              : String(value)
                        }
                        size="small"
                        sx={{ width: 160 }}
                      />
                    </Box>
                    <Slider
                      min={c.kind === "log" ? 0 : c.min}
                      max={c.kind === "log" ? 100 : c.max}
                      onChange={(_e, v) => {
                        const rawSlider = Array.isArray(v) ? v[0] : v;
                        const nextValueRaw =
                          c.kind === "log"
                            ? c.key === "top_k"
                              ? logSliderToValueWithZero(rawSlider, c.min, c.max)
                              : logSliderToValue(rawSlider, c.min, c.max)
                            : clampNumber(Number(rawSlider), c.min, c.max);
                        const nextValue =
                          c.key === "top_k" || c.key === "max_tokens"
                            ? Math.floor(nextValueRaw)
                            : nextValueRaw;
                        setOrParams((prev) => ({ ...prev, [c.key]: nextValue }));
                      }}
                        step={c.kind === "log" ? 1 : c.step}
                        value={sliderValue}
                        valueLabelDisplay="auto"
                        disabled={Boolean(c.disabled)}
                    />
                    <Typography color="text.secondary" variant="caption">
                      {value === null ? t("settings.using_model_default") : c.helper}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          );
        })()}
        {orSaving ? (
          <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
            {t("common.saving")}
          </Box>
        ) : null}
      </Box>
    </Paper>
  );
}
