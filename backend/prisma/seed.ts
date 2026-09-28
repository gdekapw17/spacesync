import { PrismaClient, Role, RoomStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed initial administrative accounts, operational roles, and sample rooms.
 * Ensures deterministic, idempotent baseline persistence state.
 */
async function main(): Promise<void> {
  console.log('[Seed] Starting database seeding process...');

  const saltRounds = 10;
  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'Password123!';
  const commonPasswordHash = await bcrypt.hash(defaultPassword, saltRounds);

  // ==========================================
  // 1. SEED USERS & PROFILES
  // ==========================================

  // Super Admin Entity
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@spacesync.ac.id' },
    update: { passwordHash: commonPasswordHash },
    create: {
      email: 'admin@spacesync.ac.id',
      passwordHash: commonPasswordHash,
      role: Role.SUPER_ADMIN,
      profile: {
        create: {
          fullName: 'Sistem Administrator Utama',
          phoneNumber: '081100000001',
          department: 'Direktorat Sistem Informasi & Teknologi',
        },
      },
    },
    include: { profile: true },
  });
  console.log(`[Seed] Super Admin initialized: ${superAdmin.email}`);

  // Room Manager Entity
  const roomManager = await prisma.user.upsert({
    where: { email: 'manager.budi@spacesync.ac.id' },
    update: { passwordHash: commonPasswordHash },
    create: {
      email: 'manager.budi@spacesync.ac.id',
      passwordHash: commonPasswordHash,
      role: Role.ROOM_MANAGER,
      profile: {
        create: {
          fullName: 'Budi Santoso, S.Kom., M.Kom.',
          phoneNumber: '081234567890',
          department: 'Pengelola Fasilitas & Sarana Prasarana',
        },
      },
    },
    include: { profile: true },
  });
  console.log(`[Seed] Room Manager initialized: ${roomManager.email}`);

  // Regular User Entity
  const regularUser = await prisma.user.upsert({
    where: { email: 'user.john@spacesync.ac.id' },
    update: { passwordHash: commonPasswordHash },
    create: {
      email: 'user.john@spacesync.ac.id',
      passwordHash: commonPasswordHash,
      role: Role.USER,
      profile: {
        create: {
          fullName: 'John Doe',
          phoneNumber: '081987654321',
          department: 'Fakultas Teknologi Informasi',
        },
      },
    },
    include: { profile: true },
  });
  console.log(`[Seed] Regular User initialized: ${regularUser.email}`);

  // ==========================================
  // 2. SEED INITIAL ROOMS INVENTORY
  // ==========================================

  const sampleRooms = [
    {
      code: 'AUD-01',
      name: 'Auditorium Utama Lantai 3',
      capacity: 150,
      location: 'Gedung Rektorat Lt. 3',
      status: RoomStatus.AVAILABLE,
      timezone: 'Asia/Jakarta',
      bufferMinutes: 15,
      managerId: roomManager.id,
    },
    {
      code: 'LAB-KOMP-01',
      name: 'Laboratorium Komputer 1',
      capacity: 40,
      location: 'Gedung Lab Terpadu Lt. 2, Sayap Barat',
      status: RoomStatus.AVAILABLE,
      timezone: 'Asia/Jakarta',
      bufferMinutes: 15,
      managerId: roomManager.id,
    },
    {
      code: 'MEET-EXEC-01',
      name: 'Ruang Rapat Eksekutif',
      capacity: 20,
      location: 'Gedung Rektorat Lt. 2',
      status: RoomStatus.AVAILABLE,
      timezone: 'Asia/Jakarta',
      bufferMinutes: 15,
      managerId: roomManager.id,
    },
  ];

  for (const roomData of sampleRooms) {
    const room = await prisma.room.upsert({
      where: { code: roomData.code },
      update: {
        name: roomData.name,
        capacity: roomData.capacity,
        location: roomData.location,
        status: roomData.status,
        timezone: roomData.timezone,
        bufferMinutes: roomData.bufferMinutes,
        managerId: roomData.managerId,
      },
      create: roomData,
    });
    console.log(`[Seed] Room initialized: [${room.code}] - ${room.name}`);
  }

  console.log('[Seed] Seeding process completed successfully.');
}

main()
  .catch((error) => {
    console.error('[Seed] Error encountered during seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
