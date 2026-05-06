import Link from 'next/link';

export const metadata = {
  title: 'Data Deletion Request — Aria OS',
  description: 'Request deletion of your Aria OS account data. Learn how to remove your data and what happens when you disconnect from Facebook or Instagram.',
};

export default function DataDeletionPage() {
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
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'rgba(220,240,255,0.93)', letterSpacing: '-0.02em', marginBottom: 16 }}>
            Data Deletion Request
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.65 }}>
            You have the right to request deletion of all personal data and business data
            associated with your Aria OS account. This page explains how to submit a deletion
            request and what happens to your data afterwards.
          </p>
        </div>

        {/* Section 1 — How to Request */}
        <div style={{ background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 }}>
            1. How to Request Deletion
          </h2>
          <div style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75 }}>
            <p style={{ marginBottom: 16 }}>
              <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Option A — Email request (recommended):</strong>
            </p>
            <div style={{ background: '#030510', border: '1px solid #1A2240', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
              <p>Send an email to{' '}
                <a href="mailto:privacy@aria-os.com" style={{ color: '#8B5CF6' }}>privacy@aria-os.com</a>
                {' '}with:
              </p>
              <ul style={{ marginTop: 8 }}>
                <li>Subject line: <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Data Deletion Request</strong></li>
                <li>Your registered email address</li>
                <li>A brief description of what data you would like deleted</li>
              </ul>
              <p style={{ marginTop: 10 }}>We will confirm receipt within 5 business days and complete deletion within 30 days.</p>
            </div>

            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Option B — Facebook / Instagram app removal:</strong>
            </p>
            <p>
              If you connected Aria OS to your Facebook or Instagram account, you can remove the
              app&rsquo;s access directly through Facebook without emailing us:
            </p>
            <ol style={{ marginTop: 10, marginBottom: 0 }}>
              <li>Go to Facebook Settings</li>
              <li>Navigate to <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Security and Login</strong> → <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Apps and Websites</strong></li>
              <li>Find <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Aria OS</strong> in the list</li>
              <li>Click <strong style={{ color: 'rgba(220,240,255,0.85)' }}>Remove</strong></li>
            </ol>
            <p style={{ marginTop: 10 }}>
              This will automatically trigger our data deletion callback and remove all associated
              Facebook and Instagram access tokens within 24 hours.
            </p>
          </div>
        </div>

        {/* Section 2 — What Gets Deleted */}
        <div style={{ background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 }}>
            2. What Gets Deleted
          </h2>
          <div style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75 }}>
            <p style={{ marginBottom: 12 }}>Upon a confirmed deletion request, the following data is permanently removed:</p>
            <ul>
              <li>Your business profile and all account settings</li>
              <li>All sales transaction records and receipts</li>
              <li>Your complete product and inventory catalogue</li>
              <li>All customer records and loyalty data</li>
              <li>All staff records and access details</li>
              <li>Social media connection tokens (Facebook, Instagram, Google)</li>
              <li>All AI-generated insights, daily briefings, and recommendations</li>
              <li>Social media post history and drafts</li>
              <li>Usage logs and activity history</li>
              <li>All files and uploaded content</li>
              <li>Your authentication credentials and account</li>
            </ul>
          </div>
        </div>

        {/* Section 3 — What We Must Retain */}
        <div style={{ background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 }}>
            3. What We Are Required to Retain
          </h2>
          <div style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75 }}>
            <p>
              Under Australian tax law (
              <em>Tax Administration Act 1953</em> and ATO record-keeping requirements),
              businesses are required to retain financial transaction records for a minimum of 5 years,
              and in some cases up to 7 years.
            </p>
            <p style={{ marginTop: 12 }}>
              As a result, aggregated sales transaction totals may be retained for up to 7 years after
              account deletion. However, <strong style={{ color: 'rgba(220,240,255,0.85)' }}>all personal identifiers will be removed</strong> —
              this means your name, email address, business name, and any other identifying information
              will be deleted. Only anonymised transaction totals required for legal compliance will be kept.
            </p>
            <p style={{ marginTop: 12 }}>
              You will be informed specifically what, if anything, must be retained at the time of your
              deletion request.
            </p>
          </div>
        </div>

        {/* Section 4 — Facebook Data Deletion */}
        <div style={{ background: '#0A0E1E', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 16, padding: '28px 32px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 }}>
            4. Facebook Automated Data Deletion
          </h2>
          <div style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75 }}>
            <p>
              If you connected Aria OS to your Facebook account, Facebook may send an automated data
              deletion request to our system when you remove the app from your Facebook settings. We
              process these requests automatically and will delete all associated Facebook access tokens
              and page data within 24 hours of receiving the request.
            </p>
            <p style={{ marginTop: 14 }}>
              Our data deletion callback endpoint is:
            </p>
            <div style={{ background: '#030510', border: '1px solid #1A2240', borderRadius: 8, padding: '12px 16px', marginTop: 8, fontFamily: 'monospace', fontSize: 13, color: '#8B5CF6', wordBreak: 'break-all' }}>
              https://aria-saas-fot6.vercel.app/api/social/data-deletion
            </div>
            <p style={{ marginTop: 14 }}>
              When Facebook sends a deletion request to this endpoint, we immediately:
            </p>
            <ol>
              <li>Remove all stored Facebook and Instagram access tokens associated with your Facebook user ID</li>
              <li>Delete all social media connection records for your account</li>
              <li>Return a confirmation code that Facebook uses to verify the deletion was completed</li>
            </ol>
            <p style={{ marginTop: 12 }}>
              You can verify the status of your Facebook data deletion by visiting the confirmation link
              provided by Facebook after you remove the app.
            </p>
          </div>
        </div>

        {/* Section 5 — Contact */}
        <div style={{ background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 }}>
            5. Contact
          </h2>
          <div style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75 }}>
            <ul>
              <li><strong style={{ color: 'rgba(220,240,255,0.85)' }}>Email:</strong>{' '}
                <a href="mailto:privacy@aria-os.com" style={{ color: '#8B5CF6' }}>privacy@aria-os.com</a>
              </li>
              <li><strong style={{ color: 'rgba(220,240,255,0.85)' }}>Initial response time:</strong> Within 5 business days</li>
              <li><strong style={{ color: 'rgba(220,240,255,0.85)' }}>Deletion completion time:</strong> Within 30 days of identity confirmation</li>
              <li><strong style={{ color: 'rgba(220,240,255,0.85)' }}>Business:</strong> Aria OS, Australia</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              For more information about how we handle your data, please read our full{' '}
              <Link href="/privacy" style={{ color: '#8B5CF6' }}>Privacy Policy</Link>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.35)', textAlign: 'center', marginTop: 40 }}>
          © 2026 Aria OS · Australia ·{' '}
          <a href="mailto:privacy@aria-os.com" style={{ color: 'rgba(130,160,200,0.5)', textDecoration: 'none' }}>privacy@aria-os.com</a>
        </p>
      </div>
    </div>
  );
}
