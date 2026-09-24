# Database Design & Persistence Specification — SpaceSync

**Nama Proyek:** SpaceSync  
**Tipe Dokumen:** Database Architecture & Schema Specification  
**Versi:** 1.0.0 (Fase 1 - MVP & Fase 2 Extension Schema)  
**Database Engine:** PostgreSQL 16+  
**ORM:** Prisma ORM v5+ / v6+

---

## 1. Skema Master Prisma (`schema.prisma`)

Seluruh representasi waktu menggunakan tipe data `DateTime` yang dipetakan ke PostgreSQL `TIMESTAMPTZ` (`timestamp with time zone`). Hal ini menjamin konsistensi absolut berbasis UTC di level database engine tanpa terpengaruh perbedaan zona waktu lokal klien.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["relationJoins"]
}

// ==========================================
// ENUMS
// ==========================================

enum Role {
  SUPER_ADMIN
  ROOM_MANAGER
  USER
}

enum RoomStatus {
  AVAILABLE
  MAINTENANCE
  INACTIVE
}

enum BookingStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
  COMPLETED
}

// ==========================================
// MODELS
// ==========================================

model User {
  id                 String     @id @default(uuid()) @db.Uuid
  email              String     @unique @db.VarChar(255)
  passwordHash       String     @map("password_hash") @db.VarChar(255)
  hashedRefreshToken String?    @map("hashed_refresh_token") @db.VarChar(255)
  role               Role       @default(USER)
  createdAt          DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  profile            Profile?
  managedRooms       Room[]     @relation("RoomManagerRelation")
  bookings           Booking[]
  auditLogs          AuditLog[]

  @@map("users")
}

model Profile {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @unique @map("user_id") @db.Uuid
  fullName    String   @map("full_name") @db.VarChar(150)
  phoneNumber String?  @map("phone_number") @db.VarChar(30)
  department  String?  @db.VarChar(100)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profiles")
}

model Room {
  id            String             @id @default(uuid()) @db.Uuid
  name          String             @db.VarChar(100)
  code          String             @unique @db.VarChar(30)
  capacity      Int                @db.Integer
  location      String             @db.VarChar(255)
  status        RoomStatus         @default(AVAILABLE)
  bufferMinutes Int                @default(15) @map("buffer_minutes") @db.Integer
  managerId     String?            @map("manager_id") @db.Uuid
  createdAt     DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  manager       User?              @relation("RoomManagerRelation", fields: [managerId], references: [id], onDelete: SetNull)
  bookings      Booking[]
  maintenances  MaintenanceBlock[]

  @@index([status, capacity], name: "idx_rooms_catalog_filter")
  @@index([managerId], name: "idx_rooms_manager_id")
  @@map("rooms")
}

model Booking {
  id                 String        @id @default(uuid()) @db.Uuid
  roomId             String        @map("room_id") @db.Uuid
  userId             String        @map("user_id") @db.Uuid
  title              String        @db.VarChar(150)
  description        String?       @db.Text
  startTime          DateTime      @map("start_time") @db.Timestamptz(6)
  endTime            DateTime      @map("end_time") @db.Timestamptz(6)
  operationalEndTime DateTime      @map("operational_end_time") @db.Timestamptz(6)
  bufferMinutes      Int           @default(15) @map("buffer_minutes") @db.Integer
  status             BookingStatus @default(PENDING)
  rejectionReason    String?       @map("rejection_reason") @db.Text
  cancellationReason String?       @map("cancellation_reason") @db.Text
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  room               Room          @relation(fields: [roomId], references: [id], onDelete: Restrict)
  user               User          @relation(fields: [userId], references: [id], onDelete: Restrict)
  auditLogs          AuditLog[]

  @@index([roomId, startTime, operationalEndTime], name: "idx_bookings_room_timeline")
  @@index([userId, status], name: "idx_bookings_user_status")
  @@index([status, startTime], name: "idx_bookings_cron_status")
  @@map("bookings")
}

