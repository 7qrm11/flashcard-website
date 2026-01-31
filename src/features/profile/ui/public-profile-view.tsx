"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";

import RelativeTime from "@/ui/relative-time";
import { useI18n } from "@/ui/i18n";

export default function PublicProfileView({
  username,
  createdAt,
  lastActiveAt,
  avatarVersion,
}: Readonly<{
  username: string;
  createdAt: string;
  lastActiveAt: string;
  avatarVersion: string | null;
}>) {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    const es = new EventSource(`/api/users/${encodeURIComponent(username)}/events`);
    es.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg?.type === "user_deleted" || msg?.type === "username_changed" || msg?.type === "avatar_updated") {
        router.refresh();
        return;
      }

      if (msg?.type === "refresh") {
        return;
      }
    };
    return () => {
      es.close();
    };
  }, [router, username]);

  const createdDateLabel = useMemo(() => {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return createdAt;
    }
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }, [createdAt]);

  const avatarSrc = useMemo(() => {
    const base = `/api/users/${encodeURIComponent(username)}/avatar`;
    if (!avatarVersion) {
      return base;
    }
    return `${base}?v=${encodeURIComponent(avatarVersion)}`;
  }, [avatarVersion, username]);

  return (
    <Paper elevation={1} sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Avatar alt={username} src={avatarSrc} sx={{ width: 56, height: 56 }}>
          {username.slice(0, 1).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            {username}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {t("profile.last_active")} <RelativeTime isoDate={lastActiveAt} />
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ mt: 3 }}>
        <Typography color="text.secondary" variant="body2">
          {t("profile.date_of_joining")}
        </Typography>
        <Typography variant="body1">{createdDateLabel}</Typography>
      </Box>
    </Paper>
  );
}
