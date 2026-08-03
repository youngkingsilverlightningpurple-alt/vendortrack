'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { CartItem } from '@/types';
import { createLogger } from '@/lib/logger';
import { updateCartItem, removeCartItem } from '@/app/actions/buyer-actions';
import { useToast } from '@/hooks/use-toast';

const log = createLogger('cart-controls');

/**
 * Cart Item Controls — Server-Side Authorized
 *
 * SECURITY: All cart mutations now go through server actions
 * that verify ownership (user_id = auth.uid()). A buyer cannot
 * modify another buyer's cart items.
 */
interface CartItemControlsProps {
  cartItem: CartItem;
}

export function CartItemControls({ cartItem }: CartItemControlsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleUpdateQuantity = async (amount: number) => {
    if (isUpdating) return;
    const newQuantity = cartItem.quantity + amount;

    if (newQuantity < 1) {
      handleRemoveItem();
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updateCartItem(cartItem.id, newQuantity);
      if (result.error) {
        toast({ variant: 'destructive', title: 'Update failed', description: result.error });
      } else {
        window.location.reload();
      }
    } catch (error: unknown) {
      log.error('Failed to update quantity:', undefined, error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update cart.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveItem = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const result = await removeCartItem(cartItem.id);
      if (result.error) {
        toast({ variant: 'destructive', title: 'Remove failed', description: result.error });
      } else {
        window.location.reload();
      }
    } catch (error: unknown) {
      log.error('Failed to remove item:', undefined, error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to remove item.' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex items-center border rounded-md">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleUpdateQuantity(-1)} disabled={isUpdating}><Minus className="h-4 w-4" /></Button>
        <span className="w-8 text-center text-sm font-medium">{cartItem.quantity}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleUpdateQuantity(1)} disabled={isUpdating}><Plus className="h-4 w-4" /></Button>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleRemoveItem} disabled={isUpdating}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
