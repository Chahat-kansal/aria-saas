'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Tag, Layers, DollarSign, Package, Barcode, Truck, Image, Star,
  Save, ArrowLeft, Loader2,
} from 'lucide-react'
import GeneralTab from './tabs/GeneralTab'
import IndustryProductForm from '@/components/products/industry/IndustryProductForm'
import type { ProductDraft } from '@/components/products/industry/CommonFields'
import { inp, lbl } from './shared'
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
    is_weight_based: (product as any).is_weight_based ?? false,
    price_per_kg: (product as any).price_per_kg ?? 0,
  })
  const [classifications, setClassifications] = useState({
    category_id: product.category_id ?? null,
    brand_id: product.brand_id ?? null,
    family_id: product.family_id ?? null,
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
  const [industryDraft, setIndustryDraft] = useState<ProductDraft>({
    name: product.name ?? '',
    price: product.price ?? '',
    cost_price: product.cost_price ?? '',
    description: product.description ?? '',
    category_id: product.category_id ?? null,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    // industry-specific fields
    kds_station: product.kds_station ?? null,
    prep_time_seconds: product.prep_time_seconds ?? null,
    allergens: product.allergens ?? [],
    shelf_life_days: product.shelf_life_days ?? null,
    course_type: product.course_type ?? null,
    alcohol_percentage: product.alcohol_percentage ?? null,
    standard_drinks: product.standard_drinks ?? null,
    vintage: product.vintage ?? null,
    age_restricted: product.age_restricted ?? false,
    container_type: product.container_type ?? null,
    stock_quantity: product.stock_quantity ?? 0,
    low_stock_threshold: product.low_stock_threshold ?? 5,
    bin_location: product.bin_location ?? '',
    case_quantity: product.case_quantity ?? 1,
    supplier_sku: product.supplier_sku ?? '',
    supplier_barcode: product.supplier_barcode ?? '',
    shelf_capacity: product.shelf_capacity ?? null,
    qty_backroom: product.qty_backroom ?? null,
    expiry_date: product.expiry_date ?? null,
  })

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
        patch('update_general', { ...general, ...industryDraft }),
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
        {activeTab === 'general' && (
          <>
            <GeneralTab data={general} onChange={(d) => setGeneral(d as typeof general)} />
            <div style={{ marginTop: 28 }}>
              <IndustryProductForm form={industryDraft} setForm={setIndustryDraft} />
            </div>
            {/* Warehouse fields */}
            <div style={{ marginTop: 28, padding: '18px 20px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--divider)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Warehouse</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Shelf Capacity</label>
                  <input type="number" min="0" style={inp} placeholder="0"
                    value={industryDraft.shelf_capacity != null ? String(industryDraft.shelf_capacity) : ''}
                    onChange={e => setIndustryDraft(f => ({ ...f, shelf_capacity: e.target.value === '' ? null : parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label style={lbl}>Backroom Qty</label>
                  <input type="number" min="0" style={inp} placeholder="0"
                    value={industryDraft.qty_backroom != null ? String(industryDraft.qty_backroom) : ''}
                    onChange={e => setIndustryDraft(f => ({ ...f, qty_backroom: e.target.value === '' ? null : parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label style={lbl}>Expiry Date</label>
                  <input type="date" style={inp}
                    value={industryDraft.expiry_date ? String(industryDraft.expiry_date).split('T')[0] : ''}
                    onChange={e => setIndustryDraft(f => ({ ...f, expiry_date: e.target.value || null }))} />
                </div>
              </div>
              {Number(industryDraft.shelf_capacity ?? 0) > 0 && Number(industryDraft.stock_quantity ?? 0) >= 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    <span>Floor fill</span>
                    <span>{Math.round(Number(industryDraft.stock_quantity ?? 0) / Number(industryDraft.shelf_capacity) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: 'var(--violet)', width: Math.min(Math.round(Number(industryDraft.stock_quantity ?? 0) / Number(industryDraft.shelf_capacity) * 100), 100) + '%', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {activeTab === 'classifications' && <ClassificationsTab data={classifications} categories={categories} brands={brands} families={families} onChange={setClassifications} />}
        {activeTab === 'sell-cost' && (
          <SellCostTab
            prices={prices} inventory={costs} priceSets={priceSets} outlets={outlets}
            onChange={(p, d, inv) => { setPrices(p); setPriceDeletedIds(d); setCosts(inv) }}
          />
        )}
        {activeTab === 'inventory' && <InventoryTab inventory={inventory} outlets={outlets} onChange={setInventory} productId={productId} />}
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
