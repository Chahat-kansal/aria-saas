'use client'
import { useParams, useRouter } from 'next/navigation'
import SaleDetailDrawer from '@/components/pos/SaleDetailDrawer'

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  return (
    <SaleDetailDrawer
      saleId={id}
      onClose={() => router.back()}
      onVoided={() => router.push('/pos/sales-history')}
    />
  )
}
