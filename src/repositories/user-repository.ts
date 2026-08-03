/**
 * @fileoverview User Repository
 *
 * Centralizes all Supabase profile queries into a single module.
 * Eliminates the 8+ duplicate `supabase.from('profiles').select('*').eq('id', user.id).single()`
 * patterns that were scattered across page components.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { UserProfile, ProfileRow } from '@/domain';
import { profileRowToDomain } from '@/domain';
import { fromDatabaseError } from '@/lib/errors';

class UserRepository {
  /** Fetch a user profile by ID */
  async findById(userId: string): Promise<UserProfile | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('profiles') as any)
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw fromDatabaseError(error);
    }
    return data ? profileRowToDomain(data as ProfileRow) : null;
  }

  /** Fetch only role and admin fields (lightweight) */
  async findRoleById(userId: string): Promise<Pick<UserProfile, 'role' | 'isAdmin' | 'sellerStatus'> | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('profiles') as any)
      .select('role, is_admin, seller_status')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw fromDatabaseError(error);
    }
    if (!data) return null;
    return {
      role: (data as Record<string, unknown>).role as UserProfile['role'],
      isAdmin: ((data as Record<string, unknown>).is_admin as boolean) ?? false,
      sellerStatus: (data as Record<string, unknown>).seller_status as UserProfile['sellerStatus'],
    };
  }

  /** Fetch all users with pagination */
  async findAll(options: { page: number; pageSize: number }): Promise<{ users: UserProfile[]; hasMore: boolean }> {
    const admin = getSupabaseAdmin();
    const { page, pageSize } = options;
    const { data, error } = await (admin
      .from('profiles') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize);

    if (error) throw fromDatabaseError(error);

    const users = (data || []).map((row: any) => profileRowToDomain(row as ProfileRow));
    const hasMore = data ? data.length >= pageSize : false;
    return { users, hasMore };
  }

  /** Update admin status */
  async updateAdminStatus(userId: string, isAdmin: boolean): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('profiles') as any)
      .update({ is_admin: isAdmin } as any)
      .eq('id', userId);

    if (error) throw fromDatabaseError(error);
  }

  /** Update seller status */
  async updateSellerStatus(userId: string, status: string): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('profiles') as any)
      .update({ seller_status: status } as any)
      .eq('id', userId);

    if (error) throw fromDatabaseError(error);
  }

  /** Delete a user by ID */
  async deleteById(userId: string): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('profiles') as any)
      .delete()
      .eq('id', userId);

    if (error) throw fromDatabaseError(error);
  }

  /** Find all users except one */
  async findAllExcept(userId: string): Promise<UserProfile[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('profiles') as any)
      .select('id')
      .neq('id', userId);

    if (error) throw fromDatabaseError(error);
    return (data || []).map((row: any) => profileRowToDomain(row as ProfileRow));
  }
}

export const userRepository = new UserRepository();
