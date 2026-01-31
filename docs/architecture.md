this repo uses next.js app router.

src/app owns routing and api route handlers. pages should stay thin and compose from feature modules.

src/features owns product behavior by domain (decks, practice, settings, profile). each feature can have a ui folder for react components and a server folder for server-only logic.

src/ui owns shared, reusable ui primitives and shells that are not specific to a single feature.

src/shared owns shared types, validation schemas, and client-safe utilities used by both server and client.
