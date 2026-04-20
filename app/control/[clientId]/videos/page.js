'use client'

export default function VideosPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Finished Videos</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          All published videos — real footage and AI-generated avatar videos.
        </p>
      </div>
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-10 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">No published videos yet.</p>
      </div>
    </div>
  )
}
