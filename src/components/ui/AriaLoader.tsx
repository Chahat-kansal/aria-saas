'use client';

interface AriaLoaderProps {
  message?: string;
  size?: 'sm' | 'md';
}

export function AriaLoader({ message = 'Aria is thinking…', size = 'md' }: AriaLoaderProps) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex gap-1 flex-shrink-0">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`${dotSize} rounded-full bg-[#1D9E75]`}
            style={{ animation: `ariapulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
      <span className={`${textSize} text-[rgba(255,255,255,0.4)]`}>{message}</span>
      <style jsx>{`
        @keyframes ariapulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
