# bryteo v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the bryteo Chrome extension v1 — Smart Outlines + AI Flashcards + FSRS-6 spaced repetition with LemonSqueezy-gated Pro tier — into Chrome Web Store Unlisted in 14-17 working days.

**Architecture:** Manifest V3 Chrome extension built with WXT (React + TypeScript + Tailwind). Anonymous Supabase auth on install; Postgres + RLS for storage; three Deno Edge Functions proxy Anthropic + receive LemonSqueezy webhooks. ts-fsrs runs client-side for review scheduling.

**Tech Stack:** WXT 0.20, React 19, TypeScript 5.6, Tailwind 4, TanStack Query 5, Zustand 5, Dexie 4, ts-fsrs 4, Supabase (Auth + Postgres 15 + Edge Functions/Deno), Anthropic SDK, LemonSqueezy, PostHog, Sentry, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-09-bryteo-v1-design.md` (single source of truth — always defer to spec on disagreement).

---

## File Structure

```
bryteo/
├── package.json                    # workspace root
├── tsconfig.json
├── wxt.config.ts                   # WXT extension config (manifest, permissions, CSP)
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── .env.example                    # template for VITE_ vars
├── .env                            # gitignored, real secrets
│
├── entrypoints/                    # WXT extension entry points
│   ├── background.ts               # service worker — message bus, SRS scheduler
│   ├── content.ts                  # YouTube content script — transcript extraction
│   ├── popup/                      # toolbar popup — auth status, pro upsell hub
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── sidepanel/                  # main workspace next to YouTube
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   └── welcome/                    # one-screen onboarding tab
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
│
├── src/
│   ├── api/                        # Supabase client + table-level CRUD
│   │   ├── supabase.ts             # client init, single instance
│   │   ├── auth.ts                 # anon signin, link email
│   │   ├── profile.ts              # read/update profiles row
│   │   ├── videos.ts               # upsert (user, video) row
│   │   ├── outlines.ts             # generate-outline RPC + read
│   │   ├── decks.ts                # create deck, set style
│   │   ├── cards.ts                # generate-cards RPC, save batch, delete
│   │   └── reviews.ts              # due-queue query, rating mutation
│   │
│   ├── components/
│   │   ├── ui/                     # primitives — Button, Card, Dialog, Toast
│   │   ├── WelcomeScreen.tsx
│   │   ├── OutlineView.tsx         # outline render + timestamp jump
│   │   ├── StylePicker.tsx
│   │   ├── CardPreviewStack.tsx    # swipe + edit + delete pre-save
│   │   ├── ReviewCard.tsx          # flip + 4 rating buttons
│   │   ├── SessionSummary.tsx      # streak + next due
│   │   ├── UpsellBanner.tsx        # 50-cap contextual upsell
│   │   ├── SettingsView.tsx
│   │   └── ErrorBoundary.tsx
│   │
│   ├── lib/
│   │   ├── fsrs.ts                 # ts-fsrs wrapper — init state, rate→next due
│   │   ├── transcript.ts           # YouTube transcript extraction
│   │   ├── prompts.ts              # outline + cards prompt builders
│   │   ├── validation.ts           # zod schemas — AI output, webhook payload
│   │   ├── storage.ts              # chrome.storage typed wrapper
│   │   ├── messages.ts             # cross-context message types + bus
│   │   ├── analytics.ts            # PostHog wrapper with PII scrubber
│   │   ├── sentry.ts               # Sentry init + scrubber
│   │   └── errors.ts               # AppError class + user-facing messages
│   │
│   ├── stores/                     # Zustand
│   │   ├── profile-store.ts        # cached profile + pro_status
│   │   └── ui-store.ts             # side-panel route, toasts
│   │
│   ├── hooks/                      # TanStack Query wrappers
│   │   ├── use-profile.ts
│   │   ├── use-outline.ts
│   │   ├── use-cards.ts
│   │   ├── use-review-queue.ts
│   │   └── use-pro-status.ts       # 60s poll
│   │
│   └── types/
│       ├── db.ts                   # supabase-cli generated
│       └── domain.ts               # Card, Outline, Deck, Style enum
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260609000001_initial_schema.sql
│   │   ├── 20260609000002_rls_policies.sql
│   │   ├── 20260609000003_card_count_trigger.sql
│   │   ├── 20260609000004_profile_creation_trigger.sql
│   │   └── 20260609000005_rate_limits.sql
│   └── functions/
│       ├── _shared/
│       │   ├── auth.ts             # JWT verify helper
│       │   ├── anthropic.ts        # SDK init
│       │   ├── rate-limit.ts       # atomic counter check + increment
│       │   ├── schemas.ts          # zod
│       │   └── cors.ts
│       ├── generate-outline/
│       │   └── index.ts
│       ├── generate-cards/
│       │   └── index.ts
│       └── lemonsqueezy-webhook/
│           └── index.ts
│
├── tests/
│   ├── setup.ts
│   ├── unit/
│   │   ├── fsrs.test.ts
│   │   ├── prompts.test.ts
│   │   ├── validation.test.ts
│   │   ├── transcript.test.ts
│   │   └── messages.test.ts
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── rls.test.ts
│   │   ├── card-count-trigger.test.ts
│   │   ├── rate-limit.test.ts
│   │   └── webhook.test.ts
│   └── e2e/
│       ├── fixtures/
│       │   └── extension.ts        # Playwright extension load helper
│       ├── happy-path.spec.ts
│       ├── cap-and-upgrade.spec.ts
│       └── network-recovery.spec.ts
│
├── public/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
│
├── store-assets/                   # CWS submission artifacts
│   ├── promo-tile-440x280.png
│   ├── screenshot-1-outline.png
│   ├── screenshot-2-cards.png
│   ├── screenshot-3-review.png
│   ├── screenshot-4-streak.png
│   ├── screenshot-5-settings.png
│   └── demo.gif
│
├── legal/
│   ├── privacy-policy.md
│   └── terms-of-service.md
│
└── scripts/
    ├── seed-test-data.ts           # dev fixtures
    └── reconcile-subscriptions.ts  # daily cron job
```

**Decomposition rationale:** Each `src/api/*.ts` file is one Supabase table's CRUD surface. Each `src/lib/*.ts` is one pure-logic concern. Components map 1:1 to UI sections in the spec's user flows. Edge Functions live in `supabase/functions/` per Supabase convention. Tests mirror source layout. No file is expected to exceed ~200 LOC.

---

## Phase Overview

| Phase | Spec day | Deliverable |
|---|---|---|
| **1. Foundation** | Day 1 | Extension sideloads. Supabase project + schema deployed. |
| **2. Anonymous Auth + Welcome** | Day 2 | Install creates anon user, welcome screen, empty side panel. |
| **3. Transcript Extraction** | Day 3 | Content script extracts transcript; service worker receives it. |
| **4. Outline Edge Function** | Day 4 | `generate-outline` returns valid structured output from Claude. |
| **5. Outline UI** | Day 5 | Side panel renders outline with clickable timestamps. |
| **6. Cards Edge Function + Style Picker** | Day 6 | `generate-cards` + style picker UI. |
| **7. Card Preview + Save** | Day 7 | Edit/regenerate/delete; save persists to Postgres. |
| **8. FSRS-6 Integration** | Day 8 | Cards have correct initial state; review queue endpoint works. |
| **9. Review Mode UI** | Day 9 | Flip, rate, FSRS update, streak, session summary. |
| **10. 50-Card Cap + Upsell** | Day 10 | Cap enforced client + server; contextual upsell visible at limit. |
| **11. LemonSqueezy Integration** | Day 11 | Checkout, webhook, entitlement flip, reconciliation cron. |
| **12. Polish** | Day 12 | Empty/loading/error states, settings, account deletion. |
| **13. CWS Submission Prep** | Day 13 | Privacy policy, listing copy, screenshots, demo GIF. |
| **14. Submit & Iterate** | Day 14 | Unlisted submission; fix any reviewer feedback. |

---

## Phase 1 — Foundation

**Goal of phase:** A WXT-built extension sideloads into Chrome. Supabase project exists with schema + RLS deployed. No UI yet.

### Task 1.1: Scaffold the WXT project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wxt.config.ts`
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.tsx`
- Create: `entrypoints/popup/App.tsx`
- Create: `public/icons/icon-16.png` (placeholder)
- Create: `public/icons/icon-48.png` (placeholder)
- Create: `public/icons/icon-128.png` (placeholder)

- [ ] **Step 1: Initialize package.json**

Run:
```bash
cd "/Users/meherzan/Desktop/My Projects/Chrome Extension(Ai-Learning)"
npm init -y
```

Then replace generated `package.json` with:

```json
{
  "name": "bryteo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "postinstall": "wxt prepare"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.59.0",
    "dexie": "^4.0.10",
    "posthog-js": "^1.180.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ts-fsrs": "^4.4.0",
    "zod": "^3.23.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/chrome": "^0.0.279",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wxt": "^0.20.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
```

Expected: completes without errors, `node_modules/` populated, `wxt prepare` runs in postinstall and creates `.wxt/` directory.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "entrypoints",
    "src",
    "tests"
  ]
}
```

- [ ] **Step 4: Create wxt.config.ts**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'bryteo — Remember what you watch',
    description: 'Turn YouTube videos into AI flashcards with spaced repetition.',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: ['https://*.youtube.com/*'],
    action: {
      default_title: 'bryteo',
      default_popup: 'popup.html'
    },
    side_panel: {
      default_path: 'sidepanel.html'
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' https://*.supabase.co https://app.lemonsqueezy.com"
    }
  }
});
```

- [ ] **Step 5: Install WXT React module**

```bash
npm install -D @wxt-dev/module-react
```

- [ ] **Step 6: Create popup entry point**

`entrypoints/popup/index.html`:
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>bryteo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/popup/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`entrypoints/popup/App.tsx`:
```tsx
export default function App() {
  return (
    <main style={{ padding: 16, minWidth: 280, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>bryteo</h1>
      <p style={{ marginTop: 8, color: '#666' }}>
        Open a YouTube video and click the icon to start.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Add placeholder icons**

Generate three simple PNGs (16x16, 48x48, 128x128) — any monochrome "b" glyph works as placeholder; final art comes in Phase 13.

```bash
# If ImageMagick installed:
mkdir -p public/icons
for size in 16 48 128; do
  magick -background "#0F172A" -fill white -gravity center \
    -size ${size}x${size} label:b public/icons/icon-${size}.png
done

# Otherwise download from https://placehold.co/16x16/0F172A/FFFFFF/png?text=b
```

- [ ] **Step 8: Build and verify**

Run:
```bash
npm run dev
```

Expected: WXT launches a Chrome instance with the extension sideloaded. The bryteo icon appears in the toolbar; clicking it opens the popup with the placeholder copy.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json wxt.config.ts entrypoints/ public/
git commit -m "feat(scaffold): WXT + React + TS extension shell"
```

---

### Task 1.2: Add Tailwind 4

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/styles/globals.css`
- Modify: `entrypoints/popup/main.tsx` (import css)
- Modify: `entrypoints/popup/App.tsx` (use Tailwind classes)

- [ ] **Step 1: Install Tailwind 4 + plugin**

```bash
npm install -D tailwindcss@^4 @tailwindcss/postcss autoprefixer postcss
```

- [ ] **Step 2: postcss.config.js**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 3: tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './entrypoints/**/*.{html,tsx,ts}',
    './src/**/*.{tsx,ts}'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        slate: { 50: '#F8FAFC', 100: '#F1F5F9', 600: '#475569' }
      }
    }
  }
} satisfies Config;
```

- [ ] **Step 4: src/styles/globals.css**

```css
@import 'tailwindcss';

@layer base {
  html, body { font-family: system-ui, sans-serif; }
}
```

- [ ] **Step 5: Wire CSS into popup**

`entrypoints/popup/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/styles/globals.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`entrypoints/popup/App.tsx`:
```tsx
export default function App() {
  return (
    <main className="p-4 min-w-[280px]">
      <h1 className="text-lg font-semibold text-ink">bryteo</h1>
      <p className="mt-2 text-sm text-slate-600">
        Open a YouTube video and click the icon to start.
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Reload extension and verify**

Run `npm run dev` (if not already running), reopen the popup. Expected: same content, now styled by Tailwind.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/styles/ entrypoints/popup/ package.json package-lock.json
git commit -m "feat(scaffold): wire Tailwind 4 into popup"
```

---

### Task 1.3: Add Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/unit/sanity.test.ts`

- [ ] **Step 1: vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts']
  }
});
```

- [ ] **Step 2: Install happy-dom**

```bash
npm install -D happy-dom
```

- [ ] **Step 3: tests/setup.ts**

```ts
import { vi } from 'vitest';

