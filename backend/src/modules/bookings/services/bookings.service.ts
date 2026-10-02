import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import {
  CancelBookingDto,
  CreateBookingDto,
  ForceCancelBookingDto,
  QueryBookingsDto,
  QueryTimelineDto,
  UpdateBookingStatusDto,
  ApprovalAction,
} from '../dto';
import { ConflictEngineService } from './conflict-engine.service';

/**
 * Representation of the authenticated user payload extracted from JWT.
 */
export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  role: Role;
}

/**
 * Standard pagination response envelope format.
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Main application service orchestrating booking lifecycle, access control,
 * database transactions, approval workflows, and cancellations.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictEngine: ConflictEngineService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Creates a new booking reservation inside an ACID transaction with pessimistic locking.
   *
   * @param userId - ID of the authenticated applicant
   * @param dto - CreateBookingDto payload
   */
  async create(userId: string, dto: CreateBookingDto): Promise<unknown> {
    const parsedStartTime = new Date(dto.startTime);
    const parsedEndTime = new Date(dto.endTime);

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 1. Fetch room details and verify active operational status
        const room = await tx.room.findUnique({
          where: { id: dto.roomId },
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            status: true,
            bufferMinutes: true,
          },
        });

        if (!room) {
          throw new NotFoundException('Ruangan tidak ditemukan');
        }

        if (room.status !== RoomStatus.AVAILABLE) {
          throw new BadRequestException(
            'Ruangan sedang tidak tersedia untuk reservasi umum (dalam status pemeliharaan atau nonaktif)',
          );
        }

        // 2. Lock room row exclusively to serialize concurrent booking attempts
        await this.conflictEngine.lockRoomRow(tx, room.id);

        // 3. Calculate operational end time with buffer
        const bufferMinutes = room.bufferMinutes ?? 15;
        const operationalEndTime = this.conflictEngine.calculateOperationalEndTime(
          parsedEndTime,
          bufferMinutes,
        );

        // 4. Validate slot availability (zero-overlap assertion)
        await this.conflictEngine.assertNoOverlap(tx, {
          roomId: room.id,
          startTime: parsedStartTime,
          operationalEndTime,
        });

        // 5. Persist the new booking record with PENDING status
        const createdBooking = await tx.booking.create({
          data: {
            roomId: room.id,
            userId,
            title: dto.title,
            description: dto.description ?? null,
            startTime: parsedStartTime,
            endTime: parsedEndTime,
            operationalEndTime,
            bufferMinutes,
            status: BookingStatus.PENDING,
          },
          include: {
            room: {
              select: {
                name: true,
                code: true,
                location: true,
              },
            },
          },
        });

        // 6. Record initial audit log entry
        await tx.auditLog.create({
          data: {
            bookingId: createdBooking.id,
            actorId: userId,
            action: 'BOOKING_CREATED',
            oldStatus: null,
            newStatus: BookingStatus.PENDING,
            notes: 'Pengajuan reservasi via web portal',
          },
        });

        // 7. Emit domain event for asynchronous decoupled consumers
        this.eventEmitter.emit('booking.created', {
          bookingId: createdBooking.id,
          roomId: createdBooking.roomId,
          userId: createdBooking.userId,
          startTime: createdBooking.startTime,
          endTime: createdBooking.endTime,
        });

        return {
          id: createdBooking.id,
          roomId: createdBooking.roomId,
          userId: createdBooking.userId,
          title: createdBooking.title,
          description: createdBooking.description,
          startTime: createdBooking.startTime.toISOString(),
          endTime: createdBooking.endTime.toISOString(),
          operationalEndTime: createdBooking.operationalEndTime.toISOString(),
          bufferMinutes: createdBooking.bufferMinutes,
          status: createdBooking.status,
          room: {
            name: createdBooking.room.name,
            code: createdBooking.room.code,
            location: createdBooking.room.location,
          },
          createdAt: createdBooking.createdAt.toISOString(),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Retrieves a paginated list of bookings scoped by user role hierarchy.
   *
   * @param user - Authenticated user identity
   * @param query - Query filter parameters
   */
  async findAll(
    user: AuthenticatedUserPayload,
    query: QueryBookingsDto,
  ): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.BookingWhereInput = {};

    // 1. Role-based data isolation
    if (user.role === Role.USER) {
      whereClause.userId = user.id;
    } else if (user.role === Role.ROOM_MANAGER) {
      whereClause.room = { managerId: user.id };
    } else if (user.role === Role.SUPER_ADMIN && query.userId) {
      whereClause.userId = query.userId;
    }

    // 2. Query filters
    if (query.status) {
      whereClause.status = query.status;
    }

    if (query.roomId) {
      whereClause.roomId = query.roomId;
    }

    if (query.startDate || query.endDate) {
      whereClause.startTime = {};
      if (query.startDate) {
        whereClause.startTime.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        whereClause.startTime.lte = new Date(`${query.endDate}T23:59:59.999Z`);
      }
    }

    // 3. Parallel execution of count and paginated query
    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where: whereClause }),
      this.prisma.booking.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          room: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          user: {
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
        },
      }),
    ]);

    const formattedData = bookings.map((item) => ({
      id: item.id,
      title: item.title,
      startTime: item.startTime.toISOString(),
      endTime: item.endTime.toISOString(),
      operationalEndTime: item.operationalEndTime.toISOString(),
      status: item.status,
      room: {
        id: item.room.id,
        name: item.room.name,
        code: item.room.code,
      },
      user: {
        id: item.user.id,
        fullName: item.user.profile?.fullName ?? 'Pengguna',
        email: item.user.email,
      },
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      data: formattedData,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves an aggregated timeline of active bookings and maintenance blocks.
   * Completely eliminates N+1 query bottlenecks for calendar and Gantt interfaces.
   *
   * @param query - QueryTimelineDto specifying start and end bounds
   */
  async findTimeline(query: QueryTimelineDto): Promise<unknown[]> {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException(
        'Rentang tanggal tidak valid: endDate harus lebih besar dari startDate',
      );
    }

    // If roomId is provided, verify room existence
    if (query.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: query.roomId },
        select: { id: true },
      });
      if (!room) {
        throw new NotFoundException('Ruangan tidak ditemukan');
      }
    }

    // Execute parallel indexed queries across bookings and maintenance blocks
    const [activeBookings, maintenanceBlocks] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          ...(query.roomId ? { roomId: query.roomId } : {}),
          status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
          startTime: { lt: endDate },
          operationalEndTime: { gt: startDate },
        },
        include: {
          room: { select: { id: true, name: true } },
          user: {
            select: {
              profile: { select: { fullName: true, department: true } },
            },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.maintenanceBlock.findMany({
        where: {
          ...(query.roomId ? { roomId: query.roomId } : {}),
          startTime: { lt: endDate },
          operationalEndTime: { gt: startDate },
        },
        include: {
          room: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    // Map bookings to timeline items
    const bookingItems = activeBookings.map((b) => ({
      id: b.id,
      type: 'BOOKING' as const,
      roomId: b.room.id,
      roomName: b.room.name,
      title: b.title,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      operationalEndTime: b.operationalEndTime.toISOString(),
      status: b.status,
      userName: b.user.profile?.fullName ?? 'Pengguna',
      department: b.user.profile?.department ?? null,
    }));

    // Map maintenance blocks to timeline items
    const maintenanceItems = maintenanceBlocks.map((m) => ({
      id: m.id,
      type: 'MAINTENANCE' as const,
      roomId: m.room.id,
      roomName: m.room.name,
      title: m.title,
      startTime: m.startTime.toISOString(),
      endTime: m.endTime.toISOString(),
      operationalEndTime: m.operationalEndTime.toISOString(),
      status: 'MAINTENANCE',
      userName: 'Tim Pemeliharaan Fasilitas',
      department: 'Sarana & Prasarana',
    }));

    // Merge and sort ascending by start time
    const mergedTimeline = [...bookingItems, ...maintenanceItems].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    return mergedTimeline;
  }

  /**
   * Retrieves single booking detailed record, including audit trail logs.
   * Enforces granular access control ensuring only owner, room manager, or admin can read.
   *
   * @param id - Unique booking identifier UUID v4
   * @param user - Authenticated user identity
   */
  async findOne(id: string, user: AuthenticatedUserPayload): Promise<unknown> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            capacity: true,
            managerId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                fullName: true,
                department: true,
              },
            },
          },
        },
        auditLogs: {
          orderBy: { recordedAt: 'asc' },
          include: {
            actor: {
              select: {
                role: true,
                profile: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Reservasi tidak ditemukan');
    }

    // Granular authorization verification
    const isOwner = booking.userId === user.id;
    const isRoomManager = user.role === Role.ROOM_MANAGER && booking.room.managerId === user.id;
    const isSuperAdmin = user.role === Role.SUPER_ADMIN;

    if (!isOwner && !isRoomManager && !isSuperAdmin) {
      throw new ForbiddenException(
        'Akses ditolak: Anda tidak memiliki otoritas untuk melihat data reservasi ini',
      );
    }

    return {
      id: booking.id,
      roomId: booking.roomId,
      userId: booking.userId,
      title: booking.title,
      description: booking.description,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      operationalEndTime: booking.operationalEndTime.toISOString(),
      bufferMinutes: booking.bufferMinutes,
      status: booking.status,
      rejectionReason: booking.rejectionReason,
      cancellationReason: booking.cancellationReason,
      room: {
        id: booking.room.id,
        name: booking.room.name,
        code: booking.room.code,
        location: booking.room.location,
        capacity: booking.room.capacity,
      },
      user: {
        id: booking.user.id,
        fullName: booking.user.profile?.fullName ?? 'Pengguna',
        email: booking.user.email,
        department: booking.user.profile?.department ?? null,
      },
      auditLogs: booking.auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        oldStatus: log.oldStatus,
        newStatus: log.newStatus,
        notes: log.notes,
        actor: {
          fullName: log.actor.profile?.fullName ?? 'Sistem',
          role: log.actor.role,
        },
        recordedAt: log.recordedAt.toISOString(),
      })),
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }

  /**
   * Processes manager approval or rejection decisions inside a Serializable transaction.
   * Re-evaluates schedule overlap strictly when approving to prevent race conditions.
   *
   * @param id - Unique booking identifier UUID v4
   * @param user - Authenticated user identity (Room Manager or Super Admin)
   * @param dto - UpdateBookingStatusDto payload
   */
  async updateStatus(
    id: string,
    user: AuthenticatedUserPayload,
    dto: UpdateBookingStatusDto,
  ): Promise<unknown> {
    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 1. Fetch booking with room relation
        const booking = await tx.booking.findUnique({
          where: { id },
          include: {
            room: {
              select: {
                id: true,
                managerId: true,
              },
            },
          },
        });

        if (!booking) {
          throw new NotFoundException('Reservasi tidak ditemukan');
        }

        // 2. Validate jurisdictional authority for Room Manager
        if (user.role === Role.ROOM_MANAGER && booking.room.managerId !== user.id) {
          throw new ForbiddenException(
            'Akses ditolak: Anda tidak memiliki wewenang manajerial atas ruangan pada reservasi ini',
          );
        }

        // 3. Ensure booking is strictly in PENDING state
        if (booking.status !== BookingStatus.PENDING) {
          throw new BadRequestException(
            'Hanya reservasi berstatus PENDING yang dapat diproses keputusannya',
          );
        }

        let newStatus: BookingStatus;
        let rejectionReason: string | null = null;
        let auditAction: string;
        let auditNotes: string;

        if (dto.status === ApprovalAction.APPROVED) {
          // Lock room row to serialize approval race conditions
          await this.conflictEngine.lockRoomRow(tx, booking.roomId);

          // Re-verify overlap inside isolation transaction excluding current pending booking
          await this.conflictEngine.assertNoOverlap(tx, {
            roomId: booking.roomId,
            startTime: booking.startTime,
            operationalEndTime: booking.operationalEndTime,
            excludeBookingId: booking.id,
          });

          newStatus = BookingStatus.APPROVED;
          auditAction = 'BOOKING_APPROVED';
          auditNotes = 'Permohonan reservasi disetujui oleh pengelola ruangan';
        } else {
          newStatus = BookingStatus.REJECTED;
          rejectionReason = dto.rejectionReason ?? null;
          auditAction = 'BOOKING_REJECTED';
          auditNotes = dto.rejectionReason ?? 'Permohonan reservasi ditolak';
        }

        // 4. Update booking entity
        const updatedBooking = await tx.booking.update({
          where: { id },
          data: {
            status: newStatus,
            rejectionReason,
          },
        });

        // 5. Record state transition in audit trail
        await tx.auditLog.create({
          data: {
            bookingId: updatedBooking.id,
            actorId: user.id,
            action: auditAction,
            oldStatus: BookingStatus.PENDING,
            newStatus,
            notes: auditNotes,
          },
        });

        // 6. Emit status changed domain event (hooked to step 3.6 listeners)
        this.eventEmitter.emit('booking.status_changed', {
          bookingId: updatedBooking.id,
          actorId: user.id,
          oldStatus: BookingStatus.PENDING,
          newStatus,
          rejectionReason,
        });

        return {
          id: updatedBooking.id,
          status: updatedBooking.status,
          rejectionReason: updatedBooking.rejectionReason,
          updatedAt: updatedBooking.updatedAt.toISOString(),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Executes self-cancellation by the applicant enforcing the strict H-2 hours deadline.
   *
   * @param id - Unique booking identifier UUID v4
   * @param user - Authenticated user identity (Applicant or Super Admin)
   * @param dto - CancelBookingDto payload
   */
  async cancelBooking(
    id: string,
    user: AuthenticatedUserPayload,
    dto: CancelBookingDto,
  ): Promise<unknown> {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const booking = await tx.booking.findUnique({
        where: { id },
      });

      if (!booking) {
        throw new NotFoundException('Reservasi tidak ditemukan');
      }

      // 1. Verify ownership (applicant or Super Admin)
      const isOwner = booking.userId === user.id;
      const isSuperAdmin = user.role === Role.SUPER_ADMIN;

      if (!isOwner && !isSuperAdmin) {
        throw new ForbiddenException(
          'Akses ditolak: Anda tidak memiliki wewenang untuk membatalkan reservasi ini',
        );
      }

      // 2. Validate cancellable state
      if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.APPROVED) {
        throw new BadRequestException(
          'Reservasi tidak dapat dibatalkan karena sudah berstatus REJECTED, CANCELLED, atau COMPLETED',
        );
      }

      // 3. Enforce strict H-2 hours cancellation deadline
      const currentTimestamp = Date.now();
      const startTimestamp = booking.startTime.getTime();
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      if (currentTimestamp >= startTimestamp) {
        throw new BadRequestException('Acara telah berlangsung atau waktu mulai telah terlewati');
      }

      if (currentTimestamp > startTimestamp - twoHoursInMs) {
        throw new BadRequestException(
          'Batas waktu pembatalan mandiri telah terlewati (maksimal 2 jam sebelum waktu mulai acara). Silakan hubungi Unit Manager terkait.',
        );
      }

      const cancellationReason = dto.cancellationReason ?? 'Dibatalkan secara mandiri oleh pemohon';

      // 4. Update status to CANCELLED
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancellationReason,
        },
      });

      // 5. Record audit trail log
      await tx.auditLog.create({
        data: {
          bookingId: updatedBooking.id,
          actorId: user.id,
          action: 'BOOKING_CANCELLED',
          oldStatus: booking.status,
          newStatus: BookingStatus.CANCELLED,
          notes: cancellationReason,
        },
      });

      // 6. Emit status changed domain event
      this.eventEmitter.emit('booking.status_changed', {
        bookingId: updatedBooking.id,
        actorId: user.id,
        oldStatus: booking.status,
        newStatus: BookingStatus.CANCELLED,
        cancellationReason,
      });

      return {
        id: updatedBooking.id,
        status: updatedBooking.status,
        cancellationReason: updatedBooking.cancellationReason,
        updatedAt: updatedBooking.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Executes emergency force-cancellation by Room Manager or Super Admin,
   * bypassing the H-2 hours deadline while requiring a formal justification reason.
   *
   * @param id - Unique booking identifier UUID v4
   * @param user - Authenticated user identity (Room Manager or Super Admin)
   * @param dto - ForceCancelBookingDto payload
   */
  async forceCancelBooking(
    id: string,
    user: AuthenticatedUserPayload,
    dto: ForceCancelBookingDto,
  ): Promise<unknown> {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: {
          room: {
            select: {
              id: true,
              managerId: true,
            },
          },
        },
      });

      if (!booking) {
        throw new NotFoundException('Reservasi tidak ditemukan');
      }

      // 1. Verify managerial jurisdiction
      if (user.role === Role.ROOM_MANAGER && booking.room.managerId !== user.id) {
        throw new ForbiddenException(
          'Akses ditolak: Anda tidak memiliki wewenang manajerial atas ruangan pada reservasi ini',
        );
      }

      // 2. Validate cancellable state
      if (
        booking.status === BookingStatus.CANCELLED ||
        booking.status === BookingStatus.COMPLETED
      ) {
        throw new BadRequestException(
          'Reservasi tidak dapat dibatalkan darurat karena sudah berstatus CANCELLED atau COMPLETED',
        );
      }

      if (booking.status === BookingStatus.REJECTED) {
        throw new BadRequestException('Reservasi sudah ditolak sebelumnya');
      }

      // 3. Update status to CANCELLED with emergency reason
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancellationReason: dto.reason,
        },
      });

      // 4. Record force-cancellation audit log
      await tx.auditLog.create({
        data: {
          bookingId: updatedBooking.id,
          actorId: user.id,
          action: 'BOOKING_FORCE_CANCELLED',
          oldStatus: booking.status,
          newStatus: BookingStatus.CANCELLED,
          notes: dto.reason,
        },
      });

      // 5. Fetch executor profile for response envelope
      const actor = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          role: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      });

      // 6. Emit status changed domain event
      this.eventEmitter.emit('booking.status_changed', {
        bookingId: updatedBooking.id,
        actorId: user.id,
        oldStatus: booking.status,
        newStatus: BookingStatus.CANCELLED,
        cancellationReason: dto.reason,
        isForceCancelled: true,
      });

      return {
        id: updatedBooking.id,
        status: updatedBooking.status,
        cancellationReason: updatedBooking.cancellationReason,
        cancelledBy: {
          id: actor?.id ?? user.id,
          fullName: actor?.profile?.fullName ?? 'Administrator',
          role: actor?.role ?? user.role,
        },
        updatedAt: updatedBooking.updatedAt.toISOString(),
      };
    });
  }
}
