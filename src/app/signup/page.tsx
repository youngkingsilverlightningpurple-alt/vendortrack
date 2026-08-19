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
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Loader2 } from "lucide-react";
import { useSupabase } from "@/components/providers/supabase-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const formSchema = z
  .object({
    fullName: z.string().min(1, { message: "Full name required." }),
    email: z.string().email({ message: "Invalid email." }),
    role: z.enum(["buyer", "seller"]),
    password: z.string().min(6, { message: "Min 6 characters." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", role: "buyer" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { full_name: values.fullName } }
    });

    if (authError || !authData.user) {
      toast({ variant: "destructive", title: "Registration failed", description: authError?.message });
      setIsLoading(false);
      return;
    }

    const { error: pError } = await supabase
      .from('profiles')
      .update({ role: values.role, full_name: values.fullName })
      .eq('id', authData.user.id);

    if (pError) {
       toast({ variant: "destructive", title: "Profile setup failed", description: pError.message });
    } else {
       router.push(values.role === 'seller' ? '/seller-dashboard' : '/buyer-orders');
    }
    setIsLoading(false);
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-white space-y-8">
          <Logo size="lg" className="[&_span]:text-white" />
          <div className="space-y-4">
            <h1 className="text-3xl font-extrabold leading-tight">
              Join the marketplace.<br />Start selling today.
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              Whether you&apos;re a buyer looking for unique products or a seller ready to launch your storefront, VendorTrack has you covered.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md border-slate-200/60 shadow-sm">
          <CardHeader className="items-center text-center">
            <Logo className="lg:hidden mb-2" />
            <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
            <CardDescription>Join the VendorTrack marketplace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input placeholder="Your full name" {...field} autoComplete="name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>I am a</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="buyer">Buyer — Shop from sellers</SelectItem>
                          <SelectItem value="seller">Seller — List & sell products</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <FormControl><Input placeholder="Min 6 characters" {...field} type="password" autoComplete="new-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl><Input placeholder="Re-enter your password" {...field} type="password" autoComplete="new-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="justify-center text-sm border-t bg-slate-50/50 py-4">
            <p className="text-muted-foreground">Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
