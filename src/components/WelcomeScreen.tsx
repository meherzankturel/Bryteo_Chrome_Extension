export function WelcomeScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold text-ink">Welcome to bryteo</h1>
        <p className="mt-4 text-slate-600 text-lg">
          Open any YouTube video and click the bryteo icon in your toolbar.
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
