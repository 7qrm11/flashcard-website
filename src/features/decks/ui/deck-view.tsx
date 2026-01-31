"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormControlLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import { IconDelete, IconMoreVert, IconSearch } from "@/ui/icons";
import PaginationBar from "@/ui/pagination-bar";
import { useNotifications } from "@/ui/notifications";
import P5SketchFrame from "@/ui/p5-sketch-frame";
import P5SketchEditorDialog from "@/ui/p5-sketch-editor-dialog";
import { useI18n } from "@/ui/i18n";

type Deck = {
  id: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
};

type Flashcard = {
  id: string;
  kind: "basic" | "mcq";
  front: string;
  back: string;
  mcqOptions: string[] | null;
  mcqCorrectIndex: number | null;
  p5Code: string | null;
  p5Width: number | null;
  p5Height: number | null;
  createdAt: string;
};

type FlashcardState = Flashcard & {
  saving: "idle" | "saving" | "error";
};

const FLASHCARD_SAVE_DEBOUNCE_MS = 450;

function optionLabel(index: number) {
  const base = 65;
  const code = base + Math.max(0, Math.min(25, Math.floor(index)));
  return String.fromCharCode(code);
}

function normalizeMcqDraft(options: string[], correctIndex: number | null) {
  const trimmed = options.map((o) => o.trim());
  if (trimmed.length < 2 || trimmed.length > 8) {
    return null;
  }
  if (trimmed.some((o) => o.length === 0)) {
    return null;
  }
  const idx = correctIndex === null ? NaN : Math.floor(Number(correctIndex));
  if (!Number.isFinite(idx) || idx < 0 || idx >= trimmed.length) {
    return null;
  }
  return { options: trimmed, correctIndex: idx };
}

