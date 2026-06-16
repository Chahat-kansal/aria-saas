'use client'
import { Suspense } from 'react'
import AuthScene from '@/components/auth/AuthScene'

// AUTH-BRAND-FIX: /login renders the unified on-brand auth scene with the "Sign in" tab pre-selected.
// Route kept (links/redirects/SEO point here). Real Supabase login + redirects preserved in AuthScene.
export default function OwnerLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0c0f0d' }} />}>
      <AuthScene initialTab="login" />
    </Suspense>
  )
}
