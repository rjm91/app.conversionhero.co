'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {} })

const THEMES = ['system', 'dark', 'light']

function applyTheme(theme) {
  const root = document.documentElement
  root.classList.remove('dark', 'system')
  if (theme === 'dark') root.classList.add('dark')
  else if (theme === 'system') root.classList.add('system')
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('system')

  useEffect(() => {
    const saved = localStorage.getItem('ca_theme') || 'system'
    setThemeState(saved)
    applyTheme(saved)
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
