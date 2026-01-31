"use client";

import { Box, Typography } from "@mui/material";

import {
  IconCheckCircleOutline,
  IconHighlightOff,
  IconRadioButtonUnchecked,
} from "@/ui/icons";

export type RequirementStatus = "ok" | "bad" | "pending";

export type RequirementItem = {
  label: string;
  status: RequirementStatus;
};

function RequirementIcon({ status }: Readonly<{ status: RequirementStatus }>) {
  if (status === "pending") {
    return (
      <IconRadioButtonUnchecked
        sx={{ color: "text.disabled", fontSize: 18 }}
      />
    );
  }
  if (status === "ok") {
    return <IconCheckCircleOutline sx={{ color: "success.main", fontSize: 18 }} />;
  }
  return <IconHighlightOff sx={{ color: "error.main", fontSize: 18 }} />;
}

export default function RequirementsList({
  items,
}: Readonly<{
  items: RequirementItem[];
}>) {
  return (
    <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
      {items.map((item) => (
        <Box
          key={item.label}
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <RequirementIcon status={item.status} />
          <Typography color="text.secondary" variant="caption" sx={{ fontSize: 13 }}>
            {item.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
