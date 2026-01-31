"use client";

import Link from "next/link";

import { Box, Button, Paper, Typography } from "@mui/material";
import { useI18n } from "@/ui/i18n";

export default function HandleNotFound() {
  const { t } = useI18n();
  return (
    <Paper elevation={1} sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        404
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
        {t("not_found.page_does_not_exist")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button component={Link} href="/" variant="contained">
          {t("not_found.go_home")}
        </Button>
      </Box>
    </Paper>
  );
}
