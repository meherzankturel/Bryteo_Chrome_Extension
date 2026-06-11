export function WelcomeScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-md text-center">
        <div
          className="
            w-20 h-20 mx-auto mb-8 grid place-items-center rounded-2xl
            bg-[var(--color-surface-2)] border border-[var(--color-border)]
            relative overflow-hidden
          "
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at top, rgba(212,161,86,0.16), transparent 60%)'
            }}
          />
          <img src="/icons/icon-128.png" alt="" className="w-12 h-12 relative z-10" />
        </div>
        <h1 className="text-[28px] font-bold tracking-tight mb-3 text-[var(--color-text)]">
          Welcome to BRYTEO
        </h1>
        <p className="text-[15px] text-[var(--color-text-2)] leading-[1.55] mb-10">
          Open any YouTube video and click the BRYTEO icon in your toolbar.
          The side panel will appear next to the video.
        </p>
        <button
          onClick={() => window.close()}
          className="
            inline-flex items-center gap-2 px-7 py-3 rounded-[8px]
            bg-[var(--color-text)] text-[var(--color-bg)]
            font-semibold text-[13.5px] tracking-[0.01em]
            transition-all duration-200
            hover:translate-y-[-1px]
          "
          style={{ boxShadow: 'var(--shadow-cta)' }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-cta-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-cta)')}
        >
          Got it
          <span className="text-[14px]">→</span>
        </button>
      </div>
    </main>
  );
}
