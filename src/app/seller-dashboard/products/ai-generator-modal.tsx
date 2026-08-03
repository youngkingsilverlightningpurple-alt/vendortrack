
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Sparkles, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import { generateProductDescription, type GeneratedProductDescription } from '@/ai/flows/generate-product-description';
import { Separator } from '@/components/ui/separator';

const log = createLogger('ai-generator');

const generatorSchema = z.object({
  productName: z.string().min(3, 'Please enter a product name.'),
  category: z.string().min(3, 'Please enter a category.'),
  keyFeatures: z.string().min(10, 'Please list at least one key feature.'),
  targetAudience: z.string().min(3, 'Please describe your target audience.'),
  tone: z.enum(['Professional', 'Friendly', 'Luxury', 'Minimal', 'Bold']),
});

type GeneratorFormValues = z.infer<typeof generatorSchema>;

interface AiGeneratorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGenerate: (content: GeneratedProductDescription) => void;
  productName?: string;
}

export function AiGeneratorModal({ isOpen, onOpenChange, onGenerate, productName }: AiGeneratorModalProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedProductDescription | null>(null);

  const form = useForm<GeneratorFormValues>({
    resolver: zodResolver(generatorSchema),
    defaultValues: {
      productName: productName || '',
      category: '',
      keyFeatures: '',
      targetAudience: '',
      tone: 'Friendly',
    },
  });

  useEffect(() => {
    if (productName) {
      form.setValue('productName', productName);
    }
  }, [productName, form]);
  
  useEffect(() => {
      if(!isOpen) {
          setGeneratedContent(null);
          form.reset({
              productName: productName || '',
              category: '',
              keyFeatures: '',
              targetAudience: '',
              tone: 'Friendly',
          })
      }
  }, [isOpen, form, productName]);

  const handleGenerate = async (values: GeneratorFormValues) => {
    setIsGenerating(true);
    setGeneratedContent(null);
    try {
      const result = await generateProductDescription(values);
      setGeneratedContent(result);
    } catch (error: unknown) {
      log.error('Failed to generate description:', undefined, error);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: 'Could not generate a description. Please try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: `${fieldName} Copied!`,
      description: 'The content has been copied to your clipboard.',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>AI Product Description Generator</DialogTitle>
          <DialogDescription>
            Fill in the details below and let AI craft a compelling product description for you.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto flex-1 pr-6">
          {/* Input Form */}
          <div className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleGenerate)} id="ai-generator-form" className="space-y-4">
                <FormField
                  control={form.control}
                  name="productName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name</FormLabel>
                      <FormControl><Input placeholder="E.g., 'Handmade Leather Journal'" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl><Input placeholder="E.g., 'Stationery', 'Fashion'" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="keyFeatures"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key Features & Specs</FormLabel>
                      <FormControl><Textarea rows={4} placeholder="E.g., 'Full-grain leather, 200 lined pages, A5 size, refillable...'" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <FormControl><Input placeholder="E.g., 'Writers, students, professionals'" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tone of Voice</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Professional">Professional</SelectItem>
                          <SelectItem value="Friendly">Friendly</SelectItem>
                          <SelectItem value="Luxury">Luxury</SelectItem>
                          <SelectItem value="Minimal">Minimal</SelectItem>
                          <SelectItem value="Bold">Bold</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>

          {/* Output Display */}
          <div className="rounded-lg bg-muted/50 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-center">Generated Content</h3>
            {isGenerating && (
                <div className="flex flex-col items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Generating...</p>
                </div>
            )}
            {generatedContent && (
                <div className="space-y-4 text-sm">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <h4 className="font-semibold">Optimized Title</h4>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyToClipboard(generatedContent.productTitle, "Title")}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="p-3 bg-background rounded-md">{generatedContent.productTitle}</p>
                    </div>
                     <div>
                        <div className="flex justify-between items-center mb-1">
                            <h4 className="font-semibold">Short Description</h4>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyToClipboard(generatedContent.shortDescription, "Description")}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="p-3 bg-background rounded-md leading-relaxed">{generatedContent.shortDescription}</p>
                    </div>
                     <div>
                        <div className="flex justify-between items-center mb-1">
                            <h4 className="font-semibold">Benefit Bullet Points</h4>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyToClipboard(generatedContent.bulletBenefits.join('\n'), "Bullet Points")}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <ul className="p-3 bg-background rounded-md space-y-2 list-disc list-inside">
                           {generatedContent.bulletBenefits.map((bullet, i) => <li key={i}>{bullet}</li>)}
                        </ul>
                    </div>
                     <div>
                        <div className="flex justify-between items-center mb-1">
                            <h4 className="font-semibold">Closing Paragraph</h4>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyToClipboard(generatedContent.closingParagraph, "Closing Paragraph")}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="p-3 bg-background rounded-md leading-relaxed">{generatedContent.closingParagraph}</p>
                    </div>
                </div>
            )}
            {!isGenerating && !generatedContent && (
                 <div className="flex flex-col items-center justify-center h-full text-center">
                    <Sparkles className="h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">Your generated content will appear here.</p>
                </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4 border-t">
          <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
          {generatedContent ? (
              <Button onClick={() => onGenerate(generatedContent)}>
                Apply to Form
              </Button>
          ): (
            <Button type="submit" form="ai-generator-form" disabled={isGenerating}>
                {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Generating...</> : "Generate Description"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
