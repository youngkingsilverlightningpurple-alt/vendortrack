import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck, CreditCard, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'VendorTrack privacy policy — how we collect, use, and protect your personal data.',
};

/**
 * P0 FIX (war room): the previous Privacy Policy was an M&A document that
 * mentioned "asset acquisition" and "acquirer responsibility" — terms that
 * have no place in a customer-facing privacy policy. It also used internal
 * jargon like "Minimalist Data Architecture", "Payment Data Isolation",
 * and "Operational Traceability" — language that no real user would expect
 * to see in a privacy policy.
 *
 * This file now contains a real, customer-facing Privacy Policy written
 * for buyers and sellers, covering the standard topics: what data we
 * collect, how we use it, who we share it with, user rights, and contact.
 *
 * NOTE: This is a starting point. Before launch, have a lawyer review and
 * customize for the specific jurisdiction(s) the marketplace operates in,
 * especially GDPR (EU), CCPA (California), and PIPEDA (Canada).
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="max-w-4xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8 border-b pb-8">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
            <p className="text-muted-foreground uppercase text-xs font-bold tracking-[0.2em] mt-1">
              How We Handle Your Data
            </p>
          </div>
        </div>

        <div className="space-y-12 max-w-none">
          <section>
            <h2 className="text-2xl font-bold">1. Data We Collect</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              When you create a VendorTrack account, we collect your name, email address, and a
              password (stored as a salted hash). When you make a purchase or list a product, we
              collect transaction data including order ID, product details, and shipping address.
              Sellers&apos; connected Stripe account ID is stored to enable payouts.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We do not store your credit card number, CVV, or any other payment card data. All
              payment information is processed directly by Stripe, our payment processor.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              2. Payment Data
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              VendorTrack uses Stripe to process payments. Stripe is PCI-DSS Level 1 certified — the
              highest level of payment security certification. When you make a purchase, your card
              details are sent directly to Stripe via their secure Elements library — they never touch
              our servers. We only store a Stripe PaymentIntent ID to correlate your order with the
              payment record.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              For more information about how Stripe handles your payment data, see
              <a href="https://stripe.com/privacy" className="text-primary underline ml-1" target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              3. How We Use Your Data
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">We use your data to:</p>
            <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
              <li>Create and manage your account</li>
              <li>Process transactions and send order confirmations</li>
              <li>Send refund notifications and other transactional emails</li>
              <li>Enable buyer-seller messaging through the platform</li>
              <li>Detect fraud and prevent abuse of the marketplace</li>
              <li>Comply with legal obligations (tax reporting, etc.)</li>
            </ul>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We do not sell your personal data. We do not share your data with third parties for
              marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">4. Data Sharing</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We share your data with the following parties only when necessary to operate the
              marketplace:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
              <li><strong>Stripe</strong> — to process payments and seller payouts</li>
              <li><strong>Supabase</strong> — our database hosting provider</li>
              <li><strong>Vercel</strong> — our web hosting provider</li>
              <li><strong>Resend</strong> — our email delivery provider (for transactional emails)</li>
              <li><strong>Law enforcement</strong> — when required by valid legal process</li>
            </ul>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Buyers&apos; names and shipping addresses are shared with the seller of the items they
              purchase, so the seller can fulfill the order. Sellers&apos; store names and product
              listings are visible to all marketplace users.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">5. Your Rights</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">You have the right to:</p>
            <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
              <li>Access your personal data — request a copy of what we hold about you</li>
              <li>Correct inaccurate personal data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Object to processing of your data for specific purposes</li>
              <li>Withdraw consent for any data processing based on consent</li>
            </ul>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              To exercise these rights, contact us at <a href="mailto:privacy@vendortrack.app" className="text-primary underline">privacy@vendortrack.app</a>.
              We will respond within 30 days. If you are an EU resident, you have additional rights
              under GDPR; if you are a California resident, you have additional rights under CCPA.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">6. Data Retention</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We retain your account data for as long as your account is active. If you delete your
              account, we will remove your personal data within 30 days, except where we are legally
              required to retain it (e.g. financial transaction records for tax compliance, which are
              typically retained for 7 years).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">7. Security</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We take reasonable measures to protect your data, including: encrypted connections
              (HTTPS/TLS), secure password hashing, row-level security policies on our database,
              strict Content Security Policy (CSP) headers, and regular security reviews. However, no
              system is 100% secure — we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">8. Cookies</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We use essential cookies to maintain your login session and remember your cart contents.
              We do not use third-party tracking cookies, advertising cookies, or analytics cookies
              that track you across other websites.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">9. Changes to This Policy</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify users of material
              changes by email or by posting a notice on the platform. Continued use of VendorTrack
              after changes take effect constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              10. Contact
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Questions about your privacy? Contact us at <a href="mailto:privacy@vendortrack.app" className="text-primary underline">privacy@vendortrack.app</a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-6">Last Updated: August 2026</p>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
