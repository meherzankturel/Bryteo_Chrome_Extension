export function WelcomeScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <img
          src="/brand/lockup.png"
          alt="BRYTEO"
          className="w-56 mx-auto"
        />
        <p className="mt-8 text-slate-600 text-lg">
          Open any YouTube video and click the BRYTEO icon in your toolbar.
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
