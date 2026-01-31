"use client";

import { useMemo, useState } from "react";

import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

type Step = 1 | 2;

export default function DeleteAccountDialog({
  open,
  onClose,
  onDeleted,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}>) {
  const { notifyError } = useNotifications();
  const { t } = useI18n();
  const confirmWord = "delete";
  const [step, setStep] = useState<Step>(1);
  const [ack, setAck] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canContinue = ack;
  const canDelete = useMemo(() => {
    return confirmText.trim() === confirmWord && password.length >= 1 && password.length <= 64;
  }, [confirmText, confirmWord, password]);

  async function doDelete() {
    if (!canDelete) {
      notifyError("errors.confirm_deletion_and_enter_password");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm: "delete" }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "errors.account_deletion_failed");
        return;
      }

      onDeleted();
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
        setStep(1);
        setAck(false);
        setConfirmText("");
        setPassword("");
      }}
      open={open}
    >
      <DialogTitle>{t("account.delete_account")}</DialogTitle>
      <DialogContent>
        {step === 1 ? (
          <Box>
            <Typography color="text.secondary" variant="body2">
              {t("account.delete_account_description")}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} />
              }
              label={t("account.delete_account_ack")}
              sx={{ mt: 2 }}
            />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography color="text.secondary" variant="body2">
              {t("account.type_word_to_confirm", { word: confirmWord })}
            </Typography>
            <TextField
              label={t("account.type_word_label", { word: confirmWord })}
              onChange={(e) => setConfirmText(e.target.value)}
              required
              value={confirmText}
            />
            <TextField
              autoComplete="current-password"
              label={t("account.password")}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          disabled={submitting}
          onClick={() => {
            if (submitting) {
              return;
            }
            if (step === 2) {
              setStep(1);
              return;
            }
            onClose();
            setStep(1);
            setAck(false);
            setConfirmText("");
            setPassword("");
          }}
          variant="text"
        >
          {step === 2 ? t("common.back") : t("common.cancel")}
        </Button>
        {step === 1 ? (
          <Button
            disabled={!canContinue || submitting}
            onClick={() => {
              setStep(2);
            }}
            variant="contained"
          >
            {t("common.continue")}
          </Button>
        ) : (
          <Button
            color="error"
            disabled={!canDelete || submitting}
            onClick={() => void doDelete()}
            variant="contained"
          >
            {t("account.delete_permanently")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
