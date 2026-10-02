import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateRoomDto, QueryRoomsDto, UpdateRoomDto } from './dto';

/**
 * Payload interface representing authenticated user extracted from JWT.
 */
export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  role: Role;
}

/**
 * Service orchestrator managing physical room inventory, scheduling filters, and operational lifecycle.
 */
@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves paginated list of rooms with dynamic multi-field search and slot availability evaluation.
   *
   * @param query DTO containing filtering and pagination parameters.
   * @returns Paginated catalog with room availability indicators.
   */
  async findAll(query: QueryRoomsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.RoomWhereInput = {};

    // 1. Text search across name, code, or location
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // 2. Minimum capacity filter
    if (query.minCapacity !== undefined) {
      where.capacity = { gte: query.minCapacity };
    }

    // 3. Operational status filter
    if (query.status) {
      where.status = query.status;
    }

    // 4. Time interval availability evaluation
    let searchStart: Date | null = null;
    let searchEnd: Date | null = null;

    if (query.startTime && query.endTime) {
      searchStart = new Date(query.startTime);
      searchEnd = new Date(query.endTime);

      if (searchEnd <= searchStart) {
        throw new BadRequestException(
          'Rentang waktu tidak valid: endTime harus lebih besar dari startTime',
        );
      }
    }

    const [total, rooms] = await Promise.all([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          manager: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
          ...(searchStart && searchEnd
            ? {
                _count: {
                  select: {
                    bookings: {
                      where: {
                        status: {
                          in: [BookingStatus.PENDING, BookingStatus.APPROVED],
                        },
                        startTime: { lt: searchEnd },
                        operationalEndTime: { gt: searchStart },
                      },
                    },
                    maintenances: {
                      where: {
                        startTime: { lt: searchEnd },
                        operationalEndTime: { gt: searchStart },
                      },
                    },
                  },
                },
              }
            : {}),
        },
      }),
    ]);

    const formattedRooms = rooms.map((room) => {
      let isAvailable = room.status === RoomStatus.AVAILABLE;

      if (searchStart && searchEnd && '_count' in room) {
        const counts = room._count as {
          bookings: number;
          maintenances: number;
        };
        const hasConflict = counts.bookings > 0 || counts.maintenances > 0;
        isAvailable = isAvailable && !hasConflict;
      }

      return {
        id: room.id,
        code: room.code,
        name: room.name,
        capacity: room.capacity,
        location: room.location,
        status: room.status,
        timezone: room.timezone,
        bufferMinutes: room.bufferMinutes,
        isAvailable,
        manager: room.manager
          ? {
              id: room.manager.id,
              fullName: room.manager.profile?.fullName ?? '',
              email: room.manager.email,
            }
          : null,
        createdAt: room.createdAt,
      };
    });

    return {
      items: formattedRooms,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single room details along with active daily schedules and operational buffer calculations.
   *
   * @param id Unique UUID v4 room identifier.
   * @param date Optional ISO date string (YYYY-MM-DD). Defaults to current UTC date.
   * @returns Detailed room specification and schedule matrix.
   */
  async findOne(id: string, date?: string) {
    const selectedDate = date ?? new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(`${selectedDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${selectedDate}T23:59:59.999Z`);

    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        manager: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                fullName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Ruangan tidak ditemukan');
    }

    const [activeBookings, maintenanceBlocks] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          roomId: id,
          status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
          startTime: { lte: endOfDay },
          operationalEndTime: { gte: startOfDay },
        },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          operationalEndTime: true,
          bufferMinutes: true,
          status: true,
        },
      }),
      this.prisma.maintenanceBlock.findMany({
        where: {
          roomId: id,
          startTime: { lte: endOfDay },
          operationalEndTime: { gte: startOfDay },
        },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          operationalEndTime: true,
          reason: true,
        },
      }),
    ]);

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      capacity: room.capacity,
      location: room.location,
      status: room.status,
      timezone: room.timezone,
      bufferMinutes: room.bufferMinutes,
      manager: room.manager
        ? {
            id: room.manager.id,
            fullName: room.manager.profile?.fullName ?? '',
            phoneNumber: room.manager.profile?.phoneNumber ?? null,
          }
        : null,
      schedule: {
        selectedDate,
        activeBookings: activeBookings.map((b) => ({
          id: b.id,
          title: b.title,
          startTime: b.startTime,
          endTime: b.endTime,
          operationalEndTime: b.operationalEndTime,
          bufferMinutes: b.bufferMinutes,
          status: b.status,
        })),
        maintenanceBlocks: maintenanceBlocks.map((m) => ({
          id: m.id,
          title: m.title,
          startTime: m.startTime,
          endTime: m.endTime,
          operationalEndTime: m.operationalEndTime,
          reason: m.reason,
        })),
      },
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  /**
   * Registers a new physical room entity into persistence store.
   *
   * @param dto Specification payload for new room.
   * @returns Newly created room record.
   */
  async create(dto: CreateRoomDto) {
    const existingCode = await this.prisma.room.findUnique({
      where: { code: dto.code },
    });

    if (existingCode) {
      throw new ConflictException('Kode ruangan sudah terdaftar pada sistem');
    }

    if (dto.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
      });

      if (!manager || manager.role !== Role.ROOM_MANAGER) {
        throw new BadRequestException(
          'Manager yang ditunjuk tidak ditemukan atau tidak memiliki peran ROOM_MANAGER',
        );
      }
    }

    return this.prisma.room.create({
      data: {
        name: dto.name,
        code: dto.code,
        capacity: dto.capacity,
        location: dto.location,
        timezone: dto.timezone ?? 'Asia/Jakarta',
        bufferMinutes: dto.bufferMinutes ?? 15,
        managerId: dto.managerId ?? null,
        status: dto.status ?? RoomStatus.AVAILABLE,
      },
    });
  }

  /**
   * Updates existing room attributes enforcing Partial Ownership RBAC.
   *
   * @param id Room UUID v4 identifier.
   * @param user Authenticated user payload.
   * @param dto Partial room update fields.
   * @returns Updated room record.
   */
  async update(id: string, user: AuthenticatedUserPayload, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Ruangan tidak ditemukan');
    }

    // Partial Ownership RBAC verification
    if (user.role === Role.ROOM_MANAGER && room.managerId !== user.id) {
      throw new ForbiddenException(
        'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
      );
    }

    if (dto.code && dto.code !== room.code) {
      const conflictCode = await this.prisma.room.findUnique({
        where: { code: dto.code },
      });

      if (conflictCode) {
        throw new ConflictException('Kode ruangan sudah terdaftar pada sistem');
      }
    }

    if (dto.managerId && dto.managerId !== room.managerId) {
      const newManager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
      });

      if (!newManager || newManager.role !== Role.ROOM_MANAGER) {
        throw new BadRequestException(
          'Manager yang ditunjuk tidak ditemukan atau tidak memiliki peran ROOM_MANAGER',
        );
      }
    }

    return this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.bufferMinutes !== undefined && {
          bufferMinutes: dto.bufferMinutes,
        }),
        ...(dto.managerId !== undefined && { managerId: dto.managerId }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  /**
   * Soft-deletes a room by updating its status to INACTIVE.
   * Protected against active future bookings.
   *
   * @param id Room UUID v4 identifier.
   * @returns Soft-deleted room metadata.
   */
  async remove(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Ruangan tidak ditemukan');
    }

    const now = new Date();
    const activeFutureBookings = await this.prisma.booking.count({
      where: {
        roomId: id,
        status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
        startTime: { gte: now },
      },
    });

    if (activeFutureBookings > 0) {
      throw new ConflictException(
        `Ruangan tidak dapat dinonaktifkan karena masih memiliki ${activeFutureBookings} reservasi aktif di masa mendatang`,
      );
    }

    const deactivated = await this.prisma.room.update({
      where: { id },
      data: { status: RoomStatus.INACTIVE },
    });

    return {
      id: deactivated.id,
      code: deactivated.code,
      status: deactivated.status,
      updatedAt: deactivated.updatedAt,
    };
  }
}
