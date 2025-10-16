"use client"

import * as React from 'react'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number // 0..100
  srLabel?: string
}

export function Progress({ value = 0, srLabel = 'Progress', className = '', ...rest }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={`w-full ${className}`} {...rest}>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
          aria-label={srLabel}
        />
      </div>
      <span className="sr-only" aria-live="polite">{srLabel}: {pct}%</span>
    </div>
  )
}

export default Progress

