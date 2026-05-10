'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Tag, Layers, DollarSign, Package, Barcode, Truck, Image, Star,
  Save, ArrowLeft, Loader2,
} from 'lucide-react'
import GeneralTab from './tabs/GeneralTab'
import ClassificationsTab from './tabs/ClassificationsTab'
import SellCostTab from './tabs/SellCostTab'
import InventoryTab from './tabs/InventoryTab'
import BarcodesTab from './tabs/BarcodesTab'
import SuppliersTab from './tabs/SuppliersTab'
import ImagesTab from './tabs/ImagesTab'
import LoyaltyTab from './tabs/LoyaltyTab'

const TABS = [
  { id: 'general',         label: 'General',         Icon: Tag },
  { id: 'classifications', label: 'Classifications',  Icon: Layers },
  { id: 'sell-cost',       label: 'Sell & Cost',      Icon: DollarSign },
  { id: 'inventory',       label: 'Inventory',        Icon: Package },
  { id: 'barcodes',        label: 'Barcodes',         Icon: Barcode },
  { id: 'suppliers',       label: 'Suppliers',        Icon: Truck },
  { id: 'images',          label: 'Images',           Icon: Image },
  { id: 'loyalty',         label: 'Loyalty',          Icon: Star },
] as const

type TabId = typeof TABS[number]['id']

interface Props {
  product: any
  prices: any[]; inventory: any[]; barcodes: any[]; loyalty: any; images: any[]
  outlets: any[]; priceSets: any[]; categories: any[]; brands: any[]; families: any[]
  suppliers: any[]; productSuppliers: any[]
}

export default function ProductEditShell(props: Props) {
  const { product, outlets, priceSets, categories, brands, families, suppliers } = props
  const router = useRouter()
  const productId = product.id as string

  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')

  // Tab-level dirty state
  const [general, setGeneral] = useState({
    name: product.name ?? '', sku: product.sku ?? '',
    description: product.description ?? '',
    is_active: product.is_active ?? true,
    show_online: product.show_online ?? false,
    is_age_restricted: product.is_age_restricted ?? false,
  })
  const [classifications, setClassifications] = useState({
    category_id: product.category_id ?? '',
    brand_id: product.brand_id ?? '',
    family_id: product.family_id ?? '',
    container_type: product.container_type ?? 'unknown',
    track_stock: product.track_stock ?? true,
    tax_rate: product.tax_rate ?? 10,
  })
  const [prices, setPrices] = useState<any[]>(props.prices)
  const [priceDeletedIds, setPriceDeletedIds] = useState<string[]>([])
  const [costs, setCosts] = useState<any[]>(props.inventory)
  const [inventory, setInventory] = useState<any[]>(props.inventory)
  const [barcodes, setBarcodes] = useState<any[]>(props.barcodes)
  const [barcodeDeletedIds, setBarcodeDeletedIds] = useState<string[]>([])
  const [productSuppliers, setProductSuppliers] = useState<any[]>(props.productSuppliers)
  const [supplierDeletedIds, setSupplierDeletedIds] = useState<string[]>([])
  const [images, setImages] = useState<any[]>(props.images)
  const [imageDeletedIds, setImageDeletedIds] = useState<string[]>([])
  const [loyalty, setLoyalty] = useState({
    earns_points: props.loyalty?.earns_points ?? true,
    points_multiplier: props.loyalty?.points_multiplier ?? 1,
    eligible_for_rewards: props.loyalty?.eligible_for_rewards ?? true,
    excluded_from_promotions: props.loyalty?.excluded_from_promotions ?? false,
    notes: props.loyalty?.notes ?? '',
  })

  const patch = useCallback(async (action: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/pos/products/${productId}?action=${action}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Save failed') }
  }, [productId])

  const save = async () => {
    setSaving(true); setError('')
    try {
      await Promise.all([
        patch('update_general', { ...general }),
        patch('update_classifications', { ...classifications }),
        patch('update_pricing', { prices: prices.filter(p => !p.id?.startsWith('new-') || p.price > 0), deleted_ids: priceDeletedIds, default_price: prices.find(p => p.outlet_id == null && p.quantity === 1)?.price }),
        patch('update_costs', { costs }),
        patch('update_inventory', { inventory }),
        patch('update_barcodes', { barcodes: barcodes.filter(b => b.barcode.trim()), deleted_ids: barcodeDeletedIds }),
        patch('update_suppliers', { suppliers: productSuppliers, deleted_ids: supplierDeletedIds }),
        patch('update_images', { images, deleted_ids: imageDeletedIds }),
        patch('update_loyalty', { ...loyalty }),
      ])
      setSavedAt(new Date())
    } catch (e: any) {
      setError(e.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const title = `Editing —${product.sku ? ` -${product.sku}` : ''} ${product.name}`

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link href={`/pos/products/${productId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back
        </Link>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {savedAt && !saving && (
            <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Saved {savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {error && <span style={{ fontSize: 11, color: 'var(--destructive)' }}>{error}</span>}
          <button onClick={save} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', overflowX: 'auto', flexShrink: 0, padding: '0 24px' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id as TabId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '12px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === id ? 'var(--violet)' : 'transparent'}`,
              color: activeTab === id ? 'var(--violet)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: activeTab === id ? 700 : 400,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 80px' }}>
        {activeTab === 'general' && <GeneralTab data={general} onChange={setGeneral} />}
        {activeTab === 'classifications' && <ClassificationsTab data={classifications} categories={categories} brands={brands} families={families} onChange={setClassifications} />}
        {activeTab === 'sell-cost' && (
          <SellCostTab
            prices={prices} inventory={costs} priceSets={priceSets} outlets={outlets}
            onChange={(p, d, inv) => { setPrices(p); setPriceDeletedIds(d); setCosts(inv) }}
          />
        )}
        {activeTab === 'inventory' && <InventoryTab inventory={inventory} outlets={outlets} onChange={setInventory} />}
        {activeTab === 'barcodes' && (
          <BarcodesTab barcodes={barcodes}
            onChange={(b, d) => { setBarcodes(b); setBarcodeDeletedIds(d) }} />
        )}
        {activeTab === 'suppliers' && (
          <SuppliersTab productSuppliers={productSuppliers} suppliers={suppliers}
            onChange={(s, d) => { setProductSuppliers(s); setSupplierDeletedIds(d) }} />
        )}
        {activeTab === 'images' && (
          <ImagesTab images={images}
            onChange={(imgs, d) => { setImages(imgs); setImageDeletedIds(d) }} />
        )}
        {activeTab === 'loyalty' && <LoyaltyTab data={loyalty} onChange={setLoyalty} />}
      </div>
    </div>
  )
}
