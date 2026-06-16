'use client'
import { Suspense } from 'react'
import AuthScene from '@/components/auth/AuthScene'

// AUTH-BRAND-FIX: /signup renders the unified on-brand auth scene with the "Start free trial" tab
// pre-selected. Route kept (links/SEO). Real Supabase signUp + Google OAuth + confirm-email/onboarding
// redirects preserved in AuthScene.
export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0c0f0d' }} />}>
      <AuthScene initialTab="signup" />
    </Suspense>
  )
}
