# bryteo v1 — Design Specification

**Status:** Approved through brainstorming. Ready for implementation planning.
**Date:** 2026-06-09
**Predecessor:** `2026-05-31-brainstorming-notes.md`
**Target ship:** 14-17 days from kickoff

---

## 1. Vision

`bryteo` is a Chrome extension that turns YouTube videos into a personal retention system. The wedge against competitors (HoverNotes, Glasp, others) is **retention-first design**: notes are commodity, but spaced-repetition flashcards generated automatically from videos — and reviewed on a science-backed schedule — are not.

**Tagline:** *They take notes. We make you remember.*

**v1 success criteria** (informs every scope decision):
- Ship a Chrome Web Store Unlisted build in ~14 productive days
- Achieve Chrome Web Store Featured-badge eligibility (minimum permissions, single-purpose, polished UX, real privacy policy)
- Demonstrate the retention loop end-to-end: install → outline → cards → daily review → measurable recall
- 5-star CWS reviews from the first ~50 beta installs
- $8-13K MRR target by month 12 (informs pricing, not v1 scope)

---

## 2. Locked decisions

| Area | Decision | Rationale |
|---|---|---|
| **Platform scope** | YouTube-only v1 + `PlatformAdapter` interface for later | 14-day build, minimum permissions, no ToS risk from paid platforms |
| **Audience** | General — "anyone who learns on YouTube" | Broadest TAM; retention is the wedge, not vertical focus |
| **Brand name** | `bryteo` | Invented, premium, all domains available |
| **Free tier model** | Storage-capped (50 saved cards), unlimited generation | Loss-aversion conversion trigger; Featured-badge safe (no crippled features) |
| **Identity** | Anonymous Supabase user created silently on install | Zero-friction install; Pro upgrade links email to same user_id, no data migration |
| **AI inference path** | All Anthropic calls proxied through Supabase Edge Functions | API key never leaves server; per-user rate limiting; model routing (Haiku/Sonnet) |
| **SRS algorithm** | FSRS-6 via `ts-fsrs` (MIT) | ~25% fewer reviews than SM-2 for same retention; modern, credible, lightweight |
| **Payments** | LemonSqueezy (Merchant of Record) | All-in 5% covers global tax compliance; cheaper than Stripe net-of-Anrok until ~$100K MRR; Stripe-owned |
| **Domain registrar** | Cloudflare Registrar + Cloudflare DNS, purchase deferred to ~T-1w before public CWS launch | Wholesale pricing, fastest global DNS, free SSL/CDN/DDoS bundled |
| **Launch strategy** | CWS Unlisted beta → Public ~3 weeks later | Lower rejection risk on first review; positive review base before cold traffic |
| **Onboarding personalization** | No goal picker. Per-deck style picker (Quick / Exam-ready / Deep / Language) at card-generation time | AI detects topic from transcript; "style" applies across any topic and matters more than "goal" |

---

## 3. Architecture (Approach A — Lean)

### 3.1 System shape

```
┌─────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3, WXT-built)          │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Popup   │  │   Side   │  │  Content Script  │   │
│  │ (auth +  │  │   Panel  │  │  (transcript +   │   │
│  │  Pro UI) │  │ (workspc)│  │   timestamp tap) │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────────────┘   │
│       └─────────────┴─────────────┘                 │
│                     │                               │
│              ┌──────┴──────────┐                    │
│              │ Service Worker  │                    │
│              │ (message bus,   │                    │
│              │  SRS scheduler) │                    │
│              └──────┬──────────┘                    │
└─────────────────────┼───────────────────────────────┘
                      │ HTTPS + Supabase JWT
                      ▼
┌─────────────────────────────────────────────────────┐
│  Supabase Project (bryteo-prod)                     │
│                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │   Auth   │  │  Postgres   │  │ Edge Functions│   │
│  │ (anon +  │  │  (RLS on    │  │   (Deno)      │   │
│  │  email)  │  │  every tbl) │  │               │   │
│  └──────────┘  └─────────────┘  └───┬───────────┘   │
└─────────────────────────────────────┼───────────────┘
                                      │
                          ┌───────────┴────────────┐
                          ▼                        ▼
              ┌──────────────────┐    ┌──────────────────┐
              │ Anthropic API    │    │ LemonSqueezy     │
              │ (Haiku / Sonnet) │    │ (webhooks in)    │
              └──────────────────┘    └──────────────────┘
```

