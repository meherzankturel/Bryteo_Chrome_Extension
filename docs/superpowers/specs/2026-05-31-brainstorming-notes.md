# Brainstorming Notes — AI YouTube Learning Chrome Extension

**Status:** In progress (brainstorming phase, not yet a final design doc)
**Date started:** 2026-05-30
**Last updated:** 2026-05-31

This file captures decisions locked + open questions + research findings during the brainstorming phase. The final design doc will be written once all 5 foundational decisions are locked.

---

## Original Vision (from user's spec)

An AI Chrome extension that turns YouTube videos into a personal learning system — outlines, flashcards, quizzes, and spaced repetition. Wedge against HoverNotes is **retention-first design**: notes are commodity, active recall + spaced repetition is not.

- **Tagline:** *They take notes. We make you remember.*
- **Goal:** Chrome Web Store Featured badge in 4-6 months
- **Revenue target:** $8-13K MRR by month 12
- **Pricing:** Free tier (limited) + Pro at $6.99/mo or $49/yr + Founding Member $29/yr (first 500) + Student $29/yr (.edu)
- **Tech:** Manifest V3, React+TS+Tailwind, Supabase, Claude Haiku/Sonnet, Dodo Payments, PostHog+Plausible

---

## Decisions Locked ✅

### 1. Platform scope
**YouTube-only for v1, with multi-platform-ready architecture.**

- One clean `PlatformAdapter` interface; only the "transcript + timestamp" layer is platform-specific.
- Why: 14-day build, maximizes Featured-badge odds (minimum permissions), avoids ToS risk from Udemy/Coursera/LinkedIn Learning scraping.
- Expand to additional platforms in month 2-3 (Coursera first — cleanest ToS).

### 2. Launch positioning / audience
**General — "anyone who learns on YouTube."**

- Hero copy: "Remember what you watch."
- Broad TAM. Competes with HoverNotes head-on, but wedge is retention.
- Will not narrow to UPSC/coding beachhead.

---

## Decisions Open 🟡

### 3. Product name
**LOCKED: `bryteo`** ✅

- Pronounced "BRITE-ee-oh"
- Invented brandable name, premium feel
- All domains verified available: `bryteo.com` ($11/yr), `bryteo.xyz` ($2 Y1 / $13/yr), `bryteo.app` ($11 Y1 / $15/yr)
- Vibe: bright + learning, -eo suffix is modern/sleek (like Cameo, Stereo, Vimeo)
- Domain purchase deferred per Phase 1 plan (ship free extension first)
- **Action item:** Grab social handles (@bryteo on IG/TikTok/X/YouTube) + reserve cheapest domain ($2 .xyz on Namecheap) TODAY to prevent squatting — costs ~$5-10 total

---

### 3a. Product name + domain (original section, archived)
**Status:** Resolved — see locked decision above.

**Constraints established:**
- Must be available at standard registration price (~$10–60/yr at Cloudflare, Porkbun, Namecheap).
- No aftermarket domains ($500+).
- Premium feel, brand-recognizable.
- User preference: cheap as possible while keeping premium feel.

**Confirmed available domains (RDAP/whois-verified, not aftermarket):**

| Domain | Y1 (Porkbun) | Renewal | Notes |
|---|---|---|---|
| mnera.app | $10.81 | $14.93/yr | Invented from Greek "mneme" (memory). Premium, ownable. |
| heyimprint.com | $11.08 | $11.08/yr | Friendly tone, .com gold standard. |
| heyimprint.app | $11.08 | $14.93/yr | Same brand, software TLD. |
| heyimprint.xyz | $2.04 | $12.98/yr | Cheap, decent reputation (abc.xyz = Google parent). |
| imprintly.xyz | $2.04 | $12.98/yr | Diminutive of Imprint. |
| mindkeep.xyz | $2.04 | $12.98/yr | Memory-themed compound. |
| mnera.me | $8.80 | $17.27/yr | FREE Y1 via GitHub Student Developer Pack. |
| cogniq.dev | $10.81 | $12.87/yr | Cognition + IQ, tech-y. |
| imprintly.dev | $10.81 | $12.87/yr | |
| imprinted.app | $10.81 | $14.93/yr | Past tense awkward. |
| imprinthq.app | $10.81 | $14.93/yr | "HQ" feels corporate. |
| brainprinthq.com | $11.08 | $11.08/yr | |
| brainprintly.com | $11.08 | $11.08/yr | |
| brainprintai.app | $10.81 | $14.93/yr | "AI" suffix overdone in 2026. |
| trybrainprint.com / .app | $11 | $11-15/yr | "Try" signals trial, less premium. |
| getbrainprint.com | $11.08 | $11.08/yr | "Get" prefix, less premium. |
| reten.dev / reten.me | $11 / $9 | $13 / $17 | Truncation of "retain." |

