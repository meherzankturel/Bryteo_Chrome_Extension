import { useState, useEffect, useRef } from 'react';
import { useProfile } from '../../src/hooks/use-profile';
import {
  useGenerateOutline,
  GateError,
  type AnalyzeGate
} from '../../src/hooks/use-outline';
import {
  useCurrentVideoOutline,
  watchTabChanges
} from '../../src/hooks/use-current-video-outline';
import { OutlineView } from '../../src/components/OutlineView';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { describeForUser } from '../../src/lib/content-type';

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

export default function App() {
  const { data: profile } = useProfile();
  const gen = useGenerateOutline();
  const cached = useCurrentVideoOutline();
  // forceAnalyze flips when the user clicks "Analyze another video" — it tells
  // the side panel to ignore the cached lookup and surface the idle state again
  // so the user can re-analyze (or analyze a freshly-loaded video without
  // closing the panel).
  const [forceAnalyze, setForceAnalyze] = useState(false);

  async function seek(seconds: number) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SEEK_VIDEO', payload: { seconds } });
    }
  }

  function startAnalyze(opts?: { override?: boolean }) {
    setForceAnalyze(false);
    gen.mutate(opts, {
      onSuccess: () => {
        // Bust the cached-outline cache so a re-mount sees the fresh one.
        cached.refetch();
      }
    });
  }

  function reset() {
    setForceAnalyze(true);
    gen.reset();
  }

  // If the mutation rejected with a GateError, pull the metadata so the UI
  // can render the right notice instead of the generic error state.
  const gate: AnalyzeGate | null =
    gen.error instanceof GateError ? gen.error.gate : null;

  // When the user navigates to a different YouTube video while the panel is
  // open, re-check the cache for that video.
  useEffect(() => {
    const cleanup = watchTabChanges(() => {
      cached.refetch();
      setForceAnalyze(false);
      gen.reset();
    });
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What we actually display this render. Effective outline = generation result
  // if there is one, else the cached lookup (unless user clicked Analyze again).
  const effectiveOutline = gen.data ?? (forceAnalyze ? null : cached.data ?? null);
  const showCacheCheck = cached.isLoading && !gen.data && !gen.isPending;
  const showOutline = !!effectiveOutline && !gen.isPending;
  const showLoading = gen.isPending;
  const showIdle =
    !showCacheCheck && !showOutline && !showLoading;

  // Cmd/Ctrl + Enter triggers analyze when side panel has focus AND we're idle
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const accelKey = isMac ? e.metaKey : e.ctrlKey;
      if (!accelKey || e.key !== 'Enter') return;
      if (!showIdle) return;
      e.preventDefault();
      startAnalyze();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIdle]);

  const cardCount = profile?.card_count ?? 0;

  return (
    <main className="h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Header */}
      <header
        className="
          px-4 py-3 flex items-center justify-between
          bg-[var(--color-surface-1)] border-b border-[var(--color-border)]
        "
      >
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-48.png" alt="" className="w-[22px] h-[22px]" />
          <span className="text-[12px] font-bold tracking-[0.16em] text-[var(--color-text)]">
            BRYTEO
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="
              font-mono text-[11px] font-medium text-[var(--color-text-3)]
              px-2.5 py-1 rounded-md
              bg-[var(--color-surface-2)] border border-[var(--color-border)]
            "
          >
            {cardCount}/50
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Body */}
      <section className="flex-1 overflow-y-auto px-[18px] py-6">
        {showCacheCheck && <CacheCheckState />}

        {showIdle && gate && (
          <GateNotice
            gate={gate}
            onAnalyzeAnyway={() => startAnalyze({ override: true })}
            onReset={reset}
          />
        )}

        {showIdle && !gate && (
          <IdleState
            onAnalyze={() => startAnalyze()}
            error={gen.error?.message}
            isMac={isMac}
          />
        )}

        {showLoading && <LoadingState />}

        {showOutline && effectiveOutline && (
          <div className="space-y-3">
            <button
              onClick={reset}
              className="text-[11px] text-[var(--color-text-3)] hover:text-[var(--color-text)] transition-colors"
            >
              ← Analyze another video
            </button>
            {gen.data?.captionKind === 'asr' && <AsrCaptionWarning />}
            <OutlineView
              outline={effectiveOutline.outline}
              onSeek={seek}
              onGenerateCards={() =>
                alert('Card generation ships in Phase 6 — coming next.')
              }
            />
          </div>
        )}
      </section>
    </main>
  );
}

