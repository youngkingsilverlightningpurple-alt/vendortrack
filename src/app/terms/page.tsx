import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck, CreditCard, Package, RotateCcw, Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'VendorTrack terms of service — marketplace rules, seller obligations, and buyer protections.',
};

/**
 * P0 FIX (war room): the previous Terms of Service was an M&A software-sale
 * contract that referred to the reader as "the acquirer" and included clauses
 * about "asset acquisition", "Dead Letter Queue", and "system administrator
 * responsibilities". This was a compliance failure — a real user reading
 * these terms would assume the site is broken or unprofessional, and a legal
 * review would block on it immediately.
 *
 * This file now contains a real, customer-facing Terms of Service written
 * for buyers and sellers — not for acquirers.
 *
 * NOTE: This is a starting point. Before launch, have a lawyer review and
 * customize for the specific jurisdiction(s) the marketplace operates in.
 */
export default function TermsOfServicePage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="max-w-4xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8 border-b pb-8">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Terms of Service</h1>
            <p className="text-muted-foreground uppercase text-xs font-bold tracking-[0.2em] mt-1">
              Marketplace Rules & User Agreement
            </p>
          </div>
        </div>

        <div className="space-y-12 max-w-none">
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              1. Acceptance of Terms
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Welcome to VendorTrack. By creating an account, browsing the marketplace, listing a product,
              or completing a purchase, you agree to these Terms of Service. If you do not agree, please
              do not use the platform. These terms form a binding agreement between you and VendorTrack
              governing your use of the marketplace.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              If you are under 18, you may use VendorTrack only with the involvement of a parent or legal
              guardian. By using the platform, you represent that you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              2. Payments and Fees
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              VendorTrack processes payments through Stripe, a PCI-DSS Level 1 certified payment processor.
              When you make a purchase, your payment is processed directly by Stripe — VendorTrack never
              stores your card details. The platform applies a 10% commission on each transaction, which
              is deducted from the seller's payout automatically.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Sellers receive payouts to their connected Stripe account. The payout schedule depends on
              Stripe's processing times and the seller's bank. Sellers are responsible for their own tax
              reporting and compliance with applicable tax laws in their jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              3. Refund Policy
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Buyers may request a refund through the &quot;My Orders&quot; section of their account. Refund
              requests are reviewed by VendorTrack and the seller. Approved refunds are processed back to
              the buyer&apos;s original payment method within 5-10 business days.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Refunds may be granted for: defective products, items not as described, items not
              delivered, or other legitimate disputes. Refunds are not granted for buyer&apos;s remorse
              (changing your mind after a valid purchase).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">4. Seller Obligations</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Sellers agree to: (a) provide accurate product descriptions and images, (b) maintain
              sufficient inventory to fulfill orders, (c) ship orders within the advertised timeframe,
              (d) respond to buyer messages within a reasonable period, and (e) comply with all applicable
              laws and regulations.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Sellers may not list: prohibited items (illegal goods, weapons, controlled substances),
              counterfeit or trademark-infringing items, or items that violate intellectual property
              rights. VendorTrack reserves the right to remove any listing that violates these rules.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">5. Buyer Obligations</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Buyers agree to: (a) provide accurate shipping and contact information, (b) pay for all
              purchases made through their account, (c) not abuse the refund system, and (d) not engage
              in fraudulent activity.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">6. Account Suspension and Termination</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              VendorTrack reserves the right to suspend or terminate accounts that violate these Terms,
              engage in fraudulent activity, or pose a risk to the marketplace community. We will provide
              notice where possible, except in cases of urgent security or legal concerns.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">7. Intellectual Property</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              VendorTrack, the VendorTrack logo, and all related branding are the property of VendorTrack.
              Sellers retain ownership of their product listings, images, and brand assets, but grant
              VendorTrack a license to display them on the marketplace for the purpose of facilitating
              sales.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              8. Limitation of Liability
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              VendorTrack is provided on an &quot;as is basis. To the maximum extent permitted by law,
              VendorTrack shall not be liable for indirect, incidental, special, consequential, or
              punitive damages, or any loss of profits or revenues arising from your use of the
              marketplace.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              VendorTrack is not responsible for the actions of buyers or sellers on the platform, but
              we will work to resolve disputes in good faith. We are not a party to the transactions
              between buyers and sellers — we provide the platform that enables them.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">9. Changes to These Terms</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We may update these Terms from time to time. We will notify users of material changes by
              email or by posting a notice on the platform. Continued use of VendorTrack after changes
              take effect constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">10. Contact</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Questions about these Terms? Contact us at <a href="mailto:support@vendortrack.app" className="text-primary underline">support@vendortrack.app</a>.
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
