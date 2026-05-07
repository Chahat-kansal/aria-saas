import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Aria OS',
  description: 'Privacy policy for Aria OS — AI operating system for local business. Learn how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#030510', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 768, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Back link */}
        <Link href="/" style={{ display: 'inline-block', fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', marginBottom: 40 }}>
          ← Back to Aria
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#8B5CF6', letterSpacing: '-0.02em', marginBottom: 20 }}>
            Aria OS
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'rgba(220,240,255,0.93)', letterSpacing: '-0.02em', marginBottom: 12 }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(130,160,200,0.6)' }}>Last updated: 6 May 2026</p>
          <p style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', marginTop: 16, lineHeight: 1.65 }}>
            This Privacy Policy explains how Aria OS (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and protects
            the information you provide when using our platform at{' '}
            <a href="https://aria-saas-fot6.vercel.app" style={{ color: '#8B5CF6' }}>
              https://aria-saas-fot6.vercel.app
            </a>
            . By using Aria OS, you agree to this policy.
          </p>
        </div>

        {/* Sections */}
        {[
          {
            title: '1. What We Collect',
            content: (
              <>
                <p>We collect the following information to operate the Aria OS platform:</p>
                <ul>
                  <li><strong>Business information</strong> — your business name, industry type, city, and description that you provide during onboarding.</li>
                  <li><strong>Point of sale data</strong> — sales transactions, product catalogues, inventory levels, customer records, and staff information entered by the business owner.</li>
                  <li><strong>Social media access tokens</strong> — when you voluntarily connect Instagram, Facebook, or Google Business Profile, we store an OAuth access token to post content on your behalf.</li>
                  <li><strong>Usage data</strong> — how you interact with the platform, including which features you use and when, to improve the service and generate accurate AI recommendations.</li>
                  <li><strong>Authentication data</strong> — your email address and encrypted password managed by Supabase Auth.</li>
                </ul>
                <p>We do not collect payment card details. Billing, where applicable, is handled entirely by Stripe and is not stored on our systems.</p>
              </>
            ),
          },
          {
            title: '2. How We Use Your Data',
            content: (
              <>
                <p>We use your data solely to operate and improve Aria OS. Specifically:</p>
                <ul>
                  <li>To operate the Aria POS terminal and process sales transactions.</li>
                  <li>To generate AI-powered business insights, daily briefings, and profit analysis using Anthropic Claude.</li>
                  <li>To create social media post suggestions based on your real sales data, top-selling products, and upcoming events.</li>
                  <li>To generate weekly stock order recommendations based on sales velocity, weather forecasts, and public holidays.</li>
                  <li>To provide weather, holiday, and market intelligence relevant to your specific business type and location.</li>
                  <li>To detect low-stock situations, missed demand, and profit leaks proactively.</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  <strong style={{ color: 'rgba(220,240,255,0.93)' }}>We do not sell your data to third parties.</strong> Your business data is never shared with other businesses or used for advertising purposes.
                </p>
                <p>
                  <strong style={{ color: 'rgba(220,240,255,0.93)' }}>We do not use your data to train AI models.</strong> Your data is sent to Anthropic&rsquo;s API for real-time analysis only and is not retained by Anthropic for training purposes under their API terms.
                </p>
              </>
            ),
          },
          {
            title: '3. Social Media Integrations',
            content: (
              <>
                <p>Aria OS optionally integrates with Facebook, Instagram, and Google Business Profile to help you manage your social media presence.</p>
                <ul>
                  <li>When you connect a social platform, we store an OAuth access token issued by that platform. This token allows us to post content on your behalf.</li>
                  <li>We only post content that you have explicitly reviewed and approved within the Aria Social Media Manager.</li>
                  <li>You can disconnect any social platform at any time from the Social Media settings page within your Aria dashboard.</li>
                  <li>When you disconnect, we immediately delete the stored access token.</li>
                </ul>
                <p><strong style={{ color: 'rgba(220,240,255,0.93)' }}>Permissions we request:</strong></p>
                <ul>
                  <li><code style={{ background: '#0A0E1E', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>pages_manage_posts</code> — to publish approved posts to your Facebook Page</li>
                  <li><code style={{ background: '#0A0E1E', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>pages_read_engagement</code> — to read engagement data on your posts</li>
                  <li><code style={{ background: '#0A0E1E', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>instagram_basic</code> — to read your Instagram account details</li>
                  <li><code style={{ background: '#0A0E1E', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>instagram_content_publish</code> — to publish approved content to your Instagram account</li>
                  <li><code style={{ background: '#0A0E1E', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>pages_show_list</code> — to identify which Facebook Pages you manage</li>
                  <li><code style={{ background: '#0A0E1E', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>business.manage</code> — to access your Google Business Profile for posting</li>
                </ul>
                <p>If you remove Aria OS from your Facebook Apps (Facebook Settings → Security and Login → Apps and Websites → Remove), Facebook will automatically send a deletion request to our system and we will remove all associated tokens within 24 hours.</p>
              </>
            ),
          },
          {
            title: '4. Data Storage',
            content: (
              <>
                <ul>
                  <li>All data is stored in Supabase (PostgreSQL) hosted in data centres located in Australia (Sydney region).</li>
                  <li>All data is encrypted at rest using AES-256 encryption and in transit using TLS 1.2 or higher.</li>
                  <li>Access to your data is enforced by Row Level Security (RLS) — each user can only read and write their own business&rsquo;s data.</li>
                  <li>Certain sensitive tokens (such as Square API credentials) are additionally encrypted at the application layer before storage.</li>
                  <li>Database access credentials are stored as environment variables and never exposed in source code.</li>
                </ul>
              </>
            ),
          },
          {
            title: '5. Third-Party Services',
            content: (
              <>
                <p>Aria OS integrates with the following third-party services. Each is subject to its own privacy policy:</p>
                <ul>
                  <li><strong>Anthropic Claude</strong> — AI analysis and content generation. Your data is sent via API for real-time processing. <a href="https://www.anthropic.com/privacy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Supabase</strong> — database and authentication infrastructure. <a href="https://supabase.com/privacy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Vercel</strong> — hosting and deployment platform. <a href="https://vercel.com/legal/privacy-policy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Meta (Facebook / Instagram)</strong> — social media posting when you connect your accounts. <a href="https://www.facebook.com/privacy/policy/" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Google</strong> — Google Business Profile posting when connected. <a href="https://policies.google.com/privacy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Square</strong> — POS data import when you connect your Square account. <a href="https://squareup.com/au/en/legal/general/privacy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Open Food Facts</strong> — open-source barcode product database used for product lookups during barcode scanning. No personal data is sent.</li>
                  <li><strong>Open-Meteo</strong> — weather forecast data used to provide business-relevant weather intelligence. No personal data is sent.</li>
                  <li><strong>Unsplash</strong> — stock photo suggestions for social media posts. No personal data is sent. <a href="https://unsplash.com/privacy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                  <li><strong>Resend</strong> — transactional email delivery. <a href="https://resend.com/legal/privacy-policy" style={{ color: '#8B5CF6' }}>Privacy Policy</a></li>
                </ul>
              </>
            ),
          },
          {
            title: '6. Your Rights (Australian Privacy Act 1988)',
            content: (
              <>
                <p>Under the Australian Privacy Act 1988 and the Australian Privacy Principles (APPs), you have the following rights:</p>
                <ul>
                  <li><strong>Right to access</strong> — you may request a copy of the personal information we hold about you.</li>
                  <li><strong>Right to correction</strong> — you may request we correct any inaccurate or outdated information.</li>
                  <li><strong>Right to deletion</strong> — you may request deletion of your account and all associated data. See our <a href="/data-deletion" style={{ color: '#8B5CF6' }}>Data Deletion</a> page for instructions.</li>
                  <li><strong>Right to withdraw consent</strong> — you may withdraw consent for any data processing at any time by contacting us. Note that withdrawing consent for core processing may affect your ability to use the platform.</li>
                  <li><strong>Right to complain</strong> — if you believe we have breached the Privacy Act, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at <a href="https://www.oaic.gov.au" style={{ color: '#8B5CF6' }}>oaic.gov.au</a>.</li>
                </ul>
                <p>To exercise any of these rights, contact us at <a href="mailto:cnkansal1105@gmail.com" style={{ color: '#8B5CF6' }}>cnkansal1105@gmail.com</a>. We will respond within 30 days.</p>
              </>
            ),
          },
          {
            title: '7. Data Retention',
            content: (
              <>
                <ul>
                  <li>Data for active accounts is retained while your account remains active.</li>
                  <li>When you delete your account, all personal identifiers and business data are removed within 30 days.</li>
                  <li>Sales transaction records may be retained for up to 7 years in anonymised form for Australian tax compliance purposes, as required under the <em>Tax Administration Act 1953</em> and ATO record-keeping obligations.</li>
                  <li>Audit logs are retained for 12 months for security and compliance purposes.</li>
                  <li>OAuth access tokens for disconnected social media accounts are deleted immediately upon disconnection.</li>
                </ul>
              </>
            ),
          },
          {
            title: '8. Cookies',
            content: (
              <>
                <ul>
                  <li>We use session cookies strictly for authentication purposes — to keep you logged in between visits.</li>
                  <li>We do not use advertising cookies, tracking pixels, or cross-site tracking of any kind.</li>
                  <li>We do not use Google Analytics or any third-party analytics that track individual users.</li>
                  <li>You can disable cookies in your browser settings, but this will prevent you from staying logged in.</li>
                </ul>
              </>
            ),
          },
          {
            title: '9. Changes to This Policy',
            content: (
              <>
                <p>We may update this Privacy Policy from time to time. When we make material changes, we will:</p>
                <ul>
                  <li>Update the &ldquo;Last updated&rdquo; date at the top of this page.</li>
                  <li>Notify active users by email at least 14 days before the changes take effect.</li>
                  <li>For significant changes, we may require you to acknowledge the updated policy before continuing to use the platform.</li>
                </ul>
              </>
            ),
          },
          {
            title: '10. Contact Us',
            content: (
              <>
                <p>For any privacy-related questions, requests, or complaints:</p>
                <ul>
                  <li><strong>Email:</strong> <a href="mailto:cnkansal1105@gmail.com" style={{ color: '#8B5CF6' }}>cnkansal1105@gmail.com</a></li>
                  <li><strong>Business:</strong> Aria OS, Australia</li>
                  <li><strong>Response time:</strong> Within 5 business days for enquiries; within 30 days for formal access or deletion requests.</li>
                </ul>
              </>
            ),
          },
        ].map(section => (
          <div key={section.title} style={{ background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16, letterSpacing: '-0.01em' }}>
              {section.title}
            </h2>
            <div style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75 }}>
              {section.content}
            </div>
          </div>
        ))}

        {/* Footer */}
        <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.35)', textAlign: 'center', marginTop: 40 }}>
          © 2026 Aria OS · Australia · <a href="mailto:cnkansal1105@gmail.com" style={{ color: 'rgba(130,160,200,0.5)', textDecoration: 'none' }}>cnkansal1105@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
