/**
 * @fileoverview Cart Repository
 *
 * All database access for cart items goes through this module.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { CartItem, CartItemRow, ProductRow } from '@/domain';
import { cartItemRowToDomain, productRowToDomain } from '@/domain';
import { fromDatabaseError } from '@/lib/errors';
import type { Product } from '@/domain';

class CartRepository {
  /** Find all cart items for a user */
  async findByUserId(userId: string): Promise<CartItem[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('cart_items') as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw fromDatabaseError(error);
    return (data || []).map((row: any) => cartItemRowToDomain(row as CartItemRow));
  }

  /** Find cart items with product data for a user */
  async findByUserIdWithProducts(userId: string): Promise<Array<CartItem & { product: Product | undefined }>> {
    const admin = getSupabaseAdmin();

    // Fetch cart items
    const { data: cartData, error: cartError } = await (admin
      .from('cart_items') as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (cartError) throw fromDatabaseError(cartError);

    const cartItems = (cartData || []).map((row: any) => cartItemRowToDomain(row as CartItemRow));

    if (cartItems.length === 0) return [];

    // Fetch products for cart items
    const productIds = cartItems.map((item: any) => item.productId);
    const { data: productData, error: productError } = await (admin
      .from('products') as any)
      .select('*')
      .in('id', productIds);

    if (productError) throw fromDatabaseError(productError);

    const productMap = new Map<string, Product>();
    for (const row of productData || []) {
      const product = productRowToDomain(row as ProductRow);
      productMap.set(product.id, product);
    }

    return cartItems.map((item: any) => ({
      ...item,
      product: productMap.get(item.productId),
    }));
  }

  /** Find a single cart item by ID */
  async findById(cartItemId: string): Promise<CartItem | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('cart_items') as any)
      .select('*')
      .eq('id', cartItemId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw fromDatabaseError(error);
    }
    return data ? cartItemRowToDomain(data as CartItemRow) : null;
  }

  /** Check if a user owns a cart item */
  async isOwnedBy(cartItemId: string, userId: string): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('cart_items') as any)
      .select('user_id')
      .eq('id', cartItemId)
      .single();

    if (error || !data) return false;
    return (data as Record<string, unknown>).user_id === userId;
  }

  /** Get product IDs in user's cart */
  async getProductIdsByUserId(userId: string): Promise<string[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('cart_items') as any)
      .select('product_id')
      .eq('user_id', userId);

    if (error) throw fromDatabaseError(error);
    return ((data || []) as any[]).map((row) => row.product_id);
  }

  /** Update cart item quantity */
  async updateQuantity(cartItemId: string, quantity: number): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('cart_items') as any)
      .update({ quantity } as any)
      .eq('id', cartItemId);

    if (error) throw fromDatabaseError(error);
  }

  /** Remove a cart item */
  async deleteById(cartItemId: string): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('cart_items') as any)
      .delete()
      .eq('id', cartItemId);

    if (error) throw fromDatabaseError(error);
  }
}

export const cartRepository = new CartRepository();
