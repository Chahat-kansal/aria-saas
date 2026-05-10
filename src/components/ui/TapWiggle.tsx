'use client'
import { useState, ReactNode } from 'react'

export function TapWiggle({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const [animating, setAnimating] = useState(false)
  const handleClick = () => {
    setAnimating(false)
    requestAnimationFrame(() => setAnimating(true))
    onClick?.()
    setTimeout(() => setAnimating(false), 700)
  }
  return (
    <div onClick={handleClick} style={{ cursor: 'pointer', display: 'contents' }}>
      <div className={animating ? 'tap-wiggle' : ''} style={{ display: 'inline-block', width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
