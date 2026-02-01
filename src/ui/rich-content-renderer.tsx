"use client";

import { useMemo } from "react";
import type { TypographyProps } from "@mui/material";
import { Box } from "@mui/material";

import LatexTypography from "@/ui/latex-typography";
import P5SketchFrame from "@/ui/p5-sketch-frame";
import { parseInlineP5, type ParsedSegment } from "@/shared/inline-p5-parser";

type RichContentRendererProps = Omit<TypographyProps, "children"> & {
    text: string;
    /** optional title for p5 sketch iframes */
    p5Title?: string;
    /** maximum width for inline sketches */
    maxSketchWidth?: number;
};

/**
 * renders text with both LaTeX math and inline p5 sketches
 *
 * - latex: $...$, $$...$$, \(...\), \[...\]
 * - p5: [p5:width:height]...code...[/p5]
 */
export default function RichContentRenderer({
    text,
    p5Title,
    maxSketchWidth,
    ...typographyProps
}: RichContentRendererProps) {
    const segments = useMemo(() => parseInlineP5(text), [text]);

    // if no p5 sections, just use LatexTypography directly
    const hasP5 = segments.some((s) => s.type === "p5");
    if (!hasP5) {
        return <LatexTypography text={text} {...typographyProps} />;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {segments.map((segment, index) => (
                <RenderSegment
                    key={index}
                    segment={segment}
                    p5Title={p5Title}
                    maxSketchWidth={maxSketchWidth}
                    typographyProps={typographyProps}
                />
            ))}
        </Box>
    );
}

function RenderSegment({
    segment,
    p5Title,
    maxSketchWidth,
    typographyProps,
}: {
    segment: ParsedSegment;
    p5Title?: string;
    maxSketchWidth?: number;
    typographyProps: Omit<TypographyProps, "children">;
}) {
    if (segment.type === "text") {
        const trimmed = segment.content.trim();
        if (trimmed.length === 0) {
            return null;
        }
        return <LatexTypography text={segment.content} {...typographyProps} />;
    }

    const { sketch } = segment;
    const width = maxSketchWidth ? Math.min(sketch.width, maxSketchWidth) : sketch.width;
    const aspectRatio = sketch.width / sketch.height;
    const height = Math.round(width / aspectRatio);

    return (
        <Box sx={{ maxWidth: width, alignSelf: "center" }}>
            <P5SketchFrame
                code={sketch.code}
                width={width}
                height={height}
                title={p5Title ?? "p5 sketch"}
            />
        </Box>
    );
}
