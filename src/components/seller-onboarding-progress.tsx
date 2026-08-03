'use client';

import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  isCompleted: boolean;
  href: string;
}

interface SellerOnboardingProgressProps {
  steps: OnboardingStep[];
}

export function SellerOnboardingProgress({ steps }: SellerOnboardingProgressProps) {
  const completedCount = steps.filter(s => s.isCompleted).length;
  const progress = (completedCount / steps.length) * 100;

  if (progress === 100) return null;

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">Store Setup Progress</CardTitle>
          <span className="text-xs font-bold text-primary">{Math.round(progress)}% Complete</span>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-3">
            {step.isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-semibold", step.isCompleted ? "text-muted-foreground line-through" : "text-foreground")}>
                {step.label}
              </p>
              {!step.isCompleted && (
                <Link href={step.href} className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                  Complete this step <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