model MaintenanceBlock {
  id                 String   @id @default(uuid()) @db.Uuid
  roomId             String   @map("room_id") @db.Uuid
  title              String   @db.VarChar(150)
  reason             String   @db.Text
  startTime          DateTime @map("start_time") @db.Timestamptz(6)
  operationalEndTime DateTime @map("operational_end_time") @db.Timestamptz(6)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  room               Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)

  @@index([roomId, startTime, operationalEndTime], name: "idx_maintenance_room_timeline")
  @@map("maintenance_blocks")
}

model AuditLog {
  id         String         @id @default(uuid()) @db.Uuid
  bookingId  String         @map("booking_id") @db.Uuid
  actorId    String         @map("actor_id") @db.Uuid
  action     String         @db.VarChar(50)
  oldStatus  BookingStatus? @map("old_status")
  newStatus  BookingStatus  @map("new_status")
  notes      String?        @db.Text
  recordedAt DateTime       @default(now()) @map("recorded_at") @db.Timestamptz(6)

  booking    Booking        @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  actor      User           @relation(fields: [actorId], references: [id], onDelete: Restrict)

  @@index([bookingId, recordedAt], name: "idx_audit_logs_booking_history")
  @@map("audit_logs")
}
```

---

## 2. Penjelasan Relasi & Integritas Referensial (Foreign Keys)

- **User $\leftrightarrow$ Profile (1:1):** Relasi satu-ke-satu tegas. Aturan `onDelete: Cascade` memastikan ketika entitas `User` dihapus, data profil turunannya dibersihkan secara otomatis.
- **User $\leftrightarrow$ Room (1:N, Penanggung Jawab):** Seorang pengguna dengan peran `ROOM_MANAGER` dapat mengelola beberapa ruangan. Aturan `onDelete: SetNull` diterapkan agar jika akun manajer dinonaktifkan atau dihapus, data ruangan fisik tetap bertahan tanpa merusak riwayat transaksi.
- **Room $\leftrightarrow$ Booking (1:N):** Relasi transaksi utama. Aturan `onDelete: Restrict` mencegah penghapusan ruangan secara fisik jika masih memiliki rekaman data reservasi (audit trail integritas data finansial/operasional).
- **User $\leftrightarrow$ Booking (1:N):** Menghubungkan pemohon dengan reservasi miliknya. Menggunakan aturan `onDelete: Restrict` demi mencegah data pemesanan lampau menjadi _orphaned row_.
- **Booking $\leftrightarrow$ AuditLog (1:N):** Jejak mutasi status. Jika entitas booking di-_purge_ (misalnya pada lingkungan staging), seluruh log mutasi terkait terhapus melalui `onDelete: Cascade`.
- **User $\leftrightarrow$ AuditLog (1:N):** Menghubungkan aktor yang mengeksekusi mutasi (Admin/Manager/User). Menggunakan aturan `onDelete: Restrict` agar identitas aktor perubahan tetap terlindungi.

---

## 3. Kamus Data & Enums

### 3.1 Nilai Enum

- **`Role`**:
  - `SUPER_ADMIN`: Akses global seluruh entitas.
  - `ROOM_MANAGER`: Pengelola ruangan dan validator pemesanan unit terkait.
  - `USER`: Pemohon reservasi fasilitas.

- **`RoomStatus`**:
  - `AVAILABLE`: Aktif dan dapat dipesan.
  - `MAINTENANCE`: Dinonaktifkan sementara untuk perbaikan.
  - `INACTIVE`: Diarsipkan permanen dari katalog.

- **`BookingStatus`**:
  - `PENDING`: Pengajuan baru menunggu persetujuan (slot waktu terkunci sementara).
  - `APPROVED`: Disetujui (slot terkunci definitif).
  - `REJECTED`: Ditolak oleh pengelola ruangan.
  - `CANCELLED`: Dibatalkan sebelum jadwal oleh pemohon/manajer.
  - `COMPLETED`: Jadwal reservasi telah berakhir secara aktual.

### 3.2 Kamus Entitas Transaksional Kunci (`bookings`)

| Kolom                  | Tipe Data       | Nullable | Nilai Default | Penjelasan Fungsional                                    |
| ---------------------- | --------------- | -------- | ------------- | -------------------------------------------------------- |
| `id`                   | `UUID`          | No       | `uuid()`      | Identifikator unik primer (PK).                          |
| `room_id`              | `UUID`          | No       | -             | Foreign Key ke tabel `rooms.id`.                         |
| `user_id`              | `UUID`          | No       | -             | Foreign Key ke tabel `users.id` (pemohon).               |
| `title`                | `VARCHAR(150)`  | No       | -             | Judul atau peruntukan kegiatan penggunaan.               |
| `description`          | `TEXT`          | Yes      | `NULL`        | Rincian agenda atau kebutuhan perlengkapan.              |
| `start_time`           | `TIMESTAMPTZ`   | No       | -             | Waktu mulai acara penyewa (UTC).                         |
| `end_time`             | `TIMESTAMPTZ`   | No       | -             | Waktu selesai acara penyewa (UTC).                       |
| `operational_end_time` | `TIMESTAMPTZ`   | No       | -             | Batas akhir fisik ruangan: `end_time + buffer_minutes`.  |
| `buffer_minutes`       | `INTEGER`       | No       | `15`          | Snapshot durasi jeda pembersihan yang diterapkan.        |
| `status`               | `BookingStatus` | No       | `'PENDING'`   | Status alur kerja reservasi.                             |
| `rejection_reason`     | `TEXT`          | Yes      | `NULL`        | Keterangan wajib saat status berubah menjadi `REJECTED`. |
| `cancellation_reason`  | `TEXT`          | Yes      | `NULL`        | Keterangan alasan pembatalan oleh user atau manajer.     |

### 3.3 Kamus Entitas Pengguna & Autentikasi (`users`)

| Kolom                  | Tipe Data       | Nullable | Nilai Default | Penjelasan Fungsional                                              |
| ---------------------- | --------------- | -------- | ------------- | ------------------------------------------------------------------ |
| `id`                   | `UUID`          | No       | `uuid()`      | Identifikator unik primer pengguna (PK).                           |
| `email`                | `VARCHAR(255)`  | No       | -             | Alamat email unik untuk kredensial autentikasi.                    |
| `password_hash`        | `VARCHAR(255)`  | No       | -             | Hash password akun (Argon2id / bcrypt).                            |
| `hashed_refresh_token` | `VARCHAR(255)`  | Yes      | `NULL`        | Hash refresh token aktif untuk validasi rotasi & sesi persistensi. |
| `role`                 | `Role`          | No       | `'USER'`      | Peran hak akses (`SUPER_ADMIN`, `ROOM_MANAGER`, `USER`).           |
| `created_at`           | `TIMESTAMPTZ`   | No       | `now()`       | Timestamp pembuatan akun pengguna (UTC).                           |
| `updated_at`           | `TIMESTAMPTZ`   | No       | `now()`       | Timestamp pembaruan data pengguna (UTC).                           |

---

## 4. Strategi Indexing Performa

```text
Tabel: bookings
├── idx_bookings_room_timeline   (room_id, start_time, operational_end_time)
├── idx_bookings_user_status     (user_id, status)
└── idx_bookings_cron_status     (status, start_time)

