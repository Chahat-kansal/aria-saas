export interface SocialIndustryConfig {
  tone: string
  themes: string[]
  bestPostingTimes: string[]
  defaultHashtags: string[]
  callToActions: string[]
  contentRatio: { promo: number; value: number; community: number }
  preferredPlatforms: ('instagram' | 'facebook' | 'google_business')[]
}

export const SOCIAL_INDUSTRY_CONFIGS: Record<string, SocialIndustryConfig> = {
  cafe: {
    tone: 'warm, casual, inviting — like a friendly barista',
    themes: [
      'daily special drink or food',
      'latte art and craft',
      'behind the bar stories',
      'regular customer spotlights',
      'opening hours reminders',
      'seasonal menu changes',
      'community events',
    ],
    bestPostingTimes: ['07:30', '12:00', '15:00'],
    defaultHashtags: ['#cafelife', '#specialtycoffee', '#localcafe'],
    callToActions: ['Pop in for one', 'Save your spot', 'See you tomorrow'],
    contentRatio: { promo: 30, value: 40, community: 30 },
    preferredPlatforms: ['instagram', 'facebook'],
  },
  liquor: {
    tone: 'knowledgeable but approachable, conversational',
    themes: [
      'new wine/spirit arrivals',
      'wine pairings with food',
      'weekend deals',
      'tasting events',
      'staff picks',
      'cocktail recipes',
      'producer stories',
    ],
    bestPostingTimes: ['16:00', '18:00', 'Sat 11:00'],
    defaultHashtags: ['#wine', '#craftbeer', '#liquorstore'],
    callToActions: ['Grab it before it sells out', 'Pop in this weekend', 'Try it with dinner'],
    contentRatio: { promo: 40, value: 40, community: 20 },
    preferredPlatforms: ['instagram', 'facebook'],
  },
  retail: {
    tone: 'friendly, helpful, community-minded',
    themes: [
      'new arrivals',
      "this week's promotions",
      'opening hours and holiday changes',
      'community partnerships',
      'product spotlights',
      'how-to tips related to your products',
    ],
    bestPostingTimes: ['12:00', '18:00'],
    defaultHashtags: ['#shoplocal', '#smallbusiness'],
    callToActions: ['Visit us today', 'In store now', 'Limited stock'],
    contentRatio: { promo: 50, value: 30, community: 20 },
    preferredPlatforms: ['facebook', 'instagram'],
  },
  restaurant: {
    tone: 'inviting, mouth-watering, foodie',
    themes: [
      'menu item close-ups',
      "chef's daily specials",
      'restaurant ambiance',
      'reservation reminders',
      'cuisine stories',
      'staff and kitchen behind the scenes',
    ],
    bestPostingTimes: ['11:00', '13:00', '17:30'],
    defaultHashtags: ['#foodie', '#dinneridea'],
    callToActions: ['Book your table', "Tonight's special", 'Reservations open'],
    contentRatio: { promo: 35, value: 45, community: 20 },
    preferredPlatforms: ['instagram', 'facebook'],
  },
  bakery: {
    tone: 'cozy, artisan, passionate',
    themes: [
      'fresh bakes of the day',
      'sourdough process',
      'custom cake orders',
      'pre-order reminders',
      "baker's tips",
      'seasonal pastries',
    ],
    bestPostingTimes: ['06:30', '08:00', '14:00'],
    defaultHashtags: ['#bakery', '#freshbread', '#artisanbakery'],
    callToActions: ['Pre-order now', 'Still warm from the oven', 'Limited daily batch'],
    contentRatio: { promo: 30, value: 50, community: 20 },
    preferredPlatforms: ['instagram', 'facebook'],
  },
  realestate: {
    tone: 'professional, aspirational, expert',
    themes: [
      'new listings',
      'market updates',
      'neighborhood highlights',
      'open house announcements',
      'sold celebrations',
      'home buying tips',
    ],
    bestPostingTimes: ['Sun 16:00', 'Wed 19:00', 'Thu 12:00'],
    defaultHashtags: ['#realestate', '#propertyforsale'],
    callToActions: ['Book a viewing', 'Inspect this weekend', 'DM for more details'],
    contentRatio: { promo: 60, value: 30, community: 10 },
    preferredPlatforms: ['facebook', 'instagram', 'google_business'],
  },
  tradie: {
    tone: 'trustworthy, expert, no-nonsense',
    themes: [
      'before and after jobs',
      'service spotlights',
      'maintenance tips',
      'emergency callout availability',
      'team and equipment',
      'customer testimonials',
    ],
    bestPostingTimes: ['07:00', '17:00'],
    defaultHashtags: ['#tradie', '#localtradie', '#qualityworkmanship'],
    callToActions: ['Get a free quote', 'Book a callout', 'Available 24/7'],
    contentRatio: { promo: 40, value: 40, community: 20 },
    preferredPlatforms: ['facebook', 'google_business', 'instagram'],
  },
  gym: {
    tone: 'energetic, motivational, supportive',
    themes: [
      'member transformations',
      'class schedules',
      'fitness tips',
      'trainer spotlights',
      'community challenges',
      'workout demonstrations',
    ],
    bestPostingTimes: ['05:30', '12:00', '18:00'],
    defaultHashtags: ['#fitness', '#gymlife', '#strongtogether'],
    callToActions: ['Free trial class', 'See you on the floor', 'Book your session'],
    contentRatio: { promo: 30, value: 50, community: 20 },
    preferredPlatforms: ['instagram', 'facebook'],
  },
  warehouse: {
    tone: 'professional, capability-focused, industry-expert',
    themes: [
      'capability showcases',
      'industry news takes',
      'case studies',
      'team certifications',
      'safety and compliance',
      'partnerships',
    ],
    bestPostingTimes: ['09:00', '14:00'],
    defaultHashtags: ['#logistics', '#supplychain'],
    callToActions: ['Get a quote', 'Schedule a tour', 'Contact our team'],
    contentRatio: { promo: 50, value: 40, community: 10 },
    preferredPlatforms: ['facebook', 'google_business'],
  },
  visa: {
    tone: 'authoritative, helpful, reassuring',
    themes: [
      'visa policy updates',
      'application tips',
      'success stories with consent',
      'common mistakes to avoid',
      'FAQ posts',
      'document checklists',
    ],
    bestPostingTimes: ['10:00', '15:00'],
    defaultHashtags: ['#visa', '#migrationaustralia'],
    callToActions: ['Book a free consult', 'Send us your situation', 'DM for advice'],
    contentRatio: { promo: 20, value: 60, community: 20 },
    preferredPlatforms: ['facebook', 'google_business'],
  },
  other: {
    tone: 'professional and approachable',
    themes: ['business updates', 'service highlights', 'community engagement'],
    bestPostingTimes: ['12:00', '18:00'],
    defaultHashtags: ['#smallbusiness'],
    callToActions: ['Get in touch', 'Visit us'],
    contentRatio: { promo: 40, value: 40, community: 20 },
    preferredPlatforms: ['facebook', 'instagram'],
  },
}

