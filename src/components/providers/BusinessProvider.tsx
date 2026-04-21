'use client';
import { createContext, useContext } from 'react';

interface Business {
  id: string;
  user_id: string;
  name: string;
  owner_name: string | null;
  industry: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  staff_count: string | null;
  monthly_revenue: string | null;
  biggest_challenge: string | null;
  google_business_url: string | null;
  google_rating: number;
  google_review_count: number;
  plan: 'starter' | 'growth' | 'pro';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string;
  onboarding_complete: boolean;
  created_at: string;
}

const BusinessContext = createContext<Business | null>(null);

export function BusinessProvider({ business, children }: { business: Business; children: React.ReactNode }) {
  return <BusinessContext.Provider value={business}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): Business {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used within BusinessProvider');
  return ctx;
}
