export const industryConfig = {
  retail: {
    label: 'Retail shop (liquor, convenience, specialty)',
    published: true,
    sidebar: ['dashboard', 'pos', 'winback', 'slow-day', 'reviews', 'profit-leaks', 'competitors', 'churn', 'reorder', 'receipt-scan', 'website-chat'],
    dashboard_modules: ['revenue', 'pos_today', 'winback', 'reviews', 'profit_leaks', 'inventory_alerts'],
    show_pos: true,
    show_visa: false,
    show_bookings: false,
  },
  cafe: {
    label: 'Café or coffee shop',
    published: true,
    sidebar: ['dashboard', 'pos', 'winback', 'slow-day', 'reviews', 'profit-leaks', 'competitors', 'churn', 'reorder', 'receipt-scan', 'website-chat'],
    dashboard_modules: ['revenue', 'pos_today', 'winback', 'slow_day', 'reviews', 'waste_alerts'],
    show_pos: true,
    show_visa: false,
    show_bookings: false,
  },
  restaurant: {
    label: 'Restaurant or food service',
    published: true,
    sidebar: ['dashboard', 'pos', 'winback', 'slow-day', 'reviews', 'profit-leaks', 'competitors', 'churn', 'reorder', 'receipt-scan', 'website-chat'],
    dashboard_modules: ['revenue', 'pos_today', 'winback', 'slow_day', 'reviews', 'waste_alerts'],
    show_pos: true,
    show_visa: false,
    show_bookings: false,
  },
  tradie: {
    label: 'Tradie',
    published: false,
    sidebar: ['dashboard', 'bookings', 'quote-builder', 'winback', 'reviews', 'compliance', 'churn', 'website-chat'],
    dashboard_modules: ['revenue', 'bookings_today', 'quotes_pending', 'reviews', 'upcoming_jobs'],
    show_pos: false,
    show_visa: false,
    show_bookings: true,
  },
  realestate: {
    label: 'Real Estate',
    published: false,
    sidebar: ['dashboard', 'bookings', 'winback', 'reviews', 'competitors', 'churn', 'compliance', 'website-chat'],
    dashboard_modules: ['revenue', 'listings_active', 'inspections_today', 'leads', 'reviews'],
    show_pos: false,
    show_visa: false,
    show_bookings: true,
  },
  salon: {
    label: 'Salon / Beauty',
    published: false,
    sidebar: ['dashboard', 'bookings', 'winback', 'slow-day', 'reviews', 'churn', 'profit-leaks', 'website-chat'],
    dashboard_modules: ['revenue', 'bookings_today', 'winback', 'slow_day', 'reviews', 'top_services'],
    show_pos: false,
    show_visa: false,
    show_bookings: true,
  },
  visa: {
    label: 'Visa / Migration Agent',
    published: false,
    sidebar: ['dashboard', 'visa/clients', 'visa/applications', 'visa/documents', 'visa/alerts', 'visa/news', 'visa/ask', 'website-chat'],
    dashboard_modules: ['active_clients', 'applications_pending', 'alerts', 'expiring_visas', 'news'],
    show_pos: false,
    show_visa: true,
    show_bookings: false,
  },
  gym: {
    label: 'Gym / Fitness',
    published: false,
    sidebar: ['dashboard', 'bookings', 'winback', 'slow-day', 'reviews', 'churn', 'profit-leaks', 'website-chat'],
    dashboard_modules: ['revenue', 'members_active', 'classes_today', 'winback', 'churn_risk'],
    show_pos: false,
    show_visa: false,
    show_bookings: true,
  },
  professional: {
    label: 'Professional Services',
    published: false,
    sidebar: ['dashboard', 'bookings', 'quote-builder', 'winback', 'reviews', 'compliance', 'churn', 'website-chat'],
    dashboard_modules: ['revenue', 'clients_active', 'appointments_today', 'quotes_pending', 'reviews'],
    show_pos: false,
    show_visa: false,
    show_bookings: true,
  },
} as const;

export type Industry = keyof typeof industryConfig;

export const publishedIndustries = (Object.entries(industryConfig) as [Industry, typeof industryConfig[Industry]][])
  .filter(([, cfg]) => (cfg as any).published === true)
  .map(([id, cfg]) => ({ id, label: cfg.label }));
