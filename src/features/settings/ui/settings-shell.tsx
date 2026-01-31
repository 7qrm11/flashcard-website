"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useI18n } from "@/ui/i18n";

type NavItem = Readonly<{
  href: string;
  labelKey: string;
  danger?: boolean;
}>;

const navItems: ReadonlyArray<NavItem> = [
  { href: "/settings/account", labelKey: "settings.section_account" },
  { href: "/settings/preferences", labelKey: "settings.section_preferences" },
  { href: "/settings/ai", labelKey: "settings.section_ai" },
  { href: "/settings/logs", labelKey: "settings.section_logs" },
];

export default function SettingsShell({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t("settings.title")}
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
        <Paper
          elevation={1}
          sx={{
            width: { xs: "100%", md: 280 },
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography color="text.secondary" variant="subtitle2">
              {t("settings.sections")}
            </Typography>
          </Box>
          <Divider />
          <List disablePadding>
            {navItems.map((item) => (
              <ListItem disablePadding key={item.href}>
                <ListItemButton
                  component={Link}
                  href={item.href}
                  selected={active(item.href)}
                >
                  <ListItemText
                    primary={t(item.labelKey)}
                    primaryTypographyProps={{
                      color: item.danger ? "error.main" : undefined,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>

        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </Stack>
    </>
  );
}
