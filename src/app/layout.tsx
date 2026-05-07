// src/app/layout.tsx
import type { Metadata } from 'next'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'ignyous.ai — AI Website Builder',
  description: 'AI-powered WordPress website management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet"/>
        <style suppressHydrationWarning>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { background: #F7F5F2; color: #1A1410; font-family: 'DM Sans', sans-serif; font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
          input, textarea, select, button { font-family: inherit; }
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-thumb { background: #E2DDD8; border-radius: 3px; }
          input:focus, textarea:focus { outline: none; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
          @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        `}</style>
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}