### 3.2 Tech stack (pinned)

| Layer | Choice | Version target |
|---|---|---|
| Extension framework | WXT | 0.20+ |
| UI | React + TypeScript + Tailwind | React 19 / TS 5.6 / Tailwind 4 |
| Server state | TanStack Query | 5.x |
| Client state | Zustand | 5.x |
| Client cache | Dexie (IndexedDB wrapper) | 4.x |
| SRS engine | `ts-fsrs` | 4.x |
| Backend | Supabase (Auth + Postgres 15 + Edge Functions/Deno) | latest |
| LLM SDK | `@anthropic-ai/sdk` (in Edge Function) | latest |
| Payments | LemonSqueezy | n/a (hosted) |
| Analytics | PostHog (extension) + Plausible (landing) | latest |
| Error tracking | Sentry (free tier) | latest |
| Tests | Vitest + Playwright | latest |

### 3.3 Edge Functions (3)

| Function | Purpose | Auth |
|---|---|---|
| `generate-outline` | POST `{videoId, transcript, title}` → `{outline: [...]}` | Supabase JWT required |
| `generate-cards` | POST `{outlineSection, style}` → `{cards: [...]}` | Supabase JWT required |
| `lemonsqueezy-webhook` | Receives LS subscription events → updates `profiles.pro_status` | HMAC signature required (no JWT) |

A fourth scheduled job (Supabase cron, not an edge function): **daily LemonSqueezy reconciliation** to catch any missed webhooks.

### 3.4 Chrome permissions (kept minimum for Featured-badge)

```json
"permissions": ["storage", "sidePanel", "activeTab"],
"host_permissions": ["https://*.youtube.com/*"],
"externally_connectable": { "matches": [] }
```

Explicitly absent: `tabs`, `<all_urls>`, `webRequest`, `cookies`, `bookmarks`, `history`, `webNavigation`.

Permission justifications for the listing:
- `storage` — local cache of your decks for instant reads
- `sidePanel` — open the workspace panel beside the YouTube video
- `activeTab` — read the current YouTube video's transcript when you click the extension. Never reads any other tab.
- `https://*.youtube.com/*` — required to extract transcript from the video you're watching

### 3.5 Content Security Policy

`connect-src` whitelisted to: Supabase project URL, LemonSqueezy checkout, Anthropic (never — server-side only). No `unsafe-eval`, no `unsafe-inline`. Manifest V3 already blocks remote code; we tighten further.

---

## 4. Data model

### 4.1 Postgres schema

