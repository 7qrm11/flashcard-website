"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";

import P5SketchFrame from "@/ui/p5-sketch-frame";
import { parseInlineP5, type ParsedSegment } from "@/shared/inline-p5-parser";

type InlineP5RendererProps = Readonly<{
    text: string;
    /** optional title for p5 sketch iframes */
    title?: string;
    /** component to use for text segments, defaults to Typography */
    textComponent?: "span" | "div" | "p";
    /** maximum width for inline sketches */
    maxSketchWidth?: number;
}>;

/**
 * renders text with inline p5 sketches
 *
 * text containing [p5:width:height]...code...[/p5] syntax will be parsed
 * and rendered with p5 sketches inline
 */
export default function InlineP5Renderer({
    text,
    title,
    textComponent = "span",
    maxSketchWidth,
}: InlineP5RendererProps) {
    const segments = useMemo(() => parseInlineP5(text), [text]);

    if (segments.length === 0) {
        return null;
    }

    if (segments.length === 1 && segments[0].type === "text") {
        return (
            <Typography component={textComponent} sx={{ whiteSpace: "pre-wrap" }}>
                {segments[0].content}
            </Typography>
        );
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {segments.map((segment, index) => (
                <RenderSegment
                    key={index}
                    segment={segment}
                    title={title}
                    textComponent={textComponent}
                    maxSketchWidth={maxSketchWidth}
                />
            ))}
        </Box>
    );
}

function RenderSegment({
    segment,
    title,
    textComponent,
    maxSketchWidth,
}: {
    segment: ParsedSegment;
    title?: string;
    textComponent: "span" | "div" | "p";
    maxSketchWidth?: number;
}) {
    if (segment.type === "text") {
        const trimmed = segment.content.trim();
        if (trimmed.length === 0) {
            return null;
        }
        return (
            <Typography component={textComponent} sx={{ whiteSpace: "pre-wrap" }}>
                {segment.content}
            </Typography>
        );
    }

    const { sketch } = segment;
    const width = maxSketchWidth ? Math.min(sketch.width, maxSketchWidth) : sketch.width;
    const aspectRatio = sketch.width / sketch.height;
    const height = Math.round(width / aspectRatio);

    return (
        <Box sx={{ maxWidth: width }}>
            <P5SketchFrame
                code={sketch.code}
                width={width}
                height={height}
                title={title ?? "p5 sketch"}
            />
        </Box>
    );
}
