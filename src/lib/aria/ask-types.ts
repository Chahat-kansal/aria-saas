export type AskBlock =
  | { type: 'lead'; content: string }
  | { type: 'text'; content: string }
  | {
      type: 'chart'
      chartType: 'bar'
      title?: string
      labels: string[]
      values: number[]
      unit?: string
      metrics: Array<{ label: string; value: string; color?: string }>
    }
  | {
      type: 'metric_row'
      items: Array<{
        label: string
        value: string
        sub?: string
        color?: string
        trend?: 'up' | 'down' | 'flat'
      }>
    }
  | {
      type: 'brain_readouts'
      items: Array<{ role: 'growth' | 'risk' | 'strategy' | 'context'; icon: string; text: string }>
    }
  | {
      type: 'council_split'
      question: string
      growth: string
      risk: string
      strategy: string
      choices: Array<{ icon: string; title: string; sub: string; prompt: string }>
    }
  | {
      type: 'action_list'
      items: Array<{
        icon: string; title: string; sub: string
        colorVariant?: 'danger' | 'warning' | 'default'
        prompt: string
      }>
    }
  | { type: 'action_single'; icon: string; title: string; sub: string; prompt: string }
  | { type: 'html'; content: string; title?: string }
  | {
      type: 'live_render'
      html: string
      height?: number
      title?: string
      downloadable?: boolean
      download_filename?: string
    }
  | {
      type: 'styled_chart'
      chart_type: 'bar' | 'line' | 'pie' | 'area' | 'scatter'
      color: string
      title: string
      data: Array<{ name: string; value: number }>
      x_label?: string
      y_label?: string
      show_legend?: boolean
      show_grid?: boolean
    }
  | {
      type: 'data_table'
      title: string
      columns: Array<{ key: string; label: string; format?: 'currency' | 'number' | 'percent' | 'text' | 'date' }>
      rows: Array<Record<string, unknown>>
      sortable?: boolean
      downloadable?: boolean
    }
  | {
      type: 'spreadsheet'
      filename: string
      headers: string[]
      rows: Array<string[]>
      auto_download?: boolean
    }
  | {
      type: 'kpi_card'
      label: string
      value: string | number
      format?: 'currency' | 'number' | 'percent'
      trend?: number
      trend_label?: string
      color?: string
      icon?: string
    }
  | {
      type: 'comparison_table'
      title: string
      left_label: string
      right_label: string
      rows: Array<{ metric: string; left: number; right: number; format?: string }>
      show_delta?: boolean
    }
  | {
      type: 'pushback'
      decision: string
      tension: string
      question: string
      severity?: 'low' | 'medium' | 'high'
    }
  | {
      type: 'menu_list'
      title?: string
      items: Array<{ name: string; price: string; description?: string }>
    }
  | {
      type: 'recommendation_card'
      name: string
      price: string
      reason: string
      image_url?: string
    }
  | {
      type: 'action_card'
      title: string
      body: string
      buttons: Array<{ label: string; href: string }>
    }

export interface AskResponse {
  blocks: AskBlock[]
  followups: string[]
  used_council: boolean
  response?: string
  conversation_id?: string | null
  intent?: string
  action?: unknown
  cost_usd_cents?: number
  downloads?: unknown
  tool_calls?: unknown[]
}
