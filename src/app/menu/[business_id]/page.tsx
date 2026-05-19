import type { Metadata } from 'next'
import MenuClient from './MenuClient'

type Props = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { business_id } = 'then' in params ? await params : params
  try {
    const biz = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'}/api/public/business/${business_id}`, { cache: 'no-store' }).then(r => r.json())
    const name = biz?.business?.name ?? 'Menu'
    return {
      title: `${name} — Menu`,
      description: `View the menu and order online from ${name}.`,
      openGraph: { title: `${name} — Menu`, type: 'website' },
    }
  } catch { return { title: 'Menu' } }
}

export default async function MenuPage({ params }: Props) {
  const { business_id } = 'then' in params ? await params : params
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    hasMenu: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'}/menu/${business_id}`,
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MenuClient businessId={business_id} />
    </>
  )
}
