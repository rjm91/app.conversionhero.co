export const metadata = {
  title: 'Terms of Service — ConversionHero',
  description: 'End-User License Agreement and Terms of Service for ConversionHero',
}

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-900 dark:text-gray-100">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">Last updated: April 24, 2026</p>

      <section className="space-y-6 leading-relaxed">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the ConversionHero application
          available at app.conversionhero.co (the &quot;Service&quot;), operated by ConversionHero
          (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). By using the Service, you agree to these Terms.
        </p>

        <h2 className="text-xl font-semibold pt-4">1. Eligibility and Account</h2>
        <p>
          You must be at least 18 years old and authorized to bind any organization on whose behalf you act. You are
          responsible for maintaining the confidentiality of your account credentials and for all activity under
          your account.
        </p>

        <h2 className="text-xl font-semibold pt-4">2. License</h2>
        <p>
          Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to
          access and use the Service for your internal business purposes. You may not copy, modify, distribute,
          sell, or reverse engineer any portion of the Service.
        </p>

        <h2 className="text-xl font-semibold pt-4">3. QuickBooks Integration</h2>
        <p>
          The Service integrates with QuickBooks Online via Intuit&apos;s API. By connecting your QuickBooks account,
          you authorize us to access invoice and customer data on your behalf for the purpose of displaying it within
          your dashboard. You may revoke this access at any time by disconnecting from within the Service or via
          your Intuit account settings. Your use of QuickBooks is also governed by Intuit&apos;s terms.
        </p>

        <h2 className="text-xl font-semibold pt-4">4. Acceptable Use</h2>
        <p>
          You agree not to use the Service to: (a) violate any law or third-party rights; (b) upload malicious code;
          (c) attempt to gain unauthorized access to any systems; or (d) interfere with the integrity or
          performance of the Service.
        </p>

        <h2 className="text-xl font-semibold pt-4">5. Data and Privacy</h2>
        <p>
          Our handling of your information is described in our{' '}
          <a href="/privacy" className="text-blue-600 dark:text-blue-400 underline">Privacy Policy</a>, which is
          incorporated into these Terms by reference.
        </p>

        <h2 className="text-xl font-semibold pt-4">6. Fees</h2>
        <p>
          Access to the Service may be subject to fees as agreed between you and ConversionHero. Fees are
          non-refundable except as required by law.
        </p>

        <h2 className="text-xl font-semibold pt-4">7. Termination</h2>
        <p>
          We may suspend or terminate your access to the Service at any time, with or without notice, for any
          reason, including violation of these Terms. You may stop using the Service at any time.
        </p>

        <h2 className="text-xl font-semibold pt-4">8. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
        </p>

        <h2 className="text-xl font-semibold pt-4">9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, CONVERSIONHERO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, ARISING OUT OF OR
          RELATED TO YOUR USE OF THE SERVICE.
        </p>

        <h2 className="text-xl font-semibold pt-4">10. Changes</h2>
        <p>
          We may update these Terms from time to time. Material changes will be posted on this page with an updated
          &quot;Last updated&quot; date. Your continued use of the Service after changes take effect constitutes
          acceptance of the revised Terms.
        </p>

        <h2 className="text-xl font-semibold pt-4">11. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the United States and the state in which ConversionHero is
          operated, without regard to conflict-of-laws principles.
        </p>

        <h2 className="text-xl font-semibold pt-4">12. Contact</h2>
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:ryan@conversionhero.co" className="text-blue-600 dark:text-blue-400 underline">
            ryan@conversionhero.co
          </a>.
        </p>
      </section>
    </main>
  )
}
