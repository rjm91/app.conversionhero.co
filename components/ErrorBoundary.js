'use client'

import { Component } from 'react'

// Contains render errors so one broken page doesn't white-screen the whole app.
// Shows the error message (temporary, for diagnosis) + a reload action.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) {
      const err = this.state.error
      return (
        <div className="p-8">
          <div className="max-w-2xl mx-auto mt-10 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/[0.08] p-6">
            <h2 className="text-base font-semibold text-red-700 dark:text-red-300">This section hit an error</h2>
            <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">We're on it. You can reload to try again.</p>
            <pre className="mt-4 text-[11px] leading-relaxed text-red-800 dark:text-red-200 bg-white/60 dark:bg-black/30 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap">
              {String(err?.message || err)}
              {err?.stack ? '\n\n' + err.stack.split('\n').slice(0, 6).join('\n') : ''}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); if (typeof window !== 'undefined') window.location.reload() }}
              className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
