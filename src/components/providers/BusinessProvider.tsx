'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Business {
  id: string;
  user_id: string;
  name: string;
  owner_name: string | null;
  industry: string | null;
  industry_subtype: string | null;
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
  data_source: string | null;
  square_connected: boolean | null;
  pos_enabled: boolean | null;
  business_model: string | null;
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
      .or('is_active.eq.true,is_active.is.null')
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
      if (businesses.length === 0) { setBusiness(null); setLoading(false); return; }

      // ── Reconcile: DB is source of truth ──
      const { data: { user } } = await supabase.auth.getUser();
      let activeId: string | null = null;
      if (user) {
        const { data: dbActive } = await supabase
          .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
        if (dbActive?.business_id && businesses.some(b => b.id === dbActive.business_id)) {
          activeId = dbActive.business_id;
        }
      }
      // If DB has no active or active doesn't exist in user's businesses, fall back
      if (!activeId) {
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('aria_active_business_id') : null;
        const savedExists = savedId && businesses.some(b => b.id === savedId);
        activeId = savedExists ? savedId : businesses[0].id;
        // Persist this fallback so future loads agree
        if (user) {
          await supabase.from('user_active_business').upsert(
            { user_id: user.id, business_id: activeId, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        }
      }
      const activeBusiness = businesses.find(b => b.id === activeId) || businesses[0];
      setBusiness(activeBusiness);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aria_active_business_id', activeBusiness.id);
      }
    } catch (err) {
      console.error('BusinessProvider error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchAllBusinesses]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  const switchBusiness = useCallback(async (id: string) => {
    const target = allBusinesses.find(b => b.id === id);
    if (!target) return;
    const previousId = business?.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // DB FIRST — single source of truth
    const { error } = await supabase.from('user_active_business').upsert(
      { user_id: user.id, business_id: id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.error('switchBusiness DB upsert failed:', error);
      return; // do NOT update local state if DB failed
    }
    // Only after DB success: update local state + localStorage
    setBusiness(target);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aria_active_business_id', id);
      // Clear cart so it doesn't bleed into the new business
      sessionStorage.removeItem('aria_pos_cart_v1');
      // Broadcast — all listeners (terminal, product list) reset
      window.dispatchEvent(new CustomEvent('aria:business-changed', {
        detail: { previousId, newId: id }
      }));
    }
  }, [allBusinesses, business?.id]);

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