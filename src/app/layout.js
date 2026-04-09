import './globals.css'

export const metadata = {
  title: 'LeadEngine Pro — B2B Lead Generation Platform',
  description:
    'AI-powered B2B lead generation. Scrape, enrich, and score leads from Google Maps in real-time.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
