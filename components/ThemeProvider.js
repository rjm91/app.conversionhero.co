'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {} })

const THEMES = ['system', 'dark', 'light', 'brand']

function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(theme) {
  const root = document.documentElement
  root.classList.remove('dark', 'system')
  // 'brand' = the dark UI with the client's brand accent (the accent swap is
  // handled in the client layout, which knows the brand color).
  // 'system' = follow the OS appearance.
  if (theme === 'dark' || theme === 'brand' || (theme === 'system' && prefersDark())) {
    root.classList.add('dark')
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('system')

  useEffect(() => {
    const saved = localStorage.getItem('ca_theme') || 'system'
    setThemeState(saved)
    applyTheme(saved)
    // Live-update when the OS appearance flips while on System.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if ((localStorage.getItem('ca_theme') || 'system') === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function setTheme(next) {
    setThemeState(next)
    localStorage.setItem('ca_theme', next)
    applyTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
