import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUserPayload } from '../rooms/rooms.service';
import { CreateMaintenanceBlockDto, QueryMaintenanceDto } from './dto';

/**
 * Service orchestrator managing room maintenance blocks and cross-table conflict validations.
 */
@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Schedules a new maintenance block for a room while enforcing partial ownership RBAC
   * and cross-table non-overlapping validation against APPROVED bookings.
   *
   * @param roomId Target physical room UUID.
   * @param user Authenticated user payload.
   * @param dto Maintenance specification payload.
   * @returns Newly scheduled maintenance block entity.
   */
  async create(roomId: string, user: AuthenticatedUserPayload, dto: CreateMaintenanceBlockDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('Ruangan tidak ditemukan');
    }

    // Partial Ownership RBAC: ROOM_MANAGER can only manage assigned rooms
    if (user.role === Role.ROOM_MANAGER && room.managerId !== user.id) {
      throw new ForbiddenException(
        'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
      );
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    const operationalEnd = dto.operationalEndTime ? new Date(dto.operationalEndTime) : end;

    if (end <= start || operationalEnd <= start) {
      throw new BadRequestException(
        'Waktu selesai pemeliharaan harus lebih besar dari waktu mulai',
      );
    }

    if (operationalEnd < end) {
      throw new BadRequestException('operationalEndTime tidak boleh lebih awal dari endTime');
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Pessimistic row locking on target room to prevent phantom read race conditions
        await tx.$executeRaw`
          SELECT id FROM "rooms" 
          WHERE id = ${roomId}::uuid 
          FOR UPDATE
        `;

        // 2. Cross-table conflict verification against APPROVED bookings (NFR-SEC-05)
        const conflictingBooking = await tx.booking.findFirst({
          where: {
            roomId,
            status: BookingStatus.APPROVED,
            startTime: { lt: operationalEnd },
            operationalEndTime: { gt: start },
          },
          select: {
            id: true,
            title: true,
            startTime: true,
            operationalEndTime: true,
          },
        });

        if (conflictingBooking) {
          throw new ConflictException(
            'Jadwal pemeliharaan bertabrakan dengan jadwal reservasi yang sudah disetujui (APPROVED)',
          );
        }

        // 3. Persist maintenance block record
        // Database Exclusion Constraint (no_overlapping_maintenance_blocks) guards concurrent maintenance blocks
        const created = await tx.maintenanceBlock.create({
          data: {
            roomId,
            title: dto.title,
            reason: dto.reason,
            startTime: start,
            endTime: end,
            operationalEndTime: operationalEnd,
          },
          select: {
            id: true,
            roomId: true,
            title: true,
            reason: true,
            startTime: true,
            endTime: true,
            operationalEndTime: true,
            createdAt: true,
          },
        });

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Retrieves paginated list of maintenance blocks for a given room.
   *
   * @param roomId Target room UUID.
   * @param user Authenticated user payload.
   * @param query Pagination and upcoming filter parameters.
   * @returns Paginated maintenance blocks and pagination metadata.
   */
  async findAllByRoom(roomId: string, user: AuthenticatedUserPayload, query: QueryMaintenanceDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('Ruangan dengan ID yang dituju tidak ditemukan');
    }

    // Partial Ownership RBAC
    if (user.role === Role.ROOM_MANAGER && room.managerId !== user.id) {
      throw new ForbiddenException(
        'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.MaintenanceBlockWhereInput = { roomId };

    // Default: only fetch upcoming maintenance schedules
    if (query.upcomingOnly !== false) {
      where.operationalEndTime = { gte: new Date() };
    }

    const [total, items] = await Promise.all([
      this.prisma.maintenanceBlock.count({ where }),
      this.prisma.maintenanceBlock.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          roomId: true,
          title: true,
          reason: true,
          startTime: true,
          endTime: true,
          operationalEndTime: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Cancels and deletes an existing maintenance block, reopening availability for regular bookings.
   *
   * @param roomId Target room UUID.
   * @param maintenanceId Maintenance block UUID to be deleted.
   * @param user Authenticated user payload.
   * @returns null on successful removal.
   */
  async remove(roomId: string, maintenanceId: string, user: AuthenticatedUserPayload) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('Ruangan tidak ditemukan');
    }

    // Partial Ownership RBAC
    if (user.role === Role.ROOM_MANAGER && room.managerId !== user.id) {
      throw new ForbiddenException(
        'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
      );
    }

    const maintenance = await this.prisma.maintenanceBlock.findFirst({
      where: {
        id: maintenanceId,
        roomId,
      },
    });

    if (!maintenance) {
      throw new NotFoundException(
        'Blok pemeliharaan dengan ID yang dituju tidak ditemukan pada ruangan ini',
      );
    }

    await this.prisma.maintenanceBlock.delete({
      where: { id: maintenanceId },
    });

    return null;
  }
}
