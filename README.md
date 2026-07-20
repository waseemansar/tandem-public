# Tandem

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Agents%20SDK-412991?logo=openai&logoColor=white)](https://openai.github.io/openai-agents-js/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

A single-tenant **Digital Twin** you can fork and make your own. Each deployment represents one person: visitors chat with an AI twin that answers from a curated knowledge doc, and the person can **join any conversation as a clearly-labelled third participant**. When the twin doesn't know an answer, it offers to check with the human; the visitor leaves an email, the human is paged, and the conversation continues live. Resolved exchanges become FAQ entries the twin drafts and the human approves — so the twin compounds in usefulness over time.

The repo ships with a **neutral placeholder identity** — no real name or photo baked in. Set a few env vars, swap the avatar, seed your login and knowledge, and it's yours (see [Make it your own](#make-it-your-own)). One deployment is one person's twin; forking is how a second person gets one.

## Features

- **Three-voice conversation** — every message is unmistakably one of three speakers: the **Twin** (AI, answers instantly), the **Human** (verified, joins when needed), or the **Visitor**. The visitor always knows who they're talking to; the human's arrival is the trust unlock.
- **Knowledge-grounded twin** — answers come from a single curated knowledge doc, editable in the console. No doc, no answer — the twin escalates rather than hallucinates.
- **Human-in-the-loop escalation** — the twin hands off with a tool call; the visitor leaves an email, the human is notified via Pushover, and the thread lands in a signal-only **Inbox**.
- **Cross-device return** — a visitor who closes the tab gets a signed **magic link** that rebinds any browser to the same thread for 30 days.
- **Compounding FAQ** — resolved threads become FAQ suggestions the twin drafts and the human approves in one click.
- **Escalation state machine** — threads move through `twin_only → awaiting_you → active_you → awaiting_visitor → resolved`, with a 30-minute idle auto-resume back to the twin.
- **Layered anti-abuse** — per-conversation and per-IP sliding-window rate limits (Postgres-backed), a visitor message-length ceiling, and an operator kill switch, all bounding LLM cost-burn.
- **Configurable identity** — the represented human (name, pronouns, photo) is build-time config, so the same codebase is a template anyone can fork.

## Tech Stack

| Layer             | Technology                                          |
| ----------------- | --------------------------------------------------- |
| Framework         | Next.js 16 (App Router) + React 19 (React Compiler) |
| Language          | TypeScript 5                                        |
| LLM orchestration | OpenAI Agents SDK + `gpt-5.6-terra`                 |
| Database          | PostgreSQL + Drizzle ORM                            |
| Auth              | Auth.js v5 — Credentials provider                   |
| Styling           | Tailwind CSS v4 + shadcn/ui                         |
| Realtime          | Server-Sent Events                                  |
| Email             | Resend + React Email                                |
| Push              | Pushover                                            |
| Package manager   | pnpm                                                |
| Unit tests        | Vitest + Testcontainers (real Postgres)             |
| E2E tests         | Playwright                                          |
| Lint / format     | ESLint + Prettier                                   |

## Getting Started

### Prerequisites

- Node.js **20.18+** and **pnpm 10**
- **Docker** — for the local Postgres container and for tests

### External accounts

- **OpenAI** — API key for the twin ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)). **Required.** Set a hard monthly spend cap (see [Operations](#operations)).
- **Pushover** — optional; pages the human on escalation. Unset = no notifications.
- **Resend** — optional; delivers visitor magic-link emails. Unset = feature no-ops with a warning.

### 1. Clone & install

```bash
git clone <your-fork-url> tandem
cd tandem
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the values — every variable is documented inline in [`.env.example`](.env.example).

### 3. Start Postgres & migrate

```bash
docker compose up -d      # local Postgres on :5432
pnpm db:migrate           # apply migrations to DATABASE_URL
```

### 4. Seed your admin login & knowledge

Both scripts read `DATABASE_URL` (and `seed:admin` the admin credentials) from `.env`.

```bash
pnpm seed:admin       # single console user, password bcrypt-hashed at rest
pnpm seed:knowledge   # placeholder doc so the twin can answer out of the box
```

### 5. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the visitor chat, and [/admin/signin](http://localhost:3000/admin/signin) for the console.

## Make it your own

A fresh clone runs as a neutral placeholder ("Your Name"). Two things make it represent you — the same steps apply locally and in production (set env vars in your host's dashboard).

**Identity** is config, read from `NEXT_PUBLIC_OWNER_*` env (single source: `src/config/site.ts`):

```bash
NEXT_PUBLIC_OWNER_FULL_NAME="Ada Lovelace"
NEXT_PUBLIC_OWNER_FIRST_NAME="Ada"
NEXT_PUBLIC_OWNER_PRONOUN_SUBJECT=she    # object=her  possessive=her
```

The `NEXT_PUBLIC_` prefix inlines these at build time — **rebuild after changing them.**

**Photo** is a binary, so it can't come from env: replace `public/placeholder-avatar.png` (keep the filename), or point `NEXT_PUBLIC_OWNER_PHOTO` at another path under `public/`.

## Common commands

```bash
pnpm dev                 # dev server
pnpm build && pnpm start # production build + serve
pnpm test                # unit tests (Vitest + Testcontainers; Docker required)
pnpm test:e2e            # Playwright end-to-end suite
pnpm lint                # ESLint (zero warnings)
pnpm db:generate         # generate a migration from the schema diff
pnpm db:migrate          # apply pending migrations
```

## Architecture

```
Visitor (browser)
    │  chat over HTTP  +  SSE stream back
    ▼
Next.js App Router ─────────────────────────────────────────────┐
    │                                                            │
    ├─ anti-abuse guard   layer A: conv id  ·  layer B: client IP (Postgres counters)
    │                                                            │
    ▼                                                            │
Twin (OpenAI Agents SDK + gpt-5.6-terra)                         │
    │  answers from the knowledge doc                            │
    ├─ knows it        →  streams reply                          │
    └─ doesn't know    →  request_human_handoff tool             │
                              │                                  │
                              ▼                                  │
                    Escalation state machine                     │
        twin_only → awaiting_you → active_you                    │
                  → awaiting_visitor → resolved                  │
                              │                                  │
              ┌───────────────┼───────────────┐                 │
              ▼               ▼               ▼                  │
          Pushover        Resend          Console  ◄─────────────┘
        (page human)   (magic link)   (/admin/* — Inbox, Knowledge, FAQ drafts)
                                            │
                              Human joins the thread as a
                              verified third participant
```

- **Stateless twin.** Each turn, the thread's messages are projected into a plain-text transcript that is the twin's entire memory — there is no hidden conversation state.
- **Escalation is a tool call.** The twin decides to hand off by calling `request_human_handoff`; the state machine and notifications hang off that single signal.
- **Join means sending, not opening.** The human enters a thread by sending their first message (emitting a "joined the conversation" system message), so triage browsing never broadcasts false presence.
- **Anti-abuse is on the visitor write path only.** The console is gated by admin sign-in; a valid session is never throttled. An OpenAI 429 (rate limit or spend cap) degrades to a friendly escalation-only reply instead of erroring.

## Project structure

```
src/
├── app/                    # Next.js routes
│   ├── (chat)/             # visitor surfaces
│   ├── admin/              # console (/admin/*)
│   └── api/                # route handlers (chat, admin, auth, health)
├── features/               # business logic, one folder per feature
│   ├── visitor/  console/  twin/  conversation/
├── shared/                 # cross-cutting: auth, email, rate-limit, notifier, magic-link, sse
├── components/             # cross-feature primitives + ui/ (shadcn)
├── config/site.ts          # build-time owner identity
└── db/                     # Drizzle schema, client, migrations
scripts/                    # seed-admin, seed-knowledge
tests/                      # Playwright E2E
```

## Configuration

All variables are documented inline in [`.env.example`](.env.example). The essentials:

| Variable                                                | Purpose                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                                          | Postgres connection for the running app.                          |
| `OPENAI_API_KEY` / `OPENAI_TWIN_MODEL`                  | Twin credentials + model (default `gpt-5.6-terra`). **Required.** |
| `AUTH_SECRET`                                           | Auth.js session secret (`openssl rand -base64 32`).               |
| `AUTH_TRUST_HOST`                                       | `true` behind a reverse proxy (Railway, etc.).                    |
| `NEXT_PUBLIC_OWNER_*`                                   | Represented human's name, pronouns, photo. Rebuild to apply.      |
| `APP_BASE_URL`                                          | Public origin for notification and magic-link deep links.         |
| `PUSHOVER_APP_TOKEN` / `PUSHOVER_USER_KEY`              | Escalation pushes. Unset = no notifications.                      |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL`                  | Magic-link emails. Unset = feature no-ops.                        |
| `MAGIC_LINK_SECRET`                                     | Signs magic-link tokens (`openssl rand -base64 32`).              |
| `RATE_LIMIT_CONVERSATION_PER_MINUTE` / `_IP_PER_MINUTE` | Anti-abuse limits (defaults 10 / 60).                             |
| `DISABLE_TWIN`                                          | Kill switch — exactly `true` makes every reply escalation-only.   |

## Operations

- **OpenAI spend cap (required).** Set a hard monthly limit in the OpenAI dashboard (Settings → Limits). The in-app rate limits bound request volume; the dashboard cap is the absolute ceiling on spend. When hit, OpenAI returns 429s and Tandem degrades to escalation-only replies.
- **Kill switch.** Set `DISABLE_TWIN=true` and redeploy to stop all OpenAI calls mid-incident; visitors still get a friendly escalation-only reply and can leave their email. Unset to restore.
- **Pushover** (optional): copy your **User Key** from [pushover.net](https://pushover.net), create an app for the **API Token**, install the mobile app, then set `PUSHOVER_USER_KEY`, `PUSHOVER_APP_TOKEN`, and `APP_BASE_URL`.
- **Resend** (optional): verify a sending domain at [resend.com](https://resend.com), create a `Sending Access` API key, then set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (prefer the `"Name <addr>"` form), and `MAGIC_LINK_SECRET`.

## Deploy

Tandem is a standard Next.js app backed by Postgres, so it runs on any host offering both — Railway, Render, Fly.io, a VPS. The only host-specific piece is the deploy lifecycle: build with `pnpm build`, then boot with `pnpm db:migrate && pnpm start` so pending migrations apply before the app starts. Set the env vars from `.env.example` in the host's dashboard.

**Railway** is wired out of the box via `railway.json`: connect the repo, add the Postgres plugin, reference its `DATABASE_URL`, set `OPENAI_API_KEY` + `AUTH_SECRET` (+ `AUTH_TRUST_HOST=true`), and push. Verify with `curl -X POST https://<host>/api/health`.

## Testing

```bash
pnpm test        # unit + integration — Testcontainers spins up an ephemeral Postgres (Docker required)
pnpm test:e2e    # Playwright — drives a real build against a separate Postgres and real OpenAI (gpt-5-nano)
```

Unit tests never touch the development database. For E2E, copy `.env.test.example` to `.env.test`, then `docker compose up -d postgres-e2e`.

## License

[MIT](LICENSE).
