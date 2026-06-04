export type Filter =
  | 'none'
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'grayscale'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'dramatic'
  | 'vivid'
  | 'noir'
  | 'golden'

export const FILTER_CSS: Record<Filter, string> = {
  none:       '',
  brightness: 'brightness(1.25)',
  contrast:   'contrast(1.3)',
  saturate:   'saturate(1.6)',
  grayscale:  'grayscale(1)',
  sepia:      'sepia(0.7)',
  warm:       'sepia(0.3) saturate(1.4) brightness(1.05)',
  cool:       'hue-rotate(30deg) saturate(0.9) brightness(1.05)',
  dramatic:   'contrast(1.4) brightness(0.85) saturate(1.2)',
  vivid:      'saturate(2) contrast(1.1)',
  noir:       'grayscale(1) contrast(1.3)',
  golden:     'sepia(0.5) saturate(1.3) brightness(1.1)',
}

export type TextAnim = 'none' | 'fade' | 'slide-up' | 'pop'

export interface TextLayer {
  id: string
  text: string
  startFrame: number
  endFrame: number
  fontSize: number
  color: string
  fontFamily: string
  x: number      // 0-100 percent
  y: number      // 0-100 percent
  bold: boolean
  shadow: boolean
  background: boolean
  backgroundColor: string
  anim?: TextAnim
}

export interface AudioLayer {
  id: string
  src: string
  startFrame: number
  volume: number        // 0-1
  fadeIn: number        // frames
  fadeOut: number       // frames
}

export interface SpeedSegment {
  startFrame: number   // source video frame where segment starts
  endFrame: number     // source video frame where segment ends
  speed: number        // playback rate for this segment (e.g. 0.5, 1, 2)
  transition?: 'none' | 'fade' | 'whip'
}

export interface EditSpec {
  videoUrl: string
  trimStartFrame: number
  trimEndFrame: number          // -1 = end of video
  speed: number                 // global speed (used when speedSegments is empty)
  filter: Filter
  filterIntensity: number       // 0-1 multiplier on the filter
  textLayers: TextLayer[]
  audioLayers: AudioLayer[]
  watermark: boolean
  outputFps: number
  outputWidth: number
  outputHeight: number
  speedSegments: SpeedSegment[] // if non-empty, overrides global `speed`
}

export interface RenderJobState {
  sandboxId: string
  cmdId: string
  outputFile: string
}
