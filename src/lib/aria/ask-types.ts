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
      items: Array<{ role: 'growth' | 'risk' | 'strategy'; icon: string; text: string }>
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
