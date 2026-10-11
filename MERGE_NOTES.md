# Cosa — merged build

One project built from all 15 uploaded zips. This file replaces the old `PATCH_NOTES.txt`
(which described changes that weren't actually in the code).

## What it's built from
**Base:** `Mafia2-main-fixed-v3` — the most complete line (casino, prestige, notoriety scaling,
exact BigInt money math, elite stocks, persistence) with the chat/ping/model fixes.

| Taken from | What | 
|---|---|
| `Mafia2-main-fixed_PA` | Prestige **upgrade tree** (`Cosa prestige tree / buy / leave`), the post-ascension tree screen, lifetime-Respect leaderboard, and the extended number suffixes (up to vigintillion) |
| `Mafia2-updated-2026-09` | The `shop_daily_purchases` migration (`supabase-migration-2026-09.sql`) — the shop's daily limits need that table |
| deployed `mafia-main-fixedv3` line + `-2026-09` | The anti-spam system, kept but **opt-in** (`ANTISPAM=on`) |

**Deliberately NOT taken** (they were regressions or risks):
- `mafia-main-fixed*` / `mafia-main`: old "Don Clint" lineage — would put the wrong owner ID back, left
  `DON CLINT` strings in the text, lost casino games / keepalive / exact money math.
- The "Extremely Aggressive" mood text that ordered the bot to use slurs (incl. the n-word). It breaks
  the persona's own hard rule and Discord's rules.
- `M2PA`'s `features.js`/`firms.js` and its `\d+` parsers: dropped `all` and `5k`-style amounts and the exact share math.
- The loose `files*.zip` patches: older float-based drafts, fully superseded.

## Fixes
**Chat**
- Model chain `qwen/qwen3.8-27b → openai/gpt-oss-120b → openai/gpt-oss-20b`. Retired (404) or rate-limited
  models are skipped; at startup the bot asks Groq which models your account can use and logs it.
- If every model is briefly rate-limited it waits (≤15 s) instead of failing the message.
- Reasoning models get token headroom (no more cut-off/empty replies → "Something went wrong").
- Replies no longer wait a fixed 5 s (`AI_MIN_REPLY_DELAY_MS`, default 1.2 s).
- Fiction rule + refusal guard: mafia-war roleplay stays in character; boilerplate refusals are retried once
  and never stored in history. Hard-limit topics (sexual/minors/hate/doxxing) are never pushed past a refusal.
- `cosa help` / `cosa commands` / `cosa rank help` answered nothing at all (the reply was discarded). Fixed.

**Pings**
- Default: the bot may ping individual **users only** — never `@everyone`, `@here` or roles — anywhere.
- Anything the AI writes can't ping at all: `@everyone/@here` are broken, `<@role>` and `<@user>` become plain text,
  and AI replies are sent with pings disabled (the normal reply-ping on the person asked is kept).
- Replies ping the person replied to again (a default Discord quirk had silently turned that off).

**Other bugs**
- Every message was answered twice: `init()` ran twice, registering every handler (and timer) twice. Fixed + guarded.
- `exile @user` / `unexile @user` in Jarvis mode answered "Unknown command".
- `stock buy X all` replied "Buy at least 1 share".
- `Cosa gang create` could crash when the database didn't return the new row.
- A slash-command description over 100 characters crashed the whole bot at startup. `npm run validate`
  checks all commands before you deploy, and a guard trims such a description instead of crashing.

## Before you deploy
1. **Host env vars:** delete any old `GROQ_MODEL_CHAT`, `GROQ_MODEL_PARSE` (and `*_FALLBACK`) — env vars override the
   defaults. The boot log prints which models are active and where they came from.
2. **Run the SQL** in Supabase if not already applied: `supabase-migration-2026-09.sql`,
   `prestige-and-notoriety-roles.sql`, `cooldown-persistence-additions.sql`.
3. `npm run validate` (slash commands) and `npm test`.
4. Optional: `ANTISPAM=on` (see `_env.example`).

## Known limits
- Groq's free tier caps tokens **per minute per model** (e.g. 8,000 on gpt-oss); the chain spreads load across
  three models, but a very busy server can still hit the cap.
- `/leaderboard`, `/auditlog` etc. depend on your database tables existing.

## Update: "the AI can only say 'The' / 'I'" (root causes and fixes)
Your Groq logs showed `qwen3.8-27b` "succeeding" with replies shrinking 20 → 2 tokens, plus 429s that never reached the fallback.
- **Cut-off replies poisoned the history.** The shared 20-message history stored the one-word replies, and each new reply
  imitated them. Now: cut-off replies are detected (`I`, `I'm`, `Mr`, `The`, `You`…), retried on a **different model with a clean slate**
  (no history), never stored, and any that slipped in are filtered. A model that cuts off twice in 5 min is benched for 5 min.
- **Qwen misread a trailing `system` note** (speaker card / retry nudge) as a fake user turn. Now every request ends on a real user turn;
  system notes are folded into it.
- **Fallback never ran because the SDK retried 429s silently on the same model** (and kept burning tokens after our timeout).
  Now `maxRetries: 0` + a real 20 s request timeout, so a 429 fails over to the next model immediately.
- **Token limit:** prompts were ~3,000 tokens against per-minute caps of ~6–8K (≈2 chats/min). The persona is ~35% shorter (same rules,
  checked by a test), identity/speaker text is compact, history is capped at 650 tokens, and the bot now **learns each model's cap from
  Groq's 429 text**, reserves budget before sending, and routes to a model with room *before* getting rejected. Prompt ≈ 2,100 tokens.
- Persona now says: always reply with at least one complete sentence, never a single word.
- If Qwen still misbehaves for you, set `GROQ_MODEL_CHAT=openai/gpt-oss-120b` on Render (steadier, less "human"); the log lines
  `[AI CUT-OFF]` show how often it happens and which model did it.
