'use client'

import React from 'react'

/**
 * Opens the browser's print dialog. The dialog is not opened on load: a page
 * that prints itself the moment it appears gives the reader no chance to see
 * what they are about to spend forty sheets of paper on.
 */
export function PrintButton() {
  return (
    <button type="button" className="utskrift-print" onClick={() => window.print()}>
      Skriv ut
    </button>
  )
}
