alter table users
  alter column scheduler_required_time_ms set default 10000;

update users
set scheduler_required_time_ms = 10000
where scheduler_required_time_ms = 6000;

alter table users
  alter column openrouter_flashcard_prompt set default $$task: generate as many high-quality flashcards as possible while staying accurate and non-repetitive. cover every atomic concept in the source material.

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
- you may include latex in front/back/options using \( ... \) for inline math and \[ ... \] for display math
- every backslash must be escaped for json (use double backslash (\\))

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic$$;

update users
set openrouter_flashcard_prompt = $$task: generate as many high-quality flashcards as possible while staying accurate and non-repetitive. cover every atomic concept in the source material.

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
- you may include latex in front/back/options using \( ... \) for inline math and \[ ... \] for display math
- every backslash must be escaped for json (use double backslash (\\))

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic$$
where openrouter_flashcard_prompt = $$task: generate the maximum quantity of high-quality flashcards possible. cover every atomic concept in the source material.

card types:
- "basic": standard front/back.
- "mcq": multiple-choice. use for tricky distinctions and common misconceptions. include 4 options with exactly 1 correct. make distractors plausible and intentionally misleading (common wrong patterns), not jokes.
- "learning": problem-solving tutor card. use when the learner must practice a method (math, physics, coding, logic). front states the problem. back teaches a solution with clear steps and checkpoints. when a visualization helps, include a p5 sketch.

mcq rules:
- store options in mcq.options (array of strings)
- store the correct option index in mcq.correctIndex (0-based)
- back explains why the correct option is correct and why the distractors are wrong (briefly)

latex rules:
- you may include latex in front/back/options using \( ... \) for inline math and \[ ... \] for display math
- every backslash must be escaped for json (use double backslash (\\))

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic$$
   or openrouter_flashcard_prompt = $$task: generate as many high-quality flashcards as possible while staying accurate and non-repetitive. cover every atomic concept in the source material.

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
- you may include latex in front/back/options using \( ... \) for inline math and \[ ... \] for display math
- every backslash must be escaped for json (use double backslashes: \\)

p5 rules (only for learning cards):
- include p5: {"width": number, "height": number, "code": string}
- code is p5 instance-mode javascript only (no html, no imports). you are writing inside new p5((p) => { ... }, el)
- define p.setup and optionally p.draw. call p.createCanvas(WIDTH, HEIGHT) using WIDTH and HEIGHT variables provided by the host
- no window/document access. no network requests. keep code small and deterministic$$;
