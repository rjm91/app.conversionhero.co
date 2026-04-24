export const metadata = {
  title: 'Privacy Policy — ConversionHero',
  description: 'Privacy Policy for ConversionHero Client Payments',
}

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-900 dark:text-gray-100">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">Last updated: April 24, 2026</p>

      <section className="space-y-6 leading-relaxed">
        <p>
          ConversionHero (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the application available at
          app.conversionhero.co (the &quot;Service&quot;). This Privacy Policy explains how we collect, use, and
          protect information in connection with the Service, including data accessed via the QuickBooks Online API.
        </p>

        <h2 className="text-xl font-semibold pt-4">1. Information We Collect</h2>
        <p>
          When you connect your QuickBooks Online account to the Service, we access invoice and customer data
          (including invoice ID, date, amount, customer name, and description) solely for the purpose of displaying
          your payment history within your ConversionHero dashboard. We also collect account information you provide
          directly, such as name and email address.
        </p>

        <h2 className="text-xl font-semibold pt-4">2. How We Use Information</h2>
        <p>
          We use the information we collect to operate, maintain, and improve the Service; to display your financial
          and client data within your dashboard; to authenticate users; and to communicate with you about your
          account. We do not sell your data to third parties.
        </p>

        <h2 className="text-xl font-semibold pt-4">3. Storage and Security</h2>
        <p>
          Data is stored securely in our managed database (Supabase) and accessed via encrypted (HTTPS) connections.
          OAuth tokens for QuickBooks are stored encrypted at rest and used only to refresh access to your data on
          your behalf. We follow industry-standard practices to protect your information, but no system is 100% secure.
        </p>

        <h2 className="text-xl font-semibold pt-4">4. Data Sharing</h2>
        <p>
          We do not share your QuickBooks data with third parties except as required to operate the Service (for
          example, our hosting and database providers). We may disclose information if required by law or to protect
          the rights and safety of our users.
        </p>

        <h2 className="text-xl font-semibold pt-4">5. Your Rights</h2>
        <p>
          You may disconnect your QuickBooks account at any time from within the Service, which revokes our access
          tokens. You may request deletion of your account and associated data by contacting us at the email below.
        </p>

        <h2 className="text-xl font-semibold pt-4">6. Cookies</h2>
        <p>
          The Service uses cookies and similar technologies for authentication and session management. You can
          control cookie settings through your browser.
        </p>

        <h2 className="text-xl font-semibold pt-4">7. Children&apos;s Privacy</h2>
        <p>
          The Service is not directed to individuals under the age of 16, and we do not knowingly collect personal
          information from children.
        </p>

        <h2 className="text-xl font-semibold pt-4">8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be posted on this page with an
          updated &quot;Last updated&quot; date.
        </p>

        <h2 className="text-xl font-semibold pt-4">9. Contact</h2>
        <p>
          Questions about this Privacy Policy can be sent to{' '}
          <a href="mailto:ryan@conversionhero.co" className="text-blue-600 dark:text-blue-400 underline">
            ryan@conversionhero.co
          </a>.
        </p>
      </section>
    </main>
  )
}
