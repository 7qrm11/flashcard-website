"use client";

import { useEffect, useState } from "react";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

export default function RenameDeckDialog({
  deckId,
  currentName,
  open,
  onClose,
  onRenamed,
}: Readonly<{
  deckId: string | null;
  currentName: string | null;
  open: boolean;
  onClose: () => void;
  onRenamed: () => void;
}>) {
  const { notifyError } = useNotifications();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(currentName ?? "");
  }, [currentName, open]);

  async function submit() {
    if (!deckId) {
      notifyError("Deck not found");
      return;
    }

    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 64) {
      notifyError("errors.name_length_1_64");
      return;
    }

    if ((currentName ?? "").trim() === trimmed) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch (err) {
        console.error("deck rename: request failed", err);
        notifyError("errors.request_failed_check_server_logs");
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "could not update deck");
        return;
      }

      onRenamed();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={() => {
        if (submitting) {
          return;
        }
        onClose();
      }}
      open={open}
    >
      <DialogTitle>{t("deck.rename_deck")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label={t("deck.deck_name")}
          onChange={(e) => setName(e.target.value)}
          value={name}
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button disabled={submitting} onClick={onClose} variant="text">
          {t("common.cancel")}
        </Button>
        <Button disabled={submitting} onClick={() => void submit()} variant="contained">
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
