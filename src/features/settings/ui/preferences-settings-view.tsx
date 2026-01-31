"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Box, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from "@mui/material";

import { useThemeMode } from "@/ui/theme-mode";
import type { ThemeMode } from "@/theme";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";
import type { UiLanguage } from "@/shared/i18n";

export default function PreferencesSettingsView({
  dailyNovelLimit,
  dailyReviewLimit,
  uiLanguage,
  schedulerBaseIntervalMinutes,
  schedulerRequiredTimeSeconds,
  schedulerRewardMultiplier,
  schedulerPenaltyMultiplier,
  schedulerTimeHistoryLimit,
}: Readonly<{
  dailyNovelLimit: number;
  dailyReviewLimit: number;
  uiLanguage: UiLanguage;
  schedulerBaseIntervalMinutes: number;
  schedulerRequiredTimeSeconds: number;
  schedulerRewardMultiplier: number;
  schedulerPenaltyMultiplier: number;
  schedulerTimeHistoryLimit: number;
}>) {
  const router = useRouter();
  const { mode: appMode, setMode: setAppMode } = useThemeMode();
  const { notifyError } = useNotifications();
  const { t, setLang } = useI18n();

  const [themeUpdating, setThemeUpdating] = useState(false);
  const [langUpdating, setLangUpdating] = useState(false);
  const [lang, setLangValue] = useState<UiLanguage>(uiLanguage);

  useEffect(() => {
    setLangValue(uiLanguage);
  }, [uiLanguage]);

  async function setTheme(nextMode: ThemeMode) {
    setThemeUpdating(true);
    const prevMode = appMode;
    setAppMode(nextMode);
    try {
      const res = await fetch("/api/settings/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (!res.ok) {
        setAppMode(prevMode);
        notifyError("errors.could_not_save_theme");
      }
    } finally {
      setThemeUpdating(false);
      router.refresh();
    }
  }

  async function saveLanguage(next: UiLanguage) {
    setLangUpdating(true);
    const prev = lang;
    setLangValue(next);
    setLang(next);
    try {
      const res = await fetch("/api/settings/language", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      if (!res.ok) {
        setLangValue(prev);
        setLang(prev);
        notifyError("common.could_not_save");
      }
    } finally {
      setLangUpdating(false);
      router.refresh();
    }
  }

  const [novelLimit, setNovelLimit] = useState(String(dailyNovelLimit));
  const [reviewLimit, setReviewLimit] = useState(String(dailyReviewLimit));
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [limitsSaving, setLimitsSaving] = useState(false);

  useEffect(() => {
    if (limitsError) {
      notifyError(limitsError);
    }
  }, [limitsError, notifyError]);

  useEffect(() => {
    setNovelLimit(String(dailyNovelLimit));
  }, [dailyNovelLimit]);
  useEffect(() => {
    setReviewLimit(String(dailyReviewLimit));
  }, [dailyReviewLimit]);

  const [baseIntervalMinutes, setBaseIntervalMinutes] = useState(String(schedulerBaseIntervalMinutes));
  const [requiredTimeSeconds, setRequiredTimeSeconds] = useState(
    String(schedulerRequiredTimeSeconds),
  );
  const [rewardMultiplier, setRewardMultiplier] = useState(String(schedulerRewardMultiplier));
  const [penaltyMultiplier, setPenaltyMultiplier] = useState(String(schedulerPenaltyMultiplier));
  const [timeHistoryLimit, setTimeHistoryLimit] = useState(String(schedulerTimeHistoryLimit));
  const [schedulerError, setSchedulerError] = useState<string | null>(null);
  const [schedulerSaving, setSchedulerSaving] = useState(false);

  useEffect(() => {
    if (schedulerError) {
      notifyError(schedulerError);
    }
  }, [schedulerError, notifyError]);

  useEffect(() => {
    setBaseIntervalMinutes(String(schedulerBaseIntervalMinutes));
  }, [schedulerBaseIntervalMinutes]);
  useEffect(() => {
    setRequiredTimeSeconds(String(schedulerRequiredTimeSeconds));
  }, [schedulerRequiredTimeSeconds]);
  useEffect(() => {
    setRewardMultiplier(String(schedulerRewardMultiplier));
  }, [schedulerRewardMultiplier]);
  useEffect(() => {
    setPenaltyMultiplier(String(schedulerPenaltyMultiplier));
  }, [schedulerPenaltyMultiplier]);
  useEffect(() => {
    setTimeHistoryLimit(String(schedulerTimeHistoryLimit));
  }, [schedulerTimeHistoryLimit]);

  useEffect(() => {
    setLimitsError(null);
    const timer = window.setTimeout(async () => {
      const nextNovel = Number.parseInt(novelLimit, 10);
      const nextReview = Number.parseInt(reviewLimit, 10);
      if (!Number.isFinite(nextNovel) || !Number.isFinite(nextReview)) {
        return;
      }
      if (nextNovel < 0 || nextNovel > 10000 || nextReview < 0 || nextReview > 10000) {
        return;
      }
      if (nextNovel === dailyNovelLimit && nextReview === dailyReviewLimit) {
        return;
      }
      setLimitsSaving(true);
      try {
        const res = await fetch("/api/settings/practice-limits", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dailyNovelLimit: nextNovel, dailyReviewLimit: nextReview }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setLimitsError(data?.error ?? "common.could_not_save");
          return;
        }
        router.refresh();
      } finally {
        setLimitsSaving(false);
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dailyNovelLimit, dailyReviewLimit, novelLimit, reviewLimit, router]);

  useEffect(() => {
    setSchedulerError(null);
    const timer = window.setTimeout(async () => {
      const nextBaseInterval = Number.parseInt(baseIntervalMinutes, 10);
      const nextRequired = Number.parseInt(requiredTimeSeconds, 10);
      const nextReward = Number.parseFloat(rewardMultiplier);
      const nextPenalty = Number.parseFloat(penaltyMultiplier);
      const nextHistoryLimit = Number.parseInt(timeHistoryLimit, 10);

      if (
        !Number.isFinite(nextBaseInterval) ||
        !Number.isFinite(nextRequired) ||
        !Number.isFinite(nextReward) ||
        !Number.isFinite(nextPenalty) ||
        !Number.isFinite(nextHistoryLimit)
      ) {
        return;
      }

      if (
        nextBaseInterval < 1 ||
        nextBaseInterval > 525600 ||
        nextRequired < 0 ||
        nextRequired > 3600 ||
        nextReward <= 0 ||
        nextReward > 1000 ||
        nextPenalty <= 0 ||
        nextPenalty > 1000 ||
        nextHistoryLimit < 1 ||
        nextHistoryLimit > 1000
      ) {
        return;
      }

      const baseIntervalUnchanged = nextBaseInterval === schedulerBaseIntervalMinutes;
      const requiredUnchanged = nextRequired === schedulerRequiredTimeSeconds;
      const rewardUnchanged = Math.abs(nextReward - schedulerRewardMultiplier) < 1e-9;
      const penaltyUnchanged = Math.abs(nextPenalty - schedulerPenaltyMultiplier) < 1e-9;
      const historyLimitUnchanged = nextHistoryLimit === schedulerTimeHistoryLimit;

      if (baseIntervalUnchanged && requiredUnchanged && rewardUnchanged && penaltyUnchanged && historyLimitUnchanged) {
        return;
      }

      setSchedulerSaving(true);
      try {
        const res = await fetch("/api/settings/scheduler", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseIntervalMinutes: nextBaseInterval,
            requiredTimeSeconds: nextRequired,
            rewardMultiplier: nextReward,
            penaltyMultiplier: nextPenalty,
            timeHistoryLimit: nextHistoryLimit,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setSchedulerError(data?.error ?? "common.could_not_save");
          return;
        }
        router.refresh();
      } finally {
        setSchedulerSaving(false);
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    baseIntervalMinutes,
    requiredTimeSeconds,
    rewardMultiplier,
    penaltyMultiplier,
    timeHistoryLimit,
    schedulerBaseIntervalMinutes,
    schedulerRequiredTimeSeconds,
    schedulerRewardMultiplier,
    schedulerPenaltyMultiplier,
    schedulerTimeHistoryLimit,
    router,
  ]);

  return (
    <Stack spacing={2}>
      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("preferences.appearance")}
        </Typography>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={appMode === "dark"}
                disabled={themeUpdating}
                onChange={(e) => {
                  void setTheme(e.target.checked ? "dark" : "light");
                }}
              />
            }
            label={t("preferences.dark_mode")}
          />
          <TextField
            disabled={langUpdating}
            label={t("preferences.language")}
            onChange={(e) => {
              const next = e.target.value === "cs" ? "cs" : "en";
              void saveLanguage(next);
            }}
            select
            value={lang}
          >
            <MenuItem value="en">{t("common.english")}</MenuItem>
            <MenuItem value="cs">{t("common.czech")}</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("preferences.practice_limits")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("preferences.max_new_per_day")}
            onChange={(e) => setNovelLimit(e.target.value)}
            value={novelLimit}
            helperText={t("hint.range", { min: 0, max: 10000 })}
          />
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("preferences.max_reviews_per_day")}
            onChange={(e) => setReviewLimit(e.target.value)}
            value={reviewLimit}
            helperText={t("hint.range", { min: 0, max: 10000 })}
          />
          {limitsSaving ? (
            <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
              {t("common.saving")}
            </Box>
          ) : null}
        </Box>
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("preferences.scheduler")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("preferences.base_interval_minutes")}
            onChange={(e) => setBaseIntervalMinutes(e.target.value)}
            value={baseIntervalMinutes}
            helperText={t("hint.range", { min: 1, max: 525600 })}
          />
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("preferences.required_time_seconds")}
            onChange={(e) => setRequiredTimeSeconds(e.target.value)}
            value={requiredTimeSeconds}
            helperText={t("hint.required_time_seconds")}
          />
          <TextField
            inputProps={{ inputMode: "decimal" }}
            label={t("preferences.reward_multiplier")}
            onChange={(e) => setRewardMultiplier(e.target.value)}
            value={rewardMultiplier}
            helperText={t("hint.greater_than_zero")}
          />
          <TextField
            inputProps={{ inputMode: "decimal" }}
            label={t("preferences.penalty_multiplier")}
            onChange={(e) => setPenaltyMultiplier(e.target.value)}
            value={penaltyMultiplier}
            helperText={t("hint.greater_than_zero")}
          />
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("preferences.time_history_limit")}
            onChange={(e) => setTimeHistoryLimit(e.target.value)}
            value={timeHistoryLimit}
            helperText={t("hint.range", { min: 1, max: 1000 })}
          />
          {schedulerSaving ? (
            <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
              {t("common.saving")}
            </Box>
          ) : null}
        </Box>
      </Paper>
    </Stack>
  );
}
