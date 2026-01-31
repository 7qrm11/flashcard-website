"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";

import { IconChevronLeft, IconChevronRight } from "@/ui/icons";
import { useI18n } from "@/ui/i18n";

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function PaginationBar({
  page,
  pageSize,
  totalCount,
  pageSizeOptions = [10, 25, 50, 100],
  rightSlot = null,
  onChange,
}: Readonly<{
  page: number;
  pageSize: number;
  totalCount: number;
  pageSizeOptions?: number[];
  rightSlot?: ReactNode;
  onChange: (next: { page: number; pageSize: number }) => void;
}>) {
  const { t } = useI18n();
  const totalPages = useMemo(() => {
    if (totalCount <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [pageSize, totalCount]);

  const clampedPage = useMemo(
    () => clampInt(page, 1, totalPages),
    [page, totalPages],
  );

  const [pageInput, setPageInput] = useState(String(clampedPage));
  useEffect(() => {
    setPageInput(String(clampedPage));
  }, [clampedPage]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        flexWrap: "wrap",
        py: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton
          aria-label={t("pagination.prev_page")}
          disabled={clampedPage <= 1}
          onClick={() => onChange({ page: clampedPage - 1, pageSize })}
          size="small"
        >
          <IconChevronLeft fontSize="small" />
        </IconButton>

        <TextField
          inputProps={{
            inputMode: "numeric",
            pattern: "[0-9]*",
            style: { textAlign: "center" },
          }}
          label={t("pagination.page")}
          onBlur={() => {
            const parsed = Number.parseInt(pageInput, 10);
            if (!Number.isFinite(parsed)) {
              setPageInput(String(clampedPage));
              return;
            }
            onChange({ page: clampInt(parsed, 1, totalPages), pageSize });
          }}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") {
              return;
            }
            (e.currentTarget as HTMLInputElement).blur();
          }}
          size="small"
          sx={{ width: 110 }}
          value={pageInput}
        />

        <Typography color="text.secondary" variant="body2" sx={{ ml: 0.5 }}>
          / {totalPages}
        </Typography>

        <IconButton
          aria-label={t("pagination.next_page")}
          disabled={clampedPage >= totalPages}
          onClick={() => onChange({ page: clampedPage + 1, pageSize })}
          size="small"
        >
          <IconChevronRight fontSize="small" />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "stretch", sm: "flex-end" },
          gap: 1,
          flexWrap: "wrap",
          flex: { xs: "1 1 100%", sm: "0 0 auto" },
        }}
      >
        {rightSlot}

        <FormControl size="small" sx={{ minWidth: 140, flex: { xs: "1 1 140px", sm: "0 0 auto" } }}>
          <InputLabel id="page-size-label">{t("pagination.per_page")}</InputLabel>
          <Select
            label={t("pagination.per_page")}
            labelId="page-size-label"
            onChange={(e) => {
              const nextSize = Number(e.target.value);
              onChange({ page: 1, pageSize: nextSize });
            }}
            value={pageSize}
          >
            {pageSizeOptions
              .filter((n) => n >= 1 && n <= 100)
              .map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
}
