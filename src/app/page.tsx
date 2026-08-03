import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { 
  Zap, 
  ShieldCheck, 
  LayoutDashboard, 
  ArrowRight, 
  Database, 
  Repeat, 
  CreditCard, 
  Activity, 
  ShieldAlert, 
  Cpu, 
  Layers, 
  RotateCcw 
} from 'lucide-react';

const Header = () => (
  <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-primary/10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Database className="text-white h-5 w-5" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">VendorTrack<span className="text-primary">.</span></span>
        </div>
        <div className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-600">
          <a className="hover:text-primary transition-colors" href="#architecture">Architecture</a>
          <a className="hover:text-primary transition-colors" href="#recovery">Reliability</a>
          <a className="hover:text-primary transition-colors" href="#demo">Sandbox</a>
          <Link href="/login" className="hover:text-primary transition-colors">Client Login</Link>
          <Link className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg transition-all shadow-lg" href="/signup">Get Started</Link>
        </div>
      </div>
    </div>
  </nav>
);

const Hero = () => (
  <section className="pt-32 pb-20 hero-pattern overflow-hidden border-b">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 border border-primary/20">
            <ShieldCheck className="h-3 w-3" />
            Production-Ready Marketplace Engine
          </div>
          <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6 tracking-tight text-slate-900">
            High-Integrity Core for <span className="text-primary">Marketplaces.</span>
          </h1>
          <p className="text-lg text-slate-600 mb-8 max-w-lg leading-relaxed">
            Standardize your multi-vendor logic on a PostgreSQL-enforced transactional backbone. Engineered for financial precision and automated recovery.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="w-full sm:w-auto h-14 px-8 rounded-xl font-bold text-lg group shadow-xl shadow-primary/20" asChild>
              <Link href="/login">
                Launch Sandbox
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 rounded-xl font-bold text-lg" asChild>
              <Link href="/help">Documentation</Link>
            </Button>
          </div>
          <p className="mt-8 text-xs text-slate-500 font-mono uppercase tracking-widest flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            System Status: Nominal / Reconciliation Active
          </p>
        </div>
        <div className="relative">
          <div className="bg-slate-900 p-2 rounded-2xl shadow-2xl border border-slate-800">
            <div className="relative group overflow-hidden rounded-xl">
              <Image width={1200} height={800} alt="System Architecture Overview" className="rounded-xl opacity-80" src="https://picsum.photos/seed/infra/1200/800" data-ai-hint="data architecture infrastructure" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent flex items-end p-8">
                <div className="space-y-4 w-full">
                   <div className="grid grid-cols-2 gap-4 text-[10px] font-mono text-white/80">
                      <div className="p-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg">
                        <p className="text-primary font-bold uppercase mb-1 flex items-center gap-1"><Layers className="h-3 w-3" /> State Engine</p>
                        <p className="text-[9px] text-slate-400">Atomic inventory locking via PostgreSQL transactions.</p>
                      </div>
                      <div className="p-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg">
                        <p className="text-primary font-bold uppercase mb-1 flex items-center gap-1"><Activity className="h-3 w-3" /> Ledger</p>
                        <p className="text-[9px] text-slate-400">Integer-precision cents storage for zero-drift accounting.</p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const SystemGuarantees = () => (
  <section className="py-24 bg-white" id="guarantees">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight">Technical Specifications</h2>
        <p className="text-slate-600">Operational integrity is enforced at the database layer, not the application layer.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-12">
        <div className="space-y-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <Repeat className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold">Atomic Transactions</h3>
          <p className="text-slate-500 leading-relaxed text-sm">Fulfillment uses PostgreSQL RPC calls. Inventory checks and order creation succeed as a single unit—eliminating orphan payments.</p>
        </div>
        <div className="space-y-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <CreditCard className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold">Financial Precision</h3>
          <p className="text-slate-500 leading-relaxed text-sm">Eliminate floating-point rounding errors. All values are stored as integers (cents) to ensure 1:1 matching with Stripe balances.</p>
        </div>
        <div className="space-y-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <Activity className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold">Forensic Audit Trail</h3>
          <p className="text-slate-500 leading-relaxed text-sm">Every critical state change is logged with a global trace ID, allowing for full reconstruction of any transactional lifecycle.</p>
        </div>
      </div>
    </div>
  </section>
);

const Architecture = () => (
  <section className="py-24 bg-slate-50 border-y" id="architecture">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-6 text-slate-900 tracking-tight">Designed for Reliability</h2>
          <p className="text-slate-600 mb-10 leading-relaxed">Most marketplaces fail when third-party APIs signal success but internal state hits a race condition. VendorTrack resolves these discrepancies automatically.</p>
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center border border-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-lg">Background Orchestration</p>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">Task-based fulfillment decouples payment capture from inventory updates, ensuring consistency even during high-traffic spikes.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center border border-primary/10">
                <RotateCcw className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-lg">Automated Safety Refunds</p>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">If inventory is exhausted during the fulfillment phase, the system automatically triggers a Stripe reversal and logs the event.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border-t-4 border-primary">
            <h3 className="text-2xl font-bold mb-6 text-slate-900">Core Architecture</h3>
            <div className="space-y-6">
              {[
                { label: "Storage Engine", value: "PostgreSQL ACID" },
                { label: "Payment Model", value: "Stripe Connect Destination" },
                { label: "Security Layer", value: "Supabase RLS" },
                { label: "Deployment", value: "Next.js 14 App Router" }
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <span className="text-slate-500 font-medium text-sm">{item.label}</span>
                  <span className="font-bold text-primary text-sm">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const FailureScenario = () => (
  <section className="py-24 bg-white" id="recovery">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="p-8 md:p-12 bg-slate-900 rounded-[3rem] text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32" />
        <div className="relative z-10 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6 border border-amber-500/20">
              <ShieldAlert className="h-3 w-3" />
              Operational Integrity
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-6 tracking-tight">Built for Edge-Case Failures.</h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              VendorTrack assumes system failures will happen. The core engine is designed to handle "Orphaned Payments" (money captured, no order) by reverting state automatically.
            </p>
            <div className="space-y-5">
              {[
                "Stripe captures $500.00 from buyer.",
                "Fulfillment worker detects inventory hit zero.",
                "System executes atomic rollback of order creation.",
                "Stripe Refund API triggered via worker idempotency.",
                "Audit log persists terminal failure for review."
              ].map((text, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold">{i + 1}</div>
                  <p className="text-sm text-slate-300 font-medium">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-slate-800 p-6 rounded-2xl border border-white/10 shadow-3xl font-mono text-[11px]">
             <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
               <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-green-500" />
                 <span className="text-slate-400">RECONCILIATION_LOG</span>
               </div>
               <span className="text-primary uppercase">Trace: 88fa-12x9</span>
             </div>
             <div className="space-y-4">
               <p className="text-slate-500">INFO: Payment captured (pi_3O8s...)</p>
               <p className="text-amber-500">WARN: Inventory exhausted (SKU: P-102)</p>
               <p className="text-primary font-bold">INIT: Auto-refund (Session ID: s_982)</p>
               <p className="text-green-400 font-bold">SUCCESS: Refund processed. State synchronized.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const DemoFlow = () => (
  <section className="py-24 bg-white" id="demo">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 className="text-3xl font-extrabold mb-4 text-slate-900 tracking-tight">Interactive Sandbox</h2>
      <p className="text-slate-600 mb-16 max-w-2xl mx-auto leading-relaxed">Evaluate the system from three operational perspectives. This environment simulates production transactional flows using a controlled dataset.</p>
      
      <div className="grid md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-slate-100 text-left hover:shadow-xl transition-all group">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-6">
             <CreditCard className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold mb-2">The Buyer</h3>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">Audit the session-locked checkout flow. Verify that prices are locked at session creation to prevent pricing exploits.</p>
          <Button variant="outline" className="w-full h-11" asChild>
            <Link href="/login">Launch Buyer View</Link>
          </Button>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-100 text-left hover:shadow-xl transition-all group">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-lg flex items-center justify-center mb-6">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold mb-2">The Seller</h3>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">Manage inventory and fulfillment logs. Test the integrated GenAI nodes for automated metadata generation.</p>
          <Button variant="outline" className="w-full h-11" asChild>
            <Link href="/login">Launch Seller View</Link>
          </Button>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-100 text-left hover:shadow-xl transition-all group">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-6">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold mb-2">The Administrator</h3>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">Monitor platform GMV yield andCaptured earnings. Audit the forensic event ledger for system transparency.</p>
          <Button variant="outline" className="w-full h-11" asChild>
            <Link href="/login">Launch Mission Control</Link>
          </Button>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="py-12 bg-white border-t">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Database className="text-white h-5 w-5" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">VendorTrack<span className="text-primary">.</span></span>
        </div>
        <div className="text-center md:text-left">
           <p className="text-[10px] text-muted-foreground mb-1 font-bold uppercase tracking-widest">
            Production Core v3.0 / Supabase / Stripe Connect
           </p>
           <div className="text-slate-500 text-xs">
            © 2024 VendorTrack. Technical Core for Marketplaces.
           </div>
        </div>
        <div className="flex gap-6 text-slate-500 text-sm font-semibold">
          <Link className="hover:text-primary transition-colors" href="/privacy-policy">Privacy</Link>
          <Link className="hover:text-primary transition-colors" href="/terms">Terms</Link>
          <Link className="hover:text-primary transition-colors" href="/help">Docs</Link>
        </div>
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
        <SystemGuarantees />
        <Architecture />
        <FailureScenario />
        <DemoFlow />
      </main>
      <Footer />
    </>
  );
}
