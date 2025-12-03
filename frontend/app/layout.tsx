import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TicketHub - Your Ticket Marketplace',
  description: 'Find and buy tickets for concerts, sports, theater, and more',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