function AsrCaptionWarning() {
  return (
    <div
      className="
        flex items-start gap-2 px-3 py-2 rounded-[6px]
        bg-[var(--color-surface-2)] border border-[var(--color-border)]
        text-[11.5px] leading-[1.45] text-[var(--color-text-2)]
      "
      style={{ borderLeftColor: 'var(--color-gold)', borderLeftWidth: '2px' }}
    >
      <span style={{ color: 'var(--color-gold)' }} className="font-bold mt-[1px]">⚠</span>
      <span>
        <span className="font-semibold text-[var(--color-text)]">Auto-generated captions.</span>{' '}
        Technical terms and numbers may be slightly off. Verify key facts against the
        video before relying on them.
      </span>
    </div>
  );
}

function CacheCheckState() {
  return (
    <div className="text-center pt-[150px]">
      <div
        className="
          w-5 h-5 mx-auto rounded-full border-2
          border-[var(--color-border)] border-t-[var(--color-text-3)]
          animate-spin
        "
      />
    </div>
  );
}

function IdleState({
  onAnalyze,
  error,
  isMac
}: {
  onAnalyze: () => void;
  error?: string;
  isMac: boolean;
}) {
  const ctaRef = useRef<HTMLButtonElement | null>(null);

  // Force the side panel to claim focus, THEN focus the CTA. Chrome can leave
  // the side panel inactive (focus stays on the YouTube tab) when it opens via
  // toolbar click, which is why Cmd+Enter wasn't firing earlier.
  useEffect(() => {
    try { window.focus(); } catch {}
    ctaRef.current?.focus();
    // Retry on next tick in case the first focus call lands before the
    // side panel is actually activatable.
    const t = setTimeout(() => {
      try { window.focus(); } catch {}
      ctaRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="text-center pt-[90px]">
      <div
        className="
          w-[72px] h-[72px] mx-auto mb-6 grid place-items-center
          rounded-2xl relative overflow-hidden
          bg-[var(--color-surface-2)] border border-[var(--color-border)]
        "
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(212,161,86,0.12), transparent 60%)'
          }}
        />
        <img src="/icons/icon-128.png" alt="" className="w-10 h-10 relative z-10" />
      </div>
      <h1 className="text-[19px] font-semibold tracking-[-0.015em] mb-1.5 text-[var(--color-text)]">
        Ready when you are
      </h1>
      <p className="text-[13px] text-[var(--color-text-2)] max-w-[240px] mx-auto mb-7 leading-[1.55]">
        Open a YouTube video and we'll turn it into a study aid you'll actually remember.
      </p>
      <button
        ref={ctaRef}
        onClick={onAnalyze}
        className="
          inline-flex items-center gap-2 px-[22px] py-[11px] rounded-[7px]
          bg-[var(--color-text)] text-[var(--color-bg)]
          font-semibold text-[13px] tracking-[0.01em]
          transition-all duration-200
          hover:translate-y-[-1px] hover:opacity-90
          focus:outline-none focus:ring-2 focus:ring-[var(--color-gold)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]
        "
        style={{ boxShadow: 'var(--shadow-cta)' }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-cta-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-cta)')}
      >
        Analyze this video
        <span className="text-[14px]">→</span>
      </button>
      <div className="mt-[18px] flex justify-center items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-3)]">
        or press
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-2)]">
          {isMac ? '⌘' : 'Ctrl'}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-2)]">↵</span>
      </div>
      {error && (
        <p className="mt-4 text-[12px] text-red-500 max-w-[260px] mx-auto">{error}</p>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="text-center pt-[130px]">
      <div
        className="
          w-[200px] h-[6px] mx-auto mb-[18px] rounded-[3px] relative overflow-hidden
          bg-[var(--color-surface-3)]
        "
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--color-gold), transparent)',
            animation: 'shimmer 1.5s linear infinite',
            transform: 'translateX(-100%)'
          }}
        />
      </div>
      <p className="text-[13px] font-medium text-[var(--color-text)] mb-1.5">
        Reading the lecture
      </p>
      <p className="font-mono text-[11px] text-[var(--color-text-3)]">~ 10s</p>
    </div>
  );
}

