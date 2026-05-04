'use client';

interface Props { size?: number; }

export default function LogoMark({ size = 24 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <rect x="16" y="2" width="19" height="19" rx="3"
        transform="rotate(45 16 2)"
        stroke="#8B5CF6" strokeWidth="1.8" fill="none"/>
      <circle cx="16" cy="16" r="3" fill="#8B5CF6"/>
      <circle cx="16" cy="4.5"  r="1.8" fill="#8B5CF6" opacity="0.4"/>
      <circle cx="27.5" cy="16" r="1.8" fill="#8B5CF6" opacity="0.4"/>
      <circle cx="16" cy="27.5" r="1.8" fill="#8B5CF6" opacity="0.4"/>
      <circle cx="4.5" cy="16"  r="1.8" fill="#8B5CF6" opacity="0.4"/>
    </svg>
  );
}
