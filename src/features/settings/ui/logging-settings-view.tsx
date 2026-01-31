"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import { IconDelete } from "@/ui/icons";
import RelativeTime from "@/ui/relative-time";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

type UserLog = {
  id: string;
  source: string;
  level: string;
  message: string;
  ts: string;
  createdAt: string;
  meta: unknown;
  data: unknown;
};

type AiDeckJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  deckId: string | null;
  deckName: string | null;
  prompt: string;
  model: string;
  systemPrompt: string;
  flashcardPrompt: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
};

function levelChipSx(level: string) {
  const v = level.toLowerCase();
  if (v === "error") {
    return { bgcolor: "error.main", color: "error.contrastText" };
  }
  if (v === "warn" || v === "warning") {
    return { bgcolor: "warning.main", color: "warning.contrastText" };
  }
  if (v === "info") {
    return { bgcolor: "info.main", color: "info.contrastText" };
  }
  if (v === "debug") {
    return { bgcolor: "grey.700", color: "common.white" };
  }
  return { bgcolor: "grey.600", color: "common.white" };
}

function statusChipSx(status: string) {
  if (status === "running" || status === "queued") {
    return { bgcolor: "info.main", color: "info.contrastText" };
  }
  if (status === "succeeded") {
    return { bgcolor: "success.main", color: "success.contrastText" };
  }
  if (status === "failed") {
    return { bgcolor: "error.main", color: "error.contrastText" };
  }
  return { bgcolor: "grey.600", color: "common.white" };
}

const SAVE_DEBOUNCE_MS = 600;
const LOGS_PAGE_SIZE = 100;