```sql
-- profiles: 1 row per Supabase auth user (anon or email)
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  pro_status          text not null default 'free',  -- 'free' | 'pro' | 'founding' | 'student'
  pro_expires_at      timestamptz,
  ls_customer_id      text,
  ls_subscription_id  text,
  card_count          int not null default 0,
  notification_hour   int default 8,                  -- 0-23, user's local time
  created_at          timestamptz not null default now()
);

-- videos: 1 row per (user, YouTube video)
create table videos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  yt_video_id   text not null,
  title         text not null,
  channel       text,
  duration_s    int,
  thumbnail_url text,
  created_at    timestamptz not null default now(),
  unique (user_id, yt_video_id)
);

-- outlines: 1 row per video
create table outlines (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos(id) on delete cascade unique,
  sections    jsonb not null,  -- [{title, summary, start_s, end_s, key_points: []}]
  model_used  text not null,   -- 'haiku' | 'sonnet'
  created_at  timestamptz not null default now()
);

-- decks: 1 row per video
create table decks (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade unique,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  style      text not null default 'quick',  -- 'quick'|'exam'|'deep'|'language'
  created_at timestamptz not null default now()
);

-- cards: counted toward 50-card free cap
create table cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references decks(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null,   -- 'basic' | 'cloze'
  front       text not null,
  back        text not null,
  source_ts_s int,
  fsrs_state  jsonb not null,  -- {stability, difficulty, due, last_review, reps, lapses, state}
  due_at      timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index cards_due_idx on cards (user_id, due_at);

-- card count trigger
create or replace function update_card_count() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update profiles set card_count = card_count + 1 where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update profiles set card_count = card_count - 1 where id = old.user_id;
  end if;
  return null;
end; $$ language plpgsql;

create trigger cards_count_trigger
  after insert or delete on cards
  for each row execute function update_card_count();

-- review log: append-only
create table review_log (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references cards(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  rating      smallint not null,  -- 1=again 2=hard 3=good 4=easy
  elapsed_ms  int not null,
  reviewed_at timestamptz not null default now()
);

create index review_log_user_idx on review_log (user_id, reviewed_at desc);

-- rate_limits: per-user daily counters
create table rate_limits (
  user_id        uuid not null references profiles(id) on delete cascade,
  day            date not null,
  outlines_today int not null default 0,
  cards_today    int not null default 0,
  primary key (user_id, day)
);
```

### 4.2 Row-Level Security (RLS)

Every table has RLS enabled. Pattern: `auth.uid() = user_id` (or `= id` for the `profiles` table itself).

```sql
alter table profiles enable row level security;
create policy "users see own profile" on profiles
  for all using (auth.uid() = id);

alter table videos enable row level security;
create policy "users see own videos" on videos
  for all using (auth.uid() = user_id);

-- Same pattern: outlines (via videos.user_id), decks, cards, review_log, rate_limits
```

The `lemonsqueezy-webhook` Edge Function uses the Supabase **service role key** to bypass RLS when updating `profiles.pro_status`.

### 4.3 Design rationale

- `profiles.card_count` denormalized → 50-cap check is O(1)
- `outlines.sections` and `cards.fsrs_state` as JSONB → read whole, write whole, no need for sub-tables
- `cards.due_at` extracted from `fsrs_state` and indexed → fast "what's due now?" queries
- `review_log` append-only → preserves data for future FSRS personalization
- Cascade deletes everywhere → one-click GDPR account deletion

### 4.4 Free → Pro upgrade migration

**None required.** The anonymous user is already in Postgres. Pro upgrade links an email to the same `auth.users` row and flips `profiles.pro_status`. No data movement.

---

## 5. User flows

### 5.1 Install (target: 10 seconds to "ready")

1. User installs from Chrome Web Store.
2. A welcome tab opens with one screen: *"Open a YouTube video to start. The side panel will appear."*
3. Behind the scenes:
   - Anonymous Supabase account created (`supabase.auth.signInAnonymously()`)
   - `user_id` stored in extension storage
   - Empty `profiles` row created via trigger on `auth.users` insert
4. Done. No goal selection, no email ask, no permission re-prompts.

### 5.2 First Smart Outline

1. User opens any YouTube video and clicks the bryteo icon.
2. Side panel opens: *"Analyzing this video…"*
3. Content script extracts transcript from YouTube's built-in captions (`ytInitialPlayerResponse.captions` or the rendered transcript panel as fallback).
4. Service worker bundles `{transcript, video_id, title, channel, duration_s, thumbnail_url}` and POSTs to `generate-outline`.
5. Edge Function:
   - Checks `rate_limits` for current day (20 outlines/day free, 200/day Pro)
   - Calls Claude (Haiku for free, Sonnet for Pro) with structured-output prompt
   - Validates response against schema
   - Inserts into `videos` + `outlines`
6. Side panel renders outline:
   - Sections with summaries + key points
   - Clickable timestamps that seek the video player
   - "Generate flashcards from these sections" button

### 5.3 Generate flashcards