export default function DeckView({
  deck,
  flashcards,
  query,
  page,
  pageSize,
  totalCount,
}: Readonly<{
  deck: Deck;
  flashcards: Flashcard[];
  query: string;
  page: number;
  pageSize: number;
  totalCount: number;
}>) {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t } = useI18n();

  const canEdit = !deck.isArchived;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"add" | "edit">("add");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [search, setSearch] = useState(query);
  useEffect(() => {
    setSearch(query);
  }, [query]);

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
      router.replace(`/create/${encodeURIComponent(deck.id)}?${params.toString()}`);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [deck.id, pageSize, query, router, search]);

  const [cards, setCards] = useState<FlashcardState[]>(
    flashcards.map((card) => ({ ...card, saving: "idle" })),
  );
  useEffect(() => {
    setCards((prev) => {
      const prevById = new Map(prev.map((c) => [c.id, c]));
      return flashcards.map((card) => prevById.get(card.id) ?? { ...card, saving: "idle" });
    });
  }, [flashcards]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [p5EditorOpen, setP5EditorOpen] = useState(false);
  const [p5EditorCardId, setP5EditorCardId] = useState<string | null>(null);
  const p5EditorCard = useMemo(() => {
    if (!p5EditorCardId) {
      return null;
    }
    return cards.find((c) => c.id === p5EditorCardId) ?? null;
  }, [cards, p5EditorCardId]);

  const [newKind, setNewKind] = useState<"basic" | "mcq">("basic");
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [newMcqOptions, setNewMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [newMcqCorrectIndex, setNewMcqCorrectIndex] = useState<number>(0);
  const [newP5EditorOpen, setNewP5EditorOpen] = useState(false);
  const [newP5Code, setNewP5Code] = useState<string | null>(null);
  const [newP5Width, setNewP5Width] = useState<number | null>(null);
  const [newP5Height, setNewP5Height] = useState<number | null>(null);

  useEffect(() => {
    if (error) {
      notifyError(error);
    }
  }, [error, notifyError]);

  useEffect(() => {
    if (aiError) {
      notifyError(aiError);
    }
  }, [aiError, notifyError]);

  const saveTimers = useRef<Map<string, number>>(new Map());
  const saveControllers = useRef<Map<string, AbortController>>(new Map());
  useEffect(() => {
    return () => {
      for (const timer of saveTimers.current.values()) {
        window.clearTimeout(timer);
      }
      saveTimers.current.clear();
      for (const controller of saveControllers.current.values()) {
        controller.abort();
      }
      saveControllers.current.clear();
    };
  }, []);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const menuOpen = Boolean(menuAnchor);

  async function deleteFlashcard(flashcardId: string) {
    if (!canEdit) {
      return;
    }

    const timer = saveTimers.current.get(flashcardId);
    if (timer) {
      window.clearTimeout(timer);
      saveTimers.current.delete(flashcardId);
    }
    const controller = saveControllers.current.get(flashcardId);
    if (controller) {
      controller.abort();
      saveControllers.current.delete(flashcardId);
    }

    const snapshot = cards;
    setCards((prev) => prev.filter((c) => c.id !== flashcardId));
    if (expandedId === flashcardId) {
      setExpandedId(null);
    }

    const res = await fetch(`/api/flashcards/${encodeURIComponent(flashcardId)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) {
      setCards(snapshot);
    }
  }

  const cardSummaryText = useMemo(() => {
    const map = new Map<string, string>();
      for (const card of cards) {
        const trimmed = card.front.trim();
        const label =
          card.kind === "mcq"
            ? t("deck.summary_prefix_mcq")
            : "";
        map.set(
          card.id,
          trimmed.length > 0 ? `${label}${trimmed}` : `${label}${t("deck.empty_flashcard")}`,
        );
      }
    return map;
  }, [cards, t]);

  function scheduleSave(next: FlashcardState) {
    if (!canEdit) {
      return;
    }

    const cardId = next.id;
    const trimmedFront = next.front.trim();
    const trimmedBack = next.back.trim();
    if (trimmedFront.length === 0 || trimmedBack.length === 0) {
      const existingTimer = saveTimers.current.get(cardId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        saveTimers.current.delete(cardId);
      }
      const existingController = saveControllers.current.get(cardId);
      if (existingController) {
        existingController.abort();
        saveControllers.current.delete(cardId);
      }
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, saving: "error" } : c)),
      );
      return;
    }

    const hasMcqDraft = next.kind === "mcq";
    const mcqDraft = hasMcqDraft
      ? normalizeMcqDraft(next.mcqOptions ?? [], next.mcqCorrectIndex)
      : null;
    if (hasMcqDraft && !mcqDraft) {
      const existingTimer = saveTimers.current.get(cardId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        saveTimers.current.delete(cardId);
      }
      const existingController = saveControllers.current.get(cardId);
      if (existingController) {
        existingController.abort();
        saveControllers.current.delete(cardId);
      }
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, saving: "error" } : c)),
      );
      return;
    }

    const p5Code = next.p5Code ? next.p5Code.trim() : "";
    const p5Width =
      typeof next.p5Width === "number" && Number.isFinite(next.p5Width)
        ? Math.floor(next.p5Width)
        : null;
    const p5Height =
      typeof next.p5Height === "number" && Number.isFinite(next.p5Height)
        ? Math.floor(next.p5Height)
        : null;
    const p5DimsOk = p5Width !== null && p5Height !== null;
    const p5 = p5Code.length > 0 ? { code: p5Code, width: p5DimsOk ? p5Width : null, height: p5DimsOk ? p5Height : null } : null;

    const existingTimer = saveTimers.current.get(cardId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, saving: "saving" } : c)),
    );

    const timer = window.setTimeout(async () => {
      const existingController = saveControllers.current.get(cardId);
      if (existingController) {
        existingController.abort();
      }
      const controller = new AbortController();
      saveControllers.current.set(cardId, controller);

      try {
        const res = await fetch(`/api/flashcards/${encodeURIComponent(cardId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: next.kind,
            front: trimmedFront,
            back: trimmedBack,
            mcq: next.kind === "mcq" ? mcqDraft : null,
            p5,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setCards((prev) =>
            prev.map((c) => (c.id === cardId ? { ...c, saving: "error" } : c)),
          );
          return;
        }

        setCards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, saving: "idle" } : c)),
        );
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return;
        }
        setCards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, saving: "error" } : c)),
        );
      }
    }, FLASHCARD_SAVE_DEBOUNCE_MS);

    saveTimers.current.set(cardId, timer);
  }

