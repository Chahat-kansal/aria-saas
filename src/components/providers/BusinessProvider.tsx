'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export interface Business {
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

interface BusinessContextValue {
  business: Business;
  allBusinesses: Business[];
  switchBusiness: (id: string) => Promise<void>;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({
  business: initialBusiness,
  allBusinesses: initialAll,
  children,
}: {
  business: Business;
  allBusinesses: Business[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [business, setBusiness] = useState<Business>(initialBusiness);
  const [allBusinesses] = useState<Business[]>(initialAll);

  const switchBusiness = useCallback(async (id: string) => {
    const target = allBusinesses.find(b => b.id === id);
    if (!target) {
      router.push('/businesses');
      return;
    }
    localStorage.setItem('aria_active_business_id', id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: existing } = await supabase
        .from('user_active_business')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        await supabase.from('user_active_business')
          .update({ business_id: id, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase.from('user_active_business').insert({ user_id: user.id, business_id: id });
      }
    }
    setBusiness(target);
    router.refresh();
  }, [allBusinesses, router]);

  return (
    <BusinessContext.Provider value={{ business, allBusinesses, switchBusiness }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness(): Business {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used within BusinessProvider');
  return ctx.business;
}

export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusinessContext must be used within BusinessProvider');
  return ctx;
}