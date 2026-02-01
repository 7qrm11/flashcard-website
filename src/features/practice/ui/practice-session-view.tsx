"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";

import { IconChevronLeft, IconChevronRight } from "@/ui/icons";
import LatexTypography from "@/ui/latex-typography";
import RichContentRenderer from "@/ui/rich-content-renderer";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

type PracticeView = {
  ok: true;
  session: {
    id: string;
    deckId: string;
    deckName: string;
    status: "active" | "ended";
    state: "intro" | "front" | "back" | "past" | "done";
    progressIndex: number;
    viewIndex: number;
    queueLength: number;
    current: null | {
      position: number;
      flashcardId: string;
      isNovel: boolean;
      kind: "basic" | "mcq";
      front: string;
      back: string;
      mcqOptions: string[] | null;
      mcqCorrectIndex: number | null;
      p5Code: string | null;
      p5Width: number | null;
      p5Height: number | null;
      answered: null | { correct: boolean; timeMs: number };
    };
  };
};

function optionLabel(index: number) {
  const base = 65;
  const code = base + Math.max(0, Math.min(25, Math.floor(index)));
  return String.fromCharCode(code);
}

export default function PracticeSessionView({
  deckId,
  sessionId: initialSessionId,
}: Readonly<{
  deckId: string;
  sessionId: string | null;
}>) {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t } = useI18n();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<PracticeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixingPast, setFixingPast] = useState(false);

  useEffect(() => {
    if (error) {
      notifyError(error);
    }
  }, [error, notifyError]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      setView(null);
      setSessionId(initialSessionId);
      try {
        let sid = initialSessionId;
        if (!sid) {
          const res = await fetch("/api/practice/sessions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deckId }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!cancelled) {
              setError(data?.error ?? "errors.could_not_start_session");
            }
            return;
          }
          const data = (await res.json()) as { sessionId?: string };
          if (!data.sessionId) {
            if (!cancelled) {
              setError("errors.could_not_start_session");
            }
            return;
          }
          sid = data.sessionId;
          if (cancelled) {
            return;
          }
          setSessionId(sid);
        }

        const viewRes = await fetch(`/api/practice/sessions/${encodeURIComponent(sid)}`, {
          cache: "no-store",
        });
        if (!viewRes.ok) {
          const errData = (await viewRes.json().catch(() => null)) as { error?: string } | null;
          setError(errData?.error ?? "errors.could_not_load_session");
          return;
        }
        const v = (await viewRes.json()) as PracticeView;
        setView(v);
      } catch {
        if (!cancelled) {
          setError("errors.could_not_start_session");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deckId, initialSessionId]);

  const session = view?.session ?? null;
  const current = session?.current ?? null;
  const hasMcq =
    !!current &&
    Array.isArray(current.mcqOptions) &&
    current.mcqOptions.length >= 2 &&
    current.mcqCorrectIndex !== null &&
    current.mcqCorrectIndex >= 0 &&
    current.mcqCorrectIndex < current.mcqOptions.length;
  const hasP5 = false; // p5 is now inline in text, no separate handling needed

  const [selectedMcqIndex, setSelectedMcqIndex] = useState<number | null>(null);
  useEffect(() => {
    setSelectedMcqIndex(null);
  }, [current?.flashcardId]);

  const autoAnsweredMcqRef = useRef<string | null>(null);
  useEffect(() => {
    autoAnsweredMcqRef.current = null;
  }, [current?.flashcardId]);

  useEffect(() => {
    if (!session || !current || !hasMcq) {
      return;
    }
    if (session.state !== "back") {
      return;
    }
    if (selectedMcqIndex === null) {
      return;
    }
    if (current.answered) {
      return;
    }
    if (busy) {
      return;
    }
    if (autoAnsweredMcqRef.current === current.flashcardId) {
      return;
    }
    autoAnsweredMcqRef.current = current.flashcardId;

    const correct = selectedMcqIndex === current.mcqCorrectIndex;
    void sendEvent({ type: "answer", correct });
  }, [busy, current, hasMcq, selectedMcqIndex, session]);

  useEffect(() => {
    if (!session || !current || !hasMcq) {
      return;
    }
    if (session.state !== "back") {
      return;
    }
    if (!current.answered) {
      return;
    }
    if (busy) {
      return;
    }
    const timer = window.setTimeout(() => {
      void sendEvent({ type: "advance" });
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [busy, current?.answered?.correct, current?.flashcardId, hasMcq, session?.state]);

  useEffect(() => {
    setFixingPast(false);
  }, [session?.state, session?.viewIndex]);

  const canGoPrev = useMemo(() => {
    return !!session && session.viewIndex > 0;
  }, [session]);
  const canGoNext = useMemo(() => {
    return !!session && session.viewIndex < session.progressIndex;
  }, [session]);

  async function sendEvent(body: unknown) {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/practice/sessions/${encodeURIComponent(sessionId)}/event`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "errors.action_failed");
        return;
      }
      const next = (await res.json()) as PracticeView;
      setView(next);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap variant="h5">
            {session?.deckName ?? t("nav.practice")}
          </Typography>
          {session ? (
            <Typography color="text.secondary" variant="body2">
              {session.queueLength === 0
                ? t("practice.no_flashcards_available")
                : t("practice.card_of", {
                  current: Math.min(session.viewIndex + 1, session.queueLength),
                  total: session.queueLength,
                })}
            </Typography>
          ) : null}
        </Box>

        <Box sx={{ display: "flex", gap: 1, justifyContent: { xs: "flex-start", sm: "flex-end" } }}>
          <Button component={Link} href="/practice" variant="outlined">
            {t("common.back")}
          </Button>
        </Box>
      </Stack>

      {!session ? (
        <Typography color="text.secondary" variant="body2">
          {t("common.loading")}
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
              gap: 1,
              maxWidth: 720,
              mx: "auto",
            }}
          >
            <Button
              disabled={!canGoPrev || busy}
              onClick={() => void sendEvent({ type: "navigate", to: session.viewIndex - 1 })}
              startIcon={<IconChevronLeft />}
              variant="text"
            >
              {t("common.back")}
            </Button>
            <Button
              disabled={!canGoNext || busy}
              endIcon={<IconChevronRight />}
              onClick={() => void sendEvent({ type: "navigate", to: session.viewIndex + 1 })}
              variant="text"
            >
              {t("common.next")}
            </Button>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Paper
              elevation={2}
              onClick={() => {
                if (busy) {
                  return;
                }
                if (session.state === "intro") {
                  void sendEvent({ type: "start" });
                  return;
                }
                if (session.state === "back" && current?.answered) {
                  void sendEvent({ type: "advance" });
                  return;
                }
                if (session.state === "front") {
                  if (hasMcq) {
                    return;
                  }
                  void sendEvent({ type: "revealBack" });
                }
              }}
              sx={{
                p: { xs: 2.5, sm: 4 },
                minHeight: { xs: 260, sm: 320 },
                maxWidth: 720,
                width: "100%",
                cursor:
                  session.state === "intro" ||
                    (session.state === "front" && !hasMcq) ||
                    (session.state === "back" && !!current?.answered)
                    ? "pointer"
                    : "default",
                userSelect: "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: session.state === "intro" ? "center" : hasMcq || hasP5 ? "stretch" : "center",
                textAlign: session.state === "intro" ? "center" : hasMcq || hasP5 ? "left" : "center",
                gap: 2,
              }}
            >
              {session.queueLength === 0 || session.state === "done" ? (
                <Typography color="text.secondary" variant="body1">
                  {t("common.done")}
                </Typography>
              ) : current ? (
                session.state === "intro" ? (
                  <Typography color="text.secondary" variant="body1" sx={{ textAlign: "center", width: "100%" }}>
                    {t("practice.click_to_show_front")}
                  </Typography>
                ) : session.state === "front" ? (
                  <Stack spacing={2} sx={{ width: "100%" }}>
                    <RichContentRenderer
                      component="div"
                      text={current.front.length > 0 ? current.front : t("practice.empty_front")}
                      variant="h5"
                      sx={{ textAlign: "center" }}
                      p5Title={t("practice.p5_title")}
                    />
                    {hasMcq ? (
                      <Stack spacing={1}>
                        {current.mcqOptions!.map((opt, optIdx) => {
                          const selected = selectedMcqIndex === optIdx;
                          return (
                            <Button
                              key={optIdx}
                              fullWidth
                              disabled={busy}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedMcqIndex(optIdx);
                                void sendEvent({ type: "revealBack" });
                              }}
                              variant={selected ? "contained" : "outlined"}
                              sx={{
                                justifyContent: "flex-start",
                                textAlign: "left",
                                textTransform: "none",
                                py: 1,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 1,
                                  alignItems: "flex-start",
                                  width: "100%",
                                }}
                              >
                                <Typography
                                  component="span"
                                  sx={{ fontWeight: 700, minWidth: 18, lineHeight: 1.6 }}
                                >
                                  {optionLabel(optIdx)}.
                                </Typography>
                                <LatexTypography
                                  component="span"
                                  text={opt}
                                  variant="body1"
                                  sx={{ flex: 1 }}
                                />
                              </Box>
                            </Button>
                          );
                        })}
                        <Typography color="text.secondary" variant="caption" sx={{ textAlign: "center" }}>
                          {t("practice.choose_option_to_reveal")}
                        </Typography>
                      </Stack>
                    ) : null}
                  </Stack>
                ) : session.state === "back" ? (
                  <Stack spacing={2} sx={{ width: "100%" }}>
                    <RichContentRenderer
                      component="div"
                      text={current.front.length > 0 ? current.front : t("practice.empty_front")}
                      variant="h6"
                      p5Title={t("practice.p5_title")}
                    />
                    {hasMcq ? (
                      <Stack spacing={1}>
                        {current.mcqOptions!.map((opt, optIdx) => {
                          const isCorrect = optIdx === current.mcqCorrectIndex;
                          const isSelected = selectedMcqIndex === optIdx;
                          return (
                            <Button
                              key={optIdx}
                              fullWidth
                              disabled={busy}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedMcqIndex(optIdx);
                                void sendEvent({
                                  type: "answer",
                                  correct: optIdx === current.mcqCorrectIndex,
                                });
                              }}
                              variant="outlined"
                              sx={{
                                justifyContent: "flex-start",
                                textAlign: "left",
                                textTransform: "none",
                                py: 1,
                                borderColor: isCorrect
                                  ? "success.main"
                                  : isSelected
                                    ? "primary.main"
                                    : "divider",
                                backgroundColor: isCorrect
                                  ? "success.light"
                                  : isSelected
                                    ? "action.selected"
                                    : "transparent",
                                "&:hover": {
                                  borderColor: isCorrect
                                    ? "success.main"
                                    : isSelected
                                      ? "primary.main"
                                      : "text.primary",
                                  backgroundColor: isCorrect
                                    ? "success.light"
                                    : isSelected
                                      ? "action.selected"
                                      : "action.hover",
                                },
                                color: "text.primary",
                              }}
                            >
                              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", width: "100%" }}>
                                <Typography
                                  component="span"
                                  sx={{ fontWeight: 700, minWidth: 18, lineHeight: 1.6 }}
                                >
                                  {optionLabel(optIdx)}.
                                </Typography>
                                <LatexTypography
                                  component="span"
                                  text={opt}
                                  variant="body1"
                                  sx={{ flex: 1 }}
                                />
                              </Box>
                            </Button>
                          );
                        })}
                        <Typography color="text.secondary" variant="caption">
                          {selectedMcqIndex === null
                            ? t("practice.no_selection")
                            : t("practice.your_selection", {
                              value: optionLabel(selectedMcqIndex),
                            })}
                        </Typography>
                        <Typography color="text.secondary" variant="caption">
                          {t("practice.correct_answer", { value: optionLabel(current.mcqCorrectIndex!) })}
                        </Typography>
                        {current.answered ? (
                          <Typography color="text.secondary" variant="caption">
                            {t("practice.click_to_continue_auto")}
                          </Typography>
                        ) : null}
                      </Stack>
                    ) : null}
                    <Divider flexItem />
                    <RichContentRenderer
                      component="div"
                      text={current.back.length > 0 ? current.back : t("practice.empty_back")}
                      variant="body1"
                      p5Title={t("practice.p5_title")}
                    />
                  </Stack>
                ) : (
                  <Stack spacing={2} sx={{ width: "100%" }}>
                    <RichContentRenderer
                      component="div"
                      text={current.front.length > 0 ? current.front : t("practice.empty_front")}
                      variant="h6"
                      p5Title={t("practice.p5_title")}
                    />
                    {hasMcq ? (
                      <Stack spacing={1.25}>
                        {current.mcqOptions!.map((opt, optIdx) => {
                          const isCorrect = optIdx === current.mcqCorrectIndex;
                          const isSelected = selectedMcqIndex === optIdx;
                          return (
                            <Box
                              key={optIdx}
                              sx={{
                                p: 1.25,
                                borderRadius: 1,
                                border: "1px solid",
                                borderColor: isCorrect
                                  ? "success.main"
                                  : isSelected
                                    ? "primary.main"
                                    : "divider",
                                backgroundColor: isCorrect
                                  ? "success.light"
                                  : isSelected
                                    ? "action.selected"
                                    : "transparent",
                              }}
                            >
                              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                                <Typography
                                  component="span"
                                  sx={{ fontWeight: 700, minWidth: 18, lineHeight: 1.5 }}
                                >
                                  {optionLabel(optIdx)}.
                                </Typography>
                                <LatexTypography
                                  component="span"
                                  text={opt}
                                  variant="body1"
                                  sx={{ flex: 1 }}
                                />
                              </Box>
                            </Box>
                          );
                        })}
                        <Typography color="text.secondary" variant="caption">
                          {selectedMcqIndex === null
                            ? t("practice.no_selection")
                            : t("practice.your_selection", {
                              value: optionLabel(selectedMcqIndex),
                            })}
                        </Typography>
                        <Typography color="text.secondary" variant="caption">
                          {t("practice.correct_answer", { value: optionLabel(current.mcqCorrectIndex!) })}
                        </Typography>
                      </Stack>
                    ) : null}
                    <Divider flexItem />
                    <RichContentRenderer
                      component="div"
                      text={current.back.length > 0 ? current.back : t("practice.empty_back")}
                      variant="body1"
                      p5Title={t("practice.p5_title")}
                    />
                    {current.answered ? (
                      <Typography color="text.secondary" variant="caption">
                        {t("practice.your_answer", {
                          value: current.answered.correct ? t("practice.answer_correct") : t("practice.answer_incorrect"),
                        })}
                      </Typography>
                    ) : null}
                  </Stack>
                )
              ) : (
                <Typography color="text.secondary" variant="body1">
                  {t("common.done")}
                </Typography>
              )}
            </Paper>
          </Box>

          {session.state === "back" ? (
            hasMcq ? null : (
              <Box sx={{ mt: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                  <Button
                    disabled={busy}
                    onClick={() => void sendEvent({ type: "answer", correct: false })}
                    variant="outlined"
                  >
                    {t("practice.answer_incorrect")}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void sendEvent({ type: "answer", correct: true })}
                    variant="contained"
                  >
                    {t("practice.answer_correct")}
                  </Button>
                </Box>
                {current?.answered ? (
                  <Typography color="text.secondary" variant="caption" sx={{ mt: 1 }}>
                    {t("practice.click_card_to_continue")}
                  </Typography>
                ) : null}
                {canGoPrev ? (
                  <Button
                    disabled={busy}
                    onClick={() => void sendEvent({ type: "navigate", to: session.viewIndex - 1 })}
                    size="small"
                    variant="text"
                    sx={{ mt: 1 }}
                  >
                    {t("practice.fix_a_mistake")}
                  </Button>
                ) : null}
              </Box>
            )
          ) : session.state === "past" ? (
            <Box sx={{ mt: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                <Button
                  disabled={busy || !fixingPast}
                  onClick={() => void sendEvent({ type: "setOutcome", correct: false })}
                  variant="outlined"
                >
                  {t("practice.mark_incorrect")}
                </Button>
                <Button
                  disabled={busy || !fixingPast}
                  onClick={() => void sendEvent({ type: "setOutcome", correct: true })}
                  variant="contained"
                >
                  {t("practice.mark_correct")}
                </Button>
              </Box>
              {!fixingPast ? (
                <Button
                  disabled={busy}
                  onClick={() => setFixingPast(true)}
                  size="small"
                  variant="text"
                  sx={{ mt: 1 }}
                >
                  {t("practice.fix_your_mistake")}
                </Button>
              ) : null}
            </Box>
          ) : null}

          {session.status === "ended" ? (
            <Box sx={{ mt: 3 }}>
              <Button
                onClick={() => {
                  router.push("/practice");
                  router.refresh();
                }}
                variant="text"
              >
                {t("common.exit")}
              </Button>
            </Box>
          ) : null}
        </>
      )}
    </>
  );
}
