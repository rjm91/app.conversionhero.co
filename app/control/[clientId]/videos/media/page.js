'use client'

export default function MediaPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Media</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Raw footage, images, stock clips, and library assets — all in one place.
        </p>
      </div>
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-10 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Assets + Library merge coming next. For now:{' '}
          <a href="assets" className="text-blue-500 hover:underline">Assets</a> ·{' '}
          <a href="library" className="text-blue-500 hover:underline">Library</a>
        </p>
      </div>
    </div>
  )
}
