import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';

/**
 * Parameters required for zero-overlap interval conflict evaluation.
 */
export interface ConflictCheckParams {
  roomId: string;
  startTime: Date;
  operationalEndTime: Date;
  excludeBookingId?: string;
}

/**
 * Low-level mathematical domain engine responsible for schedule collision detection,
 * operational buffer normalization, and pessimistic concurrency row locking.
 */
@Injectable()
export class ConflictEngineService {
  /**
   * Calculates operational end time including room cleaning sterilization buffer.
   *
   * @param endTime - Scheduled end time of the booking in UTC
   * @param bufferMinutes - Buffer duration in minutes configured for the room
   * @returns Exact operational end time normalized in UTC Date
   */
  calculateOperationalEndTime(endTime: Date, bufferMinutes: number): Date {
    const bufferMilliseconds = bufferMinutes * 60 * 1000;
    return new Date(endTime.getTime() + bufferMilliseconds);
  }

  /**
   * Locks the target Room record exclusively using pessimistic row locking.
   * Prevents concurrent transactions on the same room from causing phantom reads.
   *
   * @param tx - Active Prisma transaction client
   * @param roomId - Unique identifier of the room to lock
   */
  async lockRoomRow(tx: Prisma.TransactionClient, roomId: string): Promise<void> {
    const lockedRows = await tx.$executeRaw`
      SELECT id FROM "rooms"
      WHERE id = ${roomId}::uuid
      FOR UPDATE
    `;

    if (lockedRows === 0) {
      throw new NotFoundException('Ruangan tidak ditemukan atau tidak dapat dikunci');
    }
  }

  /**
   * Asserts that the requested time interval [startTime, operationalEndTime)
   * does not intersect with any active booking or maintenance block for the room.
   *
   * Formula for Half-Open Interval Collision:
   * (newStartTime < existingOperationalEndTime) AND (newOperationalEndTime > existingStartTime)
   *
   * @param tx - Active Prisma transaction client
   * @param params - Conflict validation parameters
   */
  async assertNoOverlap(tx: Prisma.TransactionClient, params: ConflictCheckParams): Promise<void> {
    const { roomId, startTime, operationalEndTime, excludeBookingId } = params;

    // 1. Scan for conflicting active bookings (PENDING or APPROVED)
    const bookingConflict = await tx.booking.findFirst({
      where: {
        roomId,
        status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        AND: [{ startTime: { lt: operationalEndTime } }, { operationalEndTime: { gt: startTime } }],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        operationalEndTime: true,
        status: true,
      },
    });

    if (bookingConflict) {
      const conflictStartIso = bookingConflict.startTime.toISOString().substring(11, 16);
      const conflictEndIso = bookingConflict.endTime.toISOString().substring(11, 16);
      const conflictOpEndIso = bookingConflict.operationalEndTime.toISOString().substring(11, 16);

      throw new ConflictException({
        success: false,
        statusCode: 409,
        error: 'ConflictException',
        message:
          'Slot waktu tidak tersedia karena bertubrukan dengan reservasi lain atau jeda sterilisasi ruangan',
        errors: [
          {
            field: 'startTime',
            issue: `Waktu yang diminta bertubrukan dengan jadwal reservasi aktif (${conflictStartIso} - ${conflictEndIso} UTC, buffer hingga ${conflictOpEndIso} UTC)`,
          },
        ],
      });
    }

    // 2. Scan for conflicting maintenance blocks (cross-table check)
    const maintenanceConflict = await tx.maintenanceBlock.findFirst({
      where: {
        roomId,
        AND: [{ startTime: { lt: operationalEndTime } }, { operationalEndTime: { gt: startTime } }],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        operationalEndTime: true,
      },
    });

    if (maintenanceConflict) {
      const maintStartIso = maintenanceConflict.startTime.toISOString().substring(11, 16);
      const maintOpEndIso = maintenanceConflict.operationalEndTime.toISOString().substring(11, 16);

      throw new ConflictException({
        success: false,
        statusCode: 409,
        error: 'ConflictException',
        message: 'Slot waktu tidak tersedia karena bertubrukan dengan jadwal pemeliharaan ruangan',
        errors: [
          {
            field: 'startTime',
            issue: `Ruangan dialokasikan untuk pemeliharaan rutin "${maintenanceConflict.title}" (${maintStartIso} - ${maintOpEndIso} UTC)`,
          },
        ],
      });
    }
  }
}
