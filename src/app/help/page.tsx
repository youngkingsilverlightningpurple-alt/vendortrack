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
  title: 'Help & Documentation',
  description: 'VendorTrack help center — guides for buyers, sellers, and platform administrators.',
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
            <h1 className="text-3xl font-extrabold tracking-tight">Help & Documentation</h1>
            <p className="text-muted-foreground text-sm mt-1">Guides for buyers, sellers, and platform administrators.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-12">
            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                How VendorTrack Works
              </h2>
              <p className="text-slate-600 leading-relaxed mb-4">
                VendorTrack is a marketplace built on reliable infrastructure. When you make a purchase, your payment is processed securely by <strong>Stripe</strong> and your order is handled carefully from purchase to delivery.
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="text-lg font-semibold text-primary">How Orders Are Processed</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed">
                    When you place an order, we verify the product is still in stock before charging your card. If everything checks out, your order is created and the seller is notified to ship it.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-2">
                  <AccordionTrigger className="text-lg font-semibold text-primary">Refunds When Items Sell Out</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed">
                    If an item runs out of stock between the time you pay and the time the seller accepts your order, your payment is automatically refunded. You'll never be charged for an item we can't deliver.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger className="text-lg font-semibold text-primary">Our 10% Marketplace Fee</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed">
                    VendorTrack charges sellers a <strong>10% commission</strong> on each sale. This fee is automatically deducted when a payment is processed, so sellers receive their earnings minus the fee.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                AI-Powered Product Descriptions
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Sellers can use our built-in AI tool to generate product descriptions automatically. The tool helps you write clear, well-formatted descriptions that look great in your listings.
              </p>
            </section>
          </div>

          <aside className="space-y-8">
            <div className="p-6 bg-slate-900 text-white rounded-3xl shadow-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Quick Help
              </h3>
              <div className="space-y-4 text-xs font-mono">
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-primary font-bold">How do refunds work?</p>
                  <p className="text-slate-400 mt-1">Request a refund from your orders page if something goes wrong with your purchase.</p>
                </div>
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-amber-500 font-bold">How do I track my order?</p>
                  <p className="text-slate-400 mt-1">Find your order status in the My Orders section after purchase.</p>
                </div>
              </div>
              <p className="mt-6 text-[10px] text-slate-500 leading-relaxed italic">
                Browse these topics for quick answers to common questions.
              </p>
            </div>

            <div className="p-8 bg-muted rounded-2xl border-2 border-dashed border-slate-300 text-center">
              <h3 className="font-bold">Need More Help?</h3>
              <p className="text-xs text-muted-foreground mt-2 mb-6">Our support team is here to help with any questions about using VendorTrack.</p>
              <Button asChild className="w-full">
                <a href="mailto:ops@vendortrack.com">Contact Support</a>
              </Button>
            </div>
          </aside>
        </div>

        <div className="text-center mt-16 pt-8 border-t">
          <Button variant="ghost" asChild>
            <Link href="/">Return to Overview</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
