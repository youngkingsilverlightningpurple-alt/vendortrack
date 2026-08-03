/**
 * @fileoverview User Service
 *
 * Business logic for user management.
 * Extracted from admin-actions.ts and inline code in pages.
 */

import { userRepository } from '@/repositories/user-repository';
import { auditLogRepository } from '@/repositories/audit-log-repository';
import { AuthorizationError, ErrorCode, AppError } from '@/lib/errors';
import type { UserProfile } from '@/domain';

class UserService {
  /** Get a user profile by ID */
  async getProfile(userId: string): Promise<UserProfile | null> {
    return userRepository.findById(userId);
  }

  /** Get user role information */
  async getRole(userId: string): Promise<Pick<UserProfile, 'role' | 'isAdmin' | 'sellerStatus'> | null> {
    return userRepository.findRoleById(userId);
  }

  /** Toggle admin status for a user (admin only) */
  async toggleAdminStatus(
    targetUserId: string,
    adminUserId: string,
    makeAdmin: boolean,
    traceId?: string
  ): Promise<void> {
    // Prevent self-demotion
    if (adminUserId === targetUserId && !makeAdmin) {
      throw new AppError(ErrorCode.INVALID_STATE, {
        message: 'Cannot remove your own admin status. Have another admin do this.',
        traceId,
      });
    }

    await userRepository.updateAdminStatus(targetUserId, makeAdmin);

    await auditLogRepository.insert({
      traceId: traceId || `admin_${Date.now()}`,
      eventType: 'TOGGLE_ADMIN_STATUS',
      severity: 'WARN',
      payload: {
        adminUserId,
        targetUserId,
        makeAdmin,
        result: 'success',
      },
    });
  }

  /** Update seller status (admin only) */
  async updateSellerStatus(
    targetUserId: string,
    status: string,
    adminUserId: string,
    traceId?: string
  ): Promise<void> {
    await userRepository.updateSellerStatus(targetUserId, status);

    await auditLogRepository.insert({
      traceId: traceId || `admin_${Date.now()}`,
      eventType: 'UPDATE_SELLER_STATUS',
      severity: 'INFO',
      payload: {
        adminUserId,
        targetUserId,
        status,
        result: 'success',
      },
    });
  }

  /** Get all users with pagination */
  async getUsers(options: { page: number; pageSize: number }): Promise<{ users: UserProfile[]; hasMore: boolean }> {
    return userRepository.findAll(options);
  }

  /** Purge all users except the current admin (DESTRUCTIVE) */
  async purgeAllUsers(currentUserId: string, traceId?: string): Promise<number> {
    const users = await userRepository.findAllExcept(currentUserId);

    let deletedCount = 0;
    for (const user of users) {
      try {
        await userRepository.deleteById(user.id);
        deletedCount++;
      } catch {
        // Continue with other users even if one fails
      }
    }

    await auditLogRepository.insert({
      traceId: traceId || `admin_${Date.now()}`,
      eventType: 'PURGE_ALL_USERS',
      severity: 'CRITICAL',
      payload: {
        adminUserId: currentUserId,
        deletedCount,
        result: 'success',
      },
    });

    return deletedCount;
  }
}

export const userService = new UserService();
