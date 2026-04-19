'use client'

import { useTheme } from './ThemeProvider'

const options = ['System', 'Dark', 'Light']

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-white/10">
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">Theme</p>
      <div className="space-y-0.5">
        {options.map(opt => {
          const val = opt.toLowerCase()
          const active = theme === val
          return (
            <button
              key={val}
              onClick={() => setTheme(val)}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition text-left"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-gray-500 dark:bg-gray-300' : 'bg-transparent'}`} />
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
