import { useState, useEffect, useRef } from 'react';
import { useProfile } from '../../src/hooks/use-profile';
import { useGenerateOutline } from '../../src/hooks/use-outline';
import { OutlineView } from '../../src/components/OutlineView';
import { ThemeToggle } from '../../src/components/ThemeToggle';

type Phase = 'idle' | 'outline';

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

export default function App() {
  const { data: profile } = useProfile();
  const gen = useGenerateOutline();
  const [phase, setPhase] = useState<Phase>('idle');

  async function seek(seconds: number) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SEEK_VIDEO', payload: { seconds } });
    }
  }

  function startAnalyze() {
    gen.mutate(undefined, { onSuccess: () => setPhase('outline') });
  }

  function reset() {
    setPhase('idle');
    gen.reset();
  }

  // Cmd/Ctrl + Enter triggers analyze when side panel has focus
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const accelKey = isMac ? e.metaKey : e.ctrlKey;
      if (!accelKey) return;
      if (e.key !== 'Enter') return;
      if (phase !== 'idle' || gen.isPending) return;
      e.preventDefault();
      startAnalyze();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, gen.isPending]);

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
        {phase === 'idle' && !gen.isPending && (
          <IdleState
            onAnalyze={startAnalyze}
            error={gen.error?.message}
            isMac={isMac}
          />
        )}

        {gen.isPending && <LoadingState />}

        {phase === 'outline' && gen.data && (
          <div className="space-y-3">
            <button
              onClick={reset}
              className="text-[11px] text-[var(--color-text-3)] hover:text-[var(--color-text)] transition-colors"
            >
              ← Analyze another video
            </button>
            <OutlineView
              outline={gen.data.outline}
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

  // Auto-focus the CTA on mount so the side panel receives keystrokes
  // (otherwise focus stays on the YouTube page and Cmd+Enter never fires here).
  useEffect(() => {
    ctaRef.current?.focus();
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
