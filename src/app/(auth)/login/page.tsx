"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  Box,
  Button,
  Container,
  FormControlLabel,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Tooltip,
} from "@mui/material";

import { IconDarkMode, IconLightMode } from "@/ui/icons";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";
import { useThemeMode } from "@/ui/theme-mode";
import type { UiLanguage } from "@/shared/i18n";

const usernameRegex = /^[a-z0-9_.]{1,32}$/;

export default function LoginPage() {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useThemeMode();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedUsername = username.trim();
    if (!usernameRegex.test(trimmedUsername)) {
      notifyError("auth.invalid_username");
      return;
    }
    if (password.length < 1 || password.length > 64) {
      notifyError("auth.invalid_password");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        notifyError(data?.error ?? "auth.login_failed");
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

  return (
    <Container maxWidth="xs" sx={{ display: "flex", minHeight: "100dvh", alignItems: "center" }}>
      <Paper elevation={1} sx={{ width: "100%", p: 3 }}>
        <Box component="form" onSubmit={onSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            autoComplete="username"
            label={t("auth.username_label")}
            name="username"
            onChange={(e) => setUsername(e.target.value)}
            required
            value={username}
          />
          <TextField
            autoComplete="current-password"
            label={t("auth.password_label")}
            name="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
          <Button disabled={submitting} type="submit" variant="contained">
            {t("auth.sign_in")}
          </Button>
          <MuiLink component={Link} href="/register" underline="hover" sx={{ alignSelf: "center" }}>
            {t("auth.create_account_link")}
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
