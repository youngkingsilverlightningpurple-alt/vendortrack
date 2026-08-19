import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  ArrowRight,
  ShoppingCart,
  Store,
  BarChart3,
  Truck,
  CreditCard,
  Users,
  Zap,
  CheckCircle2,
  Globe,
  Lock,
} from 'lucide-react';
import { Logo } from '@/components/logo';

const Header = () => (
  <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200/60">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-16">
        <Logo size="default" />
        <div className="hidden md:flex items-center gap-1">
          <a className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-50" href="#how-it-works">How It Works</a>
          <a className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-50" href="#features">Features</a>
          <a className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-50" href="#for-sellers">For Sellers</a>
          <div className="w-px h-6 bg-slate-200 mx-2" />
          <Link href="/login" className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">Sign In</Link>
          <Link className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg transition-all text-sm font-semibold shadow-sm" href="/signup">Get Started Free</Link>
        </div>
        <div className="md:hidden">
          <Link href="/signup" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">Sign Up</Link>
        </div>
      </div>
    </div>
  </nav>
);

const Hero = () => (
  <section className="pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center lg:max-w-4xl">
        <div className="inline-flex items-center gap-2 bg-primary/8 text-primary px-3 py-1.5 rounded-full text-xs font-semibold mb-6 border border-primary/15">
          <Zap className="h-3 w-3" />
          Multi-Vendor Marketplace Platform
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.08] mb-6 tracking-tight text-slate-900">
          The marketplace platform
          <br className="hidden sm:block" />
          built for{' '}
          <span className="text-primary">trust & scale.</span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          VendorTrack gives independent sellers a professional storefront, buyers a secure checkout, and platform operators full financial integrity — all in one system.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="w-full sm:w-auto h-13 px-8 rounded-xl font-semibold text-base group shadow-lg shadow-primary/15" asChild>
            <Link href="/signup">
              Start Selling Today
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-8 rounded-xl font-semibold text-base" asChild>
            <Link href="/products">Browse Marketplace</Link>
          </Button>
        </div>
      </div>

      {/* Trust indicators */}
      <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Stripe-Verified Payments</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <span>Row-Level Security</span>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <span>Order Tracking</span>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span>Multi-Vendor</span>
        </div>
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section className="py-20 bg-slate-50/60 border-y border-slate-200/50" id="how-it-works">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight text-slate-900">How VendorTrack Works</h2>
        <p className="text-slate-600 leading-relaxed">Three roles, one seamless system. Every transaction is tracked from click to payout.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-5">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 text-slate-900">Buyers Shop Securely</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Browse products from multiple sellers, add to cart, and check out with Stripe. Every payment is encrypted and protected by buyer-first policies.</p>
        </div>
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-11 h-11 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-5">
            <Store className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 text-slate-900">Sellers Manage & Ship</h3>
          <p className="text-sm text-slate-500 leading-relaxed">List products, track orders, and fulfill shipments from a dedicated dashboard. AI-assisted descriptions and automated payout via Stripe Connect.</p>
        </div>
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-5">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 text-slate-900">Platform Operates with Confidence</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Complete visibility into GMV, commissions, and seller health. Financial integrity enforced at the database layer with automated reconciliation.</p>
        </div>
      </div>
    </div>
  </section>
);

