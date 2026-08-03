import { Metadata } from 'next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen, Server, CreditCard, ShieldAlert, Cpu } from 'lucide-react';

export const metadata: Metadata = {
  title: 'System Documentation | VendorTrack Infrastructure',
};

export default function HelpPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="max-w-5xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12 border-b pb-8">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">System Documentation</h1>
            <p className="text-muted-foreground uppercase text-xs font-bold tracking-[0.2em] mt-1">Operational Manual & Architecture Overview</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-12">
            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Infrastructure Overview
              </h2>
              <p className="text-slate-600 leading-relaxed mb-4">
                VendorTrack is a distributed marketplace engine built on <strong>PostgreSQL</strong> for transactional integrity and <strong>Stripe Connect</strong> for automated fee capture. Unlike standard e-commerce templates, it utilizes a <strong>background fulfillment pattern</strong> to ensure no payment is ever orphaned.
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="text-lg font-semibold text-primary">The Fulfillment Loop</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed">
                    When a buyer pays, the system does not create the order immediately. Instead, it enqueues a <strong>Cloud Task</strong>. This worker performs an atomic stock check, decrements the inventory, creates the order record, and logs the event—all within a single database transaction.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-2">
                  <AccordionTrigger className="text-lg font-semibold text-primary">Self-Healing Logic</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed">
                    If the fulfillment worker detects that inventory has reached zero post-payment, it triggers an <strong>Auto-Refund API</strong> call to Stripe and logs a terminal failure. The system prioritizes financial consistency over "best-guess" order creation.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger className="text-lg font-semibold text-primary">Marketplace Fee Capture</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed">
                    Fees are calculated as <strong>Integers (Cents)</strong>. The system enforces a 10% marketplace commission at the Stripe API level, ensuring the platform owner receives funds instantly upon customer payment success.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                AI Content Nodes
              </h2>
              <p className="text-slate-600 leading-relaxed">
                The integrated copywriter is powered by <strong>Google Gemini 2.5 Flash</strong>. It features structured Zod-output validation, ensuring that AI-generated descriptions are always formatted correctly for the database and search indexers.
              </p>
            </section>
          </div>

          <aside className="space-y-8">
            <div className="p-6 bg-slate-900 text-white rounded-3xl shadow-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Critical Alarms
              </h3>
              <div className="space-y-4 text-xs font-mono">
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-primary font-bold">RECONCILIATION_ERR</p>
                  <p className="text-slate-400 mt-1">Payment exists without order for {'>'} 15m.</p>
                </div>
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-amber-500 font-bold">INVENTORY_EXHAUSTED</p>
                  <p className="text-slate-400 mt-1">Atomic lock failed. Auto-refund pending.</p>
                </div>
              </div>
              <p className="mt-6 text-[10px] text-slate-500 leading-relaxed italic">
                Monitor these flags in your mission control dashboard to ensure 100% platform reliability.
              </p>
            </div>

            <div className="p-8 bg-muted rounded-2xl border-2 border-dashed border-slate-300 text-center">
              <h3 className="font-bold">Need Direct Handover?</h3>
              <p className="text-xs text-muted-foreground mt-2 mb-6">Our technical team provides a 2-hour integration call for every asset acquisition.</p>
              <Button asChild className="w-full">
                <a href="mailto:ops@vendortrack.com">Contact Technical Support</a>
              </Button>
            </div>
          </aside>
        </div>

        <div className="text-center mt-16 pt-8 border-t">
          <Button variant="ghost" asChild>
            <Link href="/">Return to Mission Control Overview</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