1. User selects sections (default: all) and the **style picker** appears:
   - ⚡ Quick (5 cards, big concepts)
   - 🎯 Exam-ready (15 cards, denser)
   - 📖 Deep mastery (25 cards, edge cases)
   - 🌍 Language learning (cloze-heavy)
2. Click "Create cards" → `generate-cards` Edge Function called with `{outlineSection, style}`.
3. Prompt template varies by style. Returns `{cards: [{front, back, type, source_ts_s}]}`.
4. Cards land in a swipeable preview UI. Per card: **edit / regenerate / delete**.
5. "Save to library" → cards persist to Postgres; `card_count` auto-increments.
6. If save would exceed 50 cards (free tier), see flow 5.5.

### 5.4 Daily review (the retention loop)

1. Entry point: user opens extension OR receives soft notification at `notification_hour`.
2. Side panel opens to Review Mode.
3. Query: `select * from cards where user_id = $1 and due_at <= now() order by due_at asc limit 30`.
4. For each card:
   - Front shown with video title + timestamp
   - "Show answer" reveals back
   - 4 rating buttons: Again / Hard / Good / Easy
   - "Replay 30s of video" link
5. On rating:
   - `ts-fsrs` computes new stability + difficulty + next due date
   - Update `cards.fsrs_state` + `cards.due_at`
   - Insert row into `review_log`
6. End-of-session screen: *"✨ N cards reviewed • 🔥 X-day streak • Next review: tomorrow Y:00."*

### 5.5 50-card cap → upgrade

1. Before saving card #51, app reads `profiles.card_count`. If ≥ 50:
2. Contextual (non-blocking) upsell appears:
   *"You've built a 50-card library. Keep going with bryteo Pro — unlimited cards, cross-device sync, smarter AI. $6.99/mo or $49/yr."*
3. "Go Pro" → opens LemonSqueezy checkout in a new tab with `user_id` passed as custom field.
4. User pays. LemonSqueezy sends `subscription_created` webhook to `lemonsqueezy-webhook`.
5. Edge Function:
   - Verifies HMAC signature
   - Looks up `user_id` from the custom field
   - Updates `profiles.pro_status='pro'`, `pro_expires_at`, `ls_customer_id`, `ls_subscription_id`
6. Extension polls `profiles` every 60 seconds. On next poll, sees `pro_status='pro'`, upsell disappears, card #51 saves.

---

## 6. Error handling

### 6.1 Failure modes and user-facing behavior

| Failure | What user sees | What system does |
|---|---|---|
| YouTube video has no captions | *"This video doesn't have captions yet. Try a video with the [CC] icon."* | No retry. Telemetry event. |
| Anthropic 5xx or timeout | *"AI is having a slow moment. Try again."* | 30s timeout, 1 silent retry, then error |
| AI returns malformed JSON | Single transparent retry; if still bad → *"Something went sideways on our end."* | Schema validation in Edge Function |
| User's network drops | *"Saving…"* indicator persists, syncs when online | Pending-action queue in chrome.storage |
| 50-card cap hit | Upsell modal (Flow 5.5) | Insert blocked client-side AND server-side |
| LemonSqueezy webhook never arrives | User sees Pro within ≤24h via reconciliation job | Daily Supabase cron job reconciles via LS API |
| Chrome service worker dies mid-task | Invisible to user | Checkpoint state to `chrome.storage.local` every 5s |
| Bad AI card | Per-card "regenerate" or "delete" buttons | Edge function takes `regenerate: cardId` parameter |

### 6.2 Rate limiting

| Tier | Outlines/day | Cards generated/day |
|---|---|---|
| Free | 20 | 200 |
| Pro | 200 | 2,000 |

Enforced server-side in `rate_limits` table. Exceeded → 429 response with retry-after.

---

## 7. Security

