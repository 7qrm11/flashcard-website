"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  Box,
  Button,
  Container,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
} from "@mui/material";

import { IconDarkMode, IconLightMode } from "@/ui/icons";

import RequirementsList, { type RequirementStatus } from "@/ui/requirements-list";
import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";
import { useThemeMode } from "@/ui/theme-mode";
import type { UiLanguage } from "@/shared/i18n";

const usernameRegex = /^[a-z0-9_.]{1,32}$/;
const usernameCharsRegex = /^[a-z0-9_.]+$/;

type Availability = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

export default function RegisterPage() {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useThemeMode();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");

  useEffect(() => {
    const value = username.trim();

    if (value.length === 0) {
      setAvailability("idle");
      return;
    }

    if (!usernameRegex.test(value)) {
      setAvailability("invalid");
      return;
    }

    setAvailability("checking");
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/username-available?username=${encodeURIComponent(value)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) {
          setAvailability("error");
          return;
        }
        const data = (await res.json()) as { available?: boolean };
        setAvailability(data.available ? "available" : "taken");
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return;
        }
        setAvailability("error");
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [username]);

  const trimmedUsername = useMemo(() => username.trim(), [username]);
  const usernameLengthOk = trimmedUsername.length >= 1 && trimmedUsername.length <= 32;
  const usernameCharsOk =
    trimmedUsername.length >= 1 && usernameCharsRegex.test(trimmedUsername);
  const usernameAvailabilityStatus = useMemo<RequirementStatus>(() => {
    if (trimmedUsername.length === 0) {
      return "pending";
    }
    if (!usernameLengthOk || !usernameCharsOk) {
      return "bad";
    }
    if (availability === "checking") {
      return "pending";
    }
    if (availability === "available") {
      return "ok";
    }
    if (availability === "taken") {
      return "bad";
    }
    if (availability === "error") {
      return "bad";
    }
    return "pending";
  }, [availability, trimmedUsername, usernameLengthOk, usernameCharsOk]);

  const passwordLengthOk = password.length >= 1 && password.length <= 64;
  const passwordConfirmLengthOk =
    passwordConfirm.length >= 1 && passwordConfirm.length <= 64;
  const passwordsMatch =
    password.length > 0 && passwordConfirm.length > 0 && password === passwordConfirm;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!usernameRegex.test(trimmedUsername)) {
      notifyError("auth.invalid_username");
      return;
    }
    if (password.length < 1 || password.length > 64) {
      notifyError("auth.invalid_password");
      return;
    }
    if (password !== passwordConfirm) {
      notifyError("auth.passwords_do_not_match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          password,
          passwordConfirm,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "auth.register_failed");
        return;
      }

      router.push("/practice");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTheme() {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    await fetch("/api/guest/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    }).catch(() => { });
    router.refresh();
  }

  async function changeLanguage(nextLang: UiLanguage) {
    setLang(nextLang);
    await fetch("/api/guest/language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: nextLang }),
    }).catch(() => { });
    router.refresh();
  }

  const usernameHasError =
    trimmedUsername.length > 0 &&
    (!usernameRegex.test(trimmedUsername) ||
      availability === "taken" ||
      availability === "error");

  return (
    <Container maxWidth="xs" sx={{ display: "flex", minHeight: "100dvh", alignItems: "center" }}>
      <Paper elevation={1} sx={{ width: "100%", p: 3 }}>
        <Box component="form" onSubmit={onSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            autoComplete="username"
            error={usernameHasError}
            label={t("auth.username_label")}
            name="username"
            onChange={(e) => setUsername(e.target.value)}
            required
            value={username}
          />
          <RequirementsList
            items={[
              {
                label: t("auth.username_requirement_length"),
                status: trimmedUsername.length === 0 ? "pending" : usernameLengthOk ? "ok" : "bad",
              },
              {
                label: t("auth.username_requirement_charset"),
                status: trimmedUsername.length === 0 ? "pending" : usernameCharsOk ? "ok" : "bad",
              },
              {
                label:
                  availability === "checking"
                    ? t("auth.username_requirement_checking")
                    : t("auth.username_requirement_available"),
                status: usernameAvailabilityStatus,
              },
            ]}
          />
          <TextField
            autoComplete="new-password"
            label={t("auth.password_label")}
            name="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
          <RequirementsList
            items={[
              {
                label: t("auth.password_requirement_length"),
                status: password.length === 0 ? "pending" : passwordLengthOk ? "ok" : "bad",
              },
            ]}
          />
          <TextField
            autoComplete="new-password"
            label={t("auth.password_confirm_label")}
            name="passwordConfirm"
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            type="password"
            value={passwordConfirm}
          />
          <RequirementsList
            items={[
              {
                label: t("auth.password_requirement_length"),
                status:
                  passwordConfirm.length === 0
                    ? "pending"
                    : passwordConfirmLengthOk
                      ? "ok"
                      : "bad",
              },
              {
                label: t("auth.password_requirement_match"),
                status:
                  password.length === 0 || passwordConfirm.length === 0
                    ? "pending"
                    : passwordsMatch
                      ? "ok"
                      : "bad",
              },
            ]}
          />
          <Button disabled={submitting} type="submit" variant="contained">
            {t("auth.create_account")}
          </Button>
          <MuiLink component={Link} href="/login" underline="hover" sx={{ alignSelf: "center" }}>
            {t("auth.already_have_account_short")}
          </MuiLink>
        </Box>
      </Paper>

      <Box
        sx={{
          position: "fixed",
          bottom: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 1,
          backgroundColor: "background.paper",
          borderRadius: 2,
          px: 1.5,
          py: 0.5,
          boxShadow: 1,
        }}
      >
        <TextField
          select
          size="small"
          value={lang}
          onChange={(e) => changeLanguage(e.target.value as UiLanguage)}
          sx={{ minWidth: 100 }}
          SelectProps={{ MenuProps: { disableScrollLock: true } }}
        >
          <MenuItem value="en">{t("common.english")}</MenuItem>
          <MenuItem value="cs">{t("common.czech")}</MenuItem>
        </TextField>
        <Tooltip title={t("preferences.dark_mode")}>
          <IconButton onClick={() => void toggleTheme()} size="small">
            {mode === "dark" ? <IconLightMode /> : <IconDarkMode />}
          </IconButton>
        </Tooltip>
      </Box>
    </Container>
  );
}