Tabel: rooms
├── idx_rooms_catalog_filter     (status, capacity)
└── idx_rooms_manager_id         (manager_id)

Tabel: maintenance_blocks
└── idx_maintenance_room_timeline (room_id, start_time, operational_end_time)

```

### Rationale Arsitektural Indeks

1. **`idx_bookings_room_timeline` (Composite B-Tree):**
   - _Kebutuhan:_ Endpoint pengecekan ketersediaan kalender (`GET /rooms/:id/availability?date=...`) dan pengecekan overlap saat reservasi baru dibuat.
   - _Mekanisme:_ Kolom `room_id` memiliki kardinalitas tinggi untuk menyaring partisi ruangan terlebih dahulu, diikuti pemindaian rentang tanggal/jam via `start_time` dan `operational_end_time` secara cepat (_Index Range Scan_).

2. **`idx_bookings_cron_status` (Composite B-Tree):**
   - _Kebutuhan:_ Worker latar belakang NestJS Cron (`@nestjs/schedule`) yang berjalan periodik untuk membatalkan `PENDING` yang kedaluwarsa atau menyelesaikan reservasi `APPROVED` yang waktunya telah terlewati.
   - _Mekanisme:_ Mencegah _Full Table Scan_ pada seluruh baris booking yang terus bertambah seiring berjalannya waktu.

3. **`idx_rooms_catalog_filter` (Composite B-Tree):**
   - _Kebutuhan:_ Mempercepat filter daftar ruangan publik berdasarkan status operasional aktif dan kapasitas minimum peserta.

4. **`idx_rooms_manager_id` (B-Tree):**
   - _Kebutuhan:_ Mempercepat pemfilteran katalog ruangan dan antrean persetujuan oleh pengguna dengan peran `ROOM_MANAGER` untuk melihat ruangan yang berada di bawah wewenangnya (`GET /management/rooms` & `GET /management/approvals`).
   - _Mekanisme:_ Menyediakan indeks langsung pada Foreign Key `manager_id` guna menghindari _Sequential Table Scan_ pada tabel `rooms`.

---

## 5. PostgreSQL Custom Migration: Database Exclusion Constraint

Untuk menjamin prinsip integritas _zero-overlap_ pada tingkat database engine secara mutlak (_race-condition immune_), tabel `bookings` dan `maintenance_blocks` dilengkapi dengan **Exclusion Constraint** menggunakan ekstensi PostgreSQL `btree_gist`.

### Script Migrasi Manual (`prisma/migrations/<timestamp>_add_exclusion_constraints/migration.sql`)

```sql
-- 1. Aktifkan ekstensi GiST untuk tipe data scalar B-Tree
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Tambahkan Exclusion Constraint pada tabel bookings
-- Mencegah dua baris memiliki room_id yang sama dan rentang waktu tstzrange yang saling tumpang tindih
-- Hanya dievaluasi untuk status reservasi aktif yang mengunci slot (APPROVED dan PENDING)
ALTER TABLE "bookings"
ADD CONSTRAINT "no_overlapping_active_bookings"
EXCLUDE USING GIST (
  "room_id" WITH =,
  tstzrange("start_time", "operational_end_time", '[)') WITH &&
)
WHERE ("status" IN ('APPROVED', 'PENDING'));

