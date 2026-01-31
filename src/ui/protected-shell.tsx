"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
} from "@mui/material";
import { useI18n } from "@/ui/i18n";

export default function ProtectedShell({
  username,
  avatarVersion,
  children,
}: Readonly<{
  username: string;
  avatarVersion: string | null;
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(menuAnchor);

  useEffect(() => {
    let refreshTimer: number | null = null;
    let refreshPending = false;

    const scheduleRefresh = () => {
      refreshPending = true;
      if (refreshTimer !== null) {
        return;
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (!refreshPending) {
          return;
        }
        refreshPending = false;
        router.refresh();
      }, 400);
    };

    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg?.type === "user_deleted" || msg?.type === "auth_changed") {
        router.push("/login");
        router.refresh();
        return;
      }

      if (msg?.type === "refresh") {
        return;
      }
      scheduleRefresh();
    };
    return () => {
      es.close();
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };
  }, [router]);

  const avatarSrc = useMemo(() => {
    const base = "/api/me/avatar";
    if (!avatarVersion) {
      return base;
    }
    return `${base}?v=${encodeURIComponent(avatarVersion)}`;
  }, [avatarVersion]);

  const nav = useMemo(() => {
    const active = (href: string) =>
      pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
    return [
      { href: "/practice", label: t("nav.practice"), active: active("/practice") },
      { href: "/create", label: t("nav.create"), active: active("/create") },
    ];
  }, [pathname, t]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <AppBar
        color="transparent"
        elevation={0}
        position="sticky"
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {nav.map((item) => (
              <Button
                component={Link}
                href={item.href}
                key={item.href}
                sx={{
                  px: { xs: 1.25, sm: 1.75 },
                  ...(item.active
                    ? {
                        bgcolor: "action.selected",
                        "&:hover": { bgcolor: "action.selected" },
                      }
                    : null),
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>

          <Box sx={{ flex: 1 }} />

          <IconButton
            aria-controls={menuOpen ? "profile-menu" : undefined}
            aria-expanded={menuOpen ? "true" : undefined}
            aria-haspopup="menu"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            size="small"
            sx={{ alignSelf: "center" }}
          >
            <Avatar
              alt={username}
              src={avatarSrc}
              sx={{ width: 32, height: 32 }}
            >
              {username.slice(0, 1).toUpperCase()}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={menuAnchor}
            id="profile-menu"
            onClose={() => setMenuAnchor(null)}
            open={menuOpen}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            <MenuItem
              component={Link}
              href={`/@${username}`}
              onClick={() => setMenuAnchor(null)}
            >
              {t("menu.profile")}
            </MenuItem>
            <MenuItem
              component={Link}
              href="/settings"
              onClick={() => setMenuAnchor(null)}
            >
              {t("menu.settings")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                void logout();
              }}
            >
              {t("menu.sign_out")}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container
        component="main"
        maxWidth="md"
        sx={{
          py: { xs: 2.5, sm: 4 },
          minHeight: { xs: "calc(100dvh - 56px)", sm: "calc(100dvh - 64px)" },
        }}
      >
        {children}
      </Container>
    </>
  );
}
