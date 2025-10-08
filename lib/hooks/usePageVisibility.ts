'use client'

import { useEffect, useState } from 'react'

export function usePageVisibility() {
  const [visible, setVisible] = useState<boolean>(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}

