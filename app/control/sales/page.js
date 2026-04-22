'use client'

export default function SalesPage() {
  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sales</h1>
      <p className="text-sm text-gray-400">Coming soon</p>
    </div>
  )
}
