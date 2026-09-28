-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ROOM_MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "hashed_refresh_token" VARCHAR(255),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(30),
    "department" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
    "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "manager_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "operational_end_time" TIMESTAMPTZ(6) NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_blocks" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "reason" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "operational_end_time" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "old_status" "BookingStatus",
    "new_status" "BookingStatus" NOT NULL,
    "notes" TEXT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE INDEX "idx_rooms_catalog_filter" ON "rooms"("status", "capacity");

-- CreateIndex
CREATE INDEX "idx_rooms_manager_id" ON "rooms"("manager_id");

-- CreateIndex
CREATE INDEX "idx_bookings_room_timeline" ON "bookings"("room_id", "start_time", "operational_end_time");

-- CreateIndex
CREATE INDEX "idx_bookings_user_status" ON "bookings"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_bookings_cron_status" ON "bookings"("status", "start_time");

-- CreateIndex
CREATE INDEX "idx_maintenance_room_timeline" ON "maintenance_blocks"("room_id", "start_time", "operational_end_time");

-- CreateIndex
CREATE INDEX "idx_audit_logs_booking_history" ON "audit_logs"("booking_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- CUSTOM POSTGRESQL EXTENSION & GiST EXCLUSION CONSTRAINTS
-- =====================================================================

-- 1. Enable btree_gist extension to support GiST indexing over scalar columns (UUID)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Prevent overlapping bookings for active reservations (PENDING and APPROVED)
-- Uses half-open interval: [start_time, operational_end_time)
ALTER TABLE "bookings"
ADD CONSTRAINT "no_overlapping_active_bookings"
EXCLUDE USING GIST (
  "room_id" WITH =,
  tstzrange("start_time", "operational_end_time", '[)') WITH &&
)
WHERE ("status" IN ('APPROVED', 'PENDING'));

-- 3. Prevent overlapping maintenance windows for the same room
ALTER TABLE "maintenance_blocks"
ADD CONSTRAINT "no_overlapping_maintenance_blocks"
EXCLUDE USING GIST (
  "room_id" WITH =,
  tstzrange("start_time", "operational_end_time", '[)') WITH &&
);
