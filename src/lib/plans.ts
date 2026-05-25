export const PLANS = {
  free: {
    name: 'Free',
    messagesPerMonth: 50,
    models: ['claude-haiku-4-5-20251001'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    webSearch: false,
    price: 0,
  },
  pro: {
    name: 'Pro',
    messagesPerMonth: Infinity,
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'],
    maxFileSize: 20 * 1024 * 1024, // 20MB
    webSearch: true,
    price: 20,
  },
};

export function canUseModel(plan: string, model: string): boolean {
  const p = PLANS[plan as keyof typeof PLANS] || PLANS.free;
  return p.models.includes(model);
}

export function hasMessagesLeft(plan: string, used: number): boolean {
  const p = PLANS[plan as keyof typeof PLANS] || PLANS.free;
  return used < p.messagesPerMonth;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
