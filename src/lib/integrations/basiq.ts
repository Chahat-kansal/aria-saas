// Basiq Australian bank-feed client
// Docs: https://api.basiq.io/reference

const BASIQ_BASE = 'https://au-api.basiq.io';

interface TokenResp { access_token: string; expires_in: number }

// Bearer tokens are 60-minute scoped — keep in-memory cache
let cached: { token: string; expires_at: number } | null = null;

export async function getServerToken(scope: 'SERVER_ACCESS' | 'CLIENT_ACCESS' = 'SERVER_ACCESS'): Promise<string> {
  if (cached && Date.now() < cached.expires_at - 60_000) return cached.token;
  const key = process.env.BASIQ_API_KEY;
  if (!key) throw new Error('BASIQ_API_KEY not set');

  const res = await fetch(`${BASIQ_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'basiq-version': '3.0',
    },
    body: `scope=${scope}`,
  });
  if (!res.ok) {
    const tokenText = await res.text();
    console.error('[basiq/token] failed:', res.status, tokenText);
    throw new Error(`Basiq token failed: ${res.status} ${tokenText}`);
  }
  const j = await res.json() as TokenResp;
  cached = { token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function basiqFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getServerToken();
  const hasBody = init?.body != null;
  const res = await fetch(`${BASIQ_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'basiq-version': '3.0',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[basiq] failed:', path, res.status, text);
    throw new Error(`Basiq ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface BasiqUser { id: string; email: string }
export interface BasiqAccount {
  id: string;
  name: string;
  accountNo?: string;
  balance: string;
  availableFunds: string;
  currency: string;
  class?: { type: string };
  institution: string;
}
export interface BasiqTransaction {
  id: string;
  description: string;
  amount: string;
  balance: string;
  postDate: string | null;
  transactionDate: string | null;
  direction: 'debit' | 'credit';
  class?: string | null;
  subClass?: { title?: string } | null;
  account: string;
}
export interface BasiqInstitution { id: string; name: string; shortName?: string }

export async function createUser(email: string): Promise<BasiqUser> {
  return basiqFetch<BasiqUser>('/users', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function deleteUser(userId: string): Promise<void> {
  const token = await getServerToken();
  await fetch(`${BASIQ_BASE}/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'basiq-version': '3.0' },
  });
}

export async function createAuthLink(userId: string, businessId: string): Promise<{ url: string; expiresAt?: string }> {
  // Redirect URL is configured in Basiq Dashboard → Customise UI.
  // We pass business_id via Basiq's ?state= param — it is appended to the redirect URL by Basiq.
  const res = await basiqFetch<{ links?: { public?: string }; expiresAt?: string }>(
    `/users/${userId}/auth_link`,
    { method: 'POST' },
  );
  const rawUrl = res.links?.public ?? '';
  // Append state=businessId so the callback can resolve the business
  const url = rawUrl ? `${rawUrl}&state=${encodeURIComponent(businessId)}` : '';
  return { url, expiresAt: res.expiresAt };
}

interface AccountsListResp { data?: BasiqAccount[] }
export async function listAccounts(userId: string): Promise<BasiqAccount[]> {
  const res = await basiqFetch<AccountsListResp>(`/users/${userId}/accounts`);
  return res.data ?? [];
}

interface TxnListResp { data?: BasiqTransaction[] }
export async function listTransactions(userId: string, sinceDays = 90): Promise<BasiqTransaction[]> {
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
  const res = await basiqFetch<TxnListResp>(
    `/users/${userId}/transactions?filter=transaction.postDate.gte('${since}')&limit=500`,
  );
  return res.data ?? [];
}

export function isConfigured(): boolean {
  return Boolean(process.env.BASIQ_API_KEY);
}
