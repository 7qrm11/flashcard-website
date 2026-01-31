"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { IconMoreVert, IconSearch } from "@/ui/icons";
import { useI18n } from "@/ui/i18n";

import DeckStatsDialog from "./deck-stats-dialog";
import RenameDeckDialog from "./rename-deck-dialog";

type Deck = { id: string; name: string; isDefault: boolean };

export default function ArchivedDecksView({
  decks,
  query,
}: Readonly<{
  decks: Deck[];
  query: string;
}>) {
  const router = useRouter();
  const { t } = useI18n();

  const [statsOpen, setStatsOpen] = useState(false);
  const [statsDeckId, setStatsDeckId] = useState<string | null>(null);
  const [statsDeckName, setStatsDeckName] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null);
  const [renameDeckName, setRenameDeckName] = useState<string | null>(null);

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
      if (normalized.length > 0) {
        params.set("q", normalized);
      }
      const qs = params.toString();
      router.replace(qs ? `/create/archive?${qs}` : "/create/archive");
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, router, search]);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuDeckId, setMenuDeckId] = useState<string | null>(null);
  const [menuDeckName, setMenuDeckName] = useState<string | null>(null);
  const menuOpen = Boolean(menuAnchor);

  const deckById = useMemo(() => {
    const map = new Map<string, Deck>();
    for (const deck of decks) {
      map.set(deck.id, deck);
    }
    return map;
  }, [decks]);

  async function setArchived(deckId: string, archived: boolean) {
    await fetch(`/api/decks/${encodeURIComponent(deckId)}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    router.refresh();
  }

  async function deleteDeck(deckId: string) {
    await fetch(`/api/decks/${encodeURIComponent(deckId)}`, { method: "DELETE" }).catch(
      () => null,
    );
    router.refresh();
  }

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">{t("deck.archive_title")}</Typography>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: { xs: "flex-start", sm: "flex-end" },
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
          <Button component={Link} href="/create" variant="outlined">
            {t("common.back")}
          </Button>
        </Box>
      </Stack>

      <Paper elevation={1}>
        <List disablePadding>
          {decks.map((deck) => (
            <ListItem
              divider
              key={deck.id}
              secondaryAction={
                deck.isDefault ? null : (
                  <IconButton
                    edge="end"
                    onClick={(e) => {
                      setMenuAnchor(e.currentTarget);
                      setMenuDeckId(deck.id);
                      setMenuDeckName(deck.name);
                    }}
                  >
                    <IconMoreVert />
                  </IconButton>
                )
              }
            >
              <ListItemText
                primary={deck.name}
                secondary={deck.isDefault ? t("deck.default_deck") : undefined}
              />
            </ListItem>
          ))}
        </List>
        {decks.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography color="text.secondary" variant="body2">
              {query.trim().length > 0 ? t("deck.no_results") : t("deck.no_archived_decks")}
            </Typography>
          </Box>
        ) : null}
      </Paper>

      <Menu
        anchorEl={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuDeckId(null);
          setMenuDeckName(null);
        }}
        open={menuOpen}
      >
        <MenuItem
          onClick={() => {
            setRenameDeckId(menuDeckId);
            setRenameDeckName(menuDeckName);
            setRenameOpen(true);
            setMenuAnchor(null);
            setMenuDeckId(null);
            setMenuDeckName(null);
          }}
        >
          {t("common.rename")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setStatsOpen(true);
            setStatsDeckId(menuDeckId);
            setStatsDeckName(menuDeckName);
            setMenuAnchor(null);
          }}
        >
          {t("common.statistics")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            const id = menuDeckId;
            const deck = id ? deckById.get(id) : undefined;
            setMenuAnchor(null);
            if (!id || !deck || deck.isDefault) {
              return;
            }
            void setArchived(id, false);
          }}
        >
          {t("common.unarchive")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            const id = menuDeckId;
            const deck = id ? deckById.get(id) : undefined;
            setMenuAnchor(null);
            if (!id || !deck || deck.isDefault) {
              return;
            }
            void deleteDeck(id);
          }}
        >
          {t("common.delete")}
        </MenuItem>
      </Menu>

      <RenameDeckDialog
        deckId={renameDeckId}
        currentName={renameDeckName}
        onClose={() => {
          setRenameOpen(false);
          setRenameDeckId(null);
          setRenameDeckName(null);
        }}
        onRenamed={() => {
          router.refresh();
        }}
        open={renameOpen}
      />

      <DeckStatsDialog
        deckId={statsDeckId}
        deckName={statsDeckName}
        onClose={() => setStatsOpen(false)}
        open={statsOpen}
      />
    </>
  );
}
