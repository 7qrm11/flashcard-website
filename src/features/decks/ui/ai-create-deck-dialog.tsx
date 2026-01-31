"use client";

import { useState } from "react";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

export default function AiCreateDeckDialog({
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
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = prompt.trim();
    if (trimmed.length < 1 || trimmed.length > 4000) {
      notifyError("errors.prompt_length");
      return;
    }

    setSubmitting(true);
    try {
      console.info("ai deck create: submit", { promptLength: trimmed.length });

      let res: Response;
      try {
        res = await fetch("/api/decks/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: trimmed }),
        });
      } catch (err) {
        console.error("ai deck create: request failed", err);
        notifyError("errors.request_failed_check_server_logs");
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { error?: string; ok?: boolean; jobId?: string }
        | null;
      if (!res.ok) {
        notifyError(data?.error ?? "errors.could_not_start_ai_deck_creation");
        return;
      }

      console.info("ai deck create: started", { jobId: data?.jobId ?? null });
      setPrompt("");
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
        setPrompt("");
      }}
      open={open}
    >
      <DialogTitle>{t("deck.create_deck_with_ai")}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
          {t("deck.ai_uses_settings")}
        </Typography>
        <TextField
          autoFocus
          label={t("deck.ai_prompt_label")}
          multiline
          minRows={4}
          onChange={(e) => setPrompt(e.target.value)}
          value={prompt}
          fullWidth
          sx={{ mt: 2 }}
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
