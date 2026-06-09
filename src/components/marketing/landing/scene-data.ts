import type { ComponentType } from 'react'
import dynamic from 'next/dynamic'

export interface SceneDef {
  id: string
  className: string
  Component: ComponentType
}

// Lazy imports — bundled into separate chunks, not the main landing shell
import ProblemSceneNew from './scenes/ProblemSceneNew'
import MeetAriaScene from './scenes/MeetAriaScene'
import TenMinutesScene from './scenes/TenMinutesScene'
import SmartPOSScene from './scenes/SmartPOSScene'
import AustraliaWideScene from './scenes/AustraliaWideScene'
import ProblemScene from './scenes/ProblemScene'
import BrainScene from './scenes/BrainScene'
import ReorderScene from './scenes/ReorderScene'
import PricingAgentScene from './scenes/PricingAgentScene'
import AskScene from './scenes/AskScene'
import ScheduleScene from './scenes/ScheduleScene'
import AustraliaScene from './scenes/AustraliaScene'
import TestimonialScene from './scenes/TestimonialScene'
// TalkToAriaScene pulls in Three.js / WebGL via AriaTalkingHead — must be
// loaded client-only so it never touches the SSR bundle.
const TalkToAriaScene = dynamic(() => import('./scenes/TalkToAriaScene'), { ssr: false }) as ComponentType
import PricingTiersScene from './scenes/PricingTiersScene'
import OutroScene from './scenes/OutroScene'

export const SCENES: SceneDef[] = [
  { id: '02', className: 'scene-problem-new',  Component: ProblemSceneNew },
  { id: '03', className: 'scene-meet-aria',    Component: MeetAriaScene },
  { id: '04', className: 'scene-problem',      Component: ProblemScene },
  { id: '05', className: 'scene-brain',        Component: BrainScene },
  { id: '06', className: 'scene-split',        Component: ReorderScene },
  { id: '07', className: 'scene-split reverse', Component: PricingAgentScene },
  { id: '08', className: 'scene-ask',          Component: AskScene },
  { id: '09', className: 'scene-split',        Component: ScheduleScene },
  { id: '10', className: 'scene-australia',    Component: AustraliaScene },
  { id: '11', className: 'scene-ten-minutes',  Component: TenMinutesScene },
  { id: '12', className: 'scene-smart-pos',    Component: SmartPOSScene },
  { id: '13', className: 'scene-australia-wide', Component: AustraliaWideScene },
  { id: '14', className: 'scene-testimonial',  Component: TestimonialScene },
  { id: '15', className: 'scene-talk-aria',    Component: TalkToAriaScene },
  { id: '16', className: 'scene-pricing',      Component: PricingTiersScene },
  { id: '17', className: 'scene-outro',        Component: OutroScene },
]
