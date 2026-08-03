/**
 * @fileoverview User Profile Repository
 *
 * Centralizes all Supabase profile queries into a single module.
 * Eliminates the 8+ duplicate `supabase.from('profiles').select('*').eq('id', user.id).single()`
 * patterns that were scattered across page components.
 *
 * This module also provides type-safe row-to-domain transformations
 * using the ProfileRow and UserProfile types from @/types.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRow, UserProfile } from '@/types';
import { profileRowToDomain } from '@/types';

/**
 * Fetch a user profile by ID.
 * Returns a typed UserProfile (camelCase) or null if not found.
 */
export async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!data) return null;

  return profileRowToDomain(data as ProfileRow);
}

/**
 * Fetch a user profile with only role and admin fields.
 * Used by middleware and auth checks where full profile is not needed.
 */
export async function fetchUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<Pick<UserProfile, 'role' | 'isAdmin' | 'sellerStatus'> | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role, is_admin, seller_status')
    .eq('id', userId)
    .single();

  if (!data) return null;

  return {
    role: data.role as UserProfile['role'],
    isAdmin: data.is_admin ?? false,
    sellerStatus: data.seller_status as UserProfile['sellerStatus'],
  };
}

/**
 * Fetch all users with pagination.
 */
export async function fetchUsers(
  supabase: SupabaseClient,
  options: { page: number; pageSize: number }
): Promise<{ users: UserProfile[]; hasMore: boolean }> {
  const { page, pageSize } = options;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) throw error;

  const users = (data || []).map((row) => profileRowToDomain(row as ProfileRow));
  const hasMore = data ? data.length >= pageSize : false;

  return { users, hasMore };
}