function patchCard(
    cardId: string,
    patch: Partial<
      Pick<
        FlashcardState,
        "kind" | "front" | "back" | "mcqOptions" | "mcqCorrectIndex" | "p5Code" | "p5Width" | "p5Height"
      >
    >,
  ) {
    let next: FlashcardState | null = null;

    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) {
          return c;
        }
        next = { ...c, ...patch };
        return next;
      }),
    );

    if (next) {
      scheduleSave(next);
    }
  }

  function setMcqOption(
    cardId: string,
    optionIndex: number,
    value: string,
    opts?: Readonly<{ creating?: boolean }>,
  ) {
    if (opts?.creating) {
      setNewMcqOptions((prev) => {
        const next = prev.slice();
        next[optionIndex] = value;
        return next;
      });
      return;
    }

    patchCard(cardId, {
      mcqOptions: (() => {
        const card = cards.find((c) => c.id === cardId);
        const prev = card?.mcqOptions ?? [];
        const next = prev.slice();
        while (next.length <= optionIndex) {
          next.push("");
        }
        next[optionIndex] = value;
        return next;
      })(),
    });
  }

  async function createFlashcard() {
    if (!canEdit) {
      return;
    }

    const trimmedFront = newFront.trim();
    const trimmedBack = newBack.trim();
    if (trimmedFront.length === 0 || trimmedBack.length === 0) {
      return;
    }

    const mcqDraft =
      newKind === "mcq" ? normalizeMcqDraft(newMcqOptions, newMcqCorrectIndex) : null;
    if (newKind === "mcq" && !mcqDraft) {
      return;
    }

    const p5 = (() => {
      const code = newP5Code ? newP5Code.trim() : "";
      if (code.length === 0) {
        return null;
      }
      const width =
        typeof newP5Width === "number" && Number.isFinite(newP5Width)
          ? Math.floor(newP5Width)
          : null;
      const height =
        typeof newP5Height === "number" && Number.isFinite(newP5Height)
          ? Math.floor(newP5Height)
          : null;
      const dimsOk = width !== null && height !== null;
      return { code, width: dimsOk ? width : null, height: dimsOk ? height : null };
    })();

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}/flashcards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: newKind,
          front: trimmedFront,
          back: trimmedBack,
          mcq: mcqDraft ?? undefined,
          p5: p5 ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "deck.could_not_create_flashcard");
        return;
      }

      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      const id = data?.id;
      if (!id) {
        setError("deck.could_not_create_flashcard");
        return;
      }

      const card: FlashcardState = {
        id,
        kind: newKind,
        front: trimmedFront,
        back: trimmedBack,
        mcqOptions: newKind === "mcq" ? mcqDraft!.options : null,
        mcqCorrectIndex: newKind === "mcq" ? mcqDraft!.correctIndex : null,
        p5Code: p5 ? p5.code : null,
        p5Width: p5 ? p5.width : null,
        p5Height: p5 ? p5.height : null,
        createdAt: new Date().toISOString(),
        saving: "idle",
      };
      setCards((prev) => [card, ...prev]);
      setExpandedId(id);
      setNewFront("");
      setNewBack("");
      setNewKind("basic");
      setNewMcqOptions(["", "", "", ""]);
      setNewMcqCorrectIndex(0);
      setNewP5Code(null);
      setNewP5Width(null);
      setNewP5Height(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function createFlashcardsWithAi() {
    if (!canEdit || aiSubmitting) {
      return;
    }

    const trimmed = aiPrompt.trim();
    if (trimmed.length < 1 || trimmed.length > 4000) {
      setAiError("errors.prompt_length");
      return;
    }

    setAiSubmitting(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}/ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, mode: aiMode }),
      }).catch(() => null);

      if (!res || !res.ok) {
        const data = (await res?.json().catch(() => null)) as { error?: string } | null;
        setAiError(data?.error ?? "errors.ai_create_failed");
        return;
      }

      setAiPrompt("");
      setAiMode("add");
      setAiDialogOpen(false);
      router.refresh();
    } finally {
      setAiSubmitting(false);
    }
  }

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ lineHeight: 1.2 }}>
            {deck.name}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {deck.isArchived
              ? t("deck.archived_readonly")
              : deck.isDefault
                ? t("deck.default_deck")
                : " "}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, justifyContent: { xs: "flex-start", sm: "flex-end" } }}>
          {canEdit ? (
            <Button onClick={() => setAiDialogOpen(true)} variant="outlined">
              {t("deck.add_with_ai")}
            </Button>
          ) : null}
          <Button component={Link} href="/create" variant="outlined">
            {t("common.back")}
          </Button>
        </Box>
      </Stack>

      {canEdit ? (
        <Paper elevation={1} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">{t("deck.create_flashcard")}</Typography>
            <ToggleButtonGroup
              exclusive
              onChange={(_e, value) => {
                if (value !== "basic" && value !== "mcq") {
                  return;
                }
                setNewKind(value);
              }}
              size="small"
              value={newKind}
            >
              <ToggleButton value="basic">{t("deck.kind_basic")}</ToggleButton>
              <ToggleButton value="mcq">{t("deck.kind_mcq")}</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              label={
                newKind === "mcq"
                  ? t("deck.field_question")
                  : t("deck.field_front")
              }
              multiline
              minRows={2}
              onChange={(e) => setNewFront(e.target.value)}
              value={newFront}
            />
            <TextField
              label={
                newKind === "mcq"
                  ? t("deck.field_explanation")
                  : t("deck.field_back")
              }
              multiline
              minRows={2}
              onChange={(e) => setNewBack(e.target.value)}
              value={newBack}
            />
            {newKind === "mcq" ? (
              <Stack spacing={1.25}>
                <Typography variant="subtitle2">{t("deck.options")}</Typography>
                <RadioGroup
                  onChange={(e) => {
                    const next = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(next)) {
                      setNewMcqCorrectIndex(next);
                    }
                  }}
                  value={String(newMcqCorrectIndex)}
                >
                  <Stack spacing={1}>
                    {newMcqOptions.map((opt, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1,
                        }}
                      >
                        <FormControlLabel
                          control={<Radio size="small" />}
                          label={optionLabel(idx)}
                          sx={{ mt: 1.1, mr: 0.5 }}
                          value={String(idx)}
                        />
                        <TextField
                          fullWidth
                          label={`${t("deck.option")} ${optionLabel(idx)}`}
                          onChange={(e) => setMcqOption("", idx, e.target.value, { creating: true })}
                          value={opt}
                        />
                        <IconButton
                          aria-label={t("deck.remove_option")}
                          disabled={newMcqOptions.length <= 2}
                          onClick={() => {
                            setNewMcqOptions((prev) => {
                              if (prev.length <= 2) {
                                return prev;
                              }
                              const next = prev.slice();
                              next.splice(idx, 1);
                              return next;
                            });
                            setNewMcqCorrectIndex((prev) => {
                              if (idx === prev) {
                                return 0;
                              }
                              if (idx < prev) {
                                return Math.max(0, prev - 1);
                              }
                              return prev;
                            });
                          }}
                          size="small"
                          sx={{ mt: 1 }}
                        >
                          <IconDelete fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        disabled={newMcqOptions.length >= 8}
                        onClick={() => {
                          setNewMcqOptions((prev) => (prev.length >= 8 ? prev : [...prev, ""]));
                        }}
                        size="small"
                        variant="text"
                      >
                        {t("deck.add_option")}
                      </Button>
                    </Box>
                  </Stack>
                </RadioGroup>
              </Stack>
            ) : null}
            {newP5Code && newP5Code.trim().length > 0 ? (
              <Stack spacing={1}>
                <P5SketchFrame
                  code={newP5Code}
                  height={newP5Height}
                  title={t("deck.p5_title")}
                  width={newP5Width}
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
                  <Button onClick={() => setNewP5EditorOpen(true)} size="small" variant="text">
                    {t("deck.edit_sketch")}
                  </Button>
                  <Button
                    color="error"
                    onClick={() => {
                      setNewP5Code(null);
                      setNewP5Width(null);
                      setNewP5Height(null);
                    }}
                    size="small"
                    variant="text"
                  >
                    {t("deck.remove_sketch")}
                  </Button>
                </Box>
              </Stack>
            ) : (
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button onClick={() => setNewP5EditorOpen(true)} size="small" variant="text">
                  {t("deck.add_sketch")}
                </Button>
              </Box>
            )}
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                disabled={
                  submitting ||
                  newFront.trim().length === 0 ||
                  newBack.trim().length === 0 ||
                  (newKind === "mcq" && !normalizeMcqDraft(newMcqOptions, newMcqCorrectIndex))
                }
                onClick={() => void createFlashcard()}
                variant="contained"
              >
                {t("common.create")}
              </Button>
            </Box>
          </Stack>
        </Paper>
      ) : null}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="h6">{t("deck.flashcards")}</Typography>
      </Stack>

      <PaginationBar
        onChange={(next) => {
          const params = new URLSearchParams();
          params.set("page", String(next.page));
          params.set("pageSize", String(next.pageSize));
          if (query.trim().length > 0) {
            params.set("q", query.trim());
          }
          router.push(`/create/${encodeURIComponent(deck.id)}?${params.toString()}`);
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
              label={t("deck.search_flashcards")}
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
              sx={{
                minWidth: { xs: "100%", sm: 320 },
                flex: { xs: "1 1 320px", sm: "0 0 auto" },
              }}
            />
          </Box>
        }
      />

      <Stack spacing={1}>
        {cards.map((card) => (
          <Accordion
            disableGutters
            elevation={1}
            expanded={expandedId === card.id}
            key={card.id}
            onChange={(_e, expanded) => setExpandedId(expanded ? card.id : null)}
            sx={{ "&:before": { display: "none" } }}
          >
            <AccordionSummary
              aria-controls={`${card.id}-content`}
              id={`${card.id}-header`}
              sx={{
                px: 2,
                "& .MuiAccordionSummary-content": {
                  alignItems: "center",
                  gap: 1,
                },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap variant="subtitle1">
                  {cardSummaryText.get(card.id)}
                </Typography>
                {card.saving === "saving" ? (
                  <Typography color="text.secondary" variant="caption">
                    {t("deck.saving")}
                  </Typography>
                ) : card.saving === "error" ? (
                  <Typography color="error.main" variant="caption">
                    {t("common.could_not_save")}
                  </Typography>
                ) : null}
              </Box>
              {canEdit ? (
                <IconButton
                  aria-label={t("deck.flashcard_options")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuAnchor(e.currentTarget);
                    setMenuCardId(card.id);
                  }}
                  size="small"
                >
                  <IconMoreVert fontSize="small" />
                </IconButton>
              ) : null}
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pb: 2 }}>
              <Paper elevation={0} sx={{ p: 0 }}>
                <Stack spacing={2}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="subtitle2">
                      {card.kind === "mcq" ? t("deck.kind_mcq") : t("deck.kind_basic")}
                    </Typography>
                    {canEdit ? (
                      <ToggleButtonGroup
                        exclusive
                        onChange={(_e, value) => {
                          if (value !== "basic" && value !== "mcq") {
                            return;
                          }
                          if (value === card.kind) {
                            return;
                          }
                          if (value === "basic") {
                            patchCard(card.id, {
                              kind: "basic",
                              mcqOptions: null,
                              mcqCorrectIndex: null,
                            });
                            return;
                          }
                          const currentOptions =
                            Array.isArray(card.mcqOptions) && card.mcqOptions.length >= 2
                              ? card.mcqOptions
                              : ["", "", "", ""];
                          patchCard(card.id, {
                            kind: "mcq",
                            mcqOptions: currentOptions,
                            mcqCorrectIndex:
                              typeof card.mcqCorrectIndex === "number" ? card.mcqCorrectIndex : 0,
                          });
                        }}
                        size="small"
                        value={card.kind}
                      >
                        <ToggleButton value="basic">{t("deck.kind_basic")}</ToggleButton>
                        <ToggleButton value="mcq">{t("deck.kind_mcq")}</ToggleButton>
                      </ToggleButtonGroup>
                    ) : null}
                  </Box>
                  <TextField
                    disabled={!canEdit}
                    label={
                      card.kind === "mcq"
                        ? t("deck.field_question")
                        : t("deck.field_front")
                    }
                    multiline
                    minRows={2}
                    onChange={(e) => patchCard(card.id, { front: e.target.value })}
                    value={card.front}
                  />
                  <TextField
                    disabled={!canEdit}
                    label={
                      card.kind === "mcq"
                        ? t("deck.field_explanation")
                        : t("deck.field_back")
                    }
                    multiline
                    minRows={2}
                    onChange={(e) => patchCard(card.id, { back: e.target.value })}
                    value={card.back}
                  />
                  {card.p5Code ? (
                    <Stack spacing={1}>
                      <P5SketchFrame
                        code={card.p5Code}
                        height={card.p5Height}
                        title={t("deck.p5_title")}
                        width={card.p5Width}
                      />
                      {canEdit ? (
                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
                          <Button
                            onClick={() => {
                              setP5EditorCardId(card.id);
                              setP5EditorOpen(true);
                            }}
                            size="small"
                            variant="text"
                          >
                            {t("deck.edit_sketch")}
                          </Button>
                          <Button
                            color="error"
                            onClick={() =>
                              patchCard(card.id, { p5Code: null, p5Width: null, p5Height: null })
                            }
                            size="small"
                            variant="text"
                          >
                            {t("deck.remove_sketch")}
                          </Button>
                        </Box>
                      ) : null}
                    </Stack>
                  ) : canEdit ? (
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        onClick={() => {
                          setP5EditorCardId(card.id);
                          setP5EditorOpen(true);
                        }}
                        size="small"
                        variant="text"
                      >
                        {t("deck.add_sketch")}
                      </Button>
                    </Box>
                  ) : null}
                  {card.kind === "mcq" ? (
                    <Stack spacing={1.25}>
                      <Typography variant="subtitle2">{t("deck.options")}</Typography>
                      <RadioGroup
                        onChange={(e) => {
                          const nextIndex = Number((e.target as HTMLInputElement).value);
                          if (!Number.isFinite(nextIndex)) {
                            return;
                          }
                          patchCard(card.id, {
                            mcqCorrectIndex: nextIndex,
                          });
                        }}
                        value={String(card.mcqCorrectIndex ?? 0)}
                      >
                        <Stack spacing={1}>
                          {(card.mcqOptions ?? ["", "", "", ""]).map((opt, idx) => (
                            <Box
                              key={idx}
                              sx={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 1,
                              }}
                            >
                              <FormControlLabel
                                control={<Radio size="small" />}
                                label={optionLabel(idx)}
                                sx={{ mt: 1.1, mr: 0.5 }}
                                value={String(idx)}
                              />
                              <TextField
                                disabled={!canEdit}
                                fullWidth
                                label={`${t("deck.option")} ${optionLabel(idx)}`}
                                onChange={(e) => {
                                  const nextOptions = (() => {
                                    const prev = card.mcqOptions ?? [];
                                    const next = prev.slice();
                                    while (next.length <= idx) {
                                      next.push("");
                                    }
                                    next[idx] = e.target.value;
                                    return next;
                                  })();
                                  patchCard(card.id, { mcqOptions: nextOptions });
                                }}
                                value={opt}
                              />
                              {canEdit ? (
                                <IconButton
                                  aria-label={t("deck.remove_option")}
                                  disabled={(card.mcqOptions?.length ?? 0) <= 2}
                                  onClick={() => {
                                    const prev = card.mcqOptions ?? [];
                                    if (prev.length <= 2) {
                                      return;
                                    }
                                    const next = prev.slice();
                                    next.splice(idx, 1);
                                    const prevCorrect = card.mcqCorrectIndex ?? 0;
                                    const nextCorrect =
                                      idx === prevCorrect
                                        ? 0
                                        : idx < prevCorrect
                                          ? Math.max(0, prevCorrect - 1)
                                          : prevCorrect;
                                    patchCard(card.id, {
                                      mcqOptions: next,
                                      mcqCorrectIndex: nextCorrect,
                                    });
                                  }}
                                  size="small"
                                  sx={{ mt: 1 }}
                                >
                                  <IconDelete fontSize="small" />
                                </IconButton>
                              ) : null}
                            </Box>
                          ))}
                          {canEdit ? (
                            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                              <Button
                                disabled={(card.mcqOptions?.length ?? 0) >= 8}
                                onClick={() => {
                                  const prev = card.mcqOptions ?? [];
                                  if (prev.length >= 8) {
                                    return;
                                  }
                                  patchCard(card.id, { mcqOptions: [...prev, ""] });
                                }}
                                size="small"
                                variant="text"
                              >
                                {t("deck.add_option")}
                              </Button>
                            </Box>
                          ) : null}
                        </Stack>
                      </RadioGroup>
                    </Stack>
                  ) : null}
                </Stack>
              </Paper>
            </AccordionDetails>
          </Accordion>
        ))}
        {cards.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {query.trim().length > 0 ? t("deck.no_results") : t("deck.no_flashcards_yet")}
          </Typography>
        ) : null}
      </Stack>

      <Menu
        anchorEl={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuCardId(null);
        }}
        open={menuOpen}
      >
        <MenuItem
          onClick={() => {
            const id = menuCardId;
            setMenuAnchor(null);
            setMenuCardId(null);
            if (!id) {
              return;
            }
            void deleteFlashcard(id);
          }}
        >
          {t("common.delete")}
        </MenuItem>
      </Menu>

      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (aiSubmitting) {
            return;
          }
          setAiDialogOpen(false);
          setAiError(null);
          setAiPrompt("");
          setAiMode("add");
        }}
        open={aiDialogOpen}
      >
        <DialogTitle>{t("deck.add_flashcards_with_ai")}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            {t("deck.ai_uses_settings_action", {
              action: t(aiMode === "edit" ? "deck.ai_action_edits" : "deck.ai_action_creates"),
            })}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            {t("deck.ai_prompt_helper")}
          </Typography>
          <ToggleButtonGroup
            exclusive
            onChange={(_e, value) => {
              if (value !== "add" && value !== "edit") {
                return;
              }
              setAiMode(value);
            }}
            size="small"
            sx={{ mt: 2 }}
            value={aiMode}
          >
            <ToggleButton value="add">{t("deck.ai_mode_add_new")}</ToggleButton>
            <ToggleButton value="edit">{t("deck.ai_mode_edit_existing")}</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            autoFocus
            label={t("deck.ai_prompt_label")}
            multiline
            minRows={4}
            onChange={(e) => setAiPrompt(e.target.value)}
            value={aiPrompt}
            fullWidth
            sx={{ mt: 2.25 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            disabled={aiSubmitting}
            onClick={() => {
              setAiDialogOpen(false);
              setAiError(null);
              setAiPrompt("");
              setAiMode("add");
            }}
            variant="text"
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={aiSubmitting}
            onClick={() => void createFlashcardsWithAi()}
            variant="contained"
          >
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      <P5SketchEditorDialog
        open={p5EditorOpen}
        title={t(p5EditorCard?.p5Code ? "deck.edit_sketch" : "deck.add_sketch")}
        initialCode={p5EditorCard?.p5Code ?? null}
        initialWidth={p5EditorCard?.p5Width ?? null}
        initialHeight={p5EditorCard?.p5Height ?? null}
        onClose={() => {
          setP5EditorOpen(false);
          setP5EditorCardId(null);
        }}
        onSave={(value) => {
          const id = p5EditorCardId;
          setP5EditorOpen(false);
          setP5EditorCardId(null);
          if (!id) {
            return;
          }
          const code = value.code ? value.code.trim() : "";
          if (code.length > 0) {
            patchCard(id, { p5Code: code, p5Width: value.width, p5Height: value.height });
            return;
          }
          patchCard(id, { p5Code: null, p5Width: null, p5Height: null });
        }}
      />

      <P5SketchEditorDialog
        open={newP5EditorOpen}
        title={t(
          newP5Code && newP5Code.trim().length > 0 ? "deck.edit_sketch" : "deck.add_sketch",
        )}
        initialCode={newP5Code ?? null}
        initialWidth={newP5Width}
        initialHeight={newP5Height}
        onClose={() => {
          setNewP5EditorOpen(false);
        }}
        onSave={(value) => {
          setNewP5EditorOpen(false);
          const code = value.code ? value.code.trim() : "";
          if (code.length === 0) {
            setNewP5Code(null);
            setNewP5Width(null);
            setNewP5Height(null);
            return;
          }
          setNewP5Code(code);
          setNewP5Width(value.width);
          setNewP5Height(value.height);
        }}
      />
    </>
  );
}
