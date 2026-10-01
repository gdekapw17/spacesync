import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

/**
 * Service responsible for managing user profiles, paginated administrator queries,
 * and system role mutations.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Updates personal profile data for the currently authenticated user.
   *
   * @param userId - Target user identifier (UUID v4)
   * @param dto - Profile attributes to update
   * @returns Updated profile entity snapshot
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!existingUser) {
      throw new NotFoundException('Pengguna tidak ditemukan pada sistem');
    }

    const updatedProfile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        fullName: dto.fullName ?? 'Pengguna SpaceSync',
        phoneNumber: dto.phoneNumber,
        department: dto.department,
      },
      update: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
      },
      select: {
        userId: true,
        fullName: true,
        phoneNumber: true,
        department: true,
        updatedAt: true,
      },
    });

    return updatedProfile;
  }

  /**
   * Retrieves paginated and filtered institutional users (Super Admin only).
   *
   * @param query - Pagination, search, and role filtering parameters
   * @returns Paginated user array with envelope metadata
   */
  async findAll(query: QueryUsersDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                profile: {
                  fullName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          profile: {
            select: {
              fullName: true,
              department: true,
            },
          },
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Mutates the access authority role of a specified user (Super Admin only).
   * Prevents self-demotion to preserve system administrative integrity.
   *
   * @param targetUserId - ID of the user whose role is being modified
   * @param currentAdminId - ID of the Super Admin performing the modification
   * @param dto - New role assignment
   * @returns Updated user entity with new role
   */
  async updateRole(targetUserId: string, currentAdminId: string, dto: UpdateUserRoleDto) {
    if (targetUserId === currentAdminId && dto.role !== Role.SUPER_ADMIN) {
      throw new UnprocessableEntityException(
        'Super Admin tidak diperbolehkan menurunkan perannya sendiri demi integritas sistem',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Pengguna dengan ID yang dituju tidak ditemukan');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: dto.role },
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }
}
