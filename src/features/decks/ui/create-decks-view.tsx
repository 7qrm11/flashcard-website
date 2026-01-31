"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { IconDelete, IconMoreVert, IconSearch } from "@/ui/icons";
import PaginationBar from "@/ui/pagination-bar";
import RelativeTime from "@/ui/relative-time";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

import AiCreateDeckDialog from "./ai-create-deck-dialog";
import CreateDeckDialog from "./create-deck-dialog";
import DeckStatsDialog from "./deck-stats-dialog";
import ImportDeckDialog from "./import-deck-dialog";
import RenameDeckDialog from "./rename-deck-dialog";

type Deck = { id: string; name: string; isDefault: boolean };
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

export default function CreateDecksView({
  aiJobs,
  decks,
  query,
  page,
  pageSize,
  totalCount,
}: Readonly<{
  aiJobs: AiDeckJob[];
  decks: Deck[];
  query: string;
  page: number;
  pageSize: number;
  totalCount: number;
}>) {
  const router = useRouter();
  const { dismiss, notify, notifyError, notifySuccess } = useNotifications();
  const { t } = useI18n();

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiCreateOpen, setAiCreateOpen] = useState(false);
  const [aiJobsOpen, setAiJobsOpen] = useState(false);
  const [selectedAiJob, setSelectedAiJob] = useState<AiDeckJob | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsDeckId, setStatsDeckId] = useState<string | null>(null);
  const [statsDeckName, setStatsDeckName] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null);
  const [renameDeckName, setRenameDeckName] = useState<string | null>(null);

  const [search, setSearch] = useState(query);
  useEffect(() => {
    setSearch(query);
  }, [query]);

  const searchDebounceMs = 150;
  useEffect(() => {
    const normalized = search.trim().replace(/\s+/g, " ");
    const current = query.trim().replace(/\s+/g, " ");
    if (normalized === current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", String(pageSize));
      if (normalized.length > 0) {
        params.set("q", normalized);
      }
      router.replace(`/create?${params.toString()}`);
    }, searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [pageSize, query, router, search, searchDebounceMs]);

  const deckById = useMemo(() => {
    const map = new Map<string, Deck>();
    for (const deck of decks) {
      map.set(deck.id, deck);
    }
    return map;
  }, [decks]);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuDeckId, setMenuDeckId] = useState<string | null>(null);
  const menuDeck = menuDeckId ? (deckById.get(menuDeckId) ?? null) : null;
  const menuOpen = Boolean(menuAnchor && menuDeck);

  useEffect(() => {
    const active = aiJobs.filter((j) => j.status === "queued" || j.status === "running");
    const activeIds = active.map((j) => j.id);
    const notificationId = "ai_deck_jobs_active";

    if (activeIds.length === 0) {
      dismiss(notificationId);
      return;
    }

    const dismissedKey = "ai_deck_jobs_active_dismissed";
    const dismissedSet = (() => {
      try {
        const raw = window.localStorage.getItem(dismissedKey);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (!Array.isArray(parsed)) {
          return new Set<string>();
        }
        return new Set<string>(parsed.map((v) => String(v)));
      } catch {
        return new Set<string>();
      }
    })();

    const hasUndismissed = activeIds.some((id) => !dismissedSet.has(id));
    if (!hasUndismissed) {
      dismiss(notificationId);
      return;
    }

    notify({
      id: notificationId,
      severity: "info",
      autoHideMs: null,
      message:
        activeIds.length === 1
          ? t("deck.ai_creation_running_single")
          : t("deck.ai_creation_running_multi", { count: activeIds.length }),
      onDismiss: () => {
        try {
          const raw = window.localStorage.getItem(dismissedKey);
          const parsed = raw ? (JSON.parse(raw) as unknown) : null;
          const set = new Set<string>(Array.isArray(parsed) ? parsed.map((v) => String(v)) : []);
          for (const id of activeIds) {
            set.add(id);
          }
          window.localStorage.setItem(dismissedKey, JSON.stringify(Array.from(set)));
        } catch {
          // ignore
        }
      },
    });
  }, [aiJobs, dismiss, notify, t]);

  useEffect(() => {
    const key = "ai_deck_jobs_finished_notified";
    const notified = (() => {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (!Array.isArray(parsed)) {
          return new Set<string>();
        }
        return new Set<string>(parsed.map((v) => String(v)));
      } catch {
        return new Set<string>();
      }
    })();

    const now = Date.now();
    let changed = false;
    for (const job of aiJobs) {
      if (job.status !== "succeeded" && job.status !== "failed") {
        continue;
      }
      if (notified.has(job.id)) {
        continue;
      }
      const updatedAtMs = new Date(job.updatedAt).getTime();
      if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > 15_000) {
        continue;
      }
      if (job.status === "succeeded") {
        notifySuccess("deck.ai_creation_finished");
      } else {
        const err = job.error ? t(job.error) : t("errors.unknown_error");
        notifyError(t("deck.ai_creation_failed", { error: err }));
      }
      notified.add(job.id);
      changed = true;
    }

    if (changed) {
      try {
        window.localStorage.setItem(key, JSON.stringify(Array.from(notified)));
      } catch {
        // ignore
      }
    }
  }, [aiJobs, notifyError, notifySuccess, t]);

  async function archiveDeck(deckId: string) {
    await fetch(`/api/decks/${encodeURIComponent(deckId)}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    }).catch(() => null);
    router.refresh();
  }

  async function deleteDeck(deckId: string) {
    await fetch(`/api/decks/${encodeURIComponent(deckId)}`, { method: "DELETE" }).catch(
      () => null,
    );
    router.refresh();
  }

  async function duplicateDeck(deckId: string) {
    const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}/duplicate`, {
      method: "POST",
    }).catch(() => null);
    if (!res || !res.ok) {
      return;
    }
    router.refresh();
  }

  async function exportDeck(deckId: string, deckName: string) {
    const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}/export`, {
      method: "GET",
      cache: "no-store",
    }).catch(() => null);
    if (!res || !res.ok) {
      return;
    }
    const data = (await res.json().catch(() => null)) as any;
    if (!data?.deck) {
      return;
    }
    const blob = new Blob([JSON.stringify(data.deck, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deckName}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function goToFirstPage() {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("pageSize", String(pageSize));
    if (query.trim().length > 0) {
      params.set("q", query.trim());
    }
    router.push(`/create?${params.toString()}`);
  }

  const activeJobCount = useMemo(() => {
    return aiJobs.filter((j) => j.status === "queued" || j.status === "running").length;
  }, [aiJobs]);

  async function deleteAiJob(jobId: string) {
    await fetch(`/api/decks/ai/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(
      () => null,
    );
    router.refresh();
  }

  async function deleteAllAiJobs() {
    await fetch("/api/decks/ai/jobs", { method: "DELETE" }).catch(() => null);
    router.refresh();
  }

  const selectedAiJobMessages = useMemo(() => {
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
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">{t("deck.decks_title")}</Typography>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: { xs: "flex-start", sm: "flex-end" },
          }}
        >
          <Button onClick={() => setCreateOpen(true)} variant="contained">
            {t("common.create")}
          </Button>
          <Button onClick={() => setAiCreateOpen(true)} variant="outlined">
            {t("deck.create_deck_with_ai")}
          </Button>
          <Button onClick={() => setAiJobsOpen(true)} variant="outlined">
            {t("deck.ai_requests")}
            {activeJobCount > 0 ? ` (${activeJobCount})` : ""}
          </Button>
          <Button onClick={() => setImportOpen(true)} variant="outlined">
            {t("common.import")}
          </Button>
          <Button component={Link} href="/create/archive" variant="outlined">
            {t("common.archive")}
          </Button>
        </Box>
      </Stack>

      <PaginationBar
        onChange={(next) => {
          const params = new URLSearchParams();
          params.set("page", String(next.page));
          params.set("pageSize", String(next.pageSize));
          if (query.trim().length > 0) {
            params.set("q", query.trim());
          }
          router.push(`/create?${params.toString()}`);
        }}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        rightSlot={
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: { xs: "flex-start", sm: "flex-end" },
              flex: { xs: "1 1 100%", sm: "0 0 auto" },
            }}
          >
            <TextField
              label={t("deck.search_decks")}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              value={search}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: { xs: "100%", sm: 260 }, flex: { xs: "1 1 260px", sm: "0 0 auto" } }}
            />
          </Box>
        }
      />

      <Paper elevation={1}>
        <List disablePadding>
          {decks.map((deck) => (
            <ListItem
              disablePadding
              divider
              key={deck.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuAnchor(e.currentTarget);
                    setMenuDeckId(deck.id);
                  }}
                >
                  <IconMoreVert />
                </IconButton>
              }
            >
              <ListItemButton component={Link} href={`/create/${deck.id}`}>
                <ListItemText primary={deck.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>

      <Menu
        anchorEl={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuDeckId(null);
        }}
        open={menuOpen}
      >
        <MenuItem
          onClick={() => {
            setRenameDeckId(menuDeck?.id ?? null);
            setRenameDeckName(menuDeck?.name ?? null);
            setRenameOpen(true);
            setMenuAnchor(null);
          }}
        >
          {t("common.rename")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setStatsOpen(true);
            setStatsDeckId(menuDeck?.id ?? null);
            setStatsDeckName(menuDeck?.name ?? null);
            setMenuAnchor(null);
          }}
        >
          {t("common.statistics")}
        </MenuItem>
        {menuDeck && !menuDeck.isDefault ? (
          <MenuItem
            onClick={() => {
              const id = menuDeck.id;
              const deck = deckById.get(id);
              setMenuAnchor(null);
              if (!deck || deck.isDefault) {
                return;
              }
              void duplicateDeck(id);
            }}
          >
            {t("common.duplicate")}
          </MenuItem>
        ) : null}
        {menuDeck && !menuDeck.isDefault ? (
          <MenuItem
            onClick={() => {
              const id = menuDeck.id;
              const name = menuDeck.name;
              setMenuAnchor(null);
              if (!id) {
                return;
              }
              void exportDeck(id, name);
            }}
          >
            {t("common.export")}
          </MenuItem>
        ) : null}
        {menuDeck && !menuDeck.isDefault ? (
          <MenuItem
            onClick={() => {
              const id = menuDeck.id;
              const deck = deckById.get(id);
              setMenuAnchor(null);
              if (!deck || deck.isDefault) {
                return;
              }
              void archiveDeck(id);
            }}
          >
            {t("common.archive")}
          </MenuItem>
        ) : null}
        {menuDeck && !menuDeck.isDefault ? (
          <MenuItem
            onClick={() => {
              const id = menuDeck.id;
              const deck = deckById.get(id);
              setMenuAnchor(null);
              if (!deck || deck.isDefault) {
                return;
              }
              void deleteDeck(id);
            }}
          >
            {t("common.delete")}
          </MenuItem>
        ) : null}
      </Menu>

      <CreateDeckDialog
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          goToFirstPage();
          router.refresh();
        }}
        open={createOpen}
      />

      <RenameDeckDialog
        deckId={renameDeckId}
        currentName={renameDeckName}
        onClose={() => {
          setRenameOpen(false);
          setRenameDeckId(null);
          setRenameDeckName(null);
        }}
        onRenamed={() => {
          router.refresh();
        }}
        open={renameOpen}
      />

      <AiCreateDeckDialog
        onClose={() => setAiCreateOpen(false)}
        onCreated={() => {
          goToFirstPage();
          router.refresh();
        }}
        open={aiCreateOpen}
      />

      <ImportDeckDialog
        onClose={() => setImportOpen(false)}
        onImported={(_deckId) => {
          goToFirstPage();
          router.refresh();
        }}
        open={importOpen}
      />

      <DeckStatsDialog
        deckId={statsDeckId}
        deckName={statsDeckName}
        onClose={() => setStatsOpen(false)}
        open={statsOpen}
      />

      <Dialog
        fullWidth
        maxWidth="md"
        onClose={() => setAiJobsOpen(false)}
        open={aiJobsOpen}
      >
        <DialogTitle>{t("deck.ai_requests")}</DialogTitle>
        <DialogContent>
          {aiJobs.length === 0 ? (
            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
              {t("deck.no_ai_requests_yet")}
            </Typography>
          ) : (
            <List disablePadding>
              {aiJobs.map((job) => (
                <ListItem
                  disablePadding
                  divider
                  key={job.id}
                  secondaryAction={
                    <IconButton
                      aria-label={t("aria.delete_ai_job")}
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteAiJob(job.id);
                      }}
                      size="small"
                    >
                      <IconDelete fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => setSelectedAiJob(job)} sx={{ pr: 8 }}>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                          <Chip
                            label={t(`ai_job.status_${job.status}`)}
                            size="small"
                            color={
                              job.status === "succeeded"
                                ? "success"
                                : job.status === "failed"
                                  ? "error"
                                  : "default"
                            }
                            variant={job.status === "running" || job.status === "queued" ? "outlined" : "filled"}
                          />
                          <Typography noWrap variant="subtitle2" sx={{ minWidth: 0 }}>
                            {job.prompt.trim().length > 0 ? job.prompt.trim() : t("deck.ai_job_empty_prompt")}
                          </Typography>
                        </Stack>
                      }
                      primaryTypographyProps={{ component: "div" }}
                      secondary={
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          <Typography component="div" color="text.secondary" variant="caption">
                            {t("deck.ai_job_created")} <RelativeTime isoDate={job.createdAt} />
                          </Typography>
                          {job.status === "failed" ? (
                            <Typography component="div" color="error.main" variant="caption">
                              {job.error ? t(job.error) : t("errors.unknown_error")}
                            </Typography>
                          ) : null}
                          {job.deckId ? (
                            <Typography component="div" variant="caption">
                              {t("deck.ai_job_deck_prefix")}{" "}
                              <Typography
                                component={Link}
                                href={`/create/${encodeURIComponent(job.deckId)}`}
                                variant="caption"
                                sx={{ textDecoration: "none" }}
                              >
                                {job.deckName ?? job.deckId}
                              </Typography>
                            </Typography>
                          ) : null}
                        </Stack>
                      }
                      secondaryTypographyProps={{ component: "div" }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={aiJobs.length === 0}
            onClick={() => void deleteAllAiJobs()}
            variant="text"
          >
            {t("common.delete_all")}
          </Button>
          <Button onClick={() => setAiJobsOpen(false)} variant="contained">
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
          <TextField
            label={t("deck.openrouter_request_json")}
            value={selectedAiJobMessages}
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
    </>
  );
}
