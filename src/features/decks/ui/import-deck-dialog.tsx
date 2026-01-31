"use client";

import { useMemo, useState } from "react";

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

export default function ImportDeckDialog({
  open,
  onClose,
  onImported,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onImported: (deckId: string) => void;
}>) {
  const { notifyError } = useNotifications();
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileLabel = useMemo(() => {
    if (!file) {
      return t("deck.choose_file");
    }
    return file.name;
  }, [file, t]);

  async function submit() {
    if (!file) {
      notifyError("errors.choose_deck_export_file");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("deck", file);
      const res = await fetch("/api/decks/import", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "import failed");
        return;
      }
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      const id = data?.id;
      if (!id) {
        notifyError("import failed");
        return;
      }
      setFile(null);
      onImported(id);
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
        setFile(null);
        onClose();
      }}
      open={open}
    >
      <DialogTitle>{t("deck.import_deck")}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button component="label" disabled={submitting} variant="outlined">
            {fileLabel}
            <input
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                e.currentTarget.value = "";
              }}
              type="file"
            />
          </Button>
          <Typography color="text.secondary" variant="body2">
            {t("deck.exported_json_file")}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button disabled={submitting} onClick={onClose} variant="text">
          {t("common.cancel")}
        </Button>
        <Button disabled={submitting} onClick={() => void submit()} variant="contained">
          {t("common.import")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
