"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";

import LatexTypography from "@/ui/latex-typography";
import P5SketchFrame from "@/ui/p5-sketch-frame";
import { useI18n } from "@/ui/i18n";

type Flashcard = {
  id: string;
  kind: "basic" | "mcq";
  front: string;
  back: string;
  mcqOptions: string[] | null;
  mcqCorrectIndex: number | null;
  p5Code: string | null;
  p5Width: number | null;
  p5Height: number | null;
};

function optionLabel(index: number) {
  const base = 65;
  const code = base + Math.max(0, Math.min(25, Math.floor(index)));
  return String.fromCharCode(code);
}

export default function PracticeDeckView({
  deckId,
  deckName,
  flashcards,
}: Readonly<{
  deckId: string;
  deckName: string;
  flashcards: Flashcard[];
}>) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  const total = flashcards.length;

  const done = total === 0 || index >= total;
  const current = !done ? flashcards[index] : null;
  const hasMcq =
    !!current &&
    Array.isArray(current.mcqOptions) &&
    current.mcqOptions.length >= 2 &&
    current.mcqCorrectIndex !== null &&
    current.mcqCorrectIndex >= 0 &&
    current.mcqCorrectIndex < current.mcqOptions.length;
  const hasP5 = !!current && typeof current.p5Code === "string" && current.p5Code.trim().length > 0;

  const [selectedMcqIndex, setSelectedMcqIndex] = useState<number | null>(null);
  useEffect(() => {
    setSelectedMcqIndex(null);
  }, [index]);

  const title = useMemo(() => {
    if (deckName.trim().length > 0) {
      return deckName;
    }
    return t("nav.practice");
  }, [deckName, t]);

  const subtitle = useMemo(() => {
    if (total === 0) {
      return t("practice.no_flashcards_available");
    }
    if (done) {
      return t("common.done");
    }
    return t("practice.card_of", { current: index + 1, total });
  }, [done, index, t, total]);

  function goPrev() {
    setIndex((prev) => Math.max(0, prev - 1));
    setShowBack(false);
  }

  function goNext() {
    setIndex((prev) => Math.min(total, prev + 1));
    setShowBack(false);
  }

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap variant="h5">
            {title}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {subtitle}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, justifyContent: { xs: "flex-start", sm: "flex-end" } }}>
          <Button component={Link} href="/practice" variant="outlined">
            {t("common.back")}
          </Button>
        </Box>
      </Stack>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        gap: 1,
        maxWidth: 720,
        mx: "auto",
      }}
    >
      <Button disabled={index <= 0 || total === 0} onClick={goPrev} variant="text">
        {t("common.back")}
      </Button>
      <Button disabled={done || total === 0} onClick={goNext} variant="text">
        {t("common.next")}
      </Button>
    </Box>

      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Paper
          elevation={2}
          onClick={() => {
            if (done) {
              return;
            }
            setShowBack((prev) => !prev);
          }}
          sx={{
            p: { xs: 2.5, sm: 4 },
            minHeight: { xs: 260, sm: 320 },
            maxWidth: 720,
            width: "100%",
            cursor: done ? "default" : "pointer",
            userSelect: "none",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: hasMcq || hasP5 ? "stretch" : "center",
            textAlign: hasMcq || hasP5 ? "left" : "center",
            gap: 2,
          }}
        >
          {done ? (
            <Stack spacing={1} alignItems="center">
              <Typography color="text.secondary" variant="body1">
                {t("common.done")}
              </Typography>
              <Button component={Link} href="/practice" size="small" variant="text">
                {t("common.exit")}
              </Button>
            </Stack>
          ) : current ? (
            showBack ? (
              <Stack spacing={2} sx={{ width: "100%" }}>
                <LatexTypography
                  component="div"
                  text={current.front.trim().length > 0 ? current.front : t("practice.empty_front")}
                  variant="h6"
                />
                {hasP5 ? (
                  <P5SketchFrame
                    code={current.p5Code!}
                    height={current.p5Height}
                    title={t("practice.p5_title")}
                    width={current.p5Width}
                  />
                ) : null}
                {hasMcq ? (
                  <Stack spacing={1.25}>
                    {current.mcqOptions!.map((opt, optIdx) => {
                      const isCorrect = optIdx === current.mcqCorrectIndex;
                      const isSelected = selectedMcqIndex === optIdx;
                      return (
                        <Box
                          key={optIdx}
                          sx={{
                            p: 1.25,
                            borderRadius: 1,
                            border: "1px solid",
                            borderColor: isCorrect
                              ? "success.main"
                              : isSelected
                                ? "primary.main"
                                : "divider",
                            backgroundColor: isCorrect
                              ? "success.light"
                              : isSelected
                                ? "action.selected"
                                : "transparent",
                          }}
                        >
                          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                            <Typography
                              component="span"
                              sx={{ fontWeight: 700, minWidth: 18, lineHeight: 1.5 }}
                            >
                              {optionLabel(optIdx)}.
                            </Typography>
                            <LatexTypography
                              component="span"
                              text={opt}
                              variant="body1"
                              sx={{ flex: 1 }}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                    <Typography color="text.secondary" variant="caption">
                      {selectedMcqIndex === null
                        ? t("practice.no_selection")
                        : t("practice.your_selection", { value: optionLabel(selectedMcqIndex) })}
                    </Typography>
                    <Typography color="text.secondary" variant="caption">
                      {t("practice.correct_answer", { value: optionLabel(current.mcqCorrectIndex!) })}
                    </Typography>
                  </Stack>
                ) : null}
                <Divider flexItem />
                <LatexTypography
                  component="div"
                  text={current.back.trim().length > 0 ? current.back : t("practice.empty_back")}
                  variant="body1"
                />
              </Stack>
            ) : (
              <Stack spacing={2} sx={{ width: "100%" }}>
                <LatexTypography
                  component="div"
                  text={current.front.trim().length > 0 ? current.front : t("practice.empty_front")}
                  variant="h5"
                  sx={{ textAlign: "center" }}
                />
                {hasP5 ? (
                  <P5SketchFrame
                    code={current.p5Code!}
                    height={current.p5Height}
                    title={t("practice.p5_title")}
                    width={current.p5Width}
                  />
                ) : null}
                {hasMcq ? (
                  <Stack spacing={1}>
                    {current.mcqOptions!.map((opt, optIdx) => {
                      const selected = selectedMcqIndex === optIdx;
                      return (
                        <Button
                          key={optIdx}
                          fullWidth
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedMcqIndex(optIdx);
                          }}
                          variant={selected ? "contained" : "outlined"}
                          sx={{
                            justifyContent: "flex-start",
                            textAlign: "left",
                            textTransform: "none",
                            py: 1,
                          }}
                        >
                          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", width: "100%" }}>
                            <Typography component="span" sx={{ fontWeight: 700, minWidth: 18, lineHeight: 1.6 }}>
                              {optionLabel(optIdx)}.
                            </Typography>
                            <LatexTypography
                              component="span"
                              text={opt}
                              variant="body1"
                              sx={{ flex: 1 }}
                            />
                          </Box>
                        </Button>
                      );
                    })}
                    <Typography color="text.secondary" variant="caption" sx={{ textAlign: "center" }}>
                      {t("practice.click_card_to_reveal_answer")}
                    </Typography>
                  </Stack>
                ) : null}
              </Stack>
            )
          ) : (
            <Typography color="text.secondary" variant="body1">
              {t("common.done")}
            </Typography>
          )}
        </Paper>
      </Box>
    </>
  );
}