export default function LoggingSettingsView({
  aiDeckJobLogsEnabled,
  aiDeckJobLogsRetentionDays,
  loggingEnabled,
  retentionDays,
}: Readonly<{
  loggingEnabled: boolean;
  retentionDays: number;
  aiDeckJobLogsEnabled: boolean;
  aiDeckJobLogsRetentionDays: number;
}>) {
  const router = useRouter();
  const { notifyError, notifySuccess } = useNotifications();
  const { t } = useI18n();

  const [enabled, setEnabled] = useState(loggingEnabled);
  const [retention, setRetention] = useState(String(retentionDays));
  const [aiEnabled, setAiEnabled] = useState(aiDeckJobLogsEnabled);
  const [aiRetention, setAiRetention] = useState(String(aiDeckJobLogsRetentionDays));

  const [saved, setSaved] = useState(() => ({
    enabled: loggingEnabled,
    retentionDays,
    aiEnabled: aiDeckJobLogsEnabled,
    aiRetentionDays: aiDeckJobLogsRetentionDays,
  }));

  const prevProps = useRef({
    loggingEnabled,
    retentionDays,
    aiDeckJobLogsEnabled,
    aiDeckJobLogsRetentionDays,
  });

  const saveTimer = useRef<number | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const saveId = useRef(0);

  const [saving, setSaving] = useState(false);

  const [logs, setLogs] = useState<UserLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsHasMore, setLogsHasMore] = useState(false);

  const [aiJobs, setAiJobs] = useState<AiDeckJob[]>([]);
  const [aiJobsLoading, setAiJobsLoading] = useState(false);

  const [selectedLog, setSelectedLog] = useState<UserLog | null>(null);
  const [selectedAiJob, setSelectedAiJob] = useState<AiDeckJob | null>(null);

  useEffect(() => {
    const prev = prevProps.current;
    const next = {
      loggingEnabled,
      retentionDays,
      aiDeckJobLogsEnabled,
      aiDeckJobLogsRetentionDays,
    };
    prevProps.current = next;

    setSaved({
      enabled: next.loggingEnabled,
      retentionDays: next.retentionDays,
      aiEnabled: next.aiDeckJobLogsEnabled,
      aiRetentionDays: next.aiDeckJobLogsRetentionDays,
    });

    setEnabled((curr) => (curr === prev.loggingEnabled ? next.loggingEnabled : curr));
    setRetention((curr) => (curr === String(prev.retentionDays) ? String(next.retentionDays) : curr));
    setAiEnabled((curr) => (curr === prev.aiDeckJobLogsEnabled ? next.aiDeckJobLogsEnabled : curr));
    setAiRetention((curr) =>
      curr === String(prev.aiDeckJobLogsRetentionDays) ? String(next.aiDeckJobLogsRetentionDays) : curr,
    );
  }, [aiDeckJobLogsEnabled, aiDeckJobLogsRetentionDays, loggingEnabled, retentionDays]);

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

  const parsedRetention = useMemo(() => Number.parseInt(retention, 10), [retention]);
  const parsedAiRetention = useMemo(() => Number.parseInt(aiRetention, 10), [aiRetention]);

  const validRetention = Number.isFinite(parsedRetention) && parsedRetention >= 0 && parsedRetention <= 3650;
  const validAiRetention =
    Number.isFinite(parsedAiRetention) && parsedAiRetention >= 0 && parsedAiRetention <= 3650;

  const dirty = useMemo(() => {
    if (!validRetention || !validAiRetention) {
      return false;
    }
    return (
      enabled !== saved.enabled ||
      parsedRetention !== saved.retentionDays ||
      aiEnabled !== saved.aiEnabled ||
      parsedAiRetention !== saved.aiRetentionDays
    );
  }, [aiEnabled, enabled, parsedAiRetention, parsedRetention, saved, validAiRetention, validRetention]);

  useEffect(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty) {
      return;
    }

    saveTimer.current = window.setTimeout(() => {
      void saveSettings();
    }, SAVE_DEBOUNCE_MS);
  }, [dirty, enabled, parsedRetention, aiEnabled, parsedAiRetention]);

  async function saveSettings() {
    if (!validRetention || !validAiRetention) {
      return;
    }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const snapshot = {
      loggingEnabled: enabled,
      retentionDays: parsedRetention,
      aiDeckJobLogsEnabled: aiEnabled,
      aiDeckJobLogsRetentionDays: parsedAiRetention,
    };

    if (saveController.current) {
      saveController.current.abort();
    }
    const controller = new AbortController();
    saveController.current = controller;

    const id = (saveId.current += 1);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/logging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "could not save");
        return;
      }

      setSaved({
        enabled: snapshot.loggingEnabled,
        retentionDays: snapshot.retentionDays,
        aiEnabled: snapshot.aiDeckJobLogsEnabled,
        aiRetentionDays: snapshot.aiDeckJobLogsRetentionDays,
      });

      await loadLogs(true);
      await loadAiJobs();
      router.refresh();
    } catch (err) {
      if ((err as any)?.name !== "AbortError") {
        notifyError("common.could_not_save");
      }
    } finally {
      if (saveId.current === id) {
        setSaving(false);
      }
    }
  }

  async function loadLogs(reset: boolean) {
    setLogsLoading(true);
    try {
      const before = !reset && logs.length > 0 ? logs[logs.length - 1]?.createdAt : null;
      const url = new URL("/api/logs", window.location.origin);
      url.searchParams.set("limit", String(LOGS_PAGE_SIZE));
      if (before) {
        url.searchParams.set("before", before);
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        notifyError("errors.could_not_load_logs");
        return;
      }
      const data = (await res.json().catch(() => null)) as { logs?: UserLog[] } | null;
      const next = Array.isArray(data?.logs) ? data!.logs! : [];

      setLogs((prev) => {
        const list = reset ? [] : prev;
        const seen = new Set<string>(list.map((l) => l.id));
        const merged = [...list];
        for (const item of next) {
          if (!item?.id || seen.has(item.id)) {
            continue;
          }
          merged.push(item);
          seen.add(item.id);
        }
        return merged;
      });
      setLogsHasMore(next.length >= LOGS_PAGE_SIZE);
    } catch {
      notifyError("errors.could_not_load_logs");
    } finally {
      setLogsLoading(false);
    }
  }

  async function loadAiJobs() {
    setAiJobsLoading(true);
    try {
      const res = await fetch(`/api/decks/ai/jobs?limit=50`, { cache: "no-store" });
      if (!res.ok) {
        notifyError("errors.could_not_load_ai_jobs");
        return;
      }
      const data = (await res.json().catch(() => null)) as { jobs?: AiDeckJob[] } | null;
      setAiJobs(Array.isArray(data?.jobs) ? data!.jobs! : []);
    } catch {
      notifyError("errors.could_not_load_ai_jobs");
    } finally {
      setAiJobsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(true);
    void loadAiJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteLog(id: string) {
    const res = await fetch(`/api/logs/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res || !res.ok) {
      notifyError("errors.could_not_delete_log");
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== id));
    if (selectedLog?.id === id) {
      setSelectedLog(null);
    }
  }

  async function deleteAllLogs() {
    const res = await fetch("/api/logs", { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      notifyError("errors.could_not_delete_logs");
      return;
    }
    setLogs([]);
    setLogsHasMore(false);
    notifySuccess("logs.logs_deleted");
  }

  async function deleteAiJob(id: string) {
    const res = await fetch(`/api/decks/ai/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res || !res.ok) {
      notifyError("errors.could_not_delete_ai_job");
      return;
    }
    setAiJobs((prev) => prev.filter((j) => j.id !== id));
  }

  async function deleteAllAiJobs() {
    const res = await fetch("/api/decks/ai/jobs", { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      notifyError("errors.could_not_delete_ai_jobs");
      return;
    }
    setAiJobs([]);
    notifySuccess("logs.ai_jobs_deleted");
  }

  const logDetails = useMemo(() => {
    if (!selectedLog) {
      return "";
    }
    return JSON.stringify(
      {
        id: selectedLog.id,
        source: selectedLog.source,
        level: selectedLog.level,
        message: selectedLog.message,
        ts: selectedLog.ts,
        createdAt: selectedLog.createdAt,
        meta: selectedLog.meta,
        data: selectedLog.data,
      },
      null,
      2,
    );
  }, [selectedLog]);

  const aiJobPromptDetails = useMemo(() => {
    if (!selectedAiJob) {
      return "";
    }
    const systemParts = [selectedAiJob.systemPrompt.trim(), selectedAiJob.flashcardPrompt.trim()].filter(
      (p) => p.length > 0,
    );
    const system = [
      ...systemParts,
      'output must be valid json only. ensure json begins with {"name":',
    ].join("\n\n");
    return JSON.stringify(
      {
        jobId: selectedAiJob.id,
        status: selectedAiJob.status,
        model: selectedAiJob.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: selectedAiJob.prompt },
        ],
      },
      null,
      2,
    );
  }, [selectedAiJob]);

  return (
    <Stack spacing={2}>
      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("logs.app_logging")}
        </Typography>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
            }
            label={t("logs.enable_persistent_logs")}
          />
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("logs.log_retention_days")}
            value={retention}
            error={!validRetention}
            helperText={
              validRetention
                ? t("logs.retention_helper_valid")
                : t("logs.retention_helper_invalid")
            }
            onChange={(e) => setRetention(e.target.value)}
          />
          {saving ? (
            <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
              {t("common.saving")}
            </Box>
          ) : null}
        </Stack>
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("logs.ai_deck_request_logs")}
        </Typography>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={aiEnabled}
                onChange={(e) => setAiEnabled(e.target.checked)}
              />
            }
            label={t("logs.store_ai_request_history")}
          />
          <TextField
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            label={t("logs.ai_request_retention_days")}
            value={aiRetention}
            error={!validAiRetention}
            helperText={
              validAiRetention
                ? t("logs.retention_helper_valid")
                : t("logs.retention_helper_invalid")
            }
            onChange={(e) => setAiRetention(e.target.value)}
          />
          {saving ? (
            <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
              {t("common.saving")}
            </Box>
          ) : null}
        </Stack>
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }}>
            {t("logs.logs_title")}
          </Typography>
          <Button disabled={logsLoading} onClick={() => void loadLogs(true)} variant="outlined">
            {t("common.refresh")}
          </Button>
          <Button
            color="error"
            disabled={logsLoading || logs.length === 0}
            onClick={() => void deleteAllLogs()}
            variant="contained"
          >
            {t("common.delete_all")}
          </Button>
        </Stack>

        <Divider sx={{ mb: 1.5 }} />

        {logs.length === 0 ? (
          <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
            {logsLoading ? t("common.loading") : t("logs.no_logs_yet")}
          </Box>
        ) : (
          <List disablePadding>
            {logs.map((log) => (
              <ListItem
                disablePadding
                key={log.id}
                secondaryAction={
                  <IconButton
                    aria-label={t("aria.delete_log")}
                    edge="end"
                    onClick={() => void deleteLog(log.id)}
                  >
                    <IconDelete fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => setSelectedLog(log)}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                    <Chip
                      label={String(log.level || "info").toUpperCase()}
                      size="small"
                      sx={{ ...levelChipSx(String(log.level || "info")), fontWeight: 700 }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {log.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {String(log.source || "client")} • <RelativeTime isoDate={log.createdAt} />
                      </Typography>
                    </Box>
                  </Stack>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}

        {logsHasMore ? (
          <Box sx={{ mt: 1.5 }}>
            <Button disabled={logsLoading} onClick={() => void loadLogs(false)} variant="outlined">
              {t("common.load_more")}
            </Button>
          </Box>
        ) : null}
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }}>
            {t("logs.ai_deck_requests_title")}
          </Typography>
          <Button disabled={aiJobsLoading} onClick={() => void loadAiJobs()} variant="outlined">
            {t("common.refresh")}
          </Button>
          <Button
            color="error"
            disabled={aiJobsLoading || aiJobs.length === 0}
            onClick={() => void deleteAllAiJobs()}
            variant="contained"
          >
            {t("common.delete_all")}
          </Button>
        </Stack>

        <Divider sx={{ mb: 1.5 }} />

        {aiJobs.length === 0 ? (
          <Box sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.4 }}>
            {aiJobsLoading ? t("common.loading") : t("logs.no_ai_jobs_yet")}
          </Box>
        ) : (
          <List disablePadding>
            {aiJobs.map((job) => (
              <ListItem
                disablePadding
                key={job.id}
                secondaryAction={
                  <IconButton
                    aria-label={t("aria.delete_ai_job")}
                    edge="end"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteAiJob(job.id);
                    }}
                  >
                    <IconDelete fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => setSelectedAiJob(job)} sx={{ pr: 7 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                    <Chip
                      label={t(`ai_job.status_${job.status}`)}
                      size="small"
                      sx={{ ...statusChipSx(job.status), fontWeight: 700 }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {job.deckName ? job.deckName : job.prompt}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        <RelativeTime isoDate={job.createdAt} />
                        {job.status === "failed" && job.error ? ` • ${t(job.error)}` : ""}
                      </Typography>
                    </Box>
                  </Stack>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      <Dialog
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t("logs.log_details_title")}</DialogTitle>
        <DialogContent dividers>
          {selectedLog ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={String(selectedLog.level || "info").toUpperCase()}
                  size="small"
                  sx={{ ...levelChipSx(String(selectedLog.level || "info")), fontWeight: 700 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {String(selectedLog.source || "client")} • <RelativeTime isoDate={selectedLog.createdAt} />
                </Typography>
              </Stack>
              <Typography sx={{ fontWeight: 700 }}>{selectedLog.message}</Typography>
              <TextField
                label={t("logs.payload_label")}
                value={logDetails}
                multiline
                minRows={8}
                maxRows={20}
                fullWidth
                InputProps={{ readOnly: true }}
              />
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          {selectedLog ? (
            <Button
              color="error"
              onClick={() => void deleteLog(selectedLog.id)}
              variant="outlined"
            >
              {t("common.delete")}
            </Button>
          ) : null}
          <Button onClick={() => setSelectedLog(null)} variant="contained">
            {t("common.close")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(selectedAiJob)}
        onClose={() => setSelectedAiJob(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t("deck.ai_request_prompt_title")}</DialogTitle>
        <DialogContent dividers>
          {selectedAiJob?.deckId ? (
            <Box sx={{ mb: 2 }}>
              <Button
                component={Link}
                href={`/create/${encodeURIComponent(selectedAiJob.deckId)}`}
                variant="outlined"
              >
                {t("deck.open_deck")}
              </Button>
            </Box>
          ) : null}
          <TextField
            label={t("deck.openrouter_request_json")}
            value={aiJobPromptDetails}
            multiline
            minRows={12}
            maxRows={30}
            fullWidth
            InputProps={{ readOnly: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedAiJob(null)} variant="contained">
            {t("common.close")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
