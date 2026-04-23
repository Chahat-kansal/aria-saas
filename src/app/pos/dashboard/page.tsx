'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Stats { today_revenue: number; today_count: number; low_stock: number; open_session: boolean; }

export default function POSDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch(`/api/pos/reports?from=${today}&to=${today}`).then(r => r.json()),
      fetch('/api/pos/products').then(r => r.json()),
      fetch('/api/pos/sessions').then(r => r.json()),
    ]).then(([rep, prod, sess]) => {
      const prods = prod.products ?? [];
      const lowStock = prods.filter((p: any) => p.track_stock && p.stock_quantity != null && p.low_stock_threshold != null && p.stock_quantity <= p.low_stock_threshold).length;
      setStats({
        today_revenue: rep.summary?.total_revenue ?? 0,
        today_count: rep.summary?.transaction_count ?? 0,
        low_stock: lowStock,
        open_session: !!sess.openSession,
      });
      setLoading(false);
    });
  }, []);

  const cards = [
    { label: "Today's Revenue", value: loading ? '—' : `$${stats!.today_revenue.toFixed(2)}`, color: '#16a34a', href: '/pos/reports/sales' },
    { label: 'Transactions Today', value: loading ? '—' : String(stats!.today_count), color: '#2563eb', href: '/pos/reports/sales' },
    { label: 'Low Stock Items', value: loading ? '—' : String(stats!.low_stock), color: stats?.low_stock ? '#dc2626' : '#16a34a', href: '/pos/products' },
    { label: 'Register', value: loading ? '—' : stats!.open_session ? 'Open' : 'Closed', color: stats?.open_session ? '#16a34a' : '#dc2626', href: '/pos/sessions' },
  ];

  const quickLinks = [
    { label: 'Open Register', href: '/pos/terminal', icon: '🏪' },
    { label: 'Products', href: '/pos/products', icon: '📦' },
    { label: 'Categories', href: '/pos/categories', icon: '🏷️' },
    { label: 'Customers', href: '/pos/customers', icon: '👥' },
    { label: 'Reports', href: '/pos/reports', icon: '📊' },
    { label: 'Sale Keys', href: '/pos/sale-keys', icon: '🔑' },
    { label: 'Outlets', href: '/pos/outlets', icon: '📍' },
    { label: 'Stocktake', href: '/pos/stocktake', icon: '📋' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1a1a16]">POS Dashboard</h1>
        <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Overview for today</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map(c => (
          <Link key={c.label} href={c.href}
            className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:border-[#2563eb] transition-colors group">
            <p className="text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-bold group-hover:opacity-80 transition-opacity" style={{ color: c.color }}>{c.value}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-[rgba(26,26,22,.6)] uppercase tracking-wider mb-3">Quick Access</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map(l => (
          <Link key={l.href} href={l.href}
            className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:border-[#2563eb] hover:shadow-md transition-all text-center">
            <div className="text-2xl mb-2">{l.icon}</div>
            <p className="text-[13px] font-medium text-[#1a1a16]">{l.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}