export function getSocialIndustryConfig(industry: string): SocialIndustryConfig {
  return SOCIAL_INDUSTRY_CONFIGS[industry] ?? SOCIAL_INDUSTRY_CONFIGS.other
}

export function buildSocialSystemPrompt(industry: string, businessName: string): string {
  const cfg = getSocialIndustryConfig(industry)
  return `You are Aria, the social media manager for ${businessName} (a ${industry} business).

TONE: ${cfg.tone}

CONTENT THEMES (rotate across):
${cfg.themes.map(t => '- ' + t).join('\n')}

CONTENT MIX (per 10 posts):
- Promotional: ${cfg.contentRatio.promo}%
- Value/educational: ${cfg.contentRatio.value}%
- Community/relational: ${cfg.contentRatio.community}%

BEST POSTING TIMES (when followers are active):
${cfg.bestPostingTimes.join(', ')}

WHEN WRITING CAPTIONS:
- Match the tone above
- Keep Instagram captions under 150 chars before the "more" cut-off
- Facebook can be 1-3 sentences
- End with a clear call to action like: ${cfg.callToActions.join(', or ')}
- Include 3-5 relevant hashtags (mix ${cfg.defaultHashtags.join(', ')} with post-specific tags)

NEVER:
- Use generic phrases like "check it out"
- Sound like AI
- Overuse emojis (max 2 per caption)
- Make claims you can't back up
- Discount aggressively unless owner explicitly requested`
}