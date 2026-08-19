import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck, Database } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'VendorTrack privacy policy — how we collect, use, and protect your personal data.',
};

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
            <p className="text-muted-foreground uppercase text-xs font-bold tracking-[0.2em] mt-1">Data Sovereignty & Security Standards</p>
          </div>
        </div>
        
        <div className="prose prose-slate max-w-none space-y-12">
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              1. Data Minimization Strategy
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              VendorTrack follows a <strong>Minimalist Data Architecture</strong>. We only collect the technical identifiers required to maintain transactional integrity between the buyer, seller, and Stripe Connect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">2. Payment Data Isolation</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              We do <strong>not</strong> store primary account numbers (PANs) or CVVs on our servers. All sensitive financial data is tokenized by <strong>Stripe (PCI-DSS Level 1)</strong>. VendorTrack only maintains a `stripe_payment_intent_id` and a `payment_session_id` to correlate orders.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              3. Operational Traceability
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              To ensure system reliability, the backend logs technical metadata including IP addresses (for rate-limiting), request pathing, and worker execution times. These logs are stored in a secure, non-public database for forensic audit purposes only.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">4. User Sovereignty</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              We do not sell, rent, or monetize your personal data. The system is designed as a neutral financial utility. Users may request full account and data purge via the platform administrator dashboard.
            </p>
          </section>

          <section>
             <h2 className="text-2xl font-bold">5. Acquirer Responsibility</h2>
             <p className="mt-4 text-slate-600 leading-relaxed">
               Upon asset acquisition, the new owner is responsible for ensuring their specific deployment complies with local data protection regulations (e.g., GDPR, CCPA).
             </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-6">Security Grade: High | Compliance: Ready</p>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
