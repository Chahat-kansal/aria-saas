'use client';

interface AriaErrorProps {
  error?: string;
  onRetry?: () => void;
  context?: string;
  onOpenCommandBar?: () => void;
}

const FRIENDLY: Record<string, string> = {
  'Failed to fetch': 'This usually means a connectivity issue — check your internet connection.',
  'Unauthorized': 'Your session may have expired. Try refreshing the page.',
  '500': 'Something went wrong on our end. This is usually temporary.',
};

function friendlyReason(error: string): string {
  for (const [key, msg] of Object.entries(FRIENDLY)) {
    if (error.includes(key)) return msg;
  }
  return 'This is usually a temporary issue.';
}

export function AriaError({ error = 'Unknown error', onRetry, context, onOpenCommandBar }: AriaErrorProps) {
  return (
    <div className="rounded-xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white mb-0.5">
            Aria couldn&apos;t load {context ?? 'this'} right now.
          </p>
          <p className="text-xs text-[rgba(255,255,255,0.45)] leading-relaxed">
            {friendlyReason(error)}{' '}
            Try refreshing, or ask Aria in the command bar.
          </p>
          <div className="flex gap-2 mt-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] text-white transition-colors"
              >
                Retry
              </button>
            )}
            {onOpenCommandBar && (
              <button
                onClick={onOpenCommandBar}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-[#1D9E75] hover:text-[#8ff1c9] transition-colors"
              >
                Ask Aria ⌘K
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
