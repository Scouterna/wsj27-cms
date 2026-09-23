import React from 'react'
import './styles.css'
import { icons } from '@/icons'

export const metadata = {
  description: 'Svenska kontingenten till 26th World Scout Jamboree, Polen 2027.',
  title: 'WSJ27',
  icons,
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
