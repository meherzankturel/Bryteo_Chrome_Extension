import { useProfile } from '../../src/hooks/use-profile';

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
