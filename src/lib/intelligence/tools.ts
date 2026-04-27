// Re-export ARIA_SYSTEM, ARIA_TOOLS, runAriaTool from the canonical source
export { ARIA_SYSTEM, ARIA_TOOLS, runAriaTool } from '@/lib/claudeTools';

// Subsets for specific use cases
export { ARIA_TOOLS as WEB_TOOLS } from '@/lib/claudeTools';
export { ARIA_TOOLS as ADVANCED_TOOLS } from '@/lib/claudeTools';
