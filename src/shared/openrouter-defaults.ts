export const DEFAULT_OPENROUTER_FLASHCARD_PROMPT = `task: generate as many high-quality flashcards as possible while staying accurate and non-repetitive. cover every atomic concept in the source material.

target mix:
- default: at least 60% "mcq" and at most 40% "basic"

quality rules:
- do not pad with repetitive variants. every card must add new information.
- fronts must be unique (no duplicate or near-duplicate questions).
- keep language consistent with the user's prompt.
- if the prompt implies a finite list (elements, vocabulary, taxonomy, etc.), ensure coverage is complete. if the list is long, split it across multiple cards so nothing is omitted.

card types:
- "basic": standard front/back.
- "mcq": multiple-choice. include 4 options with exactly 1 correct. make distractors plausible and intentionally misleading (common wrong patterns), not jokes.

mcq rules:
- store options in mcq.options (array of strings)
- store the correct option index in mcq.correctIndex (0-based)
- back explains why the correct option is correct and why the distractors are wrong (briefly)

latex rules:
- you may include latex in front/back/options using \\( ... \\) for inline math and \\[ ... \\] for display math
- every backslash must be escaped for json (use double backslash (\\\\))

p5 rules:
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic`;

export const DEFAULT_OPENROUTER_SYSTEM_PROMPT = `you are a flashcard generation system. output valid json only.

output requirements:
- return only a single json object (no markdown, no code fences, no extra text)
- first character must be { and last character must be }
- strings must be valid json strings: do not include raw newlines inside strings (use \\n). escape backslashes as double backslash (\\\\)

schema:
{
  "name": string,
  "flashcards": [
    {
      "front": string,
      "back": string,
      "kind"?: "basic" | "mcq",
      "mcq"?: { "options": string[], "correctIndex": number },
      "p5"?: { "width": number, "height": number, "code": string }
    }
  ]
}

constraints:
- name: 1-64 chars
- front/back: 1-4000 chars
- mcq.options length: 2-8
- mcq.correctIndex is 0-based and must be within range
- p5.width: 100-1200, p5.height: 100-900`;

const LEGACY_OPENROUTER_SYSTEM_PROMPT =
  "You are an expert tutor and flashcard creator. follow instructions and stay accurate.";
const LEGACY_DEFAULT_OPENROUTER_SYSTEM_PROMPT_WITH_LEARNING = `you are a flashcard generation system. output valid json only.

output requirements:
- return only a single json object (no markdown, no code fences, no extra text)
- first character must be { and last character must be }
- strings must be valid json strings: do not include raw newlines inside strings (use \\n). escape backslashes as double backslash (\\\\)

schema:
{
  "name": string,
  "flashcards": [
    {
      "front": string,
      "back": string,
      "kind"?: "basic" | "mcq" | "learning",
      "mcq"?: { "options": string[], "correctIndex": number },
      "p5"?: { "width": number, "height": number, "code": string }
    }
  ]
}

constraints:
- name: 1-64 chars
- front/back: 1-4000 chars
- mcq.options length: 2-8
- mcq.correctIndex is 0-based and must be within range
- p5.width: 100-1200, p5.height: 100-900`;
const LEGACY_OPENROUTER_FLASHCARD_PROMPT =
  'return only a single json object with schema {"name": string, "flashcards": [{"front": string, "back": string}]}. no markdown. no code fences. no extra text. keep name 1-64 chars. keep front/back 1-4000 chars. create clear, specific flashcards.';
