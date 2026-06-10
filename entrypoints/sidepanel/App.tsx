import { useProfile } from '../../src/hooks/use-profile';

export default function App() {
  const { data: profile, isLoading } = useProfile();

  return (
    <main className="h-full flex flex-col bg-white">
      <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <img src="/icons/icon-48.png" alt="" className="w-7 h-7" />
        <span className="text-base font-semibold tracking-wide text-ink">BRYTEO</span>
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
