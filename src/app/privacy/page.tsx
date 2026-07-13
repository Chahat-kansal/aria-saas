import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Aria OS',
  description: 'Privacy Policy for Aria OS',
}

export default function PrivacyPage() {
  const updated = '20 May 2026'
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 120px', fontFamily: 'Inter, system-ui, sans-serif', color: '#1a1a2e', lineHeight: 1.7 }}>
      <div style={{ marginBottom: 48 }}>
        <a href="/" style={{ fontSize: 14, color: '#2D5240', textDecoration: 'none', fontWeight: 600 }}>← Aria OS</a>
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.5px' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: 48 }}>Last updated: {updated}</p>

      <p style={{ marginBottom: 32 }}>Aria OS ("we", "us", "our") operates the Aria OS platform at ariaos.site. This policy explains how we collect, use, and protect your information.</p>

      {[
        { title: '1. Information We Collect', items: [
          'Account information: name, email address, and password.',
          'Business information: business name, ABN, address, industry, and operating hours.',
          'POS data: sales transactions, inventory, customer records, and staff data you enter.',
          'Google reviews: if you connect your Google Business Profile, we sync your public reviews.',
          'Social media tokens: if you connect Facebook/Instagram/Google Business, we store access tokens to post on your behalf.',
          'Usage data: pages visited, features used, and platform interactions.',
          'Payment information: processed securely by Stripe — we do not store card numbers.',
        ]},
        { title: '2. How We Use Your Information', items: [
          'To provide and operate the Aria OS platform.',
          'To generate AI-powered business insights, recommendations, and automated reports.',
          'To send operational emails: receipts, alerts, and weekly digests.',
          'To sync Google reviews and publish social media posts on your behalf.',
          'To improve our services and develop new features.',
        ]},
        { title: '3. AI and Automated Processing', items: [
          'Aria OS uses AI (Anthropic Claude, Google Gemini, OpenAI) to analyse your business data and generate insights.',
          'AI-generated content is always a suggestion — you remain in control of all decisions.',
          'Your data is sent to AI providers only to generate responses. They do not train on your data under enterprise API terms.',
        ]},
        { title: '4. Data Sharing', items: [
          'We do not sell your personal information.',
          'We share data with service providers: Supabase (database), Vercel (hosting), Stripe (payments), Resend (email), ClickSend (SMS), Anthropic/Google/OpenAI (AI).',
          'We may share data if required by Australian law.',
          'Facebook/Instagram data is handled in accordance with Meta\'s terms.',
        ]},
        { title: '5. Facebook and Instagram Data', items: [
          'When you connect Facebook or Instagram, we receive access tokens to post content on your behalf.',
          'We only post content you explicitly create or approve in Aria OS.',
          'You can disconnect at any time from Social Media settings.',
          'To request deletion of your Facebook-related data, email privacy@ariaos.site.',
          'We do not share your Facebook data with third parties beyond what is required to operate posting.',
        ]},
        { title: '6. Data Storage and Security', items: [
          'Data is stored on servers in the United States (Supabase, Vercel).',
          'All data in transit is encrypted using TLS/SSL.',
          'Database access is protected by row-level security policies.',
        ]},
        { title: '7. Your Rights (Australian Privacy Act)', items: [
          'Access: Request a copy of your personal information.',
          'Correction: Ask us to correct inaccurate information.',
          'Deletion: Request deletion by emailing privacy@ariaos.site.',
          'Portability: Export your data from the Settings page at any time.',
          'Complaints: Contact the Office of the Australian Information Commissioner (OAIC).',
        ]},
        { title: '8. Contact Us', items: [
          'Privacy questions: privacy@ariaos.site',
          'Aria OS is operated from Melbourne, Victoria, Australia.',
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
