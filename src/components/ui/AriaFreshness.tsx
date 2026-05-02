'use client';

interface AriaFreshnessProps {
  generatedAt: string | null | undefined;
  onRefresh: () => void;
  refreshing?: boolean;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) === 1 ? '' : 's'} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) === 1 ? '' : 's'} ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? '' : 's'} ago`;
}

export function AriaFreshness({ generatedAt, onRefresh, refreshing }: AriaFreshnessProps) {
  if (!generatedAt) return null;

  return (
    <p className="text-[11px] text-[rgba(255,255,255,0.25)] mt-1 flex items-center gap-1.5">
      <span className="w-1 h-1 rounded-full bg-[#1D9E75] inline-block" />
      Aria analysed this {timeAgo(generatedAt)}
      <span className="text-[rgba(255,255,255,0.15)]">·</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="text-[#1D9E75] hover:text-[#8ff1c9] transition-colors disabled:opacity-40"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </p>
  );
}
