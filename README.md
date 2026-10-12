# Cosa — Discord mafia-game bot

A Discord bot with a mafia-themed economy game (bank, businesses, firms, gangs, turf wars, bounties,
casino, stocks, prestige, chess, …) and an AI personality ("Cosa") you can chat with.
Node.js 22 · discord.js · Supabase (Postgres) · Groq (LLM API).

## Quick start
```bash
npm install
cp _env.example .env      # then fill it in (never commit .env)
npm start
```
**Required** environment variables: `DISCORD_TOKEN`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`
(use the Supabase *service_role* key, on the server only). Everything else is optional — see `_env.example`.

## Database
Run these in the Supabase SQL editor (safe to re-run):
`prestige-and-notoriety-roles.sql`, `cooldown-persistence-additions.sql`, `supabase-migration-2026-09.sql`.

## Before every deploy
```bash
npm run check        # ~80s — syntax, slash-command limits, unit tests, and a full boot with fake messages
```
It needs no tokens, network or database. If it says **do NOT deploy yet**, fix that first.
Related: `npm run validate` (slash commands only), `npm test` (money-precision tests), `npm run smoke` (boot test only).
For deeper sweeps: `SWEEP=tests/commands.txt node tests/smoke.js` runs a list of text commands;
`node scripts/dump-commands.js && SLASH=$TMPDIR/cmdtree.json node tests/smoke.js` runs every slash command.

## Deploying on Render
Build command `npm install`, start command `npm start`. Set the environment variables in
**Dashboard → your service → Environment**. On boot the log prints which AI models are active and whether each
came from an env var or the code default.
> If you ever see old `GROQ_MODEL_*` variables there, delete them: environment variables **override** the defaults.

## How the AI chat works
- **Model chain:** `qwen/qwen3.8-27b → openai/gpt-oss-120b → openai/gpt-oss-20b`. A model that is retired, rate-limited
  or returns cut-off replies is skipped automatically (each Groq model has its own per-minute token budget, so the chain
  also multiplies capacity). Override with `GROQ_MODEL_CHAT`, `GROQ_MODEL_CHAT_FALLBACK`, `GROQ_MODEL_LAST_RESORT`.
- **Quality guards:** cut-off replies (`I`, `The`…) are retried on another model with a clean slate and never stored;
  refusals during mafia-war roleplay are retried in character; repeated lines are rephrased.
- **Pings:** the bot may ping individual *users* only. `@everyone`, `@here` and roles are blocked everywhere, and
  nothing the AI writes can ping anyone.
- **Fairness:** one person can't drain the shared token budget (`AI_USER_COOLDOWN_MS`, default 3 s; the Don/devs are exempt).
- **Diagnostics:** the Don/devs can type **`cosa ai status`** to see each model's health, rate-limit windows and counters.

## Troubleshooting
| Symptom | Look at |
|---|---|
| Replies are one word / cut off | `[AI CUT-OFF]` lines in the log; `cosa ai status`. Try `GROQ_MODEL_CHAT=openai/gpt-oss-120b`. |
| "Something broke on my end" | `cosa ai status` (Don/devs also see the reason in the error message). |
| Bot crashes at startup | Run `npm run validate` — a slash-command description over 100 characters kills the bot at load. |
| A model "doesn't exist" | The boot log lists the models your Groq account can use; set `GROQ_MODEL_CHAT` to one of them. |
| Everything answered twice | Make sure only **one** instance of the bot is running on the host. |

## Project layout
`index.js` (events, parsing, AI) · `economy.js`, `bank.js`, `businesses.js`, `firms.js`, `gangs.js`, `turf.js`, `bounties.js`,
`casino.js`, `prestige*.js`, … (game systems) · `scripts/` (check + validators) · `tests/` (suites run by `npm run check`) · `*.sql` (schema).

## Editing safely (people and AI tools)
1. Run `npm run check` before committing; never deploy on a red check.
2. Slash-command descriptions are limited to **100 characters**.
3. Event handlers are registered once inside `init()` — never call `init()` twice.
4. Money is exact: use the `eco.*` BigInt helpers (`toBigIntSafe`, `multiplyMoney`, …), not floating-point math.
5. Anything the AI says must go through `sanitizeOutput()`; never allow `@everyone`/role pings.
