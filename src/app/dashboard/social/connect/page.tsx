import { redirect } from 'next/navigation'

// Social account management lives at /dashboard/social
export default function SocialConnectPage() {
  redirect('/dashboard/social')
}