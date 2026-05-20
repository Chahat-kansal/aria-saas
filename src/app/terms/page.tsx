import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Aria OS',
  description: 'Terms of Service for Aria OS',
}

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 120px', fontFamily: 'Inter, system-ui, sans-serif', color: '#1a1a2e', lineHeight: 1.7 }}>
      <div style={{ marginBottom: 48 }}>
        <a href="/" style={{ fontSize: 14, color: '#2D5240', textDecoration: 'none', fontWeight: 600 }}>← Aria OS</a>
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.5px' }}>Terms of Service</h1>
      <p style={{ color: '#666', marginBottom: 48 }}>Last updated: 20 May 2026</p>

      <p style={{ marginBottom: 32 }}>By using Aria OS, you agree to these terms. Please read them carefully.</p>

      {[
        { title: '1. Service', items: [
          'Aria OS provides AI-powered business management software for Australian small businesses.',
          'We reserve the right to modify or discontinue the service with 30 days notice.',
          'You must be at least 18 years old and have authority to enter into agreements for your business.',
        ]},
        { title: '2. Account', items: [
          'You are responsible for maintaining the security of your account credentials.',
          'You are responsible for all activity that occurs under your account.',
          'Notify us immediately at support@ariaos.site of any unauthorised access.',
        ]},
        { title: '3. Acceptable Use', items: [
          'Use Aria OS only for lawful business purposes.',
          'Do not attempt to access other users\' data or reverse-engineer the platform.',
          'Do not use the AI features to generate misleading, harmful, or illegal content.',
          'Comply with Meta\'s Platform Policy when using social media posting features.',
        ]},
        { title: '4. AI-Generated Content', items: [
          'AI-generated insights, recommendations, and content are provided for informational purposes only.',
          'Aria OS does not guarantee the accuracy of AI-generated content.',
          'You are solely responsible for reviewing and approving any AI-generated content before publishing.',
          'AI-generated financial or business advice does not substitute professional advice.',
        ]},
        { title: '5. Payment and Billing', items: [
          'Subscription fees are billed monthly or annually in advance in Australian dollars.',
          'Payments are processed by Stripe. Aria OS does not store payment card information.',
          'Subscriptions auto-renew unless cancelled before the renewal date.',
          'Refunds are provided at our discretion for billing errors.',
        ]},
        { title: '6. Data Ownership', items: [
          'You retain ownership of all data you enter into Aria OS.',
          'You grant us a licence to process your data solely to provide the service.',
          'You can export your data at any time from the Settings page.',
          'Upon account termination, we will delete your data within 30 days.',
        ]},
        { title: '7. Limitation of Liability', items: [
          'Aria OS is provided "as is" without warranties of any kind.',
          'We are not liable for any loss of business, revenue, or data arising from use of the platform.',
          'Our total liability to you shall not exceed the amount paid in the last 3 months.',
          'Nothing in these terms excludes liability that cannot be excluded under Australian Consumer Law.',
        ]},
        { title: '8. Termination', items: [
          'You may cancel your account at any time from the Settings page.',
          'We may terminate or suspend your account for breach of these terms with reasonable notice.',
          'Upon termination, your right to use the service ends immediately.',
        ]},
        { title: '9. Governing Law', items: [
          'These terms are governed by the laws of Victoria, Australia.',
          'Any disputes shall be resolved in the courts of Victoria, Australia.',
        ]},
        { title: '10. Contact', items: [
          'Questions about these terms: support@ariaos.site',
          'Aria OS, Melbourne, Victoria, Australia.',
        ]},
      ].map(s => (
        <section key={s.title} style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{s.title}</h2>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {s.items.map((item, i) => <li key={i} style={{ marginBottom: 8, color: '#333' }}>{item}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
