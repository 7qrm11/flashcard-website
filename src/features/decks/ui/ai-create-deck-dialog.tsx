"use client";

import { useRef, useState } from "react";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

type SourceType = "text" | "pdf" | "youtube";

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
  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [prompt, setPrompt] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setPrompt("");
    setYoutubeUrl("");
    setPdfFile(null);
    setSourceType("text");
  }

  async function submit() {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 1 || trimmedPrompt.length > 50000) {
      notifyError("errors.prompt_length");
      return;
    }

    setSubmitting(true);
    try {
      let res: Response;

      if (sourceType === "pdf" && pdfFile) {
        const formData = new FormData();
        formData.append("prompt", trimmedPrompt);
        formData.append("pdf", pdfFile);

        res = await fetch("/api/decks/ai", {
          method: "POST",
          body: formData,
        });
      } else if (sourceType === "youtube" && youtubeUrl.trim()) {
        res = await fetch("/api/decks/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: trimmedPrompt,
            youtubeUrl: youtubeUrl.trim(),
          }),
        });
      } else {
        res = await fetch("/api/decks/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: trimmedPrompt }),
        });
      }

      const data = (await res.json().catch(() => null)) as
        | { error?: string; ok?: boolean; jobId?: string }
        | null;

      if (!res.ok) {
        notifyError(data?.error ?? "errors.could_not_start_ai_deck_creation");
        return;
      }

      console.info("ai deck create: started", { jobId: data?.jobId ?? null });
      resetForm();
      onCreated();
      onClose();
    } catch (err) {
      console.error("ai deck create: request failed", err);
      notifyError("errors.request_failed_check_server_logs");
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPdfFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
    }
  }

  const canSubmit =
    prompt.trim().length > 0 &&
    (sourceType === "text" ||
      (sourceType === "pdf" && pdfFile !== null) ||
      (sourceType === "youtube" && youtubeUrl.trim().length > 0));

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={() => {
        if (submitting) return;
        onClose();
        resetForm();
      }}
      open={open}
    >
      <DialogTitle>{t("deck.create_deck_with_ai")}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
          {t("deck.ai_uses_settings")}
        </Typography>

        <Tabs
          value={sourceType}
          onChange={(_, v) => setSourceType(v as SourceType)}
          sx={{ mt: 2, mb: 2 }}
        >
          <Tab label={t("deck.ai_source_text")} value="text" />
          <Tab label="PDF" value="pdf" />
          <Tab label="YouTube" value="youtube" />
        </Tabs>

        {sourceType === "pdf" && (
          <Box
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            sx={{
              border: "2px dashed",
              borderColor: "divider",
              borderRadius: 1,
              p: 3,
              textAlign: "center",
              mb: 2,
              cursor: "pointer",
              "&:hover": { borderColor: "primary.main" },
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {pdfFile ? (
              <Typography>{pdfFile.name}</Typography>
            ) : (
              <Typography color="text.secondary">
                {t("deck.drop_pdf_here")}
              </Typography>
            )}
          </Box>
        )}

        {sourceType === "youtube" && (
          <TextField
            label={t("deck.enter_youtube_url")}
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            fullWidth
            placeholder="https://youtube.com/watch?v=..."
            sx={{ mb: 2 }}
          />
        )}

        <TextField
          autoFocus={sourceType === "text"}
          label={t("deck.ai_prompt_label")}
          multiline
          minRows={4}
          onChange={(e) => setPrompt(e.target.value)}
          value={prompt}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button disabled={submitting} onClick={onClose} variant="text">
          {t("common.cancel")}
        </Button>
        <Button
          disabled={submitting || !canSubmit}
          onClick={() => void submit()}
          variant="contained"
        >
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
