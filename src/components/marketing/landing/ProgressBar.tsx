'use client'
import { forwardRef } from 'react'

// The fill div is manipulated directly via ref from LandingShell for 60fps perf
const ProgressBar = forwardRef<HTMLDivElement>((_, ref) => (
  <div className="progress-bar">
    <div className="progress-bar-fill" ref={ref} />
  </div>
))

ProgressBar.displayName = 'ProgressBar'
export default ProgressBar
