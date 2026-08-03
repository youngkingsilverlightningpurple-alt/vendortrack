"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Product, UserProfile, ProfileRow } from "@/types";
import { profileRowToDomain, getErrorMessage } from "@/types";
import { createLogger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { Loader2, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { AiGeneratorModal } from "./ai-generator-modal";
import type { GeneratedProductDescription } from "@/ai/flows/generate-product-description";
import { useSupabase } from "@/components/providers/supabase-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const log = createLogger('product-form');

const productFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  status: z.enum(["active", "draft"]),
  image: z.any().optional(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  product?: Product | null;
}

export function ProductForm({ isOpen, onOpenChange, product }: ProductFormProps) {
  const { user, supabase } = useSupabase();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => { if (data) setUserProfile(profileRowToDomain(data as ProfileRow)); });
    }
  }, [user, supabase]);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      title: "",
      category: "",
      description: "",
      price: 0,
      status: "draft",
    },
  });

  useEffect(() => {
    if (isOpen) {
        if (product) {
          form.reset({
              title: product.title,
              category: product.category || "",
              description: product.description,
              price: product.price,
              status: product.status,
          });
          setImagePreview(product.imageUrl || null);
        } else {
            form.reset({
                title: "",
                category: "",
                description: "",
                price: 0,
                status: "draft",
            });
            setImagePreview(null);
        }
        form.clearErrors();
    }
  }, [product, form, isOpen]);
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      form.setValue('image', file);
    }
  };

  const handleDescriptionGenerated = (generatedContent: GeneratedProductDescription) => {
    const newDescription = [
      generatedContent.shortDescription,
      "\nKey Benefits:",
      ...generatedContent.bulletBenefits.map(b => `- ${b}`),
      `\n${generatedContent.closingParagraph}`
    ].join("\n");

    form.setValue("title", generatedContent.productTitle);
    form.setValue("description", newDescription);
    setIsAiModalOpen(false);
  };

  const onSubmit = async (data: ProductFormValues) => {
    if (!user) return;

    if (userProfile?.isDemo) {
        toast({ title: "Simulation Success", description: "Product action simulated (Demo Mode)." });
        onOpenChange(false);
        return;
    }

    setIsSubmitting(true);
    try {
        let imageUrl = product?.imageUrl || "";
        if (data.image instanceof File) {
            const fileExt = data.image.name.split('.').pop();
            const fileName = `${user.id}/${Math.random()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('market-assets')
                .upload(fileName, data.image);
            
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('market-assets').getPublicUrl(fileName);
            imageUrl = publicUrl;
        }

        const productData = {
            title: data.title,
            category: data.category,
            description: data.description || "",
            price_cents: Math.round(data.price * 100),
            status: data.status,
            image_url: imageUrl,
            seller_id: user.id,
        };

        const { error } = product 
            ? await supabase.from('products').update(productData).eq('id', product.id)
            : await supabase.from('products').insert(productData);

        if (error) throw error;

        toast({ title: product ? "Product updated" : "Product created" });
        onOpenChange(false);
    } catch (error: unknown) {
        toast({ variant: "destructive", title: "Action failed", description: getErrorMessage(error) });
    } finally {
        setIsSubmitting(false);
    }
  };

  const canPublish = userProfile?.stripeConnected && userProfile?.sellerStatus === 'approved';

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {product ? "Edit Listing" : "Create New Listing"}
            {userProfile?.isDemo && <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />}
          </DialogTitle>
        </DialogHeader>

        {!canPublish && !userProfile?.isDemo && (
            <Alert className="bg-muted border-primary/20">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <AlertTitle className="text-sm font-bold">Visibility Restriction</AlertTitle>
                <AlertDescription className="text-xs">
                    {!userProfile?.stripeConnected && <span>• Stripe connection required.<br/></span>}
                    {userProfile?.sellerStatus !== 'approved' && <span>• Admin verification required.<br/></span>}
                    You can save as <strong>Draft</strong> in the meantime.
                </AlertDescription>
            </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="image"
              render={() => (
                <FormItem>
                  <FormLabel>Asset Visualization</FormLabel>
                  <FormControl>
                    <Input type="file" accept="image/*" onChange={handleImageChange} className="text-sm cursor-pointer"/>
                  </FormControl>
                  {imagePreview && <div className="relative h-32 w-32 border rounded-md overflow-hidden mt-2"><Image src={imagePreview} alt="" fill className="object-cover" /></div>}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asset Name</FormLabel>
                  <FormControl><Input placeholder="Product title" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                   <div className="flex items-center justify-between">
                     <FormLabel>Specifications</FormLabel>
                     <Button type="button" variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => setIsAiModalOpen(true)}>
                        <Sparkles className="mr-2 h-3 w-3" />
                        AI Copywriter
                     </Button>
                   </div>
                  <FormControl><Textarea placeholder="Technical details..." {...field} rows={5} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Value (USD)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Market Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active" disabled={!canPublish && !userProfile?.isDemo}>Active (Public)</SelectItem>
                          <SelectItem value="draft">Draft (Internal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
            </div>
            
            <DialogFooter className="gap-2 sm:gap-0">
                <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Commit Listing
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <AiGeneratorModal 
        isOpen={isAiModalOpen}
        onOpenChange={setIsAiModalOpen}
        onGenerate={handleDescriptionGenerated}
        productName={form.getValues('title')}
    />
    </>
  );
}
