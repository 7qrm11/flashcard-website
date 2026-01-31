"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";

import RequirementsList, { type RequirementStatus } from "@/ui/requirements-list";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

import AvatarEditorDialog from "./avatar-editor-dialog";
import DeleteAccountDialog from "./delete-account-dialog";

const usernameRegex = /^[a-z0-9_.]{1,32}$/;
const usernameCharsRegex = /^[a-z0-9_.]+$/;

type Availability =
  | "idle"
  | "unchanged"
  | "invalid"
  | "checking"
  | "available"
  | "taken"
  | "error";

export default function AccountSettingsView({
  currentUsername,
  avatarVersion,
}: Readonly<{
  currentUsername: string;
  avatarVersion: string | null;
}>) {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t } = useI18n();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const avatarSrc = useMemo(() => {
    const base = "/api/me/avatar";
    if (!avatarVersion) {
      return base;
    }
    return `${base}?v=${encodeURIComponent(avatarVersion)}`;
  }, [avatarVersion]);

  const [newUsername, setNewUsername] = useState("");
  const [usernamePassword, setUsernamePassword] = useState("");
  const [usernameAvailability, setUsernameAvailability] = useState<Availability>("idle");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);

  useEffect(() => {
    if (usernameError) {
      notifyError(usernameError);
    }
  }, [notifyError, usernameError]);

  useEffect(() => {
    setNewUsername("");
    setUsernamePassword("");
    setUsernameError(null);
    setUsernameAvailability("idle");
  }, [currentUsername]);

  const trimmedNewUsername = useMemo(() => newUsername.trim(), [newUsername]);
  const usernameDifferent = trimmedNewUsername !== currentUsername;
  const newUsernameLengthOk =
    trimmedNewUsername.length >= 1 && trimmedNewUsername.length <= 32;
  const newUsernameCharsOk =
    trimmedNewUsername.length >= 1 && usernameCharsRegex.test(trimmedNewUsername);
  const newUsernameAvailabilityStatus = useMemo<RequirementStatus>(() => {
    if (trimmedNewUsername.length === 0) {
      return "pending";
    }
    if (!usernameDifferent) {
      return "pending";
    }
    if (!newUsernameLengthOk || !newUsernameCharsOk) {
      return "bad";
    }
    if (usernameAvailability === "checking") {
      return "pending";
    }
    if (usernameAvailability === "available") {
      return "ok";
    }
    if (usernameAvailability === "taken") {
      return "bad";
    }
    if (usernameAvailability === "error") {
      return "bad";
    }
    return "pending";
  }, [
    trimmedNewUsername,
    usernameDifferent,
    newUsernameLengthOk,
    newUsernameCharsOk,
    usernameAvailability,
  ]);

  const availabilityLabel = useMemo(() => {
    if (trimmedNewUsername.length === 0) {
      return t("account.check_availability");
    }
    if (!usernameDifferent) {
      return t("account.choose_different_username");
    }
    if (usernameAvailability === "checking") {
      return t("account.checking_availability");
    }
    if (usernameAvailability === "available") {
      return t("account.username_available");
    }
    if (usernameAvailability === "taken") {
      return t("account.username_taken");
    }
    if (usernameAvailability === "invalid") {
      return t("auth.invalid_username");
    }
    if (usernameAvailability === "error") {
      return t("account.availability_check_failed");
    }
    return t("account.check_availability");
  }, [t, trimmedNewUsername.length, usernameDifferent, usernameAvailability]);

  const usernameCanSubmit = useMemo(() => {
    return (
      trimmedNewUsername !== currentUsername &&
      usernameAvailability === "available" &&
      usernamePassword.length >= 1 &&
      usernamePassword.length <= 64
    );
  }, [trimmedNewUsername, currentUsername, usernameAvailability, usernamePassword.length]);

  useEffect(() => {
    const value = newUsername.trim();

    if (value === currentUsername) {
      setUsernameAvailability("unchanged");
      return;
    }
    if (value.length === 0) {
      setUsernameAvailability("idle");
      return;
    }
    if (!usernameRegex.test(value)) {
      setUsernameAvailability("invalid");
      return;
    }

    setUsernameAvailability("checking");
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/username-available?username=${encodeURIComponent(value)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) {
          setUsernameAvailability("error");
          return;
        }
        const data = (await res.json()) as { available?: boolean };
        setUsernameAvailability(data.available ? "available" : "taken");
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return;
        }
        setUsernameAvailability("error");
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [newUsername, currentUsername]);

  async function submitUsername() {
    setUsernameError(null);
    const trimmed = newUsername.trim();
    if (!usernameRegex.test(trimmed)) {
      setUsernameError("auth.invalid_username");
      return;
    }
    if (trimmed === currentUsername) {
      setUsernameError("account.choose_different_username");
      return;
    }
    if (usernamePassword.length < 1 || usernamePassword.length > 64) {
      setUsernameError("auth.invalid_password");
      return;
    }

    setUsernameSubmitting(true);
    try {
      const res = await fetch("/api/settings/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newUsername: trimmed, password: usernamePassword }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setUsernameError(data?.error ?? "account.username_update_failed");
        return;
      }
      setUsernamePassword("");
      setNewUsername("");
      router.refresh();
    } finally {
      setUsernameSubmitting(false);
    }
  }

  const [oldPassword, setOldPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [nextPasswordConfirm, setNextPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    if (passwordError) {
      notifyError(passwordError);
    }
  }, [notifyError, passwordError]);

  async function submitPassword() {
    setPasswordError(null);

    if (oldPassword.length < 1 || oldPassword.length > 64) {
      setPasswordError("auth.invalid_password");
      return;
    }
    if (nextPassword.length < 1 || nextPassword.length > 64) {
      setPasswordError("account.invalid_new_password");
      return;
    }
    if (nextPassword !== nextPasswordConfirm) {
      setPasswordError("auth.passwords_do_not_match");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          oldPassword,
          newPassword: nextPassword,
          newPasswordConfirm: nextPasswordConfirm,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setPasswordError(data?.error ?? "account.password_update_failed");
        return;
      }

      setOldPassword("");
      setNextPassword("");
      setNextPasswordConfirm("");
      router.refresh();
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("account.profile_photo")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Avatar alt={currentUsername} src={avatarSrc} sx={{ width: 56, height: 56 }}>
            {currentUsername.slice(0, 1).toUpperCase()}
          </Avatar>
          <Button onClick={() => setAvatarOpen(true)} variant="outlined">
            {t("account.change_photo")}
          </Button>
        </Box>
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("account.change_username")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            error={usernameAvailability === "invalid" || usernameAvailability === "taken"}
            label={t("account.new_username")}
            onChange={(e) => setNewUsername(e.target.value)}
            required
            value={newUsername}
          />
          <RequirementsList
            items={[
              {
                label: t("account.requirement_username_different"),
                status:
                  trimmedNewUsername.length === 0
                    ? "pending"
                    : usernameDifferent
                      ? "ok"
                      : "bad",
              },
              {
                label: t("auth.username_requirement_length"),
                status:
                  trimmedNewUsername.length === 0
                    ? "pending"
                    : newUsernameLengthOk
                      ? "ok"
                      : "bad",
              },
              {
                label: t("auth.username_requirement_charset"),
                status:
                  trimmedNewUsername.length === 0
                    ? "pending"
                    : newUsernameCharsOk
                      ? "ok"
                      : "bad",
              },
              {
                label: availabilityLabel,
                status: newUsernameAvailabilityStatus,
              },
            ]}
          />
          <TextField
            autoComplete="current-password"
            label={t("auth.password_label")}
            onChange={(e) => setUsernamePassword(e.target.value)}
            required
            type="password"
            value={usernamePassword}
          />
          <RequirementsList
            items={[
              {
                label: t("auth.password_requirement_length"),
                status:
                  usernamePassword.length === 0
                    ? "pending"
                    : usernamePassword.length >= 1 && usernamePassword.length <= 64
                      ? "ok"
                      : "bad",
              },
            ]}
          />
          <Button
            disabled={!usernameCanSubmit || usernameSubmitting}
            onClick={() => void submitUsername()}
            variant="contained"
            sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
          >
            {t("account.update_username")}
          </Button>
        </Box>
      </Paper>

      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("account.password_section")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            autoComplete="current-password"
            label={t("account.old_password")}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            type="password"
            value={oldPassword}
          />
          <RequirementsList
            items={[
              {
                label: t("auth.password_requirement_length"),
                status:
                  oldPassword.length === 0
                    ? "pending"
                    : oldPassword.length >= 1 && oldPassword.length <= 64
                      ? "ok"
                      : "bad",
              },
            ]}
          />
          <TextField
            autoComplete="new-password"
            label={t("account.new_password")}
            onChange={(e) => setNextPassword(e.target.value)}
            required
            type="password"
            value={nextPassword}
          />
          <RequirementsList
            items={[
              {
                label: t("auth.password_requirement_length"),
                status:
                  nextPassword.length === 0
                    ? "pending"
                    : nextPassword.length >= 1 && nextPassword.length <= 64
                      ? "ok"
                      : "bad",
              },
            ]}
          />
          <TextField
            autoComplete="new-password"
            label={t("account.confirm_new_password")}
            onChange={(e) => setNextPasswordConfirm(e.target.value)}
            required
            type="password"
            value={nextPasswordConfirm}
          />
          <RequirementsList
            items={[
              {
                label: t("account.requirement_matches_new_password"),
                status:
                  nextPassword.length === 0 || nextPasswordConfirm.length === 0
                    ? "pending"
                    : nextPassword === nextPasswordConfirm
                      ? "ok"
                      : "bad",
              },
            ]}
          />
          <Button
            disabled={passwordSubmitting}
            onClick={() => void submitPassword()}
            variant="contained"
            sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
          >
            {t("account.update_password")}
          </Button>
        </Box>
      </Paper>

      <Paper
        elevation={1}
        id="delete-account"
        sx={{
          p: { xs: 2, sm: 3 },
          border: "1px solid",
          borderColor: "error.light",
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="h6" sx={{ mb: 1, color: "error.main" }}>
          {t("account.delete_account")}
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          {t("account.delete_account_description")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button color="error" onClick={() => setDeleteOpen(true)} variant="contained">
            {t("account.delete_account")}
          </Button>
        </Box>
      </Paper>

      <AvatarEditorDialog
        onClose={() => setAvatarOpen(false)}
        onSaved={() => {
          router.refresh();
        }}
        open={avatarOpen}
      />

      <DeleteAccountDialog
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          router.push("/login");
          router.refresh();
        }}
        open={deleteOpen}
      />
    </Stack>
  );
}
