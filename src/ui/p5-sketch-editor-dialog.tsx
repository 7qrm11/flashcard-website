"use client";

import { useEffect, useMemo, useState } from "react";

import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";

import P5SketchFrame from "@/ui/p5-sketch-frame";
import { useI18n } from "@/ui/i18n";

type P5SketchDraft = Readonly<{
  code: string;
  width: string;
  height: string;
}>;

type P5SketchEditorDialogProps = Readonly<{
  open: boolean;
  title: string;
  initialCode: string | null;
  initialWidth: number | null;
  initialHeight: number | null;
  onClose: () => void;
  onSave: (value: { code: string | null; width: number | null; height: number | null }) => void;
}>;

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeNumberField(value: string) {
  const raw = value.trim();
  if (raw.length === 0) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.floor(parsed);
}

export default function P5SketchEditorDialog({
  open,
  title,
  initialCode,
  initialWidth,
  initialHeight,
  onClose,
  onSave,
}: P5SketchEditorDialogProps) {
  const { t } = useI18n();

  const [draft, setDraft] = useState<P5SketchDraft>({
    code: initialCode ?? "",
    width: initialWidth === null || initialWidth === undefined ? "" : String(initialWidth),
    height: initialHeight === null || initialHeight === undefined ? "" : String(initialHeight),
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft({
      code: initialCode ?? "",
      width: initialWidth === null || initialWidth === undefined ? "" : String(initialWidth),
      height: initialHeight === null || initialHeight === undefined ? "" : String(initialHeight),
    });
  }, [initialCode, initialHeight, initialWidth, open]);

  const normalized = useMemo(() => {
    const code = draft.code.trim();
    const hasCode = code.length > 0;

    const w = normalizeNumberField(draft.width);
    const h = normalizeNumberField(draft.height);
    const hasAnyDim = w !== null || h !== null;
    const hasBothDims = w !== null && h !== null;

    const dimsError = hasCode && hasAnyDim && !hasBothDims;
    const rangeError = hasCode && hasBothDims && (w < 100 || w > 1200 || h < 100 || h > 900);

    const width = hasBothDims ? clampInt(w, 100, 1200) : null;
    const height = hasBothDims ? clampInt(h, 100, 900) : null;

    return {
      code: hasCode ? code : null,
      width: hasCode ? width : null,
      height: hasCode ? height : null,
      dimsError,
      rangeError,
    };
  }, [draft.code, draft.height, draft.width]);

  const canSave = !normalized.dimsError && !normalized.rangeError;

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      onClose={() => {
        onClose();
      }}
      open={open}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ mt: 0.5, alignItems: "stretch" }}
        >
          <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                label={t("deck.p5_width")}
                onChange={(e) => setDraft((prev) => ({ ...prev, width: e.target.value }))}
                value={draft.width}
                error={normalized.dimsError || normalized.rangeError}
                helperText={t("hint.range", { min: 100, max: 1200 })}
                sx={{ width: { xs: "100%", sm: 220 } }}
              />
              <TextField
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                label={t("deck.p5_height")}
                onChange={(e) => setDraft((prev) => ({ ...prev, height: e.target.value }))}
                value={draft.height}
                error={normalized.dimsError || normalized.rangeError}
                helperText={t("hint.range", { min: 100, max: 900 })}
                sx={{ width: { xs: "100%", sm: 220 } }}
              />
            </Stack>
            {normalized.dimsError ? (
              <Typography color="error" variant="caption">
                {t("deck.p5_dimensions_both_or_none")}
              </Typography>
            ) : null}
            <TextField
              label={t("deck.p5_code")}
              multiline
              minRows={14}
              onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))}
              value={draft.code}
              inputProps={{
                style: {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                },
              }}
            />
            <Typography color="text.secondary" variant="caption">
              {t("deck.p5_code_helper")}
            </Typography>
          </Stack>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t("deck.p5_preview")}
            </Typography>
            {normalized.code ? (
              <P5SketchFrame
                code={normalized.code}
                width={normalized.width}
                height={normalized.height}
                title={title}
              />
            ) : (
              <Box
                sx={{
                  border: "1px dashed",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 2,
                  color: "text.secondary",
                }}
              >
                {t("deck.p5_preview_empty")}
              </Box>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onClose();
          }}
          variant="text"
        >
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!canSave}
          onClick={() => {
            onSave({
              code: normalized.code,
              width: normalized.width,
              height: normalized.height,
            });
          }}
          variant="contained"
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
