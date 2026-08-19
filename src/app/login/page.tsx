"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Logo } from "@/components/logo";
import { Loader2 } from "lucide-react";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { supabase, user, isLoading: isAuthLoading } = useSupabase();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthLoading && user) {
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.role === 'seller') {
            router.push("/seller-dashboard");
          } else {
            router.push("/buyer-orders");
          }
        });
    }
  }, [user, isAuthLoading, router, supabase]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Login failed', description: error.message });
      setIsLoading(false);
    }
  }

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-white space-y-8">
          <Logo size="lg" className="[&_span]:text-white [&_span]:text-white" />
          <div className="space-y-4">
            <h1 className="text-3xl font-extrabold leading-tight">
              Your marketplace,<br />your way.
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              VendorTrack gives you the tools to sell, ship, and scale — with financial integrity built in from day one.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Secure Payments', value: 'Stripe Connect' },
              { label: 'Seller Tools', value: 'AI-Powered' },
              { label: 'Order Tracking', value: 'Full Lifecycle' },
              { label: 'Financial Integrity', value: 'PostgreSQL' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold">{label}</p>
                <p className="text-sm font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm border-slate-200/60 shadow-sm">
          <CardHeader className="items-center text-center">
            <Logo className="lg:hidden mb-2" />
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription>Sign in to your VendorTrack account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="you@company.com" {...field} type="email" autoComplete="email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input placeholder="Enter your password" {...field} type="password" autoComplete="current-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="justify-center text-sm border-t bg-slate-50/50 py-4">
            <p className="text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-primary hover:underline">Sign up</Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
