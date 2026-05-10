import type { ComponentType } from 'react'

export interface SceneDef {
  id: string
  className: string
  Component: ComponentType
}

// Lazy imports — bundled into separate chunks, not the main landing shell
import ProblemScene from './scenes/ProblemScene'
import BrainScene from './scenes/BrainScene'
import ReorderScene from './scenes/ReorderScene'
import PricingAgentScene from './scenes/PricingAgentScene'
import AskScene from './scenes/AskScene'
import ScheduleScene from './scenes/ScheduleScene'
import AustraliaScene from './scenes/AustraliaScene'
import TestimonialScene from './scenes/TestimonialScene'
import PricingTiersScene from './scenes/PricingTiersScene'
import OutroScene from './scenes/OutroScene'

export const SCENES: SceneDef[] = [
  { id: '02', className: 'scene-problem',     Component: ProblemScene },
  { id: '03', className: 'scene-brain',        Component: BrainScene },
  { id: '04', className: 'scene-split',        Component: ReorderScene },
  { id: '05', className: 'scene-split reverse', Component: PricingAgentScene },
  { id: '06', className: 'scene-ask',          Component: AskScene },
  { id: '07', className: 'scene-split',        Component: ScheduleScene },
  { id: '08', className: 'scene-australia',    Component: AustraliaScene },
  { id: '10', className: 'scene-testimonial',  Component: TestimonialScene },
  { id: '11', className: 'scene-pricing',      Component: PricingTiersScene },
  { id: '12', className: 'scene-outro',        Component: OutroScene },
]
