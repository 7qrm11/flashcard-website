"use client";

import { useEffect, useState } from "react";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

export default function DeckStatsDialog({
  open,
  deckId,
  deckName,
  onClose,
}: Readonly<{
  open: boolean;
  deckId: string | null;
  deckName: string | null;
  onClose: () => void;
}>) {
  const { notifyError } = useNotifications();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    flashcards: { total: number; novel: number; learned: number; dueNow: number };
    reviews: {
      total: number;
      correct: number;
      accuracy: number | null;
      avgTimeMs: number | null;
      medianTimeMs: number | null;
      lastPracticedAt: string | null;
      last7d: {
        total: number;
        correct: number;
        accuracy: number | null;
        avgTimeMs: number | null;
        medianTimeMs: number | null;
      };
    };
  } | null>(null);

  useEffect(() => {
    if (error) {
      notifyError(error);
    }
  }, [error, notifyError]);

  function formatPercent(value: number | null) {
    if (value === null) {
      return "—";
    }
    const pct = Math.round(value * 1000) / 10;
    return `${pct}%`;
  }

  function formatTimeMs(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
      return "—";
    }
    if (value < 1000) {
      return `${Math.round(value)} ms`;
    }
    const seconds = Math.round((value / 1000) * 10) / 10;
    return `${seconds} s`;
  }

  function formatDateTime(value: string | null) {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return date.toLocaleString();
  }

  useEffect(() => {
    if (!open || !deckId) {
      setError(null);
      setStats(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}/stats`, {
          cache: "no-store",
        });
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!cancelled) {
              setError(data?.error ?? "errors.could_not_load_stats");
            }
            return;
          }

        const data = (await res.json()) as {
          flashcards?: { total?: number; novel?: number; learned?: number; dueNow?: number };
          reviews?: {
            total?: number;
            correct?: number;
            accuracy?: number | null;
            avgTimeMs?: number | null;
            medianTimeMs?: number | null;
            lastPracticedAt?: string | null;
            last7d?: {
              total?: number;
              correct?: number;
              accuracy?: number | null;
              avgTimeMs?: number | null;
              medianTimeMs?: number | null;
            };
          };
        };
        if (!cancelled) {
          setStats({
            flashcards: {
              total: Number(data.flashcards?.total ?? 0),
              novel: Number(data.flashcards?.novel ?? 0),
              learned: Number(data.flashcards?.learned ?? 0),
              dueNow: Number(data.flashcards?.dueNow ?? 0),
            },
            reviews: {
              total: Number(data.reviews?.total ?? 0),
              correct: Number(data.reviews?.correct ?? 0),
              accuracy: data.reviews?.accuracy ?? null,
              avgTimeMs: data.reviews?.avgTimeMs ?? null,
              medianTimeMs: data.reviews?.medianTimeMs ?? null,
              lastPracticedAt: data.reviews?.lastPracticedAt ?? null,
              last7d: {
                total: Number(data.reviews?.last7d?.total ?? 0),
                correct: Number(data.reviews?.last7d?.correct ?? 0),
                accuracy: data.reviews?.last7d?.accuracy ?? null,
                avgTimeMs: data.reviews?.last7d?.avgTimeMs ?? null,
                medianTimeMs: data.reviews?.last7d?.medianTimeMs ?? null,
              },
            },
          });
        }
      } catch {
        if (!cancelled) {
          setError("errors.could_not_load_stats");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, deckId]);

  return (
    <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
      <DialogTitle>{t("common.statistics")}</DialogTitle>
      <DialogContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {deckName ?? t("common.deck")}
        </Typography>
        {loading ? (
          <Typography color="text.secondary" variant="body2">
            {t("common.loading")}
          </Typography>
        ) : error ? (
          <Typography color="text.secondary" variant="body2">
            {t(error)}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {t("deck.stats_cards")}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_total")}: {stats?.flashcards.total ?? 0}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_novel")}: {stats?.flashcards.novel ?? 0}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_learned")}: {stats?.flashcards.learned ?? 0}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_due_now")}: {stats?.flashcards.dueNow ?? 0}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {t("deck.stats_reviews")}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_total")}: {stats?.reviews.total ?? 0}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_accuracy")}: {formatPercent(stats?.reviews.accuracy ?? null)}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_avg_time")}: {formatTimeMs(stats?.reviews.avgTimeMs ?? null)}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_median_time")}: {formatTimeMs(stats?.reviews.medianTimeMs ?? null)}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_last_practiced")}: {formatDateTime(stats?.reviews.lastPracticedAt ?? null)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {t("deck.stats_last_7_days")}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_reviews")}: {stats?.reviews.last7d.total ?? 0}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_accuracy")}: {formatPercent(stats?.reviews.last7d.accuracy ?? null)}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_avg_time")}: {formatTimeMs(stats?.reviews.last7d.avgTimeMs ?? null)}
              </Typography>
              <Typography variant="body2">
                {t("deck.stats_median_time")}: {formatTimeMs(stats?.reviews.last7d.medianTimeMs ?? null)}
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">
          {t("common.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
