'use client'

export default function StaffTrainingPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center space-y-4">
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(127,184,151,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7FB897" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
      </div>
      <h1 className="text-lg font-medium" style={{ color: '#E8EDE7' }}>Training coming soon</h1>
      <p className="text-sm max-w-xs" style={{ color: '#A8B5A8' }}>
        Certifications, inductions, and learning modules will appear here once your employer sets them up.
      </p>
    </div>
  )
}