const Features = () => (
  <section className="py-20" id="features">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight text-slate-900">Built for Production</h2>
        <p className="text-slate-600 leading-relaxed">Enterprise-grade infrastructure from day one. No shortcuts.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { icon: CreditCard, title: 'Stripe Connect', desc: 'Automated seller payouts with commission splitting. PCI-DSS Level 1 compliance.' },
          { icon: ShieldCheck, title: 'Row-Level Security', desc: 'Every query is scoped by role. Buyers see products; sellers see their own orders.' },
          { icon: Truck, title: 'Order Tracking', desc: 'Full lifecycle from cart to delivery. Shipment carriers and tracking numbers logged.' },
          { icon: Lock, title: 'Financial Integrity', desc: 'Integer-precision cents storage. Zero floating-point drift. Reconciliation built in.' },
          { icon: Users, title: 'Multi-Vendor', desc: 'Each seller gets their own storefront, product catalog, and payout account.' },
          { icon: Zap, title: 'AI Product Tools', desc: 'Generate product descriptions and metadata with AI. Higher conversion, less effort.' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="p-6 rounded-xl border border-slate-200/80 bg-white hover:border-primary/20 transition-colors group">
            <div className="w-9 h-9 bg-primary/8 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/12 transition-colors">
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="font-bold mb-1.5 text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const ForSellers = () => (
  <section className="py-20 bg-slate-50/60 border-y border-slate-200/50" id="for-sellers">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-6 text-slate-900 tracking-tight">Everything a seller needs.</h2>
          <p className="text-slate-600 mb-10 leading-relaxed">From listing your first product to receiving your payout — VendorTrack handles the complexity so you can focus on your business.</p>
          <div className="space-y-5">
            {[
              'Dedicated storefront with custom branding',
              'AI-powered product description generator',
              'Real-time order and fulfillment dashboard',
              'Automated Stripe Connect payouts',
              'Inventory management with stock alerts',
              'Complete transaction and shipment history',
            ].map((text) => (
              <div key={text} className="flex gap-3 items-center">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-slate-700 font-medium">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-8 lg:p-10 rounded-2xl shadow-xl border border-slate-200/60">
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <span className="text-sm text-slate-500">Marketplace Commission</span>
              <span className="font-bold text-primary">10%</span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <span className="text-sm text-slate-500">Payout Schedule</span>
              <span className="font-bold text-slate-900">Automatic (Stripe)</span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <span className="text-sm text-slate-500">Payment Processing</span>
              <span className="font-bold text-slate-900">Stripe Connect</span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <span className="text-sm text-slate-500">Product Listings</span>
              <span className="font-bold text-slate-900">Unlimited</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">AI Tools</span>
              <span className="font-bold text-primary">Included</span>
            </div>
          </div>
          <Button className="w-full mt-8 h-12 text-base font-semibold rounded-xl" asChild>
            <Link href="/signup">
              Create Your Store
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  </section>
);

const CTA = () => (
  <section className="py-20">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-slate-900 rounded-3xl px-8 py-16 lg:px-16 lg:py-20 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/8 blur-[120px] -mr-40 -mt-40" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-6 tracking-tight text-white">Ready to launch your marketplace?</h2>
          <p className="text-slate-400 mb-10 leading-relaxed">Join sellers already building their business on VendorTrack. Set up your store in minutes.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="w-full sm:w-auto h-13 px-8 rounded-xl font-semibold text-base bg-white text-slate-900 hover:bg-slate-100" asChild>
              <Link href="/signup">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-8 rounded-xl font-semibold text-base border-slate-700 text-white hover:bg-slate-800" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="py-12 bg-white border-t border-slate-200/60">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-12">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo size="sm" />
          <p className="text-sm text-slate-500 mt-3 max-w-xs leading-relaxed">The multi-vendor marketplace platform built for trust, scale, and financial integrity.</p>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Platform</h4>
          <div className="space-y-2.5">
            <Link className="block text-sm text-slate-500 hover:text-primary transition-colors" href="/products">Marketplace</Link>
            <Link className="block text-sm text-slate-500 hover:text-primary transition-colors" href="/signup">Start Selling</Link>
            <Link className="block text-sm text-slate-500 hover:text-primary transition-colors" href="/help">Documentation</Link>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Legal</h4>
          <div className="space-y-2.5">
            <Link className="block text-sm text-slate-500 hover:text-primary transition-colors" href="/privacy-policy">Privacy Policy</Link>
            <Link className="block text-sm text-slate-500 hover:text-primary transition-colors" href="/terms">Terms of Service</Link>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Infrastructure</h4>
          <div className="space-y-2.5">
            <span className="block text-sm text-slate-500">Next.js 14 + Supabase</span>
            <span className="block text-sm text-slate-500">Stripe Connect</span>
            <span className="block text-sm text-slate-500">PostgreSQL + RLS</span>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200/60 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} VendorTrack. All rights reserved.</p>
        <p className="text-xs text-slate-400">Powered by Stripe &middot; Supabase &middot; Next.js</p>
      </div>
    </div>
  </footer>
);

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <ForSellers />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