1. **API keys never leave the server.** Anthropic key in Supabase env vars; never in extension bundle.
2. **LemonSqueezy webhook HMAC-verified.** Signature header checked against shared secret; mismatches return 401.
3. **RLS on every Postgres table.** Database itself enforces user data isolation.
4. **Per-user rate limiting** prevents one user from racking up $thousands in API charges.
5. **Edge Functions auth-gated** with Supabase JWT (except `lemonsqueezy-webhook` which has its own signature check).
6. **Strict CSP** in extension manifest: `connect-src` whitelisted to Supabase + LemonSqueezy checkout only.
7. **No third-party scripts** loaded in extension. Everything bundled.
8. **HTTPS-only ingress** on all endpoints.
9. **Service role key** used only in Edge Functions, never in browser.
10. **Sentry configured to scrub PII** — no card content, no titles, no transcripts in error reports.

---

## 8. Privacy

### 8.1 What we send to Anthropic
- Video transcript (text)
- Video title and selected style
- Nothing else (no user ID, no email)

### 8.2 What we store in Supabase
- Anonymous user ID (always)
- Email + LemonSqueezy customer/subscription IDs (only after Pro upgrade)
- Videos opened (YouTube IDs + titles + metadata)
- Outlines, decks, cards
- Review log (for FSRS + analytics)
- Subscription status

### 8.3 What we never collect
- Browsing history outside YouTube
- IP address (configured retention: 7 days max)
- Google/YouTube account info
- Content of any other tab

### 8.4 What lives only on device
- Supabase auth tokens
- IndexedDB card cache
- Pending-action queue

### 8.5 Account deletion
- One-click in settings → Postgres cascade delete + LemonSqueezy subscription cancel
- Total time: ~3 seconds
- GDPR/CCPA compliant by design

### 8.6 Analytics (PostHog)
- Event names only: `outline_generated`, `card_reviewed`, `upgrade_clicked`, etc.
- Properties limited to: tier (free/pro), style picked, video duration bucket
- Never: outline content, card front/back, video titles, video IDs

---

## 9. Chrome Web Store compliance

| CWS reviewer concern | Our answer |
|---|---|
| Single purpose | "AI learning aid for YouTube videos" |
| Minimum permissions | `storage`, `sidePanel`, `activeTab`, one host |
| Permission justification | One-line per permission in listing |
| Privacy policy URL | Hosted at bryteo.com/privacy (or Notion public page until domain purchased) |
| Manifest V3 compliance | Native — WXT is MV3-first |
| No remote code | Everything bundled, no CDN imports |
| No deceptive UI | Clear "Maybe later" on every upsell; no fake system dialogs |
| No keyword stuffing | Plain English description |
| Submission strategy | Unlisted first → fix any feedback → Public after positive beta reviews |

---

## 10. Testing strategy

### 10.1 Layers

| Layer | Tool | Count | Run when |
|---|---|---|---|
| Unit | Vitest | ~50-80 | On file save |
| Integration | Vitest + local Supabase | ~15-20 | On commit |
| End-to-end | Playwright + Chrome extension | ~5 | Before release |

### 10.2 What we test

- FSRS scheduler logic (given card + rating → correct next due date)
- 50-card cap enforcement (49 OK, 50 blocked)
- Prompt builders (transcript + style → expected prompt)
- Card validation (rejects malformed cards)
- Anonymous auth → profile row creation
- Card insert → card_count trigger fires correctly
- RLS — attempt to read another user's data fails
- LemonSqueezy webhook handler (signature check + entitlement flip)
- E2E: install → outline → cards → review one card
- E2E: hit 50-cap → see upsell → simulate Pro → save card 51
- E2E: network failure mid-action → recovery

### 10.3 What we deliberately don't test
- AI output subjective quality (measured via user retention instead)
- YouTube DOM stability (monitored via PostHog alert if transcript scrape fails >5%/hr)
- Visual regression per PR (manual review at milestones)
- LemonSqueezy reliability (their problem; reconciliation is our safety net)
- Anthropic API correctness

---

## 11. Build timeline (14-17 days)