// Stub chrome.* globals for unit tests
(globalThis as any).chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() }
  }
};
```

- [ ] **Step 4: Write sanity test**

`tests/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('has chrome stub', () => {
    expect((globalThis as any).chrome.storage.local.get).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test**

```bash
npm test
```

Expected: 2 tests pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/ package.json package-lock.json
git commit -m "test(scaffold): wire Vitest with chrome stubs"
```

---

### Task 1.4: Create Supabase project + local migrations

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260609000001_initial_schema.sql`
- Create: `supabase/migrations/20260609000002_rls_policies.sql`
- Create: `supabase/migrations/20260609000003_card_count_trigger.sql`
- Create: `supabase/migrations/20260609000004_profile_creation_trigger.sql`
- Create: `supabase/migrations/20260609000005_rate_limits.sql`
- Create: `.env.example`

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase --version
```

Expected: prints a version number ≥ 1.200.

- [ ] **Step 2: Initialize Supabase locally**

```bash
supabase init
```

Expected: creates `supabase/` directory with `config.toml`.

- [ ] **Step 3: Create the bryteo cloud project**

Go to https://supabase.com/dashboard → New Project → name `bryteo-prod` → choose closest region → set DB password → wait for provisioning (~2 min).

Then in the project Settings → API, copy:
- `Project URL` → save as `VITE_SUPABASE_URL`
- `anon public` key → save as `VITE_SUPABASE_ANON_KEY`
- `service_role` key → save as `SUPABASE_SERVICE_ROLE_KEY` (server-only, never in extension)

Project Settings → General → copy the `Reference ID` (a string like `abcdefgh`).

- [ ] **Step 4: Link CLI to the cloud project**

```bash
supabase link --project-ref <REFERENCE_ID>
```

Enter the DB password when prompted.

- [ ] **Step 5: Write initial schema migration**

`supabase/migrations/20260609000001_initial_schema.sql`:
```sql
-- profiles
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  pro_status          text not null default 'free' check (pro_status in ('free','pro','founding','student')),
  pro_expires_at      timestamptz,
  ls_customer_id      text,
  ls_subscription_id  text,
  card_count          int not null default 0,
  notification_hour   int default 8 check (notification_hour between 0 and 23),
  created_at          timestamptz not null default now()
);

-- videos
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

create index videos_user_idx on videos (user_id, created_at desc);

-- outlines
create table outlines (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos(id) on delete cascade unique,
  sections    jsonb not null,
  model_used  text not null,
  created_at  timestamptz not null default now()
);

-- decks
create table decks (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade unique,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  style      text not null default 'quick' check (style in ('quick','exam','deep','language')),
  created_at timestamptz not null default now()
);

-- cards
create table cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references decks(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null check (type in ('basic','cloze')),
  front       text not null,
  back        text not null,
  source_ts_s int,
  fsrs_state  jsonb not null,
  due_at      timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index cards_due_idx on cards (user_id, due_at);
create index cards_deck_idx on cards (deck_id);

-- review_log
create table review_log (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references cards(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 4),
  elapsed_ms  int not null,
  reviewed_at timestamptz not null default now()
);

create index review_log_user_idx on review_log (user_id, reviewed_at desc);
```

- [ ] **Step 6: Write RLS policies migration**

`supabase/migrations/20260609000002_rls_policies.sql`:
```sql
alter table profiles enable row level security;
create policy "profiles_self" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

alter table videos enable row level security;
create policy "videos_self" on videos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table outlines enable row level security;
create policy "outlines_self" on outlines for all
  using (exists (select 1 from videos v where v.id = video_id and v.user_id = auth.uid()))
  with check (exists (select 1 from videos v where v.id = video_id and v.user_id = auth.uid()));

alter table decks enable row level security;
create policy "decks_self" on decks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table cards enable row level security;
create policy "cards_self" on cards for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table review_log enable row level security;
create policy "review_log_self" on review_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 7: Write card_count trigger migration**

`supabase/migrations/20260609000003_card_count_trigger.sql`:
```sql
create or replace function update_card_count() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update profiles set card_count = card_count + 1 where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update profiles set card_count = greatest(card_count - 1, 0) where id = old.user_id;
  end if;
  return null;
end; $$;

create trigger cards_count_trigger
  after insert or delete on cards
  for each row execute function update_card_count();
```

- [ ] **Step 8: Write profile-creation trigger migration**

`supabase/migrations/20260609000004_profile_creation_trigger.sql`:
```sql
create or replace function create_profile_for_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;

create trigger profile_creation_trigger
  after insert on auth.users
  for each row execute function create_profile_for_new_user();
```

- [ ] **Step 9: Write rate_limits migration**

`supabase/migrations/20260609000005_rate_limits.sql`:
```sql
create table rate_limits (
  user_id        uuid not null references profiles(id) on delete cascade,
  day            date not null,
  outlines_today int not null default 0,
  cards_today    int not null default 0,
  primary key (user_id, day)
);

alter table rate_limits enable row level security;
create policy "rate_limits_self_read" on rate_limits for select
  using (auth.uid() = user_id);
-- writes only via service-role from Edge Functions; no insert/update policy needed.
```

- [ ] **Step 10: Push migrations to cloud**

```bash
supabase db push
```

Expected: all 5 migrations apply. Verify in Supabase dashboard → Database → Tables that profiles, videos, outlines, decks, cards, review_log, rate_limits exist.

- [ ] **Step 11: Create .env.example**

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_POSTHOG_KEY=
VITE_SENTRY_DSN=
```

Also create a real `.env` (gitignored) with actual values, but do not commit it.

- [ ] **Step 12: Commit**

```bash
git add supabase/ .env.example
git commit -m "feat(db): initial schema, RLS, triggers, rate_limits"
```

---

### Task 1.5: Wire Supabase client

**Files:**
- Create: `src/api/supabase.ts`
- Create: `src/types/db.ts`

- [ ] **Step 1: Generate TypeScript types from schema**

```bash
supabase gen types typescript --linked > src/types/db.ts
```

Expected: `src/types/db.ts` contains generated `Database` type.

- [ ] **Step 2: Create Supabase client wrapper**

`src/api/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'bryteo.auth'
    }
  }
);
```

- [ ] **Step 3: Build to confirm compile**

```bash
npm run compile
```

Expected: exit 0 (no TS errors).

- [ ] **Step 4: Commit**

```bash
git add src/api/supabase.ts src/types/db.ts
git commit -m "feat(api): wire Supabase client + generated types"
```

---

### Task 1.6: Phase 1 checkpoint

- [ ] **Step 1: Confirm phase deliverables**

- Extension sideloads (`npm run dev` opens Chrome with bryteo icon)
- Popup opens with placeholder copy
- Tailwind compiles
- Vitest sanity test passes
- Supabase project has all 7 tables with RLS enabled
- Generated DB types compile

- [ ] **Step 2: Tag the phase**

```bash
git tag phase-1-complete
```

---

## Phase 2 — Anonymous Auth + Welcome

**Goal of phase:** On extension install, an anonymous Supabase user is silently created. A welcome tab opens once. The side panel can open (empty). Profile row is fetchable in the side panel.

### Task 2.1: Enable anonymous sign-ins in Supabase

**Files:** Supabase dashboard only (no code).

- [ ] **Step 1: Toggle anon sign-ins on**

Supabase dashboard → Authentication → Providers → Anonymous Sign-ins → toggle **Enabled**.

- [ ] **Step 2: Verify via SQL**

In dashboard SQL editor:
```sql
select id, is_anonymous, created_at from auth.users order by created_at desc limit 5;
```
Expected: empty result (no users yet). Confirms query syntax and that the column exists.

---

### Task 2.2: Auth API — anonymous sign-in helper

**Files:**
- Create: `src/api/auth.ts`
- Create: `tests/unit/auth.test.ts`

- [ ] **Step 1: Write failing test for `ensureSignedIn`**

`tests/unit/auth.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSignedIn } from '@/api/auth';

vi.mock('@/api/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInAnonymously: vi.fn()
    }
  }
}));

import { supabase } from '@/api/supabase';

describe('ensureSignedIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns existing session if signed in', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } }, error: null
    });
    const session = await ensureSignedIn();
    expect(session?.user.id).toBe('u1');
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when no session exists', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null }, error: null
    });
    (supabase.auth.signInAnonymously as any).mockResolvedValue({
      data: { session: { user: { id: 'u2' } } }, error: null
    });
    const session = await ensureSignedIn();
    expect(session?.user.id).toBe('u2');
    expect(supabase.auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it('throws when anon signin fails', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null }, error: null
    });
    (supabase.auth.signInAnonymously as any).mockResolvedValue({
      data: { session: null }, error: { message: 'boom' }
    });
    await expect(ensureSignedIn()).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- auth.test.ts
```
Expected: 3 tests fail with "Cannot find module '@/api/auth'".

- [ ] **Step 3: Implement `ensureSignedIn`**

`src/api/auth.ts`:
```ts
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export async function ensureSignedIn(): Promise<Session> {
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return existing;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('signInAnonymously returned no session');
  return data.session;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- auth.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts tests/unit/auth.test.ts
git commit -m "feat(auth): ensureSignedIn anonymous helper"
```

---

### Task 2.3: Background service worker bootstraps auth on install

**Files:**
- Create: `entrypoints/background.ts`

- [ ] **Step 1: Implement background entry**

`entrypoints/background.ts`:
```ts
import { defineBackground } from 'wxt/sandbox';
import { ensureSignedIn } from '@/api/auth';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(async (details) => {
    try {
      await ensureSignedIn();
    } catch (e) {
      console.error('[bryteo] anon signin failed', e);
    }

    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
  });

  // Open side panel when toolbar icon is clicked on a YouTube tab
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true
    });
    await chrome.sidePanel.open({ tabId: tab.id });
  });
});
```

- [ ] **Step 2: Reload extension**

```bash
# Stop current dev server with Ctrl+C, then restart:
npm run dev
```

Uninstall the previous test install in `chrome://extensions/` and let WXT re-sideload.

Expected: a new tab opens at `chrome-extension://<id>/welcome.html` (will 404 until next task).

- [ ] **Step 3: Verify a user row was created**

In Supabase dashboard SQL editor:
```sql
select id, is_anonymous, created_at from auth.users order by created_at desc limit 1;
```
Expected: one row with `is_anonymous = true`. Profile row was created by the trigger:
```sql
select id, card_count, pro_status from profiles order by created_at desc limit 1;
```
Expected: one row with `card_count = 0`, `pro_status = 'free'`.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat(bg): create anon user + open welcome on install"
```

---

### Task 2.4: Welcome screen

**Files:**
- Create: `entrypoints/welcome/index.html`
- Create: `entrypoints/welcome/main.tsx`
- Create: `entrypoints/welcome/App.tsx`
- Create: `src/components/WelcomeScreen.tsx`

- [ ] **Step 1: HTML scaffolding**

`entrypoints/welcome/index.html`:
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Welcome to bryteo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/welcome/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/styles/globals.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`entrypoints/welcome/App.tsx`:
```tsx
import { WelcomeScreen } from '@/components/WelcomeScreen';

export default function App() {
  return <WelcomeScreen />;
}
```

- [ ] **Step 2: WelcomeScreen component**

`src/components/WelcomeScreen.tsx`:
```tsx
export function WelcomeScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold text-ink">Welcome to bryteo</h1>
        <p className="mt-4 text-slate-600 text-lg">
          Open any YouTube video and click the bryteo icon in your toolbar.
          The side panel will appear next to the video.
        </p>
        <button
          onClick={() => window.close()}
          className="mt-8 inline-flex items-center px-6 py-3 rounded-full bg-ink text-white font-medium"
        >
          Got it
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Reload extension, force-open welcome**

After reload, open `chrome-extension://<id>/welcome.html` directly. Expected: centered welcome card with the copy and the "Got it" button. The button closes the tab.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/welcome/ src/components/WelcomeScreen.tsx
git commit -m "feat(welcome): one-screen install onboarding"
```

---

### Task 2.5: Side panel shell

**Files:**
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.tsx`
- Create: `entrypoints/sidepanel/App.tsx`
- Create: `src/hooks/use-profile.ts`
- Create: `src/api/profile.ts`

- [ ] **Step 1: profile API**

`src/api/profile.ts`:
```ts
import { supabase } from './supabase';
import type { Database } from '@/types/db';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export async function getMyProfile(): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: use-profile hook**

`src/hooks/use-profile.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getMyProfile } from '@/api/profile';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: getMyProfile,
    staleTime: 60_000,
    refetchInterval: 60_000  // poll for pro_status changes
  });
}
```

- [ ] **Step 3: Side panel HTML + main**

`entrypoints/sidepanel/index.html`:
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>bryteo</title>
  </head>
  <body class="h-screen">
    <div id="root" class="h-full"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/sidepanel/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../src/styles/globals.css';
import { ensureSignedIn } from '@/api/auth';
import App from './App';

const queryClient = new QueryClient();

// Make sure we have a session before the React tree queries Supabase
ensureSignedIn().catch(console.error);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

`entrypoints/sidepanel/App.tsx`:
```tsx
import { useProfile } from '@/hooks/use-profile';

