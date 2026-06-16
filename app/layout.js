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
      var dark = (t === 'dark' || t === 'brand' || (t === 'system' && osDark));
      var root = document.documentElement;
      if (dark) root.classList.add('dark');
      // Paint the right background + native UI scheme BEFORE first paint so the
      // page (and scrollbars/native controls) never flash light on refresh.
      root.style.colorScheme = dark ? 'dark' : 'light';
      root.style.backgroundColor = dark ? '#0f1117' : '#f9fafb';
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
