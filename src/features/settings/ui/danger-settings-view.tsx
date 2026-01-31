"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Box, Button, Paper, Typography } from "@mui/material";

import { useI18n } from "@/ui/i18n";

import DeleteAccountDialog from "./delete-account-dialog";

export default function DangerSettingsView() {
  const router = useRouter();
  const { t } = useI18n();

  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Paper
        elevation={1}
        sx={{
          p: { xs: 2, sm: 3 },
          border: "1px solid",
          borderColor: "error.light",
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="h6" sx={{ mb: 1, color: "error.main" }}>
          {t("account.delete_account")}
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          {t("account.delete_account_description")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button color="error" onClick={() => setDeleteOpen(true)} variant="contained">
            {t("account.delete_account")}
          </Button>
        </Box>
      </Paper>

      <DeleteAccountDialog
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          router.push("/login");
          router.refresh();
        }}
        open={deleteOpen}
      />
    </>
  );
}
