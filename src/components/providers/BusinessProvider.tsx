'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  google_rating: number | null;
  google_review_count: number | null;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  onboarding_complete: boolean | null;
  created_at: string;
  logo_url: string | null;
  abn: string | null;
  website: string | null;
  is_active: boolean | null;
  subscription_status: string | null;
}

interface BusinessContextType {
  business: Business | null;
  allBusinesses: Business[];
  loading: boolean;
  switchBusiness: (id: string) => Promise<void>;
  refreshBusiness: () => Promise<void>;
  refreshAllBusinesses: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType>({
  business: null,
  allBusinesses: [],
  loading: true,
  switchBusiness: async () => {},
  refreshBusiness: async () => {},
  refreshAllBusinesses: async () => {},
});

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [allBusinesses, setAllBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllBusinesses = useCallback(async (): Promise<Business[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching businesses:', error);
      return [];
    }
    return data || [];
  }, []);

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const businesses = await fetchAllBusinesses();
      setAllBusinesses(businesses);

      if (businesses.length === 0) {
        setBusiness(null);
        setLoading(false);
        router.push('/onboarding/industry');
        return;
      }

      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem('aria_active_business_id')
        : null;
      const savedBusiness = savedId ? businesses.find(b => b.id === savedId) : null;
      const activeBusiness = savedBusiness || businesses[0];
      setBusiness(activeBusiness);

      if (!savedId && activeBusiness) {
        localStorage.setItem('aria_active_business_id', activeBusiness.id);
      }
    } catch (err) {
      console.error('BusinessProvider error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchAllBusinesses, router]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  const switchBusiness = useCallback(async (id: string) => {
    const target = allBusinesses.find(b => b.id === id);
    if (!target) return;
    setBusiness(target);
    localStorage.setItem('aria_active_business_id', id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_active_business').upsert(
        { user_id: user.id, business_id: id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    }
  }, [allBusinesses]);

  const refreshBusiness = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase.from('businesses').select('*').eq('id', business.id).single();
    if (data) setBusiness(data);
  }, [business]);

  const refreshAllBusinesses = useCallback(async () => {
    const businesses = await fetchAllBusinesses();
    setAllBusinesses(businesses);
  }, [fetchAllBusinesses]);

  return (
    <BusinessContext.Provider value={{
      business, allBusinesses, loading,
      switchBusiness, refreshBusiness, refreshAllBusinesses,
    }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness(): Business | null {
  return useContext(BusinessContext).business;
}

export function useBusinessContext(): BusinessContextType {
  return useContext(BusinessContext);
}