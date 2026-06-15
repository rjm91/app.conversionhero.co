import './globals.css'
import { ThemeProvider } from '../components/ThemeProvider'

export const metadata = {
  title: 'ConversionAgent',
  description: 'Agency Performance Dashboard',
}

// Inline script runs before React hydrates — prevents flash of wrong theme
const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('ca_theme') || 'system';
      var osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (t === 'dark' || t === 'brand' || (t === 'system' && osDark)) document.documentElement.classList.add('dark');
    } catch(e) {}
  })();
`

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-gray-50 dark:bg-[#0f1117] text-gray-900 dark:text-gray-100 antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
