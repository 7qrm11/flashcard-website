"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Typography,
} from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

const DEFAULT_EDITOR_SIZE = 360;
const DEFAULT_CROP_RATIO = 2 / 3;
const OUTPUT_SIZE = 256;
const MIN_ZOOM_LOG = 0;

type Point = { x: number; y: number };
type ImageSize = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampCutoutCenter(center: Point, editorSize: number, cropSize: number) {
  const r = cropSize / 2;
  return {
    x: clamp(center.x, r, editorSize - r),
    y: clamp(center.y, r, editorSize - r),
  };
}

function computeBaseScale(imageSize: ImageSize, editorSize: number) {
  return Math.max(editorSize / imageSize.width, editorSize / imageSize.height);
}

async function urlToImage(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export default function AvatarEditorDialog({
  open,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const { notifyError } = useNotifications();
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoomLog, setZoomLog] = useState<number>(0.0);
  const [zoomLogMax, setZoomLogMax] = useState<number>(2.0);
  const zoom = useMemo(() => Math.exp(zoomLog), [zoomLog]);
  const [editorSize, setEditorSize] = useState(DEFAULT_EDITOR_SIZE);
  const cropSize = useMemo(
    () => Math.round(editorSize * DEFAULT_CROP_RATIO),
    [editorSize],
  );
  const [cutoutCenter, setCutoutCenter] = useState<Point>(() => ({
    x: DEFAULT_EDITOR_SIZE / 2,
    y: DEFAULT_EDITOR_SIZE / 2,
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dragState = useRef<{
    pointerId: number;
    startPointer: Point;
    startCenter: Point;
  } | null>(null);

  useEffect(() => {
    if (error) {
      notifyError(error);
    }
  }, [error, notifyError]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setZoomLog(0.0);
      setZoomLogMax(2.0);
      setEditorSize(DEFAULT_EDITOR_SIZE);
      setCutoutCenter({ x: DEFAULT_EDITOR_SIZE / 2, y: DEFAULT_EDITOR_SIZE / 2 });
      setImageSize(null);
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      setImageUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const compute = () => {
      const width = window.innerWidth;
      const padding = 48;
      const nextEditor = clamp(width - padding * 2, 260, DEFAULT_EDITOR_SIZE);
      const nextCrop = Math.round(nextEditor * DEFAULT_CROP_RATIO);
      setEditorSize(nextEditor);
      setCutoutCenter((prev) => clampCutoutCenter(prev, nextEditor, nextCrop));
    };

    compute();
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const img = await urlToImage(imageUrl);
        if (cancelled) {
          return;
        }
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setZoomLog(0.0);
        setZoomLogMax(2.0);
        setCutoutCenter({ x: editorSize / 2, y: editorSize / 2 });
      } catch {
        if (cancelled) {
          return;
        }
        setError("errors.could_not_load_image");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, editorSize]);

  useEffect(() => {
    if (zoomLog > zoomLogMax - 0.5) {
      setZoomLogMax(zoomLog + 2);
    }
  }, [zoomLog, zoomLogMax]);

  const previewStyle = useMemo(() => {
    if (!imageUrl || !imageSize) {
      return {};
    }
    const baseScale = computeBaseScale(imageSize, editorSize);
    const scaledWidth = imageSize.width * baseScale * zoom;
    const scaledHeight = imageSize.height * baseScale * zoom;
    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${scaledWidth}px ${scaledHeight}px`,
      backgroundPosition: "50% 50%",
    } as const;
  }, [editorSize, imageUrl, imageSize, zoom]);

  function acceptFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("errors.choose_image_file");
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }

  async function save() {
    if (!imageUrl || !imageSize) {
      setError("errors.choose_image_first");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const img = await urlToImage(imageUrl);
      const baseScale = computeBaseScale(imageSize, editorSize);
      const scale = baseScale * zoom;
      const clampedCutout = clampCutoutCenter(cutoutCenter, editorSize, cropSize);

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("errors.could_not_create_canvas");
        return;
      }

      const imageLeft = (editorSize - imageSize.width * scale) / 2;
      const imageTop = (editorSize - imageSize.height * scale) / 2;
      const cropLeft = clampedCutout.x - cropSize / 2;
      const cropTop = clampedCutout.y - cropSize / 2;

      const srcX = (cropLeft - imageLeft) / scale;
      const srcY = (cropTop - imageTop) / scale;
      const srcSize = cropSize / scale;

      ctx.drawImage(
        img,
        srcX,
        srcY,
        srcSize,
        srcSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });
      if (!blob) {
        setError("errors.could_not_encode_image");
        return;
      }

      const form = new FormData();
      form.set("avatar", new File([blob], "avatar.png", { type: "image/png" }));

      const res = await fetch("/api/settings/avatar", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "errors.upload_failed");
        return;
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>{t("account.profile_photo")}</DialogTitle>
      <DialogContent>
        <Box
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) {
              acceptFile(file);
            }
          }}
          sx={{
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography color="text.secondary" variant="body2">
            {t("account.upload_or_drag_image")}
          </Typography>
          <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button component="label" variant="outlined">
              {t("deck.choose_file")}
              <input
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    acceptFile(file);
                  }
                  e.currentTarget.value = "";
                }}
                type="file"
              />
            </Button>
            {imageUrl ? (
              <Button
                onClick={() => {
                  setError(null);
                  setZoomLog(0.0);
                  setZoomLogMax(2.0);
                  setCutoutCenter({ x: editorSize / 2, y: editorSize / 2 });
                  if (imageUrl) {
                    URL.revokeObjectURL(imageUrl);
                  }
                  setImageUrl(null);
                  setImageSize(null);
                }}
                variant="text"
              >
                {t("common.remove")}
              </Button>
            ) : null}
          </Box>
        </Box>

        <Box sx={{ mt: 3, display: "flex", justifyContent: "center" }}>
          <Box
            onWheel={(e) => {
              if (!imageUrl || !imageSize) {
                return;
              }
              e.preventDefault();
              const delta = e.deltaY;
              setZoomLog((z) => Math.max(MIN_ZOOM_LOG, z - delta / 500));
            }}
            sx={{
              ...previewStyle,
              width: editorSize,
              height: editorSize,
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "action.hover",
              touchAction: "none",
              border: "1px solid",
              borderColor: "divider",
              position: "relative",
            }}
          >
            <Box
              onPointerDown={(e) => {
                if (!imageUrl || !imageSize) {
                  return;
                }
                const current = clampCutoutCenter(cutoutCenter, editorSize, cropSize);
                dragState.current = {
                  pointerId: e.pointerId,
                  startPointer: { x: e.clientX, y: e.clientY },
                  startCenter: current,
                };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!imageUrl || !imageSize) {
                  return;
                }
                const state = dragState.current;
                if (!state || state.pointerId !== e.pointerId) {
                  return;
                }
                const dx = e.clientX - state.startPointer.x;
                const dy = e.clientY - state.startPointer.y;
                const next = clampCutoutCenter(
                  {
                    x: state.startCenter.x + dx,
                    y: state.startCenter.y + dy,
                  },
                  editorSize,
                  cropSize,
                );
                setCutoutCenter(next);
              }}
              onPointerUp={(e) => {
                if (dragState.current?.pointerId === e.pointerId) {
                  dragState.current = null;
                }
              }}
              sx={(theme) => ({
                position: "absolute",
                left: clampCutoutCenter(cutoutCenter, editorSize, cropSize).x - cropSize / 2,
                top: clampCutoutCenter(cutoutCenter, editorSize, cropSize).y - cropSize / 2,
                width: cropSize,
                height: cropSize,
                borderRadius: "50%",
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.45)`,
                border: `2px solid ${theme.palette.common.white}`,
                cursor: imageUrl ? "grab" : "default",
              })}
            />
          </Box>
        </Box>

        <Box sx={{ mt: 2, px: 2 }}>
          <Slider
            disabled={!imageUrl || !imageSize}
            min={MIN_ZOOM_LOG}
            max={zoomLogMax}
            onChange={(_, value) => {
              setZoomLog(value as number);
            }}
            step={0.01}
            value={zoomLog}
          />
        </Box>

      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose} variant="text">
          {t("common.cancel")}
        </Button>
        <Button disabled={saving} onClick={save} variant="contained">
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
