'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Loader2, CheckCircle2, AlertCircle, Share2, Copy, CreditCard, ExternalLink } from 'lucide-react';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { UserProfile, ProfileRow } from '@/types';
import { profileRowToDomain, getErrorMessage } from '@/types';
import { createLogger } from '@/lib/logger';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const log = createLogger('seller-settings');

const settingsFormSchema = z.object({
  storeName: z.string().optional(),
  storeDescription: z.string().optional(),
  payoutEmail: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal('')),
  logo: z.any().optional(),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function SettingsPage() {
  const { supabase, user } = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // P0 FIX (war room): Stripe Connect onboarding state.
  // The audit identified that the seller settings page said "Connect Stripe
  // to enable public listings" but had NO button anywhere. The
  // `handleConnectStripe` function calls the new
  // `/api/stripe/connect/onboard` endpoint which generates a real Stripe
  // Connect onboarding URL.
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      storeName: '',
      storeDescription: '',
      payoutEmail: '',
    },
  });

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            const row = data as ProfileRow;
            const profile = profileRowToDomain(row);
            setProfile(profile);
            
            form.reset({
              storeName: profile.storeName || '',
              storeDescription: profile.storeDescription || '',
              payoutEmail: (row as ProfileRow & { payout_email?: string }).payout_email || '',
            });
            if (profile.storeLogoUrl) setLogoPreview(profile.storeLogoUrl);
          }
          setIsLoading(false);
        });
    }
  }, [user, supabase, form]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
      form.setValue('logo', file);
    }
  };

  const copyReferralLink = () => {
    if (!profile?.referralCode) return;
    const link = `${window.location.origin}/signup?ref=${profile.referralCode}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link Copied!" });
  };

  // P0 FIX (war room): Stripe Connect onboarding handler.
  // Calls /api/stripe/connect/onboard which:
  //   1. Creates a Stripe Express Connect account (if not exists)
  //   2. Generates an onboarding URL
  //   3. Returns the URL for the client to redirect to
  // After the seller completes onboarding on Stripe, they're redirected
  // back to this page with ?stripe_onboarding=complete, and Stripe fires
  // the `account.updated` webhook which syncs the connection status.
  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);
    try {
      const response = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Failed to start Stripe Connect onboarding');
      }

      if (data.alreadyConnected) {
        toast({
          title: "Stripe Connected",
          description: "Your Stripe account is already fully set up.",
        });
        return;
      }

      if (data.url) {
        // Redirect seller to Stripe-hosted onboarding UI
        toast({
          title: "Redirecting to Stripe",
          description: "Complete your Stripe Connect setup. You'll be returned here when done.",
        });
        // Use window.location for a full-page redirect (external URL)
        window.location.href = data.url;
      } else {
        throw new Error('No onboarding URL returned from server');
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: getErrorMessage(error),
      });
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const onSubmit = async (data: SettingsFormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      let logoUrl = profile?.storeLogoUrl || '';
      
      if (data.logo instanceof File) {
        const fileExt = data.logo.name.split('.').pop();
        const fileName = `${user.id}/logo-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('market-assets')
          .upload(fileName, data.logo);
        
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('market-assets').getPublicUrl(fileName);
        logoUrl = publicUrl;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          store_name: data.storeName,
          store_description: data.storeDescription,
          payout_email: data.payoutEmail,
          store_logo_url: logoUrl,
        })
        .eq('id', user.id);

      if (error) throw error;
      toast({ title: 'Settings updated successfully!' });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Update failed', description: getErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Settings</h1>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className={profile?.stripeConnected ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'}>
            <CardHeader>
              <CardTitle className="text-primary">Automated Payments</CardTitle>
              <CardDescription>Stripe Connect configuration for automated payouts.</CardDescription>
            </CardHeader>
            <CardContent>
              {profile?.stripeConnected ? (
                <Alert className="bg-white border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Account Connected</AlertTitle>
                  <AlertDescription className="text-green-700">Authorized to receive real-time payments minus 10% fee.</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <Alert variant="destructive" className="bg-white border-amber-200 text-amber-900">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle>Action Required</AlertTitle>
                    <AlertDescription className="text-amber-700">Connect Stripe to enable payouts and public listings.</AlertDescription>
                  </Alert>
                  {/*
                    P0 FIX (war room): the "Connect Stripe" button.
                    The audit identified that this button was MISSING — the
                    seller settings page said "Connect Stripe to enable
                    public listings" but had no actual button to start
                    the onboarding flow. Sellers had no way to receive
                    payouts.
                  */}
                  <Button
                    onClick={handleConnectStripe}
                    disabled={isConnectingStripe}
                    className="w-full"
                  >
                    {isConnectingStripe ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    {isConnectingStripe ? 'Connecting...' : 'Connect Stripe'}
                    {!isConnectingStripe && <ExternalLink className="h-3 w-3 ml-2" />}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    You&apos;ll be redirected to Stripe to complete setup. VendorTrack never sees your bank details.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2"><Share2 className="h-5 w-5" /> Referral Program</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input readOnly value={profile?.referralCode ? `${window.location.origin}/signup?ref=${profile.referralCode}` : 'N/A'} className="bg-white font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={copyReferralLink} disabled={!profile?.referralCode}><Copy className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader><CardTitle>Store Details</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {isLoading ? <Skeleton className="h-48 w-full" /> : (
                  <>
                    <FormField control={form.control} name="logo" render={() => (
                      <FormItem>
                        <FormLabel>Store Logo</FormLabel>
                        <FormControl><Input type="file" accept="image/*" onChange={handleLogoChange} /></FormControl>
                        {logoPreview && <div className="relative h-20 w-20 mt-4 rounded-full border overflow-hidden"><Image src={logoPreview} alt="" fill className="object-cover" /></div>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="storeName" render={({ field }) => (
                      <FormItem><FormLabel>Store Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="storeDescription" render={({ field }) => (
                      <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} rows={4} /></FormControl></FormItem>
                    )} />
                  </>
                )}
              </CardContent>
              <CardFooter className="border-t py-4">
                <Button type="submit" disabled={isSubmitting || isLoading}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
