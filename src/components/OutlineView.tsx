import type { OutlinePayload, OutlineSection } from '../api/outlines';

type Props = {
  outline: OutlinePayload;
  onSeek: (seconds: number) => void;
  onGenerateCards: () => void;
};

export function OutlineView({ outline, onSeek, onGenerateCards }: Props) {
  return (
    <div className="space-y-3">
      {outline.sections.map((s, i) => (
        <SectionCard key={i} s={s} onSeek={onSeek} />
      ))}
      <button
        onClick={onGenerateCards}
        className="w-full py-2.5 rounded-lg bg-ink text-white font-medium hover:opacity-90 transition"
      >
        Generate flashcards
      </button>
    </div>
  );
}

function SectionCard({ s, onSeek }: { s: OutlineSection; onSeek: (s: number) => void }) {
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <header className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-medium text-ink text-sm leading-tight">{s.title}</h3>
        <button
          onClick={() => onSeek(s.start_s)}
          className="shrink-0 text-xs text-slate-500 hover:text-ink hover:underline"
          title="Jump to this section in the video"
        >
          {formatTs(s.start_s)}–{formatTs(s.end_s)}
        </button>
      </header>
      <p className="text-xs text-slate-600 leading-relaxed">{s.summary}</p>
      {s.key_points.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-slate-600 space-y-0.5">
          {s.key_points.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
    </article>
  );
}

function formatTs(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