-- 3. Tambahkan Exclusion Constraint pada tabel maintenance_blocks
ALTER TABLE "maintenance_blocks"
ADD CONSTRAINT "no_overlapping_maintenance_blocks"
EXCLUDE USING GIST (
  "room_id" WITH =,
  tstzrange("start_time", "operational_end_time", '[)') WITH &&
);

```

> **Catatan Integritas:** Notasi `'[)'` pada `tstzrange` menandakan interval setengah terbuka: inklusif pada `start_time` dan eksklusif pada `operational_end_time`. Artinya, jika Booking A selesai pada rentang operasional `10:15:00.000Z`, maka Booking B yang dimulai tepat pukul `10:15:00.000Z` bernilai valid dan tidak menimbulkan konflik.

### 5.1 Panduan Penanganan Error Code PostgreSQL 23P01 pada Global Prisma Exception Filter di NestJS

Ketika transaksi konkuren lolos dari pemeriksaan awal di level aplikasi dan menabrak *Exclusion Constraint*, PostgreSQL menolak operasi `INSERT`/`UPDATE` dengan kode kesalahan native SQLSTATE **`23P01`** (`exclusion_violation`).

Secara default, Prisma ORM membungkus kesalahan engine ini ke dalam `PrismaClientKnownRequestError` (dengan kode `P2010` jika melalui raw query, atau error meta terkait) atau `PrismaClientUnknownRequestError`. Jika tidak ditangani secara spesifik pada filter global NestJS, galat ini akan diperlakukan sebagai kegagalan sistem umum dan menghasilkan respon **`HTTP 500 Internal Server Error`** ke klien.

Untuk mengonversinya menjadi respon bisnis **`HTTP 409 Conflict`** yang terstandarisasi, implementasikan pemetaan galat pada Global Exception Filter:

```typescript
// backend/src/common/filters/prisma-client-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Response } from "express";

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 1. Deteksi kode native SQLSTATE 23P01 (exclusion_violation)
    const isExclusionViolation =
      (exception instanceof Prisma.PrismaClientKnownRequestError &&
        (exception.code === "P2010" || exception.code === "P2002") &&
        (exception.meta?.code === "23P01" ||
          String(exception.meta?.message).includes("23P01"))) ||
      exception.message.includes("23P01") ||
      exception.message.includes("exclusion_violation");

    if (isExclusionViolation) {
      return response.status(HttpStatus.CONFLICT).json({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        error: "ConflictException",
        message:
          "Slot waktu bentrok dengan reservasi yang sudah ada atau masa pembersihan buffer.",
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Pemetaan kode Prisma standar lainnya
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case "P2002":
          return response.status(HttpStatus.CONFLICT).json({
            success: false,
            statusCode: HttpStatus.CONFLICT,
            error: "ConflictException",
            message: `Nilai unik pada kolom '${(exception.meta?.target as string[])?.join(", ")}' sudah digunakan.`,
            timestamp: new Date().toISOString(),
          });
        case "P2025":
          return response.status(HttpStatus.NOT_FOUND).json({
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            error: "NotFoundException",
            message: "Entitas data yang diminta tidak ditemukan.",
            timestamp: new Date().toISOString(),
          });
        default:
          break;
      }
    }

    // 3. Fallback jika galat database tidak terpetakan
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "InternalServerError",
      message: "Terjadi kesalahan internal pada transaksi basis data.",
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## 6. Query Validasi Deteksi Overlap Waktu

### 6.1 Query Transaksional Tingkat Aplikasi (Prisma Client)

Sebelum query insert dieksekusi, service aplikasi memeriksa ketersediaan slot waktu secara simultan terhadap tabel `bookings` dan tabel `maintenance_blocks`:

```typescript
// backend/src/modules/bookings/services/conflict-engine.service.ts
import { Injectable, ConflictException } from "@nestjs/common";
import { Prisma, PrismaService } from "src/database";

interface ConflictCheckParams {
  roomId: string;
  newStartTime: Date; // UTC
  newOperationalEndTime: Date; // UTC (newEndTime + bufferMinutes)
  excludeBookingId?: string; // Digunakan saat reschedule / update
}

@Injectable()
export class ConflictEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async validateSlotAvailability(
    tx: Prisma.TransactionClient,
    params: ConflictCheckParams,
  ): Promise<void> {
    const { roomId, newStartTime, newOperationalEndTime, excludeBookingId } =
      params;

    // 1. Periksa benturan terhadap reservasi aktif (PENDING & APPROVED)
    const bookingConflict = await tx.booking.findFirst({
      where: {
        roomId,
        status: { in: ["APPROVED", "PENDING"] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        AND: [
          { startTime: { lt: newOperationalEndTime } },
          { operationalEndTime: { gt: newStartTime } },
        ],
      },
      select: { id: true, startTime: true, endTime: true, status: true },
    });

    if (bookingConflict) {
      throw new ConflictException({
        code: "SLOT_OVERLAP_BOOKING",
        message:
          "Slot waktu bentrok dengan reservasi yang sudah ada atau masa pembersihan buffer.",
        conflictDetails: bookingConflict,
      });
    }

    // 2. Periksa benturan terhadap jadwal pemeliharaan ruangan
    const maintenanceConflict = await tx.maintenanceBlock.findFirst({
      where: {
        roomId,
        AND: [
          { startTime: { lt: newOperationalEndTime } },
          { operationalEndTime: { gt: newStartTime } },
        ],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        operationalEndTime: true,
      },
    });

    if (maintenanceConflict) {
      throw new ConflictException({
        code: "SLOT_OVERLAP_MAINTENANCE",
        message:
          "Ruangan sedang dalam jadwal pemeliharaan rutin pada jam tersebut.",
        conflictDetails: maintenanceConflict,
      });
    }
  }
}
```

### 6.2 Raw SQL Atomic Concurrency Lock (Kompensasi Race Condition)

Jika isolasi transaksi di tingkat database dieksekusi secara manual sebelum proses insert dilakukan:

```sql
-- Dijalankan di dalam PostgreSQL Transaction Block
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Kunci baris ruangan agar pemesanan konkuren lain menunggu giliran verifikasi
SELECT id FROM "rooms"
WHERE id = :target_room_id
FOR UPDATE;

-- Validasi tumpang tindih waktu
SELECT id FROM "bookings"
WHERE "room_id" = :target_room_id
  AND "status" IN ('APPROVED', 'PENDING')
  AND tstzrange("start_time", "operational_end_time", '[)') &&
      tstzrange(:new_start_time, :new_operational_end_time, '[)')
LIMIT 1;

-- Jika count = 0, lakukan INSERT
INSERT INTO "bookings" (
  id, room_id, user_id, title, start_time, end_time, operational_end_time, buffer_minutes, status, created_at, updated_at
) VALUES (
  gen_random_uuid(), :target_room_id, :target_user_id, :title, :new_start_time, :new_end_time, :new_operational_end_time, 15, 'PENDING', NOW(), NOW()
);

COMMIT;

```

Jika terjadi race condition pada milidetik yang identik dan melewati verifikasi level aplikasi, `no_overlapping_active_bookings` constraint di tingkat database PostgreSQL langsung menolak transaksi kedua dengan kode error `23P01` (_exclusion_violation_). Error ini kemudian ditangkap oleh `PrismaClientKnownRequestError` di NestJS dan dikonversi menjadi response HTTP `409 Conflict` terstandarisasi.

### 6.3 Catatan Arsitektural: Validasi Atomik Lintas Tabel (Booking vs MaintenanceBlock)

Terdapat batasan teknis mendasar pada PostgreSQL: **Exclusion Constraint GiST hanya dapat menegakkan aturan integritas pada baris-baris di dalam satu tabel yang sama**. PostgreSQL engine tidak mendukung *cross-table exclusion constraints*.

Artinya, PostgreSQL **tidak dapat** secara native memblokir jika jadwal pemeliharaan baru pada tabel `maintenance_blocks` bertubrukan dengan reservasi aktif pada tabel `bookings`.

Untuk mengatasi batasan ini, SpaceSync menetapkan strategi arsitektural ganda:

#### 1. Penegakan Integritas di Application & Transaction Layer (Fase 1 - Terpilih)
Pencegahan bentrok lintas tabel dijamin secara atomik menggunakan kombinasi:
- **Pessimistic Row Lock:** Mengunci baris induk `Room` menggunakan query `SELECT id FROM "rooms" WHERE id = :roomId FOR UPDATE` di dalam transaksi ACID.
- **Dual Query Verification:** Di dalam `ConflictEngineService.validateSlotAvailability`, service mengeksekusi verifikasi overlap terhadap tabel `bookings` dan tabel `maintenance_blocks` secara berurutan dalam unit kerja (*unit of work*) transaksi yang sama.
- Karena baris `Room` dikunci secara eksklusif, proses persetujuan pemesanan umum dan pembuatan blok pemeliharaan untuk ruangan yang sama dipaksa berjalan antre (*serialized execution*), mengeliminasi celah *race condition* lintas tabel.

#### 2. Alternatif Arsitektur Tabel Tunggal (Fase Lanjutan / Opsi Unifikasi)
Jika di masa depan diinginkan penegakan integritas 100% mutlak di level engine PostgreSQL tanpa mengandalkan lock aplikasi:
- Entitas pemeliharaan dapat dilebur ke dalam tabel `bookings` dengan menambahkan kolom diskriminator `type`:
  ```prisma
  enum BookingType {
    REGULAR
    MAINTENANCE
  }
  ```
- Dengan pendekatan *Single Table*, Exclusion Constraint PostgreSQL otomatis melindungi seluruh slot jadwal (baik kegiatan pengguna maupun pemeliharaan fasilitas) dalam satu indeks GiST tunggal:
  ```sql
  ALTER TABLE "bookings"
  ADD CONSTRAINT "no_overlapping_all_events"
  EXCLUDE USING GIST (
    "room_id" WITH =,
    tstzrange("start_time", "operational_end_time", '[)') WITH &&
  )
  WHERE ("status" IN ('APPROVED', 'PENDING'));
  ```
