"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Box, Button, Container, Link as MuiLink, Paper, TextField } from "@mui/material";

import { useNotifications } from "@/ui/notifications";
import { useI18n } from "@/ui/i18n";

const usernameRegex = /^[a-z0-9_.]{1,32}$/;

export default function LoginPage() {
  const router = useRouter();
  const { notifyError } = useNotifications();
  const { t } = useI18n();

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
    </Container>
  );
}