/**
 * Inline card shown when a pre-Gemini gate fires (non-educational category,
 * borderline category, or transcript-quality fail). Same gold-left-accent
 * treatment as the ASR caption warning — visually consistent "heads up" voice.
 */
function GateNotice({
  gate,
  onAnalyzeAnyway,
  onReset
}: {
  gate: AnalyzeGate;
  onAnalyzeAnyway: () => void;
  onReset: () => void;
}) {
  const { headline, body } = gateCopy(gate);

  return (
    <div className="pt-[60px] flex flex-col items-center">
      <div
        className="
          w-full max-w-[300px]
          px-4 py-3.5 rounded-[8px]
          bg-[var(--color-surface-1)] border border-[var(--color-border)]
        "
        style={{ borderLeftColor: 'var(--color-gold)', borderLeftWidth: '3px' }}
      >
        <div className="flex items-start gap-2.5">
          <span
            style={{ color: 'var(--color-gold)' }}
            className="font-bold mt-[1px] text-[14px]"
          >
            !
          </span>
          <div>
            <p className="text-[13px] font-semibold text-[var(--color-text)] mb-1 leading-[1.4]">
              {headline}
            </p>
            <p className="text-[12px] text-[var(--color-text-2)] leading-[1.5]">
              {body}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-stretch gap-2 w-full max-w-[300px]">
        <button
          onClick={onAnalyzeAnyway}
          className="
            inline-flex items-center justify-center gap-2 px-[18px] py-[10px] rounded-[7px]
            bg-[var(--color-text)] text-[var(--color-bg)]
            font-semibold text-[13px] tracking-[0.01em]
            transition-all duration-200
            hover:translate-y-[-1px] hover:opacity-90
            focus:outline-none focus:ring-2 focus:ring-[var(--color-gold)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]
          "
          style={{ boxShadow: 'var(--shadow-cta)' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.boxShadow = 'var(--shadow-cta-hover)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.boxShadow = 'var(--shadow-cta)')
          }
        >
          Analyze anyway
        </button>
        <button
          onClick={onReset}
          className="
            text-[12px] text-[var(--color-text-3)] hover:text-[var(--color-text)]
            transition-colors py-1
          "
        >
          Try a different video
        </button>
      </div>
    </div>
  );
}

/**
 * Copy for each gate kind, written user-facing — second person, no jargon,
 * acknowledges that BRYTEO might be wrong and lets the user override.
 */
function gateCopy(gate: AnalyzeGate): { headline: string; body: string } {
  if (gate.kind === 'non-educational') {
    const desc = describeForUser(gate.category);
    return {
      headline: `This looks like a ${desc} video.`,
      body: "BRYTEO works best on learning content — lectures, tutorials, explainers. Flashcards from this probably won't be useful."
    };
  }
  if (gate.kind === 'borderline') {
    return {
      headline: 'This may not be the best fit for flashcards.',
      body: "We can't tell if there's enough teachable content here. Worth a shot if you think there is."
    };
  }
  if (gate.kind === 'transcript-quality') {
    if (gate.reason === 'too-short') {
      return {
        headline: 'Not enough spoken content.',
        body: "There isn't enough transcript here to build a useful study aid."
      };
    }
    if (gate.reason === 'mostly-music') {
      return {
        headline: 'Mostly music.',
        body: "This transcript is mainly music notation — it won't produce meaningful flashcards."
      };
    }
    return {
      headline: 'Very repetitive transcript.',
      body: 'The same words repeat throughout — likely a chorus-heavy song. Flashcards probably won\'t be useful.'
    };
  }
  // Exhaustiveness fallback (shouldn't hit).
  return { headline: 'Heads up.', body: 'BRYTEO is not sure this video will produce a useful outline.' };
}
