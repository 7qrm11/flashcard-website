import "server-only";

import { PDFParse } from "pdf-parse";

const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024; // 100mb

export type PdfParseResult =
    | { ok: true; text: string; numPages: number }
    | { ok: false; error: string };

/**
 * extract text content from a pdf buffer.
 * returns plain text or an error message.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfParseResult> {
    if (buffer.length > MAX_PDF_SIZE_BYTES) {
        return { ok: false, error: "pdf file is too large" };
    }

    if (buffer.length < 8) {
        return { ok: false, error: "invalid pdf file" };
    }

    // basic pdf signature check
    const header = buffer.subarray(0, 5).toString("ascii");
    if (header !== "%PDF-") {
        return { ok: false, error: "invalid pdf file" };
    }

    try {
        const parser = new PDFParse(buffer);
        const result = await parser.getText();

        const text = result.text?.trim() ?? "";
        if (text.length === 0) {
            return { ok: false, error: "pdf contains no extractable text" };
        }

        return {
            ok: true,
            text,
            numPages: result.pages?.length ?? 0,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        if (message.toLowerCase().includes("password")) {
            return { ok: false, error: "pdf is password protected" };
        }
        return { ok: false, error: "could not parse pdf" };
    }
}
