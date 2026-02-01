import "server-only";

import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeTranscriptResult =
    | { ok: true; text: string; videoId: string }
    | { ok: false; error: string };

const VIDEO_ID_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/**
 * extract video id from various youtube url formats.
 */
export function extractVideoId(url: string): string | null {
    const match = url.match(VIDEO_ID_REGEX);
    if (match?.[1]) {
        return match[1];
    }
    // maybe it's just a video id
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
        return url.trim();
    }
    return null;
}

/**
 * fetch transcript for a youtube video.
 * returns plain text or an error message.
 */
export async function fetchYoutubeTranscript(url: string): Promise<YoutubeTranscriptResult> {
    const videoId = extractVideoId(url);
    if (!videoId) {
        return { ok: false, error: "invalid youtube url" };
    }

    try {
        const segments = await YoutubeTranscript.fetchTranscript(videoId);

        if (!segments || segments.length === 0) {
            return { ok: false, error: "no captions available for this video" };
        }

        // combine all segments into plain text
        const text = segments
            .map((seg) => seg.text?.trim() ?? "")
            .filter((t) => t.length > 0)
            .join(" ");

        if (text.length === 0) {
            return { ok: false, error: "transcript is empty" };
        }

        return {
            ok: true,
            text,
            videoId,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        if (message.includes("disabled") || message.includes("unavailable")) {
            return { ok: false, error: "captions are disabled for this video" };
        }
        if (message.includes("not found") || message.includes("404")) {
            return { ok: false, error: "video not found" };
        }
        return { ok: false, error: "could not fetch transcript" };
    }
}