export default function App() {
  const { data: profile, isLoading } = useProfile();

  return (
    <main className="h-full flex flex-col bg-white">
      <header className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-base font-semibold text-ink">bryteo</h1>
      </header>
      <section className="flex-1 px-4 py-6 text-sm text-slate-600">
        {isLoading && <p>Loading your library…</p>}
        {profile && (
          <p>
            You have <strong>{profile.card_count}</strong> cards saved.
            Open a YouTube video to start.
          </p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Reload extension, open YouTube, click toolbar icon**

Expected: side panel slides in. Shows "You have 0 cards saved." (after a brief load).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/sidepanel/ src/hooks/use-profile.ts src/api/profile.ts
git commit -m "feat(sidepanel): shell + profile fetch"
```

---

### Task 2.6: Phase 2 checkpoint

- [ ] **Step 1: Confirm deliverables**

- Install creates an anonymous Supabase user (`is_anonymous = true` in auth.users)
- Profile row auto-created via trigger
- Welcome tab opens once on install
- Side panel opens on toolbar click while on YouTube, shows card_count = 0
- All Phase 1 + Phase 2 tests pass: `npm test`

- [ ] **Step 2: Tag**

```bash
git tag phase-2-complete
```

---

## Phase 3 — Transcript Extraction

**Goal of phase:** Content script reads YouTube transcript from the page. Sends it to the service worker via `chrome.runtime.sendMessage`. Service worker logs/relays it.

### Task 3.1: Message types

**Files:**
- Create: `src/lib/messages.ts`
- Create: `tests/unit/messages.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/messages.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAppMessage, type AppMessage } from '@/lib/messages';

describe('messages', () => {
  it('accepts a valid TRANSCRIPT_READY message', () => {
    const m: AppMessage = {
      type: 'TRANSCRIPT_READY',
      payload: {
        videoId: 'abc123',
        title: 'Test',
        channel: 'Ch',
        durationS: 120,
        thumbnailUrl: 'https://example.com/t.jpg',
        transcript: 'hello world'
      }
    };
    expect(isAppMessage(m)).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isAppMessage({ foo: 'bar' })).toBe(false);
    expect(isAppMessage(null)).toBe(false);
    expect(isAppMessage('x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- messages.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/messages.ts`:
```ts
export type TranscriptReady = {
  type: 'TRANSCRIPT_READY';
  payload: {
    videoId: string;
    title: string;
    channel?: string;
    durationS?: number;
    thumbnailUrl?: string;
    transcript: string;
  };
};

export type RequestOutline = {
  type: 'REQUEST_OUTLINE';
  payload: { videoId: string };
};

export type AppMessage = TranscriptReady | RequestOutline;

export function isAppMessage(x: unknown): x is AppMessage {
  if (!x || typeof x !== 'object') return false;
  const t = (x as any).type;
  return t === 'TRANSCRIPT_READY' || t === 'REQUEST_OUTLINE';
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- messages.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/messages.ts tests/unit/messages.test.ts
git commit -m "feat(messages): typed cross-context message bus"
```

---

### Task 3.2: Transcript extraction logic (pure)

**Files:**
- Create: `src/lib/transcript.ts`
- Create: `tests/unit/transcript.test.ts`
- Create: `tests/fixtures/youtube-player-response.json`

- [ ] **Step 1: Create a small fixture**

`tests/fixtures/youtube-player-response.json`:
```json
{
  "videoDetails": {
    "videoId": "abc123",
    "title": "How LLMs Work",
    "author": "Andrej Karpathy",
    "lengthSeconds": "1234",
    "thumbnail": { "thumbnails": [{ "url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg" }] }
  },
  "captions": {
    "playerCaptionsTracklistRenderer": {
      "captionTracks": [
        {
          "baseUrl": "https://www.youtube.com/api/timedtext?v=abc123&lang=en",
          "languageCode": "en"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Write failing tests**

`tests/unit/transcript.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/youtube-player-response.json';
import { parsePlayerResponse, parseTimedTextXml } from '@/lib/transcript';

describe('parsePlayerResponse', () => {
  it('extracts video metadata + caption URL', () => {
    const r = parsePlayerResponse(fixture);
    expect(r).toEqual({
      videoId: 'abc123',
      title: 'How LLMs Work',
      channel: 'Andrej Karpathy',
      durationS: 1234,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      captionUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en'
    });
  });

  it('returns null captionUrl when no captions exist', () => {
    const noCaps = { ...fixture, captions: undefined };
    const r = parsePlayerResponse(noCaps);
    expect(r?.captionUrl).toBeNull();
  });
});

describe('parseTimedTextXml', () => {
  it('joins all text nodes with spaces', () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2">Hello</text>
      <text start="2" dur="2">world</text>
    </transcript>`;
    expect(parseTimedTextXml(xml)).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2">Tom &amp;amp; Jerry</text>
    </transcript>`;
    expect(parseTimedTextXml(xml)).toContain('Tom & Jerry');
  });
});
```

- [ ] **Step 3: Run, expect fail**

```bash
npm test -- transcript.test.ts
```

- [ ] **Step 4: Implement**

`src/lib/transcript.ts`:
```ts
export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  durationS: number;
  thumbnailUrl: string;
  captionUrl: string | null;
};

export function parsePlayerResponse(pr: any): VideoMeta | null {
  const d = pr?.videoDetails;
  if (!d?.videoId) return null;

  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const englishTrack = Array.isArray(tracks)
    ? tracks.find((t: any) => t.languageCode === 'en') ?? tracks[0]
    : null;

  return {
    videoId: d.videoId,
    title: d.title ?? '',
    channel: d.author ?? '',
    durationS: parseInt(d.lengthSeconds ?? '0', 10),
    thumbnailUrl: d.thumbnail?.thumbnails?.[0]?.url ?? '',
    captionUrl: englishTrack?.baseUrl ?? null
  };
}

export function parseTimedTextXml(xml: string): string {
  const matches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)];
  const text = matches.map((m) => decodeEntities(m[1])).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
```

- [ ] **Step 5: Run, expect pass**

```bash
npm test -- transcript.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/transcript.ts tests/unit/transcript.test.ts tests/fixtures/
git commit -m "feat(transcript): pure parsers for YouTube player response + timedtext XML"
```

---

### Task 3.3: Content script on YouTube

**Files:**
- Create: `entrypoints/content.ts`

- [ ] **Step 1: Implement content script**

`entrypoints/content.ts`:
```ts
import { defineContentScript } from 'wxt/sandbox';
import { parsePlayerResponse, parseTimedTextXml } from '@/lib/transcript';
import type { AppMessage } from '@/lib/messages';

export default defineContentScript({
  matches: ['https://*.youtube.com/watch*'],
  runAt: 'document_idle',
  async main() {
    chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
      if (msg.type === 'REQUEST_OUTLINE') {
        (async () => {
          try {
            const payload = await captureTranscript();
            sendResponse({ ok: true, payload });
          } catch (e: any) {
            sendResponse({ ok: false, error: e?.message ?? 'transcript error' });
          }
        })();
        return true; // keep channel open for async response
      }
    });
  }
});

async function captureTranscript() {
  const playerResponse = readPlayerResponseFromPage();
  if (!playerResponse) throw new Error('player response not found');

  const meta = parsePlayerResponse(playerResponse);
  if (!meta) throw new Error('could not parse video metadata');
  if (!meta.captionUrl) throw new Error('no captions available for this video');

  const xml = await fetch(meta.captionUrl).then((r) => r.text());
  const transcript = parseTimedTextXml(xml);
  if (!transcript) throw new Error('empty transcript');

  return { ...meta, transcript };
}

function readPlayerResponseFromPage(): any | null {
  // YouTube exposes ytInitialPlayerResponse on window; sometimes only via a script tag.
  const w = window as any;
  if (w.ytInitialPlayerResponse) return w.ytInitialPlayerResponse;

  const script = [...document.querySelectorAll('script')].find((s) =>
    s.textContent?.includes('ytInitialPlayerResponse')
  );
  if (!script?.textContent) return null;

  const m = script.textContent.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Reload + sanity-check**

Reload the extension, navigate to a YouTube video that has captions. Open the side panel. From the side-panel DevTools console run:

```js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_OUTLINE', payload: { videoId: 'x' } }, (resp) => console.log(resp));
```

Expected: `{ ok: true, payload: { videoId, title, channel, durationS, thumbnailUrl, captionUrl, transcript } }` with non-empty `transcript`.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): YouTube transcript capture"
```

---

### Task 3.4: Phase 3 checkpoint

- [ ] **Step 1: Confirm deliverables**

- Content script registered on YouTube watch URLs
- `REQUEST_OUTLINE` returns `{ok: true, payload}` from the active tab
- Empty-captions video returns `{ok: false, error: 'no captions available for this video'}`

- [ ] **Step 2: Tag**

```bash
git tag phase-3-complete
```

---

## Phase 4 — `generate-outline` Edge Function

**Goal of phase:** A deployed Supabase Edge Function accepts `{videoId, transcript, title}`, verifies the caller's JWT, enforces per-user rate limits, calls Claude Haiku (free) or Sonnet (Pro), validates response against a schema, and writes `videos` + `outlines` rows.

### Task 4.1: Add Anthropic secret to Supabase

- [ ] **Step 1: Set the secret**

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

(Get the key from https://console.anthropic.com/. Generate a fresh one labeled "bryteo-dev".)

- [ ] **Step 2: Verify**

```bash
supabase secrets list
```

Expected: `ANTHROPIC_API_KEY` listed. The value is never printed.

---

### Task 4.2: Shared Edge Function utilities

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/schemas.ts`
- Create: `supabase/functions/_shared/rate-limit.ts`
- Create: `supabase/functions/_shared/anthropic.ts`

- [ ] **Step 1: CORS**

`supabase/functions/_shared/cors.ts`:
```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ls-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
```

- [ ] **Step 2: Auth helper**

`supabase/functions/_shared/auth.ts`:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Response('Unauthorized', { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Response('Unauthorized', { status: 401 });
  return { user, userClient };
}

export function serviceClient() {
  return createClient(supabaseUrl, serviceRoleKey);
}
```

- [ ] **Step 3: Schemas**

`supabase/functions/_shared/schemas.ts`:
```ts
import { z } from 'https://esm.sh/zod@3.23.0';

export const outlineRequest = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  channel: z.string().optional(),
  durationS: z.number().int().optional(),
  thumbnailUrl: z.string().url().optional(),
  transcript: z.string().min(50).max(50_000)
});

export const outlineSection = z.object({
  title: z.string(),
  summary: z.string(),
  start_s: z.number().int().nonnegative(),
  end_s: z.number().int().nonnegative(),
  key_points: z.array(z.string()).min(1).max(8)
});

export const outlineResponse = z.object({
  sections: z.array(outlineSection).min(1).max(12)
});

export const cardsRequest = z.object({
  deckId: z.string().uuid(),
  outlineSection: outlineSection,
  style: z.enum(['quick', 'exam', 'deep', 'language'])
});

export const cardOut = z.object({
  type: z.enum(['basic', 'cloze']),
  front: z.string().min(1),
  back: z.string().min(1),
  source_ts_s: z.number().int().nonnegative()
});

export const cardsResponse = z.object({ cards: z.array(cardOut).min(1).max(40) });
```

- [ ] **Step 4: Rate limiter**

`supabase/functions/_shared/rate-limit.ts`:
```ts
import { serviceClient } from './auth.ts';

const LIMITS = {
  free: { outlines: 20, cards: 200 },
  pro:  { outlines: 200, cards: 2000 },
  founding: { outlines: 200, cards: 2000 },
  student: { outlines: 200, cards: 2000 }
};

export async function checkAndIncrement(
  userId: string,
  field: 'outlines_today' | 'cards_today',
  amount: number,
  tier: keyof typeof LIMITS
): Promise<{ allowed: boolean; remaining: number }> {
  const sb = serviceClient();
  const day = new Date().toISOString().slice(0, 10);
  const max = field === 'outlines_today' ? LIMITS[tier].outlines : LIMITS[tier].cards;

  // upsert with atomic increment
  const { data, error } = await sb.rpc('rate_limit_increment', {
    p_user_id: userId,
    p_day: day,
    p_field: field,
    p_amount: amount
  });
  if (error) throw new Error(error.message);

  const used = (data as number) ?? 0;
  return { allowed: used <= max, remaining: Math.max(0, max - used) };
}
```

- [ ] **Step 5: Add the RPC the rate limiter calls**

Create migration `supabase/migrations/20260609000006_rate_limit_rpc.sql`:
```sql
create or replace function rate_limit_increment(
  p_user_id uuid,
  p_day date,
  p_field text,
  p_amount int
) returns int
language plpgsql security definer as $$
declare
  v_value int;
begin
  insert into rate_limits (user_id, day) values (p_user_id, p_day)
    on conflict do nothing;

  if p_field = 'outlines_today' then
    update rate_limits set outlines_today = outlines_today + p_amount
      where user_id = p_user_id and day = p_day
      returning outlines_today into v_value;
  elsif p_field = 'cards_today' then
    update rate_limits set cards_today = cards_today + p_amount
      where user_id = p_user_id and day = p_day
      returning cards_today into v_value;
  else
    raise exception 'unknown field %', p_field;
  end if;

  return v_value;
end; $$;
```

Then push:
```bash
supabase db push
```

- [ ] **Step 6: Anthropic init**

`supabase/functions/_shared/anthropic.ts`:
```ts
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';

export const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!
});

export function modelFor(tier: 'free' | 'pro' | 'founding' | 'student') {
  return tier === 'free' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
}
```

- [ ] **Step 7: Commit shared utilities**

```bash
git add supabase/functions/_shared/ supabase/migrations/20260609000006_rate_limit_rpc.sql
git commit -m "feat(edge): shared CORS, auth, schemas, rate-limit RPC, Anthropic init"
```

---

### Task 4.3: `generate-outline` Edge Function

**Files:**
- Create: `supabase/functions/generate-outline/index.ts`

- [ ] **Step 1: Implement the function**

`supabase/functions/generate-outline/index.ts`:
```ts
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserFromRequest, serviceClient } from '../_shared/auth.ts';
import { outlineRequest, outlineResponse } from '../_shared/schemas.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';
import { anthropic, modelFor } from '../_shared/anthropic.ts';

const SYSTEM = `You convert YouTube transcripts into structured study outlines.
Return JSON with this shape:
{
  "sections": [
    {
      "title": "Short section title",
      "summary": "One-paragraph summary of this section.",
      "start_s": 0,
      "end_s": 120,
      "key_points": ["point 1", "point 2", "point 3"]
    }
  ]
}
- 3 to 8 sections.
- Timestamps must lie inside the video.
- 2-6 key points per section.
- Reply with ONLY the JSON. No prose, no markdown fences.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { user } = await getUserFromRequest(req);
    const body = outlineRequest.parse(await req.json());

    const sb = serviceClient();
    const { data: profile } = await sb
      .from('profiles').select('pro_status').eq('id', user.id).single();
    const tier = (profile?.pro_status ?? 'free') as 'free' | 'pro' | 'founding' | 'student';

    const rl = await checkAndIncrement(user.id, 'outlines_today', 1, tier);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'rate_limit', remaining: 0 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const model = modelFor(tier);
    const userPrompt = `Video title: ${body.title}\nDuration: ${body.durationS ?? 'unknown'} seconds.\nTranscript:\n${body.transcript}`;

    const aiResp = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = aiResp.content
      .filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { return jsonErr('ai_invalid_json', 502); }

    const outline = outlineResponse.safeParse(parsed);
    if (!outline.success) {
      // single retry
      const retry = await anthropic.messages.create({
        model, max_tokens: 4096, system: SYSTEM,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: text },
          { role: 'user', content: 'That JSON did not match the schema. Reply again with valid JSON only.' }
        ]
      });
      const retryText = retry.content
        .filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      try { parsed = JSON.parse(retryText); }
      catch { return jsonErr('ai_invalid_json', 502); }
      const second = outlineResponse.safeParse(parsed);
      if (!second.success) return jsonErr('ai_invalid_json', 502);
      parsed = second.data;
    } else {
      parsed = outline.data;
    }

    // upsert video, insert outline
    const { data: video, error: vErr } = await sb.from('videos')
      .upsert({
        user_id: user.id,
        yt_video_id: body.videoId,
        title: body.title,
        channel: body.channel,
        duration_s: body.durationS,
        thumbnail_url: body.thumbnailUrl
      }, { onConflict: 'user_id,yt_video_id' })
      .select().single();
    if (vErr || !video) return jsonErr('db_video', 500);

    const { error: oErr } = await sb.from('outlines').upsert({
      video_id: video.id,
      sections: parsed.sections,
      model_used: model
    }, { onConflict: 'video_id' });
    if (oErr) return jsonErr('db_outline', 500);

    return new Response(JSON.stringify({ videoId: video.id, outline: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return jsonErr('server_error', 500);
  }
});

function jsonErr(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy generate-outline --no-verify-jwt
# --no-verify-jwt lets US verify the JWT in handler code (so we can return proper JSON errors)
```

Expected: function shows up in Supabase dashboard → Edge Functions.

- [ ] **Step 3: Smoke-test via curl**

```bash
# Get a session token first:
# In Chrome devtools (sidepanel context): copy the result of:
# (await chrome.storage.local.get('bryteo.auth')).['bryteo.auth'].access_token

TOKEN="paste-here"
URL="$(grep VITE_SUPABASE_URL .env | cut -d= -f2)/functions/v1/generate-outline"

curl -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "test-abc",
    "title": "Quick test",
    "transcript": "'$(printf 'hello world. '%.0s {1..30})'"
  }' | jq .
```

Expected: 200 OK, JSON body with `videoId` and `outline.sections[]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-outline/
git commit -m "feat(edge): generate-outline with schema validation + 1 retry"
```

---

### Task 4.4: Client-side outline API

**Files:**
- Create: `src/api/outlines.ts`
- Create: `src/api/videos.ts`

- [ ] **Step 1: outlines.ts**

`src/api/outlines.ts`:
```ts
import { supabase } from './supabase';

export type OutlineSection = {
  title: string;
  summary: string;
  start_s: number;
  end_s: number;
  key_points: string[];
};

export type OutlinePayload = { sections: OutlineSection[] };

export async function generateOutline(input: {
  videoId: string;
  title: string;
  channel?: string;
  durationS?: number;
  thumbnailUrl?: string;
  transcript: string;
}): Promise<{ videoId: string; outline: OutlinePayload }> {
  const { data, error } = await supabase.functions.invoke('generate-outline', {
    body: input
  });
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: videos.ts (read-only for now)**

`src/api/videos.ts`:
```ts
import { supabase } from './supabase';

export async function getVideo(videoId: string) {
  const { data, error } = await supabase
    .from('videos').select('*').eq('id', videoId).single();
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/api/outlines.ts src/api/videos.ts
git commit -m "feat(api): client outlines + videos"
```

---

### Task 4.5: Phase 4 checkpoint

- [ ] **Step 1: Confirm**

- `supabase functions list` shows `generate-outline` deployed
- curl with a valid token returns a valid `OutlineResponse`
- curl with no token returns 401
- 21st call within the same day returns 429

- [ ] **Step 2: Tag**

```bash
git tag phase-4-complete
```

---

## Phase 5 — Outline UI

**Goal of phase:** Click extension on a YouTube video → side panel calls content script for transcript → calls `generate-outline` → renders outline with clickable timestamps that seek the player.

### Task 5.1: Side panel orchestrates the outline flow

**Files:**
- Create: `src/hooks/use-outline.ts`
- Create: `src/components/OutlineView.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`
- Modify: `entrypoints/content.ts` (add SEEK message handler)

- [ ] **Step 1: useGenerateOutline hook**

`src/hooks/use-outline.ts`:
```ts
import { useMutation } from '@tanstack/react-query';
import { generateOutline, type OutlinePayload } from '@/api/outlines';

export function useGenerateOutline() {
  return useMutation({
    mutationFn: async (): Promise<{ videoId: string; outline: OutlinePayload }> => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('no active tab');

      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'REQUEST_OUTLINE',
        payload: { videoId: '' }
      });
      if (!resp?.ok) throw new Error(resp?.error ?? 'transcript failed');

      return generateOutline(resp.payload);
    }
  });
}
```

- [ ] **Step 2: OutlineView component**

`src/components/OutlineView.tsx`:
```tsx
import type { OutlinePayload, OutlineSection } from '@/api/outlines';