**Rejected (confirmed aftermarket / parked / taken):**
- recall.com / .app / .io / .so / all variants (all taken)
- imprint.com / .app / .io / .so (all taken)
- brainprint.com (aftermarket — registered since 1999)
- forge.app, lens.app, etch.app, mira.app, lumo.app, klio.app, etc. (all taken)
- mneo.app, memra.app, brane.app (all taken)

**Free-Y1 options researched:**

| Path | Y1 | Renewal | Premium? | Catch |
|---|---|---|---|---|
| GitHub Student Pack → `.me` via Namecheap | $0 | $17/yr | ⭐⭐⭐ | Requires student verification |
| Promotional `.xyz` (Namecheap/Spaceship) | $0.98–$2.04 | $12.98/yr | ⭐⭐⭐⭐ | abc.xyz validates the TLD |
| Subdomain (imprint.vercel.app) | $0 forever | $0 | ⭐ | Bad for brand |
| `.com` | $11 | $11/yr forever | ⭐⭐⭐⭐⭐ | $0.92/month — effectively free |

**Top candidates (current shortlist):**
1. **mnera.app** — $11/$15. Best premium invented brand.
2. **heyimprint.com** — $11/$11 forever. Keeps Imprint, .com gold standard.
3. **heyimprint.xyz** — $2/$13. Cheapest path that's still premium.
4. **mnera.me** — $0/$17 (if student-verified). Truly free Y1.

**Awaiting user pick.**

### 4. Free tier strictness
**LOCKED: Storage-capped freemium** ✅

**Free tier (no account required to start):**
- ✅ Unlimited Smart Outlines (the "aha" feature — drives install + ratings)
- ✅ Unlimited AI Flashcard generation
- ✅ Unlimited Quiz mode + Spaced Repetition
- ✅ Goal-based onboarding (UPSC, coding, language, general)
- ✅ Standard AI model (Claude Haiku)
- 🔒 **50 saved cards total cap** (the conversion trigger — loss aversion)
- 🔒 Single device (no sync)
- ❌ No exports, audio review, advanced card styles

**Pro tier ($6.99/mo or $49/yr):**
- ♾️ Unlimited saved cards
- ✅ Cross-device sync
- ✅ Claude Sonnet (smarter outlines, deeper cards)
- ✅ Exports (Anki, Notion, CSV, Markdown)
- ✅ Custom card styles (cloze, image occlusion, multiple-choice)
- ✅ Audio review mode
- ✅ Priority support (24h)

**Other tiers (per original spec):**
- Founding Member Annual: $29/yr year 1, first 500 only (launch urgency)
- Student Plan: $29/yr with .edu verification (India play)
- Pro+ AI Boost: +$3/mo for Claude Opus + deep analysis (add month 3+)

**Why storage-cap not usage-cap:**
- Usage caps ("3 videos/week") cause rage-uninstalls and bad CWS reviews
- Storage caps trigger loss-aversion conversion (user invested in library)
- Matches proven freemium patterns: Notion, Loom, Linear, Readwise
- Featured-badge safe — no crippled core features

### 5. Domain registration provider
**Will recommend after name lock.** Porkbun and Cloudflare are at-cost / cheapest. NOT GoDaddy (premium markup on everything).

### 6. Payment processor
**Original spec recommended Dodo Payments** (handles Indian GST + international tax). Awaiting user confirmation.

---

## Research Findings

### Multi-platform integration risks (why we picked YouTube-only)

1. **Each platform = separate content script.** YouTube/Udemy/Coursera/LinkedIn all have different DOM, transcript systems, paywalls.
2. **Multi-host permissions hurt Featured badge.** Asking for `udemy.com + coursera.com + linkedin.com` looks like data harvesting to CWS reviewers.
3. **Paid platforms' ToS prohibit transcript extraction.** Udemy ToS explicitly bans scraping. Legal exposure.
4. **14-day timeline breaks** — each extra platform adds 3-5 days.
5. **The retention engine (flashcards/quiz/SRS) is platform-agnostic.** Build adapter pattern; expand later.

### Domain industry truths

- **Aftermarket trap:** Many "available" domains (per DNS check) are actually registered but parked by domain investors. They charge $500-$5000+.
- **GoDaddy markup:** GoDaddy charges 2-3× standard registration. Always check Cloudflare/Porkbun first.
- **DNS check is insufficient:** Need RDAP (`https://rdap.org/domain/X`) or proper registry whois to verify "truly never registered" vs "registered + parked."
- **No premium domain is truly free.** GitHub Student Pack is the only legit free Y1 path for a real TLD.

---

## Next Steps

1. Lock name + domain (current question).
2. Lock free-tier strictness (3/week vs 3/day vs custom).
3. Confirm domain registrar (Porkbun vs Cloudflare).
4. Confirm payment processor (Dodo Payments).
5. Move to architecture proposal (PlatformAdapter, data flow, error handling).
6. Write final design doc.
7. Hand off to writing-plans skill for implementation plan.
