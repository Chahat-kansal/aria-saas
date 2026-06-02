export interface ProductForTerminal {
  id: string
  name: string
  sku: string
  barcode?: string | null
  category?: string | null
  price: number
  cost_price?: number | null
  stock_quantity?: number | null
  image_url?: string | null
  image_source?: string | null
  container_type?: string | null
  description?: string | null
  track_inventory?: boolean
  active?: boolean
  agent_bundle_product_id?: string | null
  agent_bundle_price?: number | null
  performance_tier?: string | null
}

export interface LayoutProps {
  products: ProductForTerminal[]
  onProductClick: (product: ProductForTerminal) => void
  selectedCategory?: string | null
  searchQuery?: string
  recentProductIds?: string[]
  suggestedProductIds?: string[]
  showStock?: boolean
}
