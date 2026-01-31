# website

## local setup

1) install deps

```bash
npm install
```

2) install and start postgres (arch linux example)

```bash
sudo pacman -S postgresql
sudo -iu postgres initdb -D /var/lib/postgres/data
sudo systemctl enable --now postgresql

sudo -iu postgres createuser --createdb "$USER"
createdb website
```

3) configure env (set `DATABASE_URL` to your local postgres)

```bash
cp .env.example .env
```

note: `.env.example` uses a unix socket connection (`/run/postgresql`) which works well with peer auth on arch linux. if you prefer tcp, use a url like `postgresql://user:password@localhost:5432/website`.

4) run migrations

```bash
npm run db:migrate
```

5) start dev server

```bash
npm run dev
```

## deployment (supabase + vercel)

1) create a supabase project, then go to `project settings` -> `database` and copy:

- a direct connection string (for running migrations)
- a pooled connection string (transaction pooler, recommended for vercel)

2) run migrations against supabase (from your machine)

```bash
DATABASE_URL="your direct supabase connection string" npm run db:migrate
```

3) deploy to vercel

- import this repo in vercel
- set env var `DATABASE_URL` to your pooled supabase connection string
- deploy

## auth rules

- unauthenticated users can only access `/login` and `/register`
- authenticated users are redirected to `/practice`
- username: 1-32 chars, only `[a-z0-9_.]`
- password: 1-64 chars
- password hashing: argon2id
