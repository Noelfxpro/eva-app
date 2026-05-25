import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'EVA — Verified Authorship on Shelby',
  description: 'Proof of authorship for Web3 content, stored on Shelby hot storage',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
