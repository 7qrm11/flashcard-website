"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Box,
  Button,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { IconSearch } from "@/ui/icons";
import PaginationBar from "@/ui/pagination-bar";
import { useI18n } from "@/ui/i18n";

type Deck = { id: string; name: string };

export default function PracticeDecksView({
  decks,
  query,
  page,
  pageSize,
  totalCount,
}: Readonly<{
  decks: Deck[];
  query: string;
  page: number;
  pageSize: number;
  totalCount: number;
}>) {
  const router = useRouter();
  const { t } = useI18n();

  const [search, setSearch] = useState(query);
  useEffect(() => {
    setSearch(query);
  }, [query]);

  useEffect(() => {
    const normalized = search.trim().replace(/\s+/g, " ");
    const current = query.trim().replace(/\s+/g, " ");
    if (normalized === current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", String(pageSize));
      if (normalized.length > 0) {
        params.set("q", normalized);
      }
      router.replace(`/practice?${params.toString()}`);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [pageSize, query, router, search]);

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">{t("nav.practice")}</Typography>
      </Stack>

      <PaginationBar
        onChange={(next) => {
          const params = new URLSearchParams();
          params.set("page", String(next.page));
          params.set("pageSize", String(next.pageSize));
          if (query.trim().length > 0) {
            params.set("q", query.trim());
          }
          router.push(`/practice?${params.toString()}`);
        }}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        rightSlot={
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: { xs: "flex-start", sm: "flex-end" },
              flex: { xs: "1 1 100%", sm: "0 0 auto" },
            }}
          >
            <TextField
              label={t("deck.search_decks")}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              value={search}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: { xs: "100%", sm: 260 }, flex: { xs: "1 1 260px", sm: "0 0 auto" } }}
            />
          </Box>
        }
      />

      <Paper elevation={1}>
        <List disablePadding>
          {decks.map((deck) => (
            <ListItem disablePadding divider key={deck.id}>
              <ListItemButton
                component={Link}
                href={`/practice/${encodeURIComponent(deck.id)}`}
              >
                <ListItemText primary={deck.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        {decks.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography color="text.secondary" variant="body2">
              {t("practice.no_decks_available")}
            </Typography>
          </Box>
        ) : null}
      </Paper>
    </>
  );
}
