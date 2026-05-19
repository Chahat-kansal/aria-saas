export const SEGMENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  champions:       { bg: 'rgba(29,158,117,0.12)',  text: '#085041', label: 'Champions' },
  loyal:           { bg: 'rgba(127,119,221,0.12)', text: '#3C3489', label: 'Loyal' },
  regular:         { bg: 'rgba(136,135,128,0.12)', text: '#444441', label: 'Regular' },
  new:             { bg: 'rgba(55,138,221,0.12)',  text: '#0C447C', label: 'New' },
  at_risk:         { bg: 'rgba(239,159,39,0.12)',  text: '#854F0B', label: 'At risk' },
  hibernating:     { bg: 'rgba(216,90,48,0.12)',   text: '#712B13', label: 'Hibernating' },
  never_returned:  { bg: 'rgba(212,83,126,0.12)',  text: '#72243E', label: 'Never returned' },
  needs_attention: { bg: 'rgba(186,117,23,0.12)',  text: '#633806', label: 'Needs attention' },
  unscored:        { bg: 'rgba(0,0,0,0.04)',       text: '#444441', label: 'Unscored' },
}

export const SEGMENT_ORDER = ['champions', 'loyal', 'regular', 'new', 'at_risk', 'needs_attention', 'hibernating', 'never_returned']
