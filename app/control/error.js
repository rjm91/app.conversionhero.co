'use client'

// Catches render errors in /control (including the client layout) so the app
// shows the actual error instead of a blank "client-side exception" screen.
export default function ControlError({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117] p-6">
      <div className="max-w-2xl w-full rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/[0.08] p-6">
        <h2 className="text-base font-semibold text-red-700 dark:text-red-300">Something errored on this page</h2>
        <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">We're on it — reload to try again.</p>
        <pre className="mt-4 text-[11px] leading-relaxed text-red-800 dark:text-red-200 bg-white/60 dark:bg-black/30 rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap">
          {String(error?.message || error)}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
          {error?.stack ? '\n\n' + error.stack.split('\n').slice(0, 8).join('\n') : ''}
        </pre>
        <button
          onClick={() => reset()}
          className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
