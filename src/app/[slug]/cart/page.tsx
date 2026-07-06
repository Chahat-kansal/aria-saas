export const runtime = 'nodejs'
import { redirect } from 'next/navigation'

// Cart redirects to the ordering engine (existing /menu/[slug])
export default async function CartPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  redirect('/menu/' + slug)
}