"use client";

import { useState } from "react";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

export default function CreateDeckDialog({
  open,
  onClose,
  onCreated,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}>) {
  const { notifyError } = useNotifications();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 64) {
      notifyError("errors.name_length_1_64");
      return;
    }

    setSubmitting(true);
    try {
      console.info("deck create: submit", { nameLength: trimmed.length });

      let res: Response;
      try {
        res = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch (err) {
        console.error("deck create: request failed", err);
        notifyError("errors.request_failed_check_server_logs");
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "could not create deck");
        return;
      }

      console.info("deck create: created");
      setName("");
      onCreated();
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
        setName("");
      }}
      open={open}
    >
      <DialogTitle>{t("deck.create_deck")}</DialogTitle>
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
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