| Day | Deliverable |
|---|---|
| **1** | WXT project + Supabase project + schema + RLS deployed. Extension sideloads. |
| **2** | Anonymous auth working. Welcome screen + empty side panel. |
| **3** | Content script extracts transcript from YouTube. |
| **4** | `generate-outline` Edge Function deployed and returning structured output. |
| **5** | Outline UI ships — sections, clickable timestamps. First "wow" moment. |
| **6** | `generate-cards` Edge Function + style picker UI. |
| **7** | Card preview UI (swipe, edit, regenerate, delete, save). |
| **8** | FSRS-6 wired into card creation + review queue endpoint. |
| **9** | Review mode UI — flip, rate, end-of-session screen, streak. Second "wow." |
| **10** | 50-card cap + contextual upsell + Pro polling. |
| **11** | LemonSqueezy: checkout, webhook handler, entitlement flip, reconciliation cron. Test payment works. |
| **12** | Polish — empty/loading/error states, "no captions" fallback, settings, account deletion. |
| **13** | Privacy policy, listing copy, screenshots, demo GIF, icon, promo tile. |
| **14** | Submit to CWS as Unlisted. While waiting, prep launch tweet thread. |

**Buffer days 15-17** absorb: prompt-tuning surprises, CWS rejection-and-resubmit, YouTube DOM quirks.

**Riskiest days:** 1-2 (infra setup), 4 + 6 (prompt engineering), 11 (payments).

---

## 12. Explicitly out of scope for v1

| Feature | Earliest |
|---|---|
| Coursera / Udemy / LinkedIn Learning support | Month 2-3 (Coursera first per ToS analysis) |
| In-page YouTube overlay | Month 2 |
| Exports — Anki, Notion, CSV, Markdown | Month 1 post-launch (Pro) |
| Multiple-choice / image-occlusion cards | Month 2-3 (Pro) |
| Audio review mode | Month 2-3 (Pro) |
| Real-time multi-device sync (live, not on-focus) | Month 2-3 if users ask |
| Mobile web companion | Month 3+ |
| Founding Member tier ($29/yr, first 500) | Day 1 of public launch (pricing config only) |
| Student tier (.edu verify) | Month 1 post-launch |
| Pro+ AI Boost (Claude Opus) | Month 3+ if Pro signal strong |

---

## 13. Open items (to revisit pre-launch)

- **Domain purchase**: defer until name is final; budget $10.44 at Cloudflare for `bryteo.com`
- **Privacy policy hosting**: Notion public page until domain bought, then move to `bryteo.com/privacy`
- **Razorpay add-on for Indian UPI**: revisit at month 2 if India conversion underperforms
- **Personal FSRS parameter training**: revisit at month 3+ when review_log has enough data
- **PostHog vs Plausible split**: confirm during day 12 — may consolidate to PostHog only
- **Soft notification permission UX**: design the moment we ask for it (probably after first deck saved, not at install)

---

## 14. Feature summary (the whole v1 in one glance)

**Core learning loop**
- Smart Outlines (AI, timestamped, clickable)
- AI Flashcards with per-deck style picker (Quick / Exam-ready / Deep / Language)
- Basic Q/A + cloze cards
- Per-card timestamp jump-back
- Card preview: edit / regenerate / delete
- FSRS-6 spaced repetition
- Daily review with 4-rating system
- Streak counter + session summary
- Soft daily review notification

**Identity + library**
- Zero-friction anonymous install
- Personal library (videos, decks, cards, reviews)
- One-click account deletion

**Free → Pro**
- 50-card free cap with contextual upsell
- LemonSqueezy checkout (Pro at $6.99/mo or $49/yr)
- Pro: unlimited cards + cross-device sync + Claude Sonnet
- Founding ($29/yr first 500) + Student ($29/yr .edu) tiers as pricing options

**Quiet but important**
- Side panel UI (no in-page overlay v1)
- Settings (notification time, account deletion, manage subscription)
- Server-proxied AI calls (no key leakage)
- Per-user rate limiting
- Privacy-first analytics
