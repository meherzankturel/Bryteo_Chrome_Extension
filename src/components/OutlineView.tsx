import type { OutlinePayload, OutlineSection } from '../api/outlines';

type Props = {
  outline: OutlinePayload;
  onSeek: (seconds: number) => void;
  onGenerateCards: () => void;
};

export function OutlineView({ outline, onSeek, onGenerateCards }: Props) {
  return (
    <div className="space-y-2.5">
      {outline.sections.map((s, i) => (
        <SectionCard key={i} s={s} onSeek={onSeek} />
      ))}
      <div className="pt-4">
        <button
          onClick={onGenerateCards}
          className="
            w-full py-[13px] rounded-[7px]
            inline-flex items-center justify-center gap-2
            bg-[var(--color-text)] text-[var(--color-bg)]
            font-semibold text-[13.5px] tracking-[0.01em]
            transition-all duration-200
            hover:translate-y-[-1px]
          "
          style={{ boxShadow: 'var(--shadow-cta)' }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-cta-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-cta)')}
        >
          Generate flashcards
          <span className="text-[14px]">→</span>
        </button>
      </div>
    </div>
  );
}

function SectionCard({ s, onSeek }: { s: OutlineSection; onSeek: (sec: number) => void }) {
  return (
    <article
      className="
        rounded-lg p-[14px]
        bg-[var(--color-surface-1)] border border-[var(--color-border)]
        transition-colors duration-200
        hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)]
      "
    >
      <header className="flex justify-between items-start gap-2.5 mb-2">
        <h3 className="text-[13.5px] font-semibold leading-[1.3] tracking-[-0.005em] text-[var(--color-text)] m-0">
          {s.title}
        </h3>
        <button
          onClick={() => onSeek(s.start_s)}
          className="
            shrink-0 font-mono text-[10.5px] font-medium
            px-2 py-[3px] rounded-[5px]
            bg-[var(--color-surface-2)] border border-[var(--color-border)]
            text-[var(--color-text-3)]
            hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]
            transition-colors duration-150 cursor-pointer
          "
          title="Jump to this moment in the video"
        >
          {formatTs(s.start_s)}
        </button>
      </header>
      <p className="text-[12.5px] leading-[1.55] text-[var(--color-text-2)] m-0 mb-2.5">
        {s.summary}
      </p>
      {s.key_points.length > 0 && (
        <ul className="list-none m-0 p-0 space-y-1">
          {s.key_points.map((p, i) => (
            <li
              key={i}
              className="
                text-[12px] leading-[1.5] text-[var(--color-text)]
                pl-3.5 relative
              "
            >
              <span className="absolute left-0 text-[var(--color-text-3)]">—</span>
              {p}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function formatTs(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