const LEGACY_DEFAULT_OPENROUTER_FLASHCARD_PROMPT_WITH_LEARNING = `task: generate as many high-quality flashcards as possible while staying accurate and non-repetitive. cover every atomic concept in the source material.

target mix:
- default: at least 60% "mcq" and at most 40% "basic"
- use "learning" only when the topic requires step-by-step problem solving

quality rules:
- do not pad with repetitive variants. every card must add new information.
- fronts must be unique (no duplicate or near-duplicate questions).
- keep language consistent with the user's prompt.
- if the prompt implies a finite list (elements, vocabulary, taxonomy, etc.), ensure coverage is complete. if the list is long, split it across multiple cards so nothing is omitted.

card types:
- "basic": standard front/back.
- "mcq": multiple-choice. include 4 options with exactly 1 correct. make distractors plausible and intentionally misleading (common wrong patterns), not jokes.
- "learning": problem-solving tutor card. use when the learner must practice a method (math, physics, coding, logic). front states the problem. back teaches a solution with clear steps and checkpoints. when a visualization helps, include a p5 sketch.

mcq rules:
- store options in mcq.options (array of strings)
- store the correct option index in mcq.correctIndex (0-based)
- back explains why the correct option is correct and why the distractors are wrong (briefly)

latex rules:
- you may include latex in front/back/options using \\( ... \\) for inline math and \\[ ... \\] for display math
- every backslash must be escaped for json (use double backslash (\\\\))

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic`;
const LEGACY_OPENROUTER_FLASHCARD_PROMPT_RICH_TYPES = `task: generate the maximum quantity of high-quality flashcards possible. cover every atomic concept in the source material.

card types:
- "basic": standard front/back.
- "mcq": multiple-choice. use for tricky distinctions and common misconceptions. include 4 options with exactly 1 correct. make distractors plausible and intentionally misleading (common wrong patterns), not jokes.
- "learning": problem-solving tutor card. use when the learner must practice a method (math, physics, coding, logic). front states the problem. back teaches a solution with clear steps and checkpoints. when a visualization helps, include a p5 sketch.

mcq rules:
- store options in mcq.options (array of strings)
- store the correct option index in mcq.correctIndex (0-based)
- back explains why the correct option is correct and why the distractors are wrong (briefly)

latex rules:
- you may include latex in front/back/options using \\( ... \\) for inline math and \\[ ... \\] for display math
- every backslash must be escaped for json (use double backslash (\\\\))

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic`;
const LEGACY_OPENROUTER_FLASHCARD_PROMPT_QUALITY_RULES = `task: generate as many high-quality flashcards as possible while staying accurate and non-repetitive. cover every atomic concept in the source material.

quality rules:
- do not pad with repetitive variants. every card must add new information.
- fronts must be unique (no duplicate or near-duplicate questions).
- avoid overly specific geography/region variants unless the user prompt is explicitly about that region.

card types:
- "basic": standard front/back.
- "mcq": multiple-choice. use for tricky distinctions and common misconceptions. include 4 options with exactly 1 correct. make distractors plausible and intentionally misleading (common wrong patterns), not jokes.
- "learning": problem-solving tutor card. use when the learner must practice a method (math, physics, coding, logic). front states the problem. back teaches a solution with clear steps and checkpoints. when a visualization helps, include a p5 sketch.

mcq rules:
- store options in mcq.options (array of strings)
- store the correct option index in mcq.correctIndex (0-based)
- back explains why the correct option is correct and why the distractors are wrong (briefly)

latex rules:
- you may include latex in front/back/options using \\( ... \\) for inline math and \\[ ... \\] for display math
- every backslash must be escaped for json (use double backslashes: \\\\)

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic`;

export function normalizeOpenrouterSystemPrompt(value: string | null | undefined) {
  const raw = value ?? "";
  if (
    raw.trim().length === 0 ||
    raw === LEGACY_OPENROUTER_SYSTEM_PROMPT ||
    raw === LEGACY_DEFAULT_OPENROUTER_SYSTEM_PROMPT_WITH_LEARNING
  ) {
    return DEFAULT_OPENROUTER_SYSTEM_PROMPT;
  }
  return raw;
}

export function normalizeOpenrouterFlashcardPrompt(value: string | null | undefined) {
  const raw = value ?? "";
  const normalized = raw.replace(/\r\n/g, "\n");
  if (
    normalized.trim().length === 0 ||
    normalized === LEGACY_OPENROUTER_FLASHCARD_PROMPT ||
    normalized === LEGACY_DEFAULT_OPENROUTER_FLASHCARD_PROMPT_WITH_LEARNING ||
    normalized === LEGACY_OPENROUTER_FLASHCARD_PROMPT_RICH_TYPES ||
    normalized === LEGACY_OPENROUTER_FLASHCARD_PROMPT_QUALITY_RULES
  ) {
    return DEFAULT_OPENROUTER_FLASHCARD_PROMPT;
  }
  return raw;
}
