import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Database, Lock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | VendorTrack Infrastructure Asset',
};

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
            <p className="text-muted-foreground uppercase text-xs font-bold tracking-[0.2em] mt-1">Operational Governance & Use Agreement</p>
          </div>
        </div>

        <div className="prose prose-slate max-w-none space-y-12">
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              1. Nature of the Software
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              VendorTrack is a production-grade marketplace infrastructure system provided as a software asset. This current deployment is a <strong>Sandbox Evaluation Environment</strong>. Real financial transactions are only processed if you have integrated your own production Stripe keys. By default, the system operates in "Test Mode."
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2">
               <Lock className="h-5 w-5 text-primary" />
              2. Transactional Integrity & Responsibility
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              The platform utilizes <strong>distributed systems logic</strong> (Cloud Tasks, PostgreSQL Transactions) to ensure data consistency. However, the system administrator (you, the acquirer) is responsible for monitoring the reconciliation worker logs and addressing any terminal failure flags in the Dead Letter Queue (DLQ).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">3. Financial Processing (Stripe Connect)</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              All marketplace payments are routed via <strong>Stripe Connect Destination Charges</strong>. The Platform Owner is the merchant of record for commissions captured. Users are responsible for their own tax compliance and anti-money laundering (AML) requirements as dictated by Stripe's Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">4. Limitation of Liability</h2>
            <p className="mt-4 text-slate-600 leading-relaxed uppercase font-bold text-xs tracking-tight bg-slate-50 p-4 border rounded">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VENDORTRACK INFRASTRUCTURE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE OWNERS OF THIS ASSET SHALL NOT BE LIABLE FOR ANY FINANCIAL DRIFT, SYSTEM TIMEOUTS, OR THIRD-PARTY API FAILURES.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">5. Intellectual Property</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Acquisition of this asset includes full ownership of the source code, database schemas, and deployment configurations. You are authorized to deploy, modify, and monetize this system without further attribution to the original prototyper.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-6">Last Updated: October 2024</p>
          <Button asChild>
            <Link href="/">Return to Infrastructure Overview</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