type Props = {
  outline: OutlinePayload;
  onSeek: (seconds: number) => void;
  onGenerateCards: () => void;
};

export function OutlineView({ outline, onSeek, onGenerateCards }: Props) {
  return (
    <div className="space-y-4">
      {outline.sections.map((s, i) => (
        <SectionCard key={i} s={s} onSeek={onSeek} />
      ))}
      <button
        onClick={onGenerateCards}
        className="w-full py-2.5 rounded-lg bg-ink text-white font-medium"
      >
        Generate flashcards from these sections
      </button>
    </div>
  );
}

function SectionCard({ s, onSeek }: { s: OutlineSection; onSeek: (s: number) => void }) {
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">{s.title}</h3>
        <button
          onClick={() => onSeek(s.start_s)}
          className="text-xs text-slate-600 hover:text-ink"
        >
          {formatTs(s.start_s)} – {formatTs(s.end_s)}
        </button>
      </header>
      <p className="mt-1 text-sm text-slate-600">{s.summary}</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-0.5">
        {s.key_points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
    </article>
  );
}

function formatTs(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 3: Add SEEK_VIDEO message + content-script handler**

Modify `src/lib/messages.ts` — add to the union:
```ts
export type SeekVideo = { type: 'SEEK_VIDEO'; payload: { seconds: number } };
export type AppMessage = TranscriptReady | RequestOutline | SeekVideo;
// update isAppMessage to include 'SEEK_VIDEO'
```

Update the `isAppMessage` check:
```ts
return t === 'TRANSCRIPT_READY' || t === 'REQUEST_OUTLINE' || t === 'SEEK_VIDEO';
```

In `entrypoints/content.ts`, add another branch inside the message listener:
```ts
if (msg.type === 'SEEK_VIDEO') {
  const video = document.querySelector('video');
  if (video) {
    video.currentTime = msg.payload.seconds;
    video.play().catch(() => {});
    sendResponse({ ok: true });
  } else {
    sendResponse({ ok: false, error: 'no video element' });
  }
  return true;
}
```

- [ ] **Step 4: Wire the side panel**

Replace `entrypoints/sidepanel/App.tsx`:
```tsx
import { useState } from 'react';
import { useProfile } from '@/hooks/use-profile';
import { useGenerateOutline } from '@/hooks/use-outline';
import { OutlineView } from '@/components/OutlineView';

export default function App() {
  const { data: profile } = useProfile();
  const gen = useGenerateOutline();
  const [videoId, setVideoId] = useState<string | null>(null);

  async function seek(seconds: number) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_VIDEO', payload: { seconds } });
  }

  return (
    <main className="h-full flex flex-col bg-white">
      <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h1 className="text-base font-semibold text-ink">bryteo</h1>
        <span className="text-xs text-slate-600">{profile?.card_count ?? 0}/50 cards</span>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-4">
        {!gen.data && !gen.isPending && (
          <button
            onClick={() => gen.mutate(undefined, { onSuccess: (r) => setVideoId(r.videoId) })}
            className="w-full py-3 rounded-lg bg-ink text-white font-medium"
          >
            Analyze this video
          </button>
        )}

        {gen.isPending && <p className="text-sm text-slate-600">Analyzing this video…</p>}

        {gen.isError && (
          <p className="text-sm text-red-600">
            {(gen.error as Error).message}
          </p>
        )}

        {gen.data && (
          <OutlineView
            outline={gen.data.outline}
            onSeek={seek}
            onGenerateCards={() => alert('TODO Phase 6')}
          />
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Test end-to-end**

Reload extension. Open a YouTube video with captions. Click extension icon → side panel opens. Click "Analyze this video." Wait ~3-5s. Outline renders. Click a timestamp → video seeks to that moment.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-outline.ts src/components/OutlineView.tsx src/lib/messages.ts entrypoints/content.ts entrypoints/sidepanel/App.tsx
git commit -m "feat(outline-ui): first end-to-end outline render + seek"
```

---

### Task 5.2: Phase 5 checkpoint

- [ ] **Step 1: Confirm**

- Outline appears within ~5s on a video with captions
- Timestamp click seeks the video
- "No captions" video shows the spec-defined message
- 21st outline same day shows rate-limit error

- [ ] **Step 2: Tag**

```bash
git tag phase-5-complete
```

---

## Phase 6 — `generate-cards` Edge Function + Style Picker

**Goal of phase:** Edge Function returns FSRS-ready cards per outline section + style. Style picker UI ships in the side panel.

### Task 6.1: Prompt builders (pure, unit-tested)

**Files:**
- Create: `src/lib/prompts.ts`
- Create: `tests/unit/prompts.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cardsSystemPrompt, cardsUserPrompt } from '@/lib/prompts';

describe('cards prompts', () => {
  it('varies card count per style', () => {
    expect(cardsSystemPrompt('quick')).toMatch(/3-5 cards/);
    expect(cardsSystemPrompt('exam')).toMatch(/10-15 cards/);
    expect(cardsSystemPrompt('deep')).toMatch(/20-25 cards/);
    expect(cardsSystemPrompt('language')).toMatch(/cloze/);
  });

  it('user prompt includes section + key points', () => {
    const p = cardsUserPrompt({
      title: 'Section A',
      summary: 'Summary.',
      start_s: 0, end_s: 60,
      key_points: ['k1', 'k2']
    });
    expect(p).toContain('Section A');
    expect(p).toContain('k1');
    expect(p).toContain('k2');
  });
});
```

- [ ] **Step 2: Run, expect fail.** `npm test -- prompts.test.ts`

- [ ] **Step 3: Implement**

`src/lib/prompts.ts`:
```ts
import type { OutlineSection } from '@/api/outlines';

export type Style = 'quick' | 'exam' | 'deep' | 'language';

const CARDS_BY_STYLE: Record<Style, string> = {
  quick:    '3-5 cards. Big concepts only. Simple Q/A.',
  exam:     '10-15 cards. Denser, more rigorous wording. Mix Q/A and cloze.',
  deep:     '20-25 cards. Include edge cases and definitions.',
  language: '8-12 cards. Cloze-heavy. Focus on vocabulary and grammar.'
};

export function cardsSystemPrompt(style: Style): string {
  return `Generate flashcards from a video section. Style: ${style}.
${CARDS_BY_STYLE[style]}

Return JSON: { "cards": [{ "type": "basic"|"cloze", "front": "...", "back": "...", "source_ts_s": <int> }] }

Rules:
- Each card must have a "source_ts_s" timestamp within [section.start_s, section.end_s].
- "basic" cards: front is a question, back is the answer.
- "cloze" cards: front has [...] gaps, back is the filled-in version.
- Reply with ONLY the JSON. No prose, no markdown fences.`;
}

export function cardsUserPrompt(s: OutlineSection): string {
  return `Section title: ${s.title}
Time range: ${s.start_s}s - ${s.end_s}s
Summary: ${s.summary}

Key points:
${s.key_points.map((p) => `- ${p}`).join('\n')}`;
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts.ts tests/unit/prompts.test.ts
git commit -m "feat(prompts): card prompt builders per style"
```

---

### Task 6.2: `generate-cards` Edge Function

**Files:**
- Create: `supabase/functions/generate-cards/index.ts`
- Modify: `supabase/functions/_shared/schemas.ts` (already added in Task 4.2)

- [ ] **Step 1: Mirror prompt logic in Deno (small duplication is fine)**

Create `supabase/functions/_shared/prompts.ts`:
```ts
export type Style = 'quick' | 'exam' | 'deep' | 'language';

const BY_STYLE: Record<Style, string> = {
  quick:    '3-5 cards. Big concepts only. Simple Q/A.',
  exam:     '10-15 cards. Denser. Mix Q/A and cloze.',
  deep:     '20-25 cards. Include edge cases and definitions.',
  language: '8-12 cards. Cloze-heavy. Vocabulary + grammar focus.'
};

export function systemPrompt(style: Style) {
  return `Generate flashcards from a video section. Style: ${style}.
${BY_STYLE[style]}
Return JSON: { "cards": [{ "type":"basic"|"cloze", "front":"...", "back":"...", "source_ts_s":<int> }] }
Rules:
- source_ts_s must be within the section's time range.
- Reply with ONLY the JSON. No prose, no markdown fences.`;
}

export function userPrompt(s: { title: string; summary: string; start_s: number; end_s: number; key_points: string[] }) {
  return `Section: ${s.title}\nRange: ${s.start_s}s-${s.end_s}s\nSummary: ${s.summary}\nKey points:\n${s.key_points.map(p=>'- '+p).join('\n')}`;
}
```

- [ ] **Step 2: Edge Function**

`supabase/functions/generate-cards/index.ts`:
```ts
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserFromRequest, serviceClient } from '../_shared/auth.ts';
import { cardsRequest, cardsResponse } from '../_shared/schemas.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';
import { anthropic, modelFor } from '../_shared/anthropic.ts';
import { systemPrompt, userPrompt } from '../_shared/prompts.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user } = await getUserFromRequest(req);
    const body = cardsRequest.parse(await req.json());

    const sb = serviceClient();
    const { data: profile } = await sb.from('profiles').select('pro_status').eq('id', user.id).single();
    const tier = (profile?.pro_status ?? 'free') as 'free' | 'pro' | 'founding' | 'student';

    // Generate (style determines how many cards we'll ask for; rate-limit by upper bound)
    const upperBound = body.style === 'deep' ? 25 : body.style === 'exam' ? 15 : body.style === 'language' ? 12 : 5;
    const rl = await checkAndIncrement(user.id, 'cards_today', upperBound, tier);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const model = modelFor(tier);
    const aiResp = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt(body.style),
      messages: [{ role: 'user', content: userPrompt(body.outlineSection) }]
    });

    const text = aiResp.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { return jsonErr('ai_invalid_json', 502); }

    const validated = cardsResponse.safeParse(parsed);
    if (!validated.success) {
      const retry = await anthropic.messages.create({
        model, max_tokens: 4096,
        system: systemPrompt(body.style),
        messages: [
          { role: 'user', content: userPrompt(body.outlineSection) },
          { role: 'assistant', content: text },
          { role: 'user', content: 'That JSON did not match the schema. Reply again with valid JSON only.' }
        ]
      });
      const retryText = retry.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      try { parsed = JSON.parse(retryText); }
      catch { return jsonErr('ai_invalid_json', 502); }
      const second = cardsResponse.safeParse(parsed);
      if (!second.success) return jsonErr('ai_invalid_json', 502);
      parsed = second.data;
    } else {
      parsed = validated.data;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return jsonErr('server_error', 500);
  }
});

function jsonErr(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy generate-cards --no-verify-jwt
```

- [ ] **Step 4: Smoke test**

```bash
curl -X POST "$(grep VITE_SUPABASE_URL .env | cut -d= -f2)/functions/v1/generate-cards" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "00000000-0000-0000-0000-000000000000",
    "style": "quick",
    "outlineSection": {
      "title":"Test","summary":"A test section.","start_s":0,"end_s":60,
      "key_points":["fact one","fact two"]
    }
  }' | jq .
```

Expected: 200 OK with `cards: [...]`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/prompts.ts supabase/functions/generate-cards/
git commit -m "feat(edge): generate-cards function"
```

---

### Task 6.3: Style picker component + client API

**Files:**
- Create: `src/components/StylePicker.tsx`
- Create: `src/api/cards.ts`
- Create: `src/api/decks.ts`

- [ ] **Step 1: StylePicker**

`src/components/StylePicker.tsx`:
```tsx
import type { Style } from '@/lib/prompts';

const OPTIONS: { id: Style; emoji: string; label: string; sub: string }[] = [
  { id: 'quick',    emoji: '⚡', label: 'Quick',     sub: '~5 cards' },
  { id: 'exam',     emoji: '🎯', label: 'Exam-ready', sub: '~15 cards' },
  { id: 'deep',     emoji: '📖', label: 'Deep',      sub: '~25 cards' },
  { id: 'language', emoji: '🌍', label: 'Language',  sub: 'cloze-heavy' }
];

export function StylePicker({ value, onChange }: { value: Style; onChange: (s: Style) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`p-3 rounded-lg border text-left ${
            value === o.id ? 'border-ink bg-slate-50' : 'border-slate-100'
          }`}
        >
          <div className="text-xl">{o.emoji}</div>
          <div className="text-sm font-medium text-ink mt-1">{o.label}</div>
          <div className="text-xs text-slate-600">{o.sub}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: cards API**

`src/api/cards.ts`:
```ts
import { supabase } from './supabase';
import type { Style } from '@/lib/prompts';
import type { OutlineSection } from './outlines';

export type GeneratedCard = {
  type: 'basic' | 'cloze';
  front: string;
  back: string;
  source_ts_s: number;
};

export async function generateCards(input: {
  deckId: string;
  outlineSection: OutlineSection;
  style: Style;
}): Promise<{ cards: GeneratedCard[] }> {
  const { data, error } = await supabase.functions.invoke('generate-cards', { body: input });
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 3: decks API**

`src/api/decks.ts`:
```ts
import { supabase } from './supabase';
import type { Style } from '@/lib/prompts';

export async function createDeck(input: {
  videoId: string;
  name: string;
  style: Style;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { data, error } = await supabase.from('decks').upsert({
    video_id: input.videoId,
    user_id: user.id,
    name: input.name,
    style: input.style
  }, { onConflict: 'video_id' }).select().single();
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/StylePicker.tsx src/api/cards.ts src/api/decks.ts
git commit -m "feat(api,ui): style picker + cards/decks client APIs"
```

---

### Task 6.4: Phase 6 checkpoint

- [ ] **Step 1: Confirm**

- curl to `generate-cards` returns valid JSON
- StylePicker renders 4 options
- 4 of those style strings match the Phase 6 prompt tests

- [ ] **Step 2: Tag**

```bash
git tag phase-6-complete
```

---

## Phase 7 — Card Preview + Save

**Goal of phase:** After generating cards, user previews each in a swipeable stack; can edit, regenerate, delete; "Save to library" persists to Postgres with initial FSRS state.

### Task 7.1: FSRS wrapper (pure)

**Files:**
- Create: `src/lib/fsrs.ts`
- Create: `tests/unit/fsrs.test.ts`

- [ ] **Step 1: Failing tests**

`tests/unit/fsrs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { initialState, rate } from '@/lib/fsrs';

describe('fsrs wrapper', () => {
  it('initial state is due now and has reps=0', () => {
    const s = initialState(new Date('2026-06-10T00:00:00Z'));
    expect(s.reps).toBe(0);
    expect(new Date(s.due).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('rate "good" pushes due_at into future', () => {
    const before = initialState(new Date('2026-06-10T00:00:00Z'));
    const after = rate(before, 3, new Date('2026-06-10T00:00:00Z'));
    expect(new Date(after.due).getTime()).toBeGreaterThan(new Date(before.due).getTime());
    expect(after.reps).toBe(1);
  });

  it('rate "again" resets / shortens due', () => {
    const start = initialState(new Date('2026-06-10T00:00:00Z'));
    const good = rate(start, 3, new Date('2026-06-10T00:00:00Z'));
    const again = rate(good, 1, new Date(good.due));
    expect(new Date(again.due).getTime()).toBeLessThan(new Date(good.due).getTime() + 24 * 3600 * 1000);
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement**

`src/lib/fsrs.ts`:
```ts
import { FSRS, createEmptyCard, type Card as FsrsCard, Rating, generatorParameters } from 'ts-fsrs';

const fsrs = new FSRS(generatorParameters({ enable_fuzz: true }));

export type FsrsState = FsrsCard;

export function initialState(now: Date = new Date()): FsrsState {
  return createEmptyCard(now);
}

export function rate(state: FsrsState, rating: 1 | 2 | 3 | 4, now: Date = new Date()): FsrsState {
  const map: Record<number, Rating> = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };
  const result = fsrs.next(state, now, map[rating]);
  return result.card;
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fsrs.ts tests/unit/fsrs.test.ts
git commit -m "feat(fsrs): ts-fsrs wrapper with initialState + rate"
```

---

### Task 7.2: Save cards mutation

**Files:**
- Modify: `src/api/cards.ts` (add saveCards)

- [ ] **Step 1: Add saveCards + getCardCount + deleteCard**

Append to `src/api/cards.ts`:
```ts
import { initialState } from '@/lib/fsrs';
import type { Database } from '@/types/db';
export type CardRow = Database['public']['Tables']['cards']['Row'];

export async function saveCards(input: {
  deckId: string;
  cards: GeneratedCard[];
}): Promise<CardRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const now = new Date();
  const payload = input.cards.map((c) => {
    const state = initialState(now);
    return {
      deck_id: input.deckId,
      user_id: user.id,
      type: c.type,
      front: c.front,
      back: c.back,
      source_ts_s: c.source_ts_s,
      fsrs_state: state as any,
      due_at: state.due
    };
  });

  const { data, error } = await supabase.from('cards').insert(payload).select();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCard(cardId: string) {
  const { error } = await supabase.from('cards').delete().eq('id', cardId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/cards.ts
git commit -m "feat(api): saveCards seeds FSRS state, deleteCard"
```

---

### Task 7.3: Card preview stack UI

**Files:**
- Create: `src/components/CardPreviewStack.tsx`

- [ ] **Step 1: Implement**

`src/components/CardPreviewStack.tsx`:
```tsx
import { useState } from 'react';
import type { GeneratedCard } from '@/api/cards';

type Props = {
  cards: GeneratedCard[];
  onSave: (kept: GeneratedCard[]) => void;
};

export function CardPreviewStack({ cards: initial, onSave }: Props) {
  const [cards, setCards] = useState<GeneratedCard[]>(initial);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);

  if (cards.length === 0) {
    return <p className="text-sm text-slate-600">No cards left. Try again.</p>;
  }

  const c = cards[index];

  function remove() {
    const next = cards.filter((_, i) => i !== index);
    setCards(next);
    setIndex(Math.min(index, Math.max(0, next.length - 1)));
  }

  function updateField(field: 'front' | 'back', value: string) {
    setCards(cards.map((x, i) => (i === index ? { ...x, [field]: value } : x)));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-600">
        Card {index + 1} of {cards.length} · {formatTs(c.source_ts_s)} in video
      </div>

      <div className="rounded-lg border border-slate-100 bg-white p-4 space-y-3">
        {editing ? (
          <>
            <textarea value={c.front} onChange={(e) => updateField('front', e.target.value)}
                      className="w-full rounded border-slate-200 text-sm p-2 min-h-[64px]" />
            <textarea value={c.back} onChange={(e) => updateField('back', e.target.value)}
                      className="w-full rounded border-slate-200 text-sm p-2 min-h-[64px]" />
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-ink whitespace-pre-wrap">{c.front}</div>
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{c.back}</div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
                className="px-3 py-2 text-sm rounded border border-slate-200 disabled:opacity-30">←</button>
        <button onClick={() => setEditing(!editing)}
                className="px-3 py-2 text-sm rounded border border-slate-200">
          {editing ? 'Done' : 'Edit'}
        </button>
        <button onClick={remove}
                className="px-3 py-2 text-sm rounded border border-slate-200 text-red-600">Delete</button>
        <button onClick={() => setIndex(Math.min(cards.length - 1, index + 1))}
                disabled={index === cards.length - 1}
                className="ml-auto px-3 py-2 text-sm rounded border border-slate-200 disabled:opacity-30">→</button>
      </div>

      <button onClick={() => onSave(cards)}
              className="w-full py-2.5 rounded-lg bg-ink text-white font-medium">
        Save {cards.length} card{cards.length === 1 ? '' : 's'} to library
      </button>
    </div>
  );
}

function formatTs(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CardPreviewStack.tsx
git commit -m "feat(ui): card preview stack with edit + delete"
```

---

### Task 7.4: Wire side panel: outline → style picker → cards → preview → save

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx`

- [ ] **Step 1: Replace App.tsx**

```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useProfile } from '@/hooks/use-profile';
import { useGenerateOutline } from '@/hooks/use-outline';
import { OutlineView } from '@/components/OutlineView';
import { StylePicker } from '@/components/StylePicker';
import { CardPreviewStack } from '@/components/CardPreviewStack';
import { generateCards, saveCards, type GeneratedCard } from '@/api/cards';
import { createDeck } from '@/api/decks';
import type { Style } from '@/lib/prompts';

type Phase = 'idle' | 'outline' | 'choose-style' | 'preview' | 'saved';

export default function App() {
  const { data: profile, refetch: refetchProfile } = useProfile();
  const gen = useGenerateOutline();
  const [phase, setPhase] = useState<Phase>('idle');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>('quick');
  const [cards, setCards] = useState<GeneratedCard[]>([]);

  const genCards = useMutation({
    mutationFn: async (chosen: Style) => {
      if (!videoId || !gen.data) throw new Error('no outline');
      const deck = await createDeck({
        videoId,
        name: gen.data.outline.sections[0]?.title ?? 'Deck',
        style: chosen
      });
      // Concatenate sections for a single AI call. (Multi-section parallel calls = Phase 12.)
      const merged = mergeSections(gen.data.outline.sections);
      const { cards } = await generateCards({ deckId: deck.id, outlineSection: merged, style: chosen });
      setCards(cards);
      setPhase('preview');
    }
  });

  const save = useMutation({
    mutationFn: async (kept: GeneratedCard[]) => {
      if (!videoId) throw new Error('no video');
      const deck = await createDeck({
        videoId,
        name: gen.data!.outline.sections[0]?.title ?? 'Deck',
        style
      });
      await saveCards({ deckId: deck.id, cards: kept });
      await refetchProfile();
      setPhase('saved');
    }
  });

  async function seek(seconds: number) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_VIDEO', payload: { seconds } });
  }

  return (
    <main className="h-full flex flex-col bg-white">
      <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h1 className="text-base font-semibold text-ink">bryteo</h1>
        <span className="text-xs text-slate-600">{profile?.card_count ?? 0}/50 cards</span>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {phase === 'idle' && (
          <button onClick={() => gen.mutate(undefined, {
                    onSuccess: (r) => { setVideoId(r.videoId); setPhase('outline'); }
                  })}
                  className="w-full py-3 rounded-lg bg-ink text-white font-medium">
            Analyze this video
          </button>
        )}

        {gen.isPending && <p className="text-sm text-slate-600">Analyzing this video…</p>}
        {gen.isError && <p className="text-sm text-red-600">{(gen.error as Error).message}</p>}

        {phase === 'outline' && gen.data && (
          <OutlineView outline={gen.data.outline} onSeek={seek}
                       onGenerateCards={() => setPhase('choose-style')} />
        )}

        {phase === 'choose-style' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Pick a card style:</p>
            <StylePicker value={style} onChange={setStyle} />
            <button onClick={() => genCards.mutate(style)}
                    disabled={genCards.isPending}
                    className="w-full py-2.5 rounded-lg bg-ink text-white font-medium disabled:opacity-50">
              {genCards.isPending ? 'Creating cards…' : 'Create cards'}
            </button>
            {genCards.isError && <p className="text-sm text-red-600">{(genCards.error as Error).message}</p>}
          </div>
        )}

        {phase === 'preview' && (
          <CardPreviewStack cards={cards} onSave={(kept) => save.mutate(kept)} />
        )}

        {phase === 'saved' && (
          <div className="space-y-2">
            <p className="text-sm text-ink font-medium">Saved!</p>
            <p className="text-sm text-slate-600">
              You have {profile?.card_count ?? 0} cards. We'll surface them in Review Mode as they come due.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function mergeSections(sections: any[]) {
  const all_points = sections.flatMap((s) => s.key_points);
  return {
    title: 'All sections',
    summary: sections.map((s) => `• ${s.title}: ${s.summary}`).join('\n'),
    start_s: sections[0]?.start_s ?? 0,
    end_s: sections[sections.length - 1]?.end_s ?? 0,
    key_points: all_points
  };
}
```

- [ ] **Step 2: Test end-to-end**

Reload extension. Analyze → outline → "Generate flashcards" → pick style → preview → save → "Saved!" + card count updates in header.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/sidepanel/App.tsx
git commit -m "feat(ui): end-to-end outline → cards → preview → save"
```

---

### Task 7.5: Phase 7 checkpoint

- [ ] **Step 1: Confirm**

- After save, `select count(*) from cards where user_id = '<u>'` matches what was saved
- `profiles.card_count` reflects the new total (trigger working)
- `fsrs_state` is non-null with sensible fields

- [ ] **Step 2: Tag**

```bash
git tag phase-7-complete
```

---

## Phase 8 — FSRS-6 Review Queue

**Goal of phase:** Server query returns "cards due now" for current user. Client hook caches it. Rating a card persists new FSRS state + appends to `review_log`.

### Task 8.1: Reviews API

**Files:**
- Create: `src/api/reviews.ts`

- [ ] **Step 1: Implement**

`src/api/reviews.ts`:
```ts
import { supabase } from './supabase';
import { rate } from '@/lib/fsrs';
import type { CardRow } from './cards';

export async function getDueCards(limit = 30): Promise<CardRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { data, error } = await supabase
    .from('cards').select('*')
    .eq('user_id', user.id)
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function rateCard(input: {
  card: CardRow;
  rating: 1 | 2 | 3 | 4;
  elapsedMs: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const newState = rate(input.card.fsrs_state as any, input.rating);

  const { error: uErr } = await supabase.from('cards')
    .update({ fsrs_state: newState as any, due_at: newState.due as any })
    .eq('id', input.card.id);
  if (uErr) throw new Error(uErr.message);

  const { error: lErr } = await supabase.from('review_log').insert({
    card_id: input.card.id,
    user_id: user.id,
    rating: input.rating,
    elapsed_ms: input.elapsedMs
  });
  if (lErr) throw new Error(lErr.message);
}

export async function getReviewStats(): Promise<{ streakDays: number; reviewedToday: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  // Today count
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const { count: reviewedToday } = await supabase
    .from('review_log').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('reviewed_at', startOfDay.toISOString());

  // Streak: pull last 60 days of distinct review dates, count consecutive from today.
  const sixtyAgo = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: rows } = await supabase
    .from('review_log').select('reviewed_at')
    .eq('user_id', user.id).gte('reviewed_at', sixtyAgo)
    .order('reviewed_at', { ascending: false });

  const days = new Set((rows ?? []).map((r) => r.reviewed_at!.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streakDays: streak, reviewedToday: reviewedToday ?? 0 };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/reviews.ts
git commit -m "feat(api): due queue, rating mutation, streak stats"
```

---

### Task 8.2: Review hook

**Files:**
- Create: `src/hooks/use-review-queue.ts`

- [ ] **Step 1: Implement**

`src/hooks/use-review-queue.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDueCards, rateCard } from '@/api/reviews';

export function useDueCards() {
  return useQuery({ queryKey: ['due-cards'], queryFn: () => getDueCards(30), staleTime: 0 });
}

export function useRateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rateCard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['due-cards'] })
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-review-queue.ts
git commit -m "feat(hooks): due queue + rate card"
```

---

### Task 8.3: Phase 8 checkpoint

- [ ] **Step 1: Confirm**

- `select * from cards where due_at <= now() and user_id = '<u>'` returns expected rows
- `rate` updates `cards.fsrs_state` + `due_at` and inserts to `review_log`

- [ ] **Step 2: Tag**

```bash
git tag phase-8-complete
```

---

## Phase 9 — Review Mode UI

**Goal of phase:** New "Review Mode" route in the side panel. Card flip, 4 rating buttons, FSRS update on tap, streak + session summary.

### Task 9.1: ReviewCard component

**Files:**
- Create: `src/components/ReviewCard.tsx`
- Create: `src/components/SessionSummary.tsx`

- [ ] **Step 1: ReviewCard**

`src/components/ReviewCard.tsx`:
```tsx
import { useState } from 'react';
import type { CardRow } from '@/api/cards';

type Props = {
  card: CardRow;
  onRate: (rating: 1 | 2 | 3 | 4, elapsedMs: number) => void;
  onSeek: (seconds: number) => void;
};

export function ReviewCard({ card, onRate, onSeek }: Props) {
  const [shown, setShown] = useState(false);
  const [startedAt] = useState(() => Date.now());

  function rate(r: 1 | 2 | 3 | 4) {
    onRate(r, Date.now() - startedAt);
    setShown(false);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-100 bg-white p-4 min-h-[180px]">
        <div className="text-sm whitespace-pre-wrap">{card.front}</div>
        {shown && (
          <>
            <hr className="my-3 border-slate-100" />
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{card.back}</div>
          </>
        )}
      </div>

      {card.source_ts_s != null && (
        <button onClick={() => onSeek(card.source_ts_s!)}
                className="text-xs text-slate-600 underline">
          Replay {formatTs(card.source_ts_s)} in video
        </button>
      )}

      {!shown ? (
        <button onClick={() => setShown(true)}
                className="w-full py-2.5 rounded-lg bg-ink text-white font-medium">
          Show answer
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <button onClick={() => rate(1)} className="py-2 rounded-lg border border-red-300 text-red-700">Again</button>
          <button onClick={() => rate(2)} className="py-2 rounded-lg border border-orange-300 text-orange-700">Hard</button>
          <button onClick={() => rate(3)} className="py-2 rounded-lg border border-green-300 text-green-700">Good</button>
          <button onClick={() => rate(4)} className="py-2 rounded-lg border border-blue-300 text-blue-700">Easy</button>
        </div>
      )}
    </div>
  );
}

function formatTs(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}
```

- [ ] **Step 2: SessionSummary**

`src/components/SessionSummary.tsx`:
```tsx
type Props = { reviewedCount: number; streakDays: number; nextDueHint: string };

export function SessionSummary({ reviewedCount, streakDays, nextDueHint }: Props) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-5 text-center space-y-2">
      <div className="text-2xl">✨</div>
      <p className="text-base font-medium text-ink">{reviewedCount} cards reviewed</p>
      <p className="text-sm text-slate-600">🔥 {streakDays}-day streak</p>
      <p className="text-xs text-slate-500">{nextDueHint}</p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ReviewCard.tsx src/components/SessionSummary.tsx
git commit -m "feat(ui): ReviewCard + SessionSummary"
```

---

### Task 9.2: Review route in side panel

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx` (add tabs: Build | Review)

- [ ] **Step 1: Add nav + review route**

Replace the inside of `App.tsx`'s `<main>` (keep imports) with a two-tab shell:

```tsx
import { ReviewCard } from '@/components/ReviewCard';
import { SessionSummary } from '@/components/SessionSummary';
import { useDueCards, useRateCard } from '@/hooks/use-review-queue';
import { useQuery } from '@tanstack/react-query';
import { getReviewStats } from '@/api/reviews';

// inside App component, add:
const [tab, setTab] = useState<'build' | 'review'>('build');
const due = useDueCards();
const rateMut = useRateCard();
const stats = useQuery({ queryKey: ['stats'], queryFn: getReviewStats });

// ...keep existing build flow; add a header tab strip and a review tab body:

<div className="flex border-b border-slate-100">
  <button onClick={() => setTab('build')}
          className={`flex-1 py-2 text-sm ${tab === 'build' ? 'text-ink font-medium border-b-2 border-ink' : 'text-slate-600'}`}>
    Build
  </button>
  <button onClick={() => setTab('review')}
          className={`flex-1 py-2 text-sm ${tab === 'review' ? 'text-ink font-medium border-b-2 border-ink' : 'text-slate-600'}`}>
    Review {(due.data?.length ?? 0) > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-ink text-white rounded">{due.data?.length}</span>}
  </button>
</div>

{tab === 'review' && (
  <section className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
    {due.isLoading && <p className="text-sm text-slate-600">Loading…</p>}
    {due.data && due.data.length === 0 && (
      <SessionSummary
        reviewedCount={stats.data?.reviewedToday ?? 0}
        streakDays={stats.data?.streakDays ?? 0}
        nextDueHint="No cards due. Come back tomorrow."
      />
    )}
    {due.data && due.data.length > 0 && (
      <ReviewCard
        card={due.data[0]}
        onRate={(rating, elapsedMs) => rateMut.mutate({ card: due.data![0], rating, elapsedMs })}
        onSeek={seek}
      />
    )}
  </section>
)}
```

(Leave the existing build-phase JSX wrapped in `{tab === 'build' && (...)}` so it switches cleanly.)

- [ ] **Step 2: Test the loop**

Reload extension. Save some cards in Build tab. Switch to Review tab. Click Show answer → rate → next card appears. After last card → SessionSummary with streak. Sanity-check `review_log` rows in Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/sidepanel/App.tsx
git commit -m "feat(ui): Review tab with FSRS rating loop + streak"
```

---

### Task 9.3: Phase 9 checkpoint

- [ ] **Step 1: Confirm**

- Rating moves the next-due-at into the future per FSRS
- Streak counter increments after first review today
- After all due cards consumed, SessionSummary appears

- [ ] **Step 2: Tag**

```bash
git tag phase-9-complete
```

---

## Phase 10 — 50-Card Cap + Upsell

**Goal of phase:** Trying to save a 51st card on free tier shows a contextual upsell. Server also enforces (defense in depth).

### Task 10.1: Server-side cap enforcement

**Files:**
- Create: `supabase/migrations/20260609000007_card_cap_enforcement.sql`

- [ ] **Step 1: Migration**

```sql
create or replace function enforce_card_cap() returns trigger
language plpgsql security definer as $$
declare
  v_status text;
  v_count int;
begin
  select pro_status, card_count into v_status, v_count
    from profiles where id = new.user_id;
  if v_status = 'free' and v_count >= 50 then
    raise exception 'card_cap_reached' using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger card_cap_trigger
  before insert on cards
  for each row execute function enforce_card_cap();
```

- [ ] **Step 2: Push**

```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609000007_card_cap_enforcement.sql
git commit -m "feat(db): enforce 50-card cap server-side"
```

---

### Task 10.2: Client cap check + UpsellBanner

**Files:**
- Create: `src/components/UpsellBanner.tsx`
- Modify: `src/api/cards.ts` (map cap exception to friendly error)

- [ ] **Step 1: Component**

`src/components/UpsellBanner.tsx`:
```tsx
export function UpsellBanner({ onUpgrade, onDismiss }: { onUpgrade: () => void; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-sm font-medium text-ink">You've built a 50-card library 🎉</p>
      <p className="text-sm text-slate-700">
        That's the free limit. Keep going with bryteo Pro — unlimited cards, cross-device sync,
        smarter AI cards. $6.99/mo or $49/yr.
      </p>
      <div className="flex gap-2">
        <button onClick={onUpgrade}
                className="px-4 py-2 rounded-full bg-ink text-white text-sm font-medium">
          Go Pro
        </button>
        <button onClick={onDismiss}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700">
          Maybe later
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Error mapping in saveCards**

Replace the `saveCards` body's catch with:
```ts
const { data, error } = await supabase.from('cards').insert(payload).select();
if (error) {
  if (error.message.includes('card_cap_reached')) {
    const e = new Error('card_cap_reached');
    (e as any).code = 'CARD_CAP';
    throw e;
  }
  throw new Error(error.message);
}
return data;
```

- [ ] **Step 3: Wire UpsellBanner in side panel**

In `App.tsx`, replace the `save.mutate(kept)` flow with:

```tsx
const [showUpsell, setShowUpsell] = useState(false);

const save = useMutation({
  mutationFn: async (kept: GeneratedCard[]) => {
    // ... existing impl ...
  },
  onError: (e: any) => {
    if (e.code === 'CARD_CAP' || e.message === 'card_cap_reached') {
      setShowUpsell(true);
    }
  }
});

// In the JSX render, near top of section column:
{showUpsell && (
  <UpsellBanner
    onUpgrade={() => openCheckout()}
    onDismiss={() => setShowUpsell(false)}
  />
)}
```

Add a stub `openCheckout()` that just opens a placeholder URL for now; replaced in Phase 11:

```ts
function openCheckout() {
  chrome.tabs.create({ url: 'https://app.lemonsqueezy.com/' });
}
```

- [ ] **Step 4: Test**

Manually seed 50 cards (via Supabase SQL editor or by generating 5-card decks 10 times). Try to save a 51st → UpsellBanner appears. Click "Maybe later" → it disappears. Click "Go Pro" → tab opens to LemonSqueezy.

- [ ] **Step 5: Commit**

```bash
git add src/components/UpsellBanner.tsx src/api/cards.ts entrypoints/sidepanel/App.tsx
git commit -m "feat(upsell): 50-cap detection + contextual upsell banner"
```

---

### Task 10.3: Phase 10 checkpoint

- [ ] **Step 1: Confirm**

- 51st insert is blocked by Postgres trigger
- UpsellBanner appears in side panel
- "Maybe later" dismisses without saving (user keeps 50 cards)

- [ ] **Step 2: Tag**

```bash
git tag phase-10-complete
```

---

## Phase 11 — LemonSqueezy Integration

**Goal of phase:** Real LemonSqueezy product + variants set up. Checkout URL opens with `user_id` as custom data. Webhook flips `profiles.pro_status` to `pro`. Daily reconciliation cron catches missed webhooks.

### Task 11.1: Create the LemonSqueezy products

LemonSqueezy dashboard work (no code).

- [ ] **Step 1: Sign up + create store**

Visit https://www.lemonsqueezy.com → sign up → create "bryteo" store.

- [ ] **Step 2: Create a product "bryteo Pro"**

Product type: "Subscription". Add two variants:
- Monthly: $6.99 USD, billed monthly
- Annual: $49 USD, billed yearly

Copy the **Product ID** and both **Variant IDs**.

- [ ] **Step 3: Generate API key**

LS dashboard → Settings → API → New token. Save as `LEMONSQUEEZY_API_KEY` (server-only).

- [ ] **Step 4: Create webhook secret**

LS dashboard → Settings → Webhooks → Add endpoint:
- URL: `https://YOUR_SUPABASE_REF.functions.supabase.co/lemonsqueezy-webhook`
- Signing secret: generate a 32+ char random string, copy it.
- Subscribe to events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_success`, `subscription_payment_failed`.

- [ ] **Step 5: Set Supabase secrets**

```bash
supabase secrets set LEMONSQUEEZY_API_KEY=ls_...
supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET=<the 32-char string>
supabase secrets set LEMONSQUEEZY_STORE_ID=<your store id>
supabase secrets set LEMONSQUEEZY_VARIANT_MONTHLY=<monthly variant id>
supabase secrets set LEMONSQUEEZY_VARIANT_YEARLY=<yearly variant id>
```

---

### Task 11.2: `lemonsqueezy-webhook` Edge Function

**Files:**
- Create: `supabase/functions/lemonsqueezy-webhook/index.ts`

- [ ] **Step 1: Implement with HMAC verification**

```ts
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { createHmac } from 'https://deno.land/std@0.220.0/node/crypto.ts';
import { serviceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });

  const signature = req.headers.get('x-signature');
  const secret = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET');
  if (!signature || !secret) return new Response('unauthorized', { status: 401 });

  const raw = await req.text();
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  if (!timingSafeEqual(signature, expected)) return new Response('bad signature', { status: 401 });

  const payload = JSON.parse(raw);
  const event = payload.meta?.event_name as string;
  const userId = payload.meta?.custom_data?.user_id as string | undefined;
  const sub = payload.data?.attributes;
  const subId = String(payload.data?.id ?? '');

  if (!userId) {
    console.warn('webhook with no user_id custom data', event);
    return new Response('ok', { status: 200 });
  }

  const sb = serviceClient();

  if (event === 'subscription_created' || event === 'subscription_updated' || event === 'subscription_payment_success') {
    const renewsAt = sub?.renews_at ? new Date(sub.renews_at).toISOString() : null;
    await sb.from('profiles').update({
      pro_status: 'pro',
      pro_expires_at: renewsAt,
      ls_customer_id: String(sub?.customer_id ?? ''),
      ls_subscription_id: subId
    }).eq('id', userId);
  } else if (event === 'subscription_cancelled' || event === 'subscription_expired') {
    await sb.from('profiles').update({
      pro_status: 'free',
      pro_expires_at: null
    }).eq('id', userId);
  }

  return new Response('ok', { status: 200 });
});

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 2: Deploy without JWT verification**

```bash
supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
```

- [ ] **Step 3: Test with LS dashboard "Send test event"**

In LemonSqueezy → Webhooks → click the endpoint → "Send test event" → `subscription_created` with `custom_data: { user_id: '<a real anon user id>' }`.

Expected: function returns 200, the user's `profiles.pro_status` flips to `pro`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/lemonsqueezy-webhook/
git commit -m "feat(edge): LemonSqueezy webhook with HMAC verification"
```

---

### Task 11.3: Checkout URL builder + Pro polling

**Files:**
- Create: `src/lib/checkout.ts`
- Modify: `entrypoints/sidepanel/App.tsx` (real `openCheckout` + poll)

- [ ] **Step 1: Checkout helper**

`src/lib/checkout.ts`:
```ts
// LemonSqueezy checkout URL template; uses public store + variant data
const STORE = import.meta.env.VITE_LEMONSQUEEZY_STORE;          // e.g. 'bryteo'
const VARIANT_YEARLY = import.meta.env.VITE_LEMONSQUEEZY_VARIANT_YEARLY;
const VARIANT_MONTHLY = import.meta.env.VITE_LEMONSQUEEZY_VARIANT_MONTHLY;

export function checkoutUrl(opts: { userId: string; plan: 'yearly' | 'monthly' }): string {
  const variant = opts.plan === 'yearly' ? VARIANT_YEARLY : VARIANT_MONTHLY;
  const u = new URL(`https://${STORE}.lemonsqueezy.com/buy/${variant}`);
  u.searchParams.set('checkout[custom][user_id]', opts.userId);
  return u.toString();
}
```

- [ ] **Step 2: Add VITE_ vars to `.env`** (also update `.env.example`)

```
VITE_LEMONSQUEEZY_STORE=bryteo
VITE_LEMONSQUEEZY_VARIANT_YEARLY=12345
VITE_LEMONSQUEEZY_VARIANT_MONTHLY=12346
```

- [ ] **Step 3: Update sidepanel openCheckout to real URL**

Replace the placeholder `openCheckout()` in `App.tsx`:
```tsx
import { checkoutUrl } from '@/lib/checkout';
import { supabase } from '@/api/supabase';

async function openCheckout() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  chrome.tabs.create({ url: checkoutUrl({ userId: user.id, plan: 'yearly' }) });
}
```

The 60-second polling for `pro_status` is already wired through `useProfile`'s `refetchInterval`. When the webhook fires, next poll picks it up.

- [ ] **Step 4: End-to-end test in LS test mode**

LS dashboard → Settings → Test mode ON. Use test card `4242 4242 4242 4242`. Buy the yearly plan. Within ~60s side-panel header should show "0/∞ cards" (or your chosen Pro indicator — adjust the header to render `card_count / pro_status === 'pro' ? '∞' : 50`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/checkout.ts entrypoints/sidepanel/App.tsx .env.example
git commit -m "feat(checkout): LemonSqueezy yearly checkout flow"
```

---

### Task 11.4: Daily reconciliation cron

**Files:**
- Create: `supabase/migrations/20260609000008_reconcile_cron.sql`
- Create: `supabase/functions/reconcile-subscriptions/index.ts`

- [ ] **Step 1: Reconciliation Edge Function**

```ts
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { serviceClient } from '../_shared/auth.ts';

const LS = 'https://api.lemonsqueezy.com/v1';
const API_KEY = Deno.env.get('LEMONSQUEEZY_API_KEY')!;

serve(async (_req) => {
  const sb = serviceClient();

  // Pull all bryteo subscriptions updated in last 26 hours.
  const since = new Date(Date.now() - 26 * 3600_000).toISOString();
  const url = `${LS}/subscriptions?filter[updated_after]=${encodeURIComponent(since)}&page[size]=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } });
  if (!resp.ok) return new Response('LS fetch failed', { status: 502 });

  const { data: subs } = await resp.json();
  let fixed = 0;
  for (const s of subs ?? []) {
    const userId = s.attributes?.custom_data?.user_id;
    if (!userId) continue;
    const status = s.attributes?.status as string; // active | cancelled | expired | past_due | unpaid
    const want = ['active', 'on_trial', 'past_due'].includes(status) ? 'pro' : 'free';
    const renewsAt = s.attributes?.renews_at ? new Date(s.attributes.renews_at).toISOString() : null;

    const { data: cur } = await sb.from('profiles').select('pro_status').eq('id', userId).single();
    if (cur?.pro_status !== want) {
      await sb.from('profiles').update({
        pro_status: want,
        pro_expires_at: renewsAt,
        ls_subscription_id: String(s.id)
      }).eq('id', userId);
      fixed++;
    }
  }
  return new Response(JSON.stringify({ fixed }), { headers: { 'Content-Type': 'application/json' } });
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy reconcile-subscriptions --no-verify-jwt
```

- [ ] **Step 3: Schedule the cron via pg_cron**

`supabase/migrations/20260609000008_reconcile_cron.sql`:
```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'reconcile-subscriptions-daily',
  '0 3 * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.functions.supabase.co/reconcile-subscriptions',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Replace `YOUR_PROJECT_REF` with your real ref. Set the setting once via dashboard:
```sql
alter database postgres set app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
```

Then push:
```bash
supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/reconcile-subscriptions/ supabase/migrations/20260609000008_reconcile_cron.sql
git commit -m "feat(cron): daily LemonSqueezy reconciliation safety net"
```

---

### Task 11.5: Phase 11 checkpoint

- [ ] **Step 1: Confirm**

- LS test-mode purchase flips `pro_status` to `pro` within ~60s
- Cancellation in LS flips `pro_status` back to `free` within ~24h via cron
- Webhook with bad signature returns 401

- [ ] **Step 2: Tag**

```bash
git tag phase-11-complete
```

---

## Phase 12 — Polish

**Goal of phase:** Empty states, loading skeletons, error toasts, "no captions" fallback, settings page, account deletion.

### Task 12.1: Settings page + account deletion

**Files:**
- Create: `src/components/SettingsView.tsx`
- Create: `src/api/account.ts`
- Modify: `entrypoints/sidepanel/App.tsx` (add Settings tab)

- [ ] **Step 1: Account API**

`src/api/account.ts`:
```ts
import { supabase } from './supabase';

export async function updateNotificationHour(hour: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { error } = await supabase.from('profiles')
    .update({ notification_hour: hour }).eq('id', user.id);
  if (error) throw new Error(error.message);
}

export async function deleteAccount(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  // Profile cascade deletes everything user owns.
  // Calling auth.admin would need service key; instead, sign out + leave profile cleanup to admin.
  // For full self-service deletion we expose an Edge Function — see Step 3.
  await supabase.functions.invoke('delete-account', { body: {} });
  await supabase.auth.signOut();
}
```

- [ ] **Step 2: delete-account Edge Function**

`supabase/functions/delete-account/index.ts`:
```ts
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserFromRequest, serviceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user } = await getUserFromRequest(req);
    const sb = serviceClient();

    // Cancel LemonSqueezy subscription if present
    const { data: profile } = await sb.from('profiles')
      .select('ls_subscription_id').eq('id', user.id).single();
    if (profile?.ls_subscription_id) {
      const apiKey = Deno.env.get('LEMONSQUEEZY_API_KEY')!;
      await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${profile.ls_subscription_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
      }).catch(() => {});
    }

    // Delete auth user (cascades to profile → videos → outlines → decks → cards → review_log)
    const { error } = await sb.auth.admin.deleteUser(user.id);
    if (error) return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response('ok', { headers: corsHeaders });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response('server_error', { status: 500 });
  }
});
```

Deploy:
```bash
supabase functions deploy delete-account --no-verify-jwt
```

- [ ] **Step 3: SettingsView component**

`src/components/SettingsView.tsx`:
```tsx
import { useState } from 'react';
import { useProfile } from '@/hooks/use-profile';
import { updateNotificationHour, deleteAccount } from '@/api/account';

export function SettingsView() {
  const { data: profile, refetch } = useProfile();
  const [hour, setHour] = useState(profile?.notification_hour ?? 8);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs uppercase text-slate-500 tracking-wide mb-2">Reminders</h2>
        <div className="rounded-lg border border-slate-100 bg-white p-3">
          <label className="text-sm text-ink">Review reminder time</label>
          <select value={hour}
                  onChange={(e) => { setHour(parseInt(e.target.value, 10)); }}
                  onBlur={async () => { await updateNotificationHour(hour); refetch(); }}
                  className="mt-1 w-full rounded border-slate-200 text-sm">
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase text-slate-500 tracking-wide mb-2">Subscription</h2>
        <div className="rounded-lg border border-slate-100 bg-white p-3 text-sm">
          Status: <strong>{profile?.pro_status ?? 'free'}</strong>
          {profile?.ls_subscription_id && (
            <p className="mt-2 text-xs text-slate-600">Manage at lemonsqueezy.com</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase text-slate-500 tracking-wide mb-2">Danger Zone</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
                    className="text-sm text-red-700 font-medium">
              Delete my account
            </button>
          ) : (
            <>
              <p className="text-sm text-red-700">
                Permanently delete everything: cards, decks, reviews, subscription.
              </p>
              <div className="flex gap-2">
                <button onClick={async () => { await deleteAccount(); window.close(); }}
                        className="px-3 py-1.5 rounded bg-red-600 text-white text-sm">
                  Yes, delete forever
                </button>
                <button onClick={() => setConfirming(false)}
                        className="px-3 py-1.5 rounded border border-slate-200 text-sm">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add Settings tab to side panel**

In `App.tsx`, extend the tab type to `'build' | 'review' | 'settings'`, add a settings tab button (gear icon or "Settings" text), and render:
```tsx
{tab === 'settings' && (
  <section className="flex-1 overflow-y-auto px-4 py-4">
    <SettingsView />
  </section>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsView.tsx src/api/account.ts supabase/functions/delete-account/ entrypoints/sidepanel/App.tsx
git commit -m "feat(settings): notification hour + account deletion"
```

---

### Task 12.2: Empty / loading / error states

**Files:**
- Create: `src/components/EmptyState.tsx`
- Create: `src/lib/errors.ts`

- [ ] **Step 1: EmptyState**

`src/components/EmptyState.tsx`:
```tsx
type Props = { icon?: string; title: string; body: string; cta?: { label: string; onClick: () => void } };
export function EmptyState({ icon = '📺', title, body, cta }: Props) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      {cta && (
        <button onClick={cta.onClick}
                className="mt-4 px-4 py-2 rounded-full bg-ink text-white text-sm font-medium">
          {cta.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Error message mapping**

`src/lib/errors.ts`:
```ts
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes('no captions')) return "This video doesn't have captions yet. Try one with the CC icon.";
  if (msg.includes('rate_limit')) return "You've hit today's limit. Try again tomorrow.";
  if (msg.includes('card_cap')) return "You've hit the 50-card free limit.";
  if (msg.includes('ai_invalid_json')) return "AI returned something unexpected. Try again.";
  if (msg.includes('network')) return "Network's flaky. Trying again will help.";
  return "Something went sideways on our end. Try again.";
}
```

- [ ] **Step 3: Apply EmptyState / friendlyError in App.tsx**

Replace bare error renders with:
```tsx
{gen.isError && <p className="text-sm text-red-600">{friendlyError(gen.error)}</p>}
```

Replace the "idle" build state with an `EmptyState`:
```tsx
{phase === 'idle' && (
  <EmptyState
    icon="🎬"
    title="Ready when you are."
    body="Open a YouTube video, then click 'Analyze this video.'"
    cta={{ label: 'Analyze this video', onClick: () => gen.mutate(undefined, { onSuccess: (r) => { setVideoId(r.videoId); setPhase('outline'); } }) }}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/EmptyState.tsx src/lib/errors.ts entrypoints/sidepanel/App.tsx
git commit -m "feat(ui): empty/error states + friendly error mapping"
```

---

### Task 12.3: Sentry + PostHog scaffold

**Files:**
- Create: `src/lib/sentry.ts`
- Create: `src/lib/analytics.ts`

- [ ] **Step 1: Sentry init**

```bash
npm install @sentry/browser
```

`src/lib/sentry.ts`:
```ts
import * as Sentry from '@sentry/browser';

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event) {
      // strip PII
      if (event.request?.cookies) delete event.request.cookies;
      if (event.user) event.user = { id: event.user.id };
      return event;
    }
  });
}

export function captureError(e: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(e, { extra: context });
}
```

- [ ] **Step 2: PostHog wrapper**

```bash
npm install posthog-js
```

`src/lib/analytics.ts`:
```ts
import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true
  });
}

type EventName =
  | 'install'
  | 'outline_generated'
  | 'cards_generated'
  | 'cards_saved'
  | 'card_reviewed'
  | 'upsell_shown'
  | 'upgrade_clicked'
  | 'pro_activated'
  | 'account_deleted';

export function track(event: EventName, props?: Record<string, unknown>) {
  if (!key) return;
  posthog.capture(event, props ?? {});
}
```

- [ ] **Step 3: Add track() calls in sidepanel App**

At key moments — after `gen.mutate` success, after `genCards` success, after `save` success, after each `rateMut` success, when UpsellBanner shows, when `openCheckout` fires.

E.g.:
```tsx
import { track } from '@/lib/analytics';
// ...
gen.mutate(undefined, { onSuccess: (r) => { track('outline_generated'); setVideoId(r.videoId); setPhase('outline'); } });
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/sentry.ts src/lib/analytics.ts entrypoints/sidepanel/App.tsx package.json package-lock.json
git commit -m "feat(observability): Sentry + PostHog with PII-safe configs"
```

---

### Task 12.4: Phase 12 checkpoint

- [ ] **Step 1: Confirm**

- Account deletion removes auth user + all owned rows
- Notification-hour change persists
- Errors show friendly copy not raw exceptions
- PostHog dashboard receives events (verify in PostHog → Live)

- [ ] **Step 2: Tag**

```bash
git tag phase-12-complete
```

---

## Phase 13 — CWS Submission Prep

**Goal of phase:** Privacy policy hosted, listing copy written, screenshots + promo tile + demo GIF produced, permissions justifications drafted.

### Task 13.1: Privacy policy + Terms

**Files:**
- Create: `legal/privacy-policy.md`
- Create: `legal/terms-of-service.md`

- [ ] **Step 1: Privacy Policy**

`legal/privacy-policy.md`:
```markdown
# bryteo Privacy Policy

*Last updated: 2026-06-09*

This document describes what bryteo collects, why, and your rights.

## What we collect

**Anonymous account.** On install we generate a random user ID and store it in Supabase. We never ask for your name, age, or any personal details for free use.

**Your library.** Outlines, decks, flashcards, and review history you create are stored in Supabase, tied to your anonymous user ID.

**YouTube video metadata.** When you generate an outline, we store the video's YouTube ID, title, channel, duration, and thumbnail URL.

**Subscription metadata (Pro only).** If you upgrade, LemonSqueezy provides your email and a customer ID. We store these in your bryteo profile to know you're Pro.

**Analytics events.** Event names like `outline_generated` and `card_reviewed`, tied to your anonymous user ID. We never log the content of your cards, outlines, or video titles.

## What we send to Anthropic (the AI)

When you generate an outline or cards, we send the video transcript, title, and your chosen style to Anthropic's API. We do not send your user ID, email, or any personal data.

## What we never collect

- Your browsing history outside YouTube
- Your IP address (Supabase logs are 7-day rolling; we do not retain them)
- Your Google / YouTube account info
- Content of any other browser tab

## Sharing

We do not sell, rent, or share your data with third parties for marketing.

We use the following processors strictly to operate bryteo:
- **Supabase** (hosting + database)
- **Anthropic** (AI generation only)
- **LemonSqueezy** (Pro payments)
- **PostHog** (anonymous product analytics)
- **Sentry** (error reporting, PII scrubbed)

## Your rights

- **Delete your account** anytime in Settings → Danger Zone. This removes every row tied to your user ID within seconds.
- **Export your data** by emailing privacy@bryteo.com (we'll send your decks and cards as JSON within 7 days).

## Contact

privacy@bryteo.com
```

- [ ] **Step 2: Terms (short version)**

`legal/terms-of-service.md`:
```markdown
# bryteo Terms of Service

*Last updated: 2026-06-09*

By using bryteo you agree to the following.

## What bryteo is

A Chrome extension that generates AI summaries and flashcards from YouTube videos for your personal study use.

## Acceptable use

You may use bryteo for personal learning. You may not:
- Resell or redistribute generated content as if it were your own commercial product
- Use bryteo to systematically scrape YouTube at scale
- Attempt to extract API keys or bypass rate limits

## Free tier limits

The free tier limits you to 50 saved flashcards. Upgrade to Pro for unlimited.

## Pro subscription

Pro is billed via LemonSqueezy. You can cancel any time at lemonsqueezy.com and retain Pro until the end of the current billing period.

## No guarantees

bryteo's AI may produce incorrect or incomplete summaries. Verify important information against the original source. bryteo is provided "as is" without warranty.

## Liability

To the maximum extent permitted by law, bryteo and its operators are not liable for any indirect, incidental, or consequential damages arising from your use.

## Contact

hello@bryteo.com
```

- [ ] **Step 3: Host the privacy policy on a public Notion or GitHub Pages site (until bryteo.com is registered)**

Publish `legal/privacy-policy.md` as a public Notion page → copy public URL.
Record the URL — it goes in the Chrome Web Store listing in the next task.

- [ ] **Step 4: Commit**

```bash
git add legal/
git commit -m "docs(legal): privacy policy + terms"
```

---

### Task 13.2: CWS listing copy + screenshots

**Files:**
- Create: `store-assets/listing-copy.md`
- Create (manually export): `store-assets/screenshot-1-outline.png` ... `screenshot-5-settings.png`
- Create: `store-assets/promo-tile-440x280.png`
- Create: `store-assets/demo.gif`

- [ ] **Step 1: Write listing copy**

`store-assets/listing-copy.md`:
```markdown
# Chrome Web Store Listing — bryteo

## Title
bryteo — Remember what you watch

## Short description (132 chars max)
Turn YouTube videos into AI flashcards with spaced repetition. They take notes. We make you remember.

## Detailed description
bryteo turns every YouTube video into a personal retention system.

When you open a video, bryteo's AI builds a structured outline with summaries, key points, and clickable timestamps. From the outline, generate flashcards in your chosen style — Quick, Exam-ready, Deep, or Language. Every card has a timestamp link back to the moment in the video that taught it.

The retention engine uses FSRS-6 — the modern spaced-repetition algorithm trusted by Anki — so you only review what you're about to forget.

### Features
- 🧠 Smart Outlines from any YouTube video with captions
- 🎴 AI flashcards in 4 styles (Quick / Exam / Deep / Language)
- ⏰ FSRS-6 spaced repetition — modern, science-backed scheduling
- ⚡ One-click timestamp jump-back from any card to the video moment
- 🔥 Daily review streaks
- 🛡️ Private by default — we never read your other tabs, never share your data

### Free tier
- Unlimited AI generation
- Up to 50 saved cards

### Pro ($6.99/mo or $49/yr)
- Unlimited saved cards
- Cross-device sync
- Smarter AI (Claude Sonnet)
- More features coming: exports, audio review, multi-platform support

### Permissions justification
- **activeTab** — to read the current YouTube video's transcript only when you click the bryteo icon. Never any other tab.
- **storage** — to cache your decks locally for instant reads.
- **sidePanel** — to open bryteo's workspace next to YouTube.
- **youtube.com host** — required to extract transcripts from the video you're watching.

We never read your browsing history, never collect personal data without your consent, and let you delete everything in one click.

## Category
Productivity → Tools

## Privacy policy URL
<paste public URL of privacy-policy.md>
```

- [ ] **Step 2: Take 5 screenshots (1280×800 PNG, Chrome zoom 100%)**

1. **Outline view** — YouTube video on left, side panel with outline + clickable timestamps on right
2. **Style picker** — the 4-option grid mid-flow
3. **Card preview** — a clear, clean card with the timestamp link
4. **Review mode** — "Show answer" + 4 rating buttons
5. **Settings** — notification hour + danger zone

Save them as `store-assets/screenshot-N-name.png`.

- [ ] **Step 3: Promo tile (440×280 PNG)**

Simple: solid dark background, bryteo wordmark, tagline "Remember what you watch."

- [ ] **Step 4: Demo GIF (≤5s, ≤3MB)**

Capture the install → outline → card → rate flow as a screen recording. Compress with gifski or ffmpeg.

- [ ] **Step 5: Final manifest review**

Verify `wxt.config.ts` has:
- `name: 'bryteo — Remember what you watch'`
- `version: '0.1.0'` (or current)
- Only `storage`, `sidePanel`, `activeTab` in permissions
- Only `https://*.youtube.com/*` in host_permissions
- CSP whitelisting just Supabase + LemonSqueezy
- No `unsafe-eval`, no remote scripts

- [ ] **Step 6: Commit**

```bash
git add store-assets/
git commit -m "chore(store): CWS listing copy, screenshots, promo tile, demo gif"
```

---

### Task 13.3: Phase 13 checkpoint

- [ ] **Step 1: Confirm**

- Privacy policy URL loads in a browser
- 5 screenshots are 1280×800 and visually accurate
- Promo tile is 440×280
- Demo GIF plays and is < 3MB

- [ ] **Step 2: Tag**

```bash
git tag phase-13-complete
```

---

## Phase 14 — Submit + Iterate

**Goal of phase:** A reviewable build sits in the CWS dashboard as **Unlisted**. Any reviewer feedback is addressed within one cycle.

### Task 14.1: Pay CWS developer fee + production build

- [ ] **Step 1: Register / pay the one-time $5 CWS developer fee**

https://chrome.google.com/webstore/devconsole → sign in with the Google account that will own the listing → pay $5.

- [ ] **Step 2: Production build**

```bash
npm run build
npm run zip
```

Expected: `.output/bryteo-0.1.0-chrome.zip` in repo root.

- [ ] **Step 3: Create new listing**

In CWS Dashboard → New item → upload the .zip.

- Set **Visibility: Unlisted**
- Paste listing copy from `store-assets/listing-copy.md`
- Upload screenshots, promo tile
- Paste privacy policy URL
- Permissions justification: paste the matching section
- Single purpose: "AI learning aid for YouTube videos"
- Save for review

- [ ] **Step 4: Submit for review**

Click "Submit for review."

Expected: status becomes "Pending review". Typical CWS review: 1-3 days for an unlisted extension.

---

### Task 14.2: Respond to reviewer feedback

- [ ] **Step 1: Read any rejection email carefully**

Common rejections + fixes:
- **"Permission not justified"** — tighten the per-permission justification in the listing.
- **"Single purpose unclear"** — narrow the description's first sentence.
- **"Privacy policy missing required disclosures"** — add the specific data type CWS flagged.
- **"Permission scope too broad"** — usually a CSP or host_permissions issue; tighten in `wxt.config.ts`.

- [ ] **Step 2: Apply fix, bump version, rebuild**

In `wxt.config.ts`: bump `version: '0.1.1'`.

```bash
npm run build
npm run zip
```

- [ ] **Step 3: Upload new .zip + reply in dashboard**

Upload the new zip, write a 1-2 sentence reply in the "Notes for reviewer" field describing exactly what changed.

- [ ] **Step 4: Repeat until approved**

---

### Task 14.3: Once approved (Unlisted)

- [ ] **Step 1: Share the unlisted install link with 50-100 beta testers**

Sources for beta testers:
- Indie Hackers communities (Show IH)
- Subreddits: r/Anki, r/GetStudying, r/UPSC, r/learnprogramming
- Twitter/X build-in-public network
- Friends + their networks

- [ ] **Step 2: Watch PostHog + Sentry**

Daily: any error spike? Any onboarding drop-off? Any rate-limit complaints?

- [ ] **Step 3: Iterate on feedback for 2-4 weeks**

Patch bugs. Tighten copy. Add 1-2 high-signal features if obvious.

- [ ] **Step 4: Flip to Public + register `bryteo.com`**

When reviews are 4.5+ avg and core flow has no major bugs:
- Cloudflare Registrar → buy `bryteo.com` (~$10.44)
- Move privacy policy from Notion to `bryteo.com/privacy`
- Update listing URL
- CWS Dashboard → Visibility → **Public**
- Open the GitHub repo to public (`gh repo edit --visibility public --accept-visibility-change-consequences`)

- [ ] **Step 5: Tag the ship**

```bash
git tag v0.1-ship
git push --tags
```

---

## Self-Review

After writing all 14 phases, I ran the spec-coverage / placeholder / type-consistency check.

### Spec coverage

| Spec section | Implemented in plan |
|---|---|
| §3.1 System shape | Phase 1 (scaffold), Phases 2-3 (extension surfaces), Phase 4 (Edge Functions) |
| §3.2 Tech stack pinning | Task 1.1 package.json |
| §3.3 Three Edge Functions + reconciliation | Phase 4 (outline), Phase 6 (cards), Phase 11 (webhook + reconcile) |
| §3.4 Permissions whitelist | Task 1.1 wxt.config.ts |
| §3.5 CSP | Task 1.1 wxt.config.ts |
| §4.1 Postgres schema | Tasks 1.4 + 4.2 (+ 10.1 + 11.4) |
| §4.2 RLS policies | Task 1.4 migration 2 |
| §4.3 Denormalized card_count | Task 1.4 migration 3 |
| §4.4 No upgrade migration | Designed-in by anonymous-from-day-1; no task needed |
| §5.1 Install flow | Phase 2 |
| §5.2 First outline | Phase 5 |
| §5.3 Generate cards w/ style picker | Phases 6-7 |
| §5.4 Daily review w/ FSRS | Phases 8-9 |
| §5.5 50-cap → upgrade | Phases 10-11 |
| §6 Error handling | Phase 12 (friendlyError + EmptyState) |
| §7 Security (10 items) | Phase 4 (JWT + secrets), Phase 11 (HMAC), Phase 1 (CSP), Phase 4 (rate limit) |
| §8 Privacy | Phase 13 (policy doc), Phase 12 (analytics + PII scrub) |
| §9 CWS compliance checklist | Phases 13-14 |
| §10 Testing strategy | Tasks 1.3, 2.2, 3.1, 3.2, 6.1, 7.1 (unit tests) — see below for additional gaps closed |
| §11 14-day timeline | Phases align 1:1 to spec days 1-14 |
| §12 Out-of-scope | Honored — no tasks for Coursera, in-page overlay, etc. |
| §13 Open items | Honored — domain purchase + Razorpay deferred to post-ship |

**Coverage gaps closed during self-review:**

- Spec §10.2 lists `cards_count` trigger as an integration test, `rls.test.ts` as an integration test, `webhook.test.ts` as an integration test, `rate_limit.test.ts` as an integration test, plus 3 E2E tests. These were referenced in the file-structure but no tasks wrote them. **Adding a single Phase 12.5 covering integration + E2E test scaffolding** so the testing strategy from the spec is realized, not just promised. Appended below.

### Placeholder scan

Searched for `TODO`, `TBD`, `fill in`, `similar to`. Found one — **Task 6.2 references `cardsRequest` / `cardsResponse` defined in `_shared/schemas.ts`** from Task 4.2; both are explicitly written there. Confirmed consistent. No remaining placeholders.

### Type consistency

- `OutlineSection` is defined identically in `src/api/outlines.ts` and `src/lib/prompts.ts`'s usage — both rely on the API export. ✓
- `Style` is defined once in `src/lib/prompts.ts`, reused in `src/api/cards.ts` and `src/api/decks.ts`. ✓
- `GeneratedCard` (client) maps to `cardOut` schema (server) — both have `type`, `front`, `back`, `source_ts_s`. ✓
- `CardRow` is the generated `Database['public']['Tables']['cards']['Row']` — used in `cards.ts` and `reviews.ts`. ✓
- `FsrsState` aliases `ts-fsrs` `Card` type — used consistently in `fsrs.ts` and `reviews.ts`. ✓
- Message types from `src/lib/messages.ts` are referenced in `content.ts` and `App.tsx` — consistent. ✓

---

## Phase 12.5 — Test Coverage (added during self-review)

**Goal of phase:** Realize the integration + E2E test plan from spec §10.

### Task 12.5.1: Integration tests against local Supabase

**Files:**
- Create: `tests/integration/auth.test.ts`
- Create: `tests/integration/rls.test.ts`
- Create: `tests/integration/card-count-trigger.test.ts`
- Create: `tests/integration/rate-limit.test.ts`
- Create: `tests/integration/card-cap.test.ts`

- [ ] **Step 1: Boot local Supabase**

```bash
supabase start
```

Expected: prints local URL + anon key. Note them.

- [ ] **Step 2: rls.test.ts**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON = '<paste from supabase start output>';

describe('RLS', () => {
  it('user B cannot read user A cards', async () => {
    const sbA = createClient(URL, ANON);
    const { data: a } = await sbA.auth.signInAnonymously();
    expect(a.user).toBeDefined();

    // create video + deck + card as A
    const { data: video } = await sbA.from('videos').insert({
      user_id: a.user!.id, yt_video_id: 'xA', title: 'T'
    }).select().single();
    const { data: deck } = await sbA.from('decks').insert({
      video_id: video!.id, user_id: a.user!.id, name: 'D', style: 'quick'
    }).select().single();
    await sbA.from('cards').insert({
      deck_id: deck!.id, user_id: a.user!.id, type: 'basic',
      front: 'q', back: 'a', fsrs_state: { reps: 0, due: new Date().toISOString() }
    });

    // sign in as B in a separate client
    const sbB = createClient(URL, ANON);
    await sbB.auth.signInAnonymously();
    const { data: cards } = await sbB.from('cards').select('*');
    expect(cards?.length).toBe(0);
  });
});
```

- [ ] **Step 3: card-count-trigger.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON = '<...>';

describe('card_count trigger', () => {
  it('increments on insert + decrements on delete', async () => {
    const sb = createClient(URL, ANON);
    const { data: a } = await sb.auth.signInAnonymously();
    const { data: video } = await sb.from('videos').insert({
      user_id: a!.user!.id, yt_video_id: 'cct', title: 'T'
    }).select().single();
    const { data: deck } = await sb.from('decks').insert({
      video_id: video!.id, user_id: a!.user!.id, name: 'D', style: 'quick'
    }).select().single();

    const { data: card } = await sb.from('cards').insert({
      deck_id: deck!.id, user_id: a!.user!.id, type: 'basic',
      front: 'q', back: 'a', fsrs_state: { reps: 0, due: new Date().toISOString() }
    }).select().single();

    const { data: p1 } = await sb.from('profiles').select('card_count').eq('id', a!.user!.id).single();
    expect(p1!.card_count).toBe(1);

    await sb.from('cards').delete().eq('id', card!.id);

    const { data: p2 } = await sb.from('profiles').select('card_count').eq('id', a!.user!.id).single();
    expect(p2!.card_count).toBe(0);
  });
});
```

- [ ] **Step 4: card-cap.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON = '<...>';

describe('card_cap', () => {
  it('blocks 51st insert on free tier', async () => {
    const sb = createClient(URL, ANON);
    const { data: a } = await sb.auth.signInAnonymously();
    const { data: video } = await sb.from('videos').insert({
      user_id: a!.user!.id, yt_video_id: 'cap', title: 'T'
    }).select().single();
    const { data: deck } = await sb.from('decks').insert({
      video_id: video!.id, user_id: a!.user!.id, name: 'D', style: 'quick'
    }).select().single();

    const rows = Array.from({ length: 50 }, (_, i) => ({
      deck_id: deck!.id, user_id: a!.user!.id, type: 'basic',
      front: `q${i}`, back: `a${i}`,
      fsrs_state: { reps: 0, due: new Date().toISOString() }
    }));
    const { error: bulkErr } = await sb.from('cards').insert(rows);
    expect(bulkErr).toBeNull();

    const { error: capErr } = await sb.from('cards').insert({
      deck_id: deck!.id, user_id: a!.user!.id, type: 'basic',
      front: 'q51', back: 'a51', fsrs_state: { reps: 0, due: new Date().toISOString() }
    });
    expect(capErr?.message).toMatch(/card_cap_reached/);
  });
});
```

- [ ] **Step 5: rate-limit.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON = '<...>';

describe('rate_limit_increment RPC', () => {
  it('increments and returns the new value', async () => {
    const sb = createClient(URL, ANON);
    const { data: a } = await sb.auth.signInAnonymously();
    const day = new Date().toISOString().slice(0, 10);

    const { data: v1 } = await sb.rpc('rate_limit_increment', {
      p_user_id: a!.user!.id, p_day: day, p_field: 'outlines_today', p_amount: 1
    });
    expect(v1).toBe(1);

    const { data: v2 } = await sb.rpc('rate_limit_increment', {
      p_user_id: a!.user!.id, p_day: day, p_field: 'outlines_today', p_amount: 5
    });
    expect(v2).toBe(6);
  });
});
```

- [ ] **Step 6: auth.test.ts** (sanity)

```ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON = '<...>';

describe('anon signin + profile trigger', () => {
  it('creates a profile row on anon signin', async () => {
    const sb = createClient(URL, ANON);
    const { data } = await sb.auth.signInAnonymously();
    expect(data.user).toBeDefined();

    // wait briefly for trigger to settle
    await new Promise((r) => setTimeout(r, 200));
    const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user!.id).single();
    expect(profile).toBeDefined();
    expect(profile!.pro_status).toBe('free');
    expect(profile!.card_count).toBe(0);
  });
});
```

- [ ] **Step 7: Run integration suite**

```bash
npm test -- tests/integration
```

Expected: all 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add tests/integration/
git commit -m "test(integration): RLS, card-count trigger, card cap, rate limit, anon signin"
```

---

### Task 12.5.2: Playwright E2E setup

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/extension.ts`
- Create: `tests/e2e/happy-path.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { headless: false, viewport: { width: 1400, height: 900 } }
});
```

- [ ] **Step 3: Extension load fixture**

`tests/e2e/fixtures/extension.ts`:
```ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const pathToExt = path.resolve(process.cwd(), '.output/chrome-mv3');
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExt}`,
        `--load-extension=${pathToExt}`
      ]
    });
    await use(ctx);
    await ctx.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2];
    await use(id);
  }
});

export const expect = test.expect;
```

- [ ] **Step 4: Happy-path E2E**

`tests/e2e/happy-path.spec.ts`:
```ts
import { test, expect } from './fixtures/extension';

test('install → side panel opens → analyze on a YouTube video', async ({ context, extensionId }) => {
  // open welcome
  const welcome = await context.newPage();
  await welcome.goto(`chrome-extension://${extensionId}/welcome.html`);
  await expect(welcome.getByRole('heading', { name: /welcome to bryteo/i })).toBeVisible();
  await welcome.close();

  // open YouTube
  const yt = await context.newPage();
  await yt.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await yt.waitForLoadState('domcontentloaded');

  // open side panel via extension toolbar — Playwright cannot click the toolbar icon directly,
  // so we open the side panel URL in a new tab as a proxy for the smoke test:
  const sp = await context.newPage();
  await sp.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(sp.getByText(/bryteo/i)).toBeVisible();
});
```

- [ ] **Step 5: Run**

```bash
npm run build && npm run test:e2e
```

Expected: test passes. Welcome appears; side panel mounts.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json package-lock.json
git commit -m "test(e2e): Playwright happy path smoke test"
```

---

### Task 12.5.3: Phase 12.5 checkpoint

- [ ] **Step 1: Confirm**

- `npm test` runs all unit + integration tests green
- `npm run test:e2e` runs the smoke test green

- [ ] **Step 2: Tag**

```bash
git tag phase-12.5-complete
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-bryteo-v1-implementation.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — A fresh subagent runs one task at a time; you (or the orchestrating model) review the diff between tasks. Best for quality + early catch of off-the-plan behavior. Slightly higher token cost.

**2. Inline Execution** — Tasks run in the current session using `superpowers:executing-plans`. Faster wall-clock; uses session checkpoints for review.

**Which approach?**




