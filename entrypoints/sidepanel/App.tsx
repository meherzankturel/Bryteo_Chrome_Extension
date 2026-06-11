import { useState } from 'react';
import { useProfile } from '../../src/hooks/use-profile';
import { useGenerateOutline } from '../../src/hooks/use-outline';
import { OutlineView } from '../../src/components/OutlineView';

type Phase = 'idle' | 'outline';

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
    gen.mutate(undefined, {
      onSuccess: () => setPhase('outline')
    });
  }

  function reset() {
    setPhase('idle');
    gen.reset();
  }

  const cardCount = profile?.card_count ?? 0;

  return (
    <main className="h-full flex flex-col bg-slate-50">
      <header className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-48.png" alt="" className="w-6 h-6" />
          <span className="text-sm font-semibold tracking-wide text-ink">BRYTEO</span>
        </div>
        <span className="text-xs text-slate-500">{cardCount}/50 cards</span>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-4">
        {phase === 'idle' && !gen.isPending && (
          <IdleState onAnalyze={startAnalyze} error={gen.error?.message} />
        )}

        {gen.isPending && <LoadingState />}

        {phase === 'outline' && gen.data && (
          <div className="space-y-3">
            <button
              onClick={reset}
              className="text-xs text-slate-500 hover:text-ink"
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

function IdleState({ onAnalyze, error }: { onAnalyze: () => void; error?: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-3xl mb-2">📺</div>
      <p className="text-sm font-medium text-ink mb-1">Ready when you are</p>
      <p className="text-xs text-slate-600 mb-6 max-w-[240px] mx-auto">
        Open a YouTube video and click below. BRYTEO will summarize it for you.
      </p>
      <button
        onClick={onAnalyze}
        className="px-5 py-2.5 rounded-lg bg-ink text-white text-sm font-medium hover:opacity-90 transition"
      >
        Analyze this video
      </button>
      {error && (
        <p className="mt-4 text-xs text-red-600 max-w-[260px] mx-auto">{error}</p>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="text-center py-12">
      <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-ink rounded-full animate-spin mb-3" />
      <p className="text-sm text-slate-600">Analyzing this video…</p>
      <p className="text-xs text-slate-500 mt-1">This usually takes 5–15 seconds.</p>
    </div>
  );
}
