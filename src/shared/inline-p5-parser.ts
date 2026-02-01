/**
 * inline p5 syntax parser
 *
 * format: [p5:width:height]...code...[/p5]
 *
 * example:
 *   some text [p5:200:100]p.setup=()=>{p.createCanvas(WIDTH,HEIGHT)}[/p5] more text
 */

export type InlineP5Sketch = {
    code: string;
    width: number;
    height: number;
};

export type ParsedSegment =
    | { type: "text"; content: string }
    | { type: "p5"; sketch: InlineP5Sketch };

const INLINE_P5_REGEX = /\[p5:(\d+):(\d+)\]([\s\S]*?)\[\/p5\]/g;

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 150;
const MIN_WIDTH = 50;
const MAX_WIDTH = 1200;
const MIN_HEIGHT = 50;
const MAX_HEIGHT = 900;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * parses text containing inline p5 syntax into segments
 */
export function parseInlineP5(text: string): ParsedSegment[] {
    const segments: ParsedSegment[] = [];
    let lastIndex = 0;

    const matches = text.matchAll(INLINE_P5_REGEX);

    for (const match of matches) {
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;

        if (matchStart > lastIndex) {
            segments.push({ type: "text", content: text.slice(lastIndex, matchStart) });
        }

        const rawWidth = parseInt(match[1], 10);
        const rawHeight = parseInt(match[2], 10);
        const code = match[3].trim();

        if (code.length > 0) {
            segments.push({
                type: "p5",
                sketch: {
                    code,
                    width: clamp(
                        Number.isFinite(rawWidth) ? rawWidth : DEFAULT_WIDTH,
                        MIN_WIDTH,
                        MAX_WIDTH,
                    ),
                    height: clamp(
                        Number.isFinite(rawHeight) ? rawHeight : DEFAULT_HEIGHT,
                        MIN_HEIGHT,
                        MAX_HEIGHT,
                    ),
                },
            });
        }

        lastIndex = matchEnd;
    }

    if (lastIndex < text.length) {
        segments.push({ type: "text", content: text.slice(lastIndex) });
    }

    if (segments.length === 0 && text.length > 0) {
        segments.push({ type: "text", content: text });
    }

    return segments;
}

/**
 * checks if text contains any inline p5 syntax
 */
export function hasInlineP5(text: string): boolean {
    INLINE_P5_REGEX.lastIndex = 0;
    return INLINE_P5_REGEX.test(text);
}

/**
 * extracts all inline p5 sketches from text
 */
export function extractInlineP5Sketches(text: string): InlineP5Sketch[] {
    return parseInlineP5(text)
        .filter((seg): seg is { type: "p5"; sketch: InlineP5Sketch } => seg.type === "p5")
        .map((seg) => seg.sketch);
}

/**
 * strips inline p5 syntax from text, leaving only the non-p5 content
 */
export function stripInlineP5(text: string): string {
    return parseInlineP5(text)
        .filter((seg): seg is { type: "text"; content: string } => seg.type === "text")
        .map((seg) => seg.content)
        .join("");
}
