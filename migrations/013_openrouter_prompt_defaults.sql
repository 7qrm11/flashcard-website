alter table users
  alter column openrouter_system_prompt set default $$you are a flashcard generation system. your sole function is to produce comprehensive flashcard sets in valid json format.
output requirements: start with {. end with }. no other text before or after. valid json only.
schema: {"name": string, "flashcards": [{"front": string, "back": string}]}
constraints: name max 64 chars. front max 4000 chars. back max 4000 chars.
generation requirements: maximize flashcard quantity. extract every atomic concept from source material. create cards for definitions, applications, relationships, examples, edge cases, and cross-domain connections. one concept per card. prioritize comprehensiveness over brevity.$$;

alter table users
  alter column openrouter_flashcard_prompt set default $$you must output valid json only. first character must be {. last character must be }. no text before or after json object.
schema: {"name": string, "flashcards": [{"front": string, "back": string}]}
constraints: name maximum 64 characters. front maximum 4000 characters. back maximum 4000 characters.
task: generate maximum quantity flashcards possible. cover every atomic concept in the source material. include cross-domain applications and connections between concepts. each flashcard tests one discrete piece of knowledge.$$;

update users
set openrouter_system_prompt = $$you are a flashcard generation system. your sole function is to produce comprehensive flashcard sets in valid json format.
output requirements: start with {. end with }. no other text before or after. valid json only.
schema: {"name": string, "flashcards": [{"front": string, "back": string}]}
constraints: name max 64 chars. front max 4000 chars. back max 4000 chars.
generation requirements: maximize flashcard quantity. extract every atomic concept from source material. create cards for definitions, applications, relationships, examples, edge cases, and cross-domain connections. one concept per card. prioritize comprehensiveness over brevity.$$
where openrouter_system_prompt = 'You are an expert tutor and flashcard creator. follow instructions and stay accurate.'
   or btrim(openrouter_system_prompt) = '';

update users
set openrouter_flashcard_prompt = $$you must output valid json only. first character must be {. last character must be }. no text before or after json object.
schema: {"name": string, "flashcards": [{"front": string, "back": string}]}
constraints: name maximum 64 characters. front maximum 4000 characters. back maximum 4000 characters.
task: generate maximum quantity flashcards possible. cover every atomic concept in the source material. include cross-domain applications and connections between concepts. each flashcard tests one discrete piece of knowledge.$$
where openrouter_flashcard_prompt = 'return only a single json object with schema {"name": string, "flashcards": [{"front": string, "back": string}]}. no markdown. no code fences. no extra text. keep name 1-64 chars. keep front/back 1-4000 chars. create clear, specific flashcards.'
   or btrim(openrouter_flashcard_prompt) = '';

