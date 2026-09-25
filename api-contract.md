# API Contract & Endpoint Specification — SpaceSync

**Nama Proyek:** SpaceSync  
**Tipe Dokumen:** RESTful API Contract & Interface Specification (Part 1: Envelope & Identity)  
**Versi:** 1.0.0  
**Base URL:** `/api/v1`  
**Content-Type:** `application/json`

---

## 1. Standar Response Format (Envelope Pattern)

Semua endpoint backend NestJS mengimplementasikan Envelope Pattern secara konsisten. Lapisan transformasi diatur secara global menggunakan `TransformResponseInterceptor` untuk respons sukses dan `HttpExceptionFilter` untuk penanganan kegagalan.

### 1.1 Success Response Structure

Digunakan untuk seluruh respons dengan kode status HTTP 2xx. Struktur mendukung payload data tunggal, array, maupun paginasi.

```typescript
export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource retrieved successfully",
  "data": {},
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### 1.2 Error Response Structure

Digunakan untuk seluruh respons kegagalan dengan kode status HTTP 4xx dan 5xx. Format menjamin frontend dapat mengekstrak pesan spesifik per field form secara deterministik.

```typescript
export interface ApiFieldError {
  field: string;
  issue: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  errors?: ApiFieldError[];
  timestamp: string;
  path: string;
}
```

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Validasi input gagal",
  "errors": [
    {
      "field": "email",
      "issue": "Format email tidak valid"
    }
  ],
  "timestamp": "2026-09-25T02:40:00.000Z",
  "path": "/api/v1/auth/register"
}
```

### 1.3 Standar HTTP Status Codes

| Status Code                 | Klasifikasi  | Penggunaan Spesifik di SpaceSync                                                                                   |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `200 OK`                    | Success      | Pengambilan data (GET), pembaruan parsial (PATCH), atau eksekusi proses non-idempotent tanpa pembuatan baris baru. |
| `201 Created`               | Success      | Pembuatan entitas baru di basis data (POST register, create room, create booking).                                 |
| `400 Bad Request`           | Client Error | Malformed JSON, pelanggaran validasi DTO (class-validator), atau pelanggaran aturan bisnis mendasar.               |
| `401 Unauthorized`          | Client Error | Ketiadaan, kedaluwarsa, atau ketidakvalidan token JWT pada protected routes.                                       |
| `403 Forbidden`             | Client Error | Pengguna terautentikasi tetapi tidak memiliki peran (role) yang berhak mengakses resource.                         |
| `404 Not Found`             | Client Error | Resource (User ID, Room ID, Booking ID) tidak ditemukan di sistem.                                                 |
| `409 Conflict`              | Client Error | Pelanggaran duplikasi unik (email telah terdaftar) atau zero-overlap rule (slot waktu bentrok).                    |
| `422 Unprocessable Entity`  | Client Error | Sintaks payload benar, tetapi logika parameter tidak dapat diproses secara semantik.                               |
| `500 Internal Server Error` | Server Error | Kesalahan runtime internal server, kegagalan koneksi database, atau pengecualian yang tidak ditangani.             |

---

### 1.4 Standarisasi Validasi Route Parameter (ParseUUIDPipe)

Untuk memastikan keandalan sistem dan mencegah *payload* dengan format ID sembarang menembus ke *service layer* atau membebani *connection pool* basis data, seluruh route controller yang menerima parameter entitas dinamis (`:id`, `:maintenanceId`, `:actorId`) **diwajibkan** menggunakan pipe bawaan NestJS:

```typescript
@Param('id', new ParseUUIDPipe({ version: '4' })) id: string
```

Jika klien mengirimkan parameter yang bukan merupakan representasi string UUID v4 valid (misal: `/api/v1/bookings/123-abc` atau `/api/v1/rooms/random_string`), NestJS secara otomatis memutus rantai eksekusi dan mengembalikan respons `400 Bad Request` terstandarisasi sebelum menyentuh logika bisnis:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Validation failed (uuid v4 is expected)",
  "timestamp": "2026-09-25T03:30:00.000Z",
  "path": "/api/v1/bookings/invalid-id"
}
```

---

## 2. Modul Autentikasi & Pengguna

### 2.1 Register User Baru

Mendaftarkan akun internal baru. Pengguna baru secara default memperoleh peran `USER`.

- **Endpoint:** `POST /api/v1/auth/register`
- **Akses Guard:** `@Public()` (Tanpa Guard)
- **Headers:** `Content-Type: application/json`

#### Request Body DTO

Dekorator memvalidasi alamat email institusional, kekuatan kata sandi minimal 8 karakter dengan kombinasi angka dan huruf, serta sanitasi string nama lengkap.

```typescript
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from "class-validator";

export class RegisterDto {
  @ApiProperty({
    example: "budi.santoso@institution.ac.id",
    description: "Email resmi pengguna",
  })
  @IsEmail({}, { message: "Format email tidak valid" })
  @IsNotEmpty({ message: "Email wajib diisi" })
  email: string;

  @ApiProperty({
    example: "Rahasia123!",
    description: "Password minimal 8 karakter, kombinasi huruf & angka",
  })
  @IsString()
  @MinLength(8, { message: "Password minimal terdiri dari 8 karakter" })
  @Matches(/^(?=.*[A-Za-z])(?=.*\\d).*$/, {
    message: "Password harus mengandung setidaknya satu huruf dan satu angka",
  })
  password: string;

  @ApiProperty({
    example: "Budi Santoso",
    description: "Nama lengkap pengguna",
  })
  @IsString()
  @IsNotEmpty({ message: "Nama lengkap wajib diisi" })
  fullName: string;

  @ApiProperty({ example: "081234567890", required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ example: "Teknologi Informasi", required: false })
  @IsOptional()
  @IsString()
  department?: string;
}
```

#### Response Payloads

**Success (`HTTP 201 Created`)**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Registrasi akun berhasil",
  "data": {
    "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "email": "budi.santoso@institution.ac.id",
    "role": "USER",
    "profile": {
      "fullName": "Budi Santoso",
      "phoneNumber": "081234567890",
      "department": "Teknologi Informasi"
    },
    "createdAt": "2026-09-25T02:40:00.000Z"
  }
}
```

**Failure (`HTTP 409 Conflict`)**

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Email sudah terdaftar pada sistem",
  "timestamp": "2026-09-25T02:40:01.000Z",
  "path": "/api/v1/auth/register"
}
```

- **Error Codes Terkait:**
  - `AUTH_EMAIL_ALREADY_EXISTS` (`409`): Alamat email telah dipakai entitas lain.
  - `VALIDATION_FAILED` (`400`): Format payload tidak memenuhi batasan DTO.

---

### 2.2 Login

Mengautentikasi pengguna menggunakan kredensial email dan password. Menghasilkan Access Token (disimpan di memori klien) dan Refresh Token (dikirim via cookie Set-Cookie berstatus HttpOnly).

- **Endpoint:** `POST /api/v1/auth/login`
- **Akses Guard:** `@Public()` (Tanpa Guard)
- **Headers:** `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "budi.santoso@institution.ac.id" })
  @IsEmail({}, { message: "Format email tidak valid" })
  @IsNotEmpty({ message: "Email tidak boleh kosong" })
  email: string;

  @ApiProperty({ example: "Rahasia123!" })
  @IsString()
  @IsNotEmpty({ message: "Password tidak boleh kosong" })
  password: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

- **Header Response:** `Set-Cookie: refresh_token=eyJhbGciOi...; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Autentikasi berhasil",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
      "email": "budi.santoso@institution.ac.id",
      "role": "USER",
      "fullName": "Budi Santoso"
    }
  }
}
```

**Failure (`HTTP 401 Unauthorized`)**

```json
{
  "success": false,
  "statusCode": 401,
  "error": "UnauthorizedException",
  "message": "Kredensial yang diberikan tidak valid",
  "timestamp": "2026-09-25T02:41:00.000Z",
  "path": "/api/v1/auth/login"
}
```

- **Error Codes Terkait:**
  - `AUTH_INVALID_CREDENTIALS` (`401`): Pasangan email dan password tidak cocok.
  - `AUTH_ACCOUNT_DISABLED` (`403`): Akun berstatus ditangguhkan/inaktif.

---

### 2.3 Refresh Token

Memperbarui pasangan token sesi. Refresh token diekstraksi dari HttpOnly cookie untuk mencegah XSS.

- **Endpoint:** `POST /api/v1/auth/refresh`
- **Akses Guard:** `@UseGuards(JwtRefreshGuard)`
- **Headers:** `Cookie: refresh_token=<JWT_REFRESH_TOKEN>`
- **Request Body:** None (Payload diambil langsung dari cookie `refresh_token`).

#### Response Payloads

**Success (`HTTP 200 OK`)**

- **Header Response:** `Set-Cookie: refresh_token=eyJhbGciOi...<NEW_ROTATED_TOKEN>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token berhasil diperbarui",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...<NEW_ACCESS_TOKEN>"
  }
}
```

**Failure (`HTTP 401 Unauthorized`)**

```json
{
  "success": false,
  "statusCode": 401,
  "error": "UnauthorizedException",
  "message": "Refresh token kedaluwarsa atau tidak valid",
  "timestamp": "2026-09-25T02:42:00.000Z",
  "path": "/api/v1/auth/refresh"
}
```

- **Error Codes Terkait:**
  - `AUTH_REFRESH_TOKEN_EXPIRED` (`401`): Sesi 7 hari berakhir, pengguna wajib re-login.
  - `AUTH_REFRESH_TOKEN_INVALID` (`401`): Signature token tidak cocok atau manipulasi cookie.

---

### 2.4 Logout (Pencabutan Sesi)

Mengakhiri sesi pengguna aktif dengan menghapus hash refresh token di database (`currentHashedRefreshToken = null`) serta menginstruksikan browser untuk menghapus cookie `HttpOnly` refresh token.

- **Endpoint:** `POST /api/v1/auth/logout`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`
- **Response Headers:** `Set-Cookie: refresh_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
- **Request Body:** None

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Sesi berhasil diakhiri",
  "data": null
}
```

**Failure (`HTTP 401 Unauthorized`)**

```json
{
  "success": false,
  "statusCode": 401,
  "error": "UnauthorizedException",
  "message": "Akses ditolak: Access token tidak valid atau kedaluwarsa",
  "timestamp": "2026-09-25T02:42:30.000Z",
  "path": "/api/v1/auth/logout"
}
```

- **Error Codes Terkait:**
  - `AUTH_UNAUTHORIZED` (`401`): Header Authorization tidak valid atau kedaluwarsa.

---

### 2.5 Dapatkan Profil Pengguna Aktif (`/auth/me`)

Mengembalikan data profil lengkap, penugasan unit ruangan (jika manager), dan identitas peran dari payload JWT pengguna saat ini.

- **Endpoint:** `GET /api/v1/auth/me`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`
- **Request Body:** None

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profil pengguna berhasil dimuat",
  "data": {
    "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "email": "budi.santoso@institution.ac.id",
    "role": "ROOM_MANAGER",
    "profile": {
      "fullName": "Budi Santoso",
      "phoneNumber": "081234567890",
      "department": "Teknologi Informasi"
    },
    "managedRooms": [
      {
        "id": "3b29c922-6b9f-4f65-8b3d-71b56ceaa192",
        "code": "LAB-KOMP-1",
        "name": "Laboratorium Komputer 1"
      }
    ],
    "createdAt": "2026-09-25T02:40:00.000Z"
  }
}
```

**Failure (`HTTP 401 Unauthorized`)**

```json
{
  "success": false,
  "statusCode": 401,
  "error": "UnauthorizedException",
  "message": "Akses ditolak: Access token tidak valid atau kedaluwarsa",
  "timestamp": "2026-09-25T02:43:00.000Z",
  "path": "/api/v1/auth/me"
}
```

- **Error Codes Terkait:**
  - `AUTH_UNAUTHORIZED` (`401`): Header Authorization tidak dilampirkan atau token rusak.

---

### 2.6 Perbarui Profil Pengguna Mandiri

Memperbarui data profil personal milik pengguna yang sedang terautentikasi.

- **Endpoint:** `PATCH /api/v1/users/profile`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateProfileDto {
  @ApiProperty({ example: "Budi Santoso, M.Kom.", required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ example: "081298765432", required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ example: "Pusat Data & Sistem Informasi", required: false })
  @IsOptional()
  @IsString()
  department?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profil berhasil diperbarui",
  "data": {
    "userId": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "fullName": "Budi Santoso, M.Kom.",
    "phoneNumber": "081298765432",
    "department": "Pusat Data & Sistem Informasi",
    "updatedAt": "2026-09-25T02:44:00.000Z"
  }
}
```

- **Error Codes Terkait:**
  - `USER_NOT_FOUND` (`404`): User target tidak ditemukan di persistence layer.

---

### 2.7 Ganti Password Mandiri

Memungkinkan pengguna terautentikasi melakukan rotasi kata sandi dengan memvalidasi kata sandi lama sebelum menyimpan hash kata sandi baru. Setelah berhasil, seluruh sesi aktif (refresh token) dicabut demi keamanan.

- **Endpoint:** `PATCH /api/v1/auth/change-password`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({
    example: "OldPassword123!",
    description: "Kata sandi lama yang saat ini aktif",
  })
  @IsNotEmpty({ message: "Kata sandi lama wajib diisi" })
  @IsString({ message: "Kata sandi lama harus berupa string" })
  oldPassword: string;

  @ApiProperty({
    example: "NewSecurePassword456!",
    description: "Kata sandi baru (minimal 8 karakter)",
  })
  @IsNotEmpty({ message: "Kata sandi baru wajib diisi" })
  @IsString({ message: "Kata sandi baru harus berupa string" })
  @MinLength(8, { message: "Kata sandi baru minimal 8 karakter" })
  newPassword: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

- **Response Headers:** `Set-Cookie: refresh_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Kata sandi berhasil diperbarui. Silakan masuk kembali dengan kredensial baru.",
  "data": null
}
```

**Failure (`HTTP 400 Bad Request` — Kata Sandi Lama Salah)**

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Kata sandi lama yang Anda masukkan tidak sesuai",
  "timestamp": "2026-09-25T02:44:30.000Z",
  "path": "/api/v1/auth/change-password"
}
```

**Failure (`HTTP 422 Unprocessable Entity` — Kata Sandi Baru Sama dengan yang Lama)**

```json
{
  "success": false,
  "statusCode": 422,
  "error": "UnprocessableEntityException",
  "message": "Kata sandi baru tidak boleh sama dengan kata sandi lama",
  "timestamp": "2026-09-25T02:44:31.000Z",
  "path": "/api/v1/auth/change-password"
}
```

- **Error Codes Terkait:**
  - `AUTH_INVALID_OLD_PASSWORD` (`400`): Verifikasi kata sandi lama gagal.
  - `AUTH_PASSWORD_UNCHANGED` (`422`): Kata sandi baru identik dengan kata sandi lama.
  - `AUTH_UNAUTHORIZED` (`401`): Token kedaluwarsa atau tidak valid.

---

### 2.8 Daftar Pengguna Global (Khusus Admin)

Mengambil daftar seluruh pengguna sistem dengan mekanisme paginasi dan filter pencarian.

- **Endpoint:** `GET /api/v1/users`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Query Parameters DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { Role } from "@prisma/client";

export class QueryUsersDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({ required: false, description: "Pencarian nama atau email" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ enum: Role, required: false })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data pengguna berhasil diambil",
  "data": [
    {
      "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
      "email": "budi.santoso@institution.ac.id",
      "role": "USER",
      "profile": {
        "fullName": "Budi Santoso",
        "department": "Teknologi Informasi"
      },
      "createdAt": "2026-09-25T02:40:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

**Failure (`HTTP 403 Forbidden`)**

```json
{
  "success": false,
  "statusCode": 403,
  "error": "ForbiddenException",
  "message": "Akses ditolak: Anda tidak memiliki otoritas peran SUPER_ADMIN",
  "timestamp": "2026-09-25T02:45:00.000Z",
  "path": "/api/v1/users"
}
```

- **Error Codes Terkait:**
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Peran pengguna tidak mencukupi untuk mengeksekusi operasi.

---

### 2.9 Mutasi Peran Pengguna (Khusus Admin)

Mengubah peran hak akses pengguna secara eksplisit.

- **Endpoint:** `PATCH /api/v1/users/:id/role`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty } from "class-validator";
import { Role } from "@prisma/client";

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role, example: Role.ROOM_MANAGER })
  @IsNotEmpty({ message: "Role tidak boleh kosong" })
  @IsEnum(Role, { message: "Nilai role tidak valid" })
  role: Role;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Peran pengguna berhasil diperbarui",
  "data": {
    "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "email": "budi.santoso@institution.ac.id",
    "role": "ROOM_MANAGER",
    "updatedAt": "2026-09-25T02:46:00.000Z"
  }
}
```

**Failure (`HTTP 404 Not Found`)**

```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "Pengguna dengan ID yang dituju tidak ditemukan",
  "timestamp": "2026-09-25T02:46:01.000Z",
  "path": "/api/v1/users/e2a9b340-9a2c-4734-9271-4fb24e883832/role"
}
```

- **Error Codes Terkait:**
  - `USER_NOT_FOUND` (`404`): User target tidak ada di basis data.
  - `AUTH_CANNOT_DEMOTE_SELF` (`422`): Super Admin tidak diperbolehkan menurunkan perannya sendiri demi integritas sistem.

---

## 3. Modul Manajemen Ruangan (`/api/v1/rooms`)

Modul ini memfasilitasi katalogisasi inventaris fasilitas bersama, pengecekan ketersediaan slot waktu secara real-time, serta administrasi operasional ruangan.

---

### 3.1 Daftar Ruangan Publik & Filter Ketersediaan

Mengambil daftar seluruh ruangan dengan filter dinamis berbasis kapasitas, pencarian teks, status operasional, serta ketersediaan slot waktu pada tanggal dan rentang jam tertentu.

- **Endpoint:** `GET /api/v1/rooms`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)` (Seluruh peran terautentikasi: `USER`, `ROOM_MANAGER`, `SUPER_ADMIN`)
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Query Parameters DTO

Dekorator `class-transformer` mengonversi nilai query URL (string) menjadi tipe primitif target (`number`, `Date`), sementara `class-validator` memastikan integritas batasan numerik dan format tanggal UTC.

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from "class-validator";
import { RoomStatus } from "@prisma/client";

export class QueryRoomsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Page harus berupa integer" })
  @Min(1, { message: "Page minimal bernilai 1" })
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Limit harus berupa integer" })
  @Min(1, { message: "Limit minimal bernilai 1" })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Pencarian nama ruangan, kode, atau gedung/lantai",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 20,
    description: "Filter kapasitas minimum peserta",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Kapasitas harus berupa integer" })
  @Min(1, { message: "Kapasitas minimal bernilai 1" })
  minCapacity?: number;

  @ApiPropertyOptional({
    enum: RoomStatus,
    description: "Status ruangan (default: AVAILABLE jika tidak diset)",
  })
  @IsOptional()
  @IsEnum(RoomStatus, { message: "Status ruangan tidak valid" })
  status?: RoomStatus;

  @ApiPropertyOptional({
    example: "2026-10-15",
    description: "Filter ketersediaan berdasarkan tanggal (YYYY-MM-DD)",
  })
  @IsOptional()
  @IsDateString({}, { message: "Format tanggal harus YYYY-MM-DD" })
  date?: string;

  @ApiPropertyOptional({
    example: "2026-10-15T09:00:00.000Z",
    description:
      "Awal rentang waktu yang ingin diperiksa (Wajib UTC ISO-8601 jika endTime diisi)",
  })
  @ValidateIf((o) => o.endTime !== undefined)
  @IsISO8601(
    {},
    { message: "startTime harus berupa format ISO-8601 UTC penuh" },
  )
  startTime?: string;

  @ApiPropertyOptional({
    example: "2026-10-15T11:00:00.000Z",
    description:
      "Akhir rentang waktu yang ingin diperiksa (Wajib UTC ISO-8601 jika startTime diisi)",
  })
  @ValidateIf((o) => o.startTime !== undefined)
  @IsISO8601({}, { message: "endTime harus berupa format ISO-8601 UTC penuh" })
  endTime?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Daftar ruangan berhasil dimuat",
  "data": [
    {
      "id": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
      "code": "AUD-01",
      "name": "Auditorium Utama Lantai 3",
      "capacity": 150,
      "location": "Gedung Rektorat Lt. 3",
      "status": "AVAILABLE",
      "timezone": "Asia/Jakarta",
      "bufferMinutes": 15,
      "isAvailable": true,
      "manager": {
        "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
        "fullName": "Budi Santoso",
        "email": "budi.santoso@institution.ac.id"
      },
      "createdAt": "2026-09-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 3.2 Detail Ruangan & Jadwal Terisi Harian

Mengambil spesifikasi rinci suatu ruangan beserta daftar reservasi aktif (`PENDING`, `APPROVED`) dan blok pemeliharaan (`MaintenanceBlock`) pada tanggal yang dipilih. Endpoint ini mengembalikan data `operationalEndTime` untuk memetakan visualisasi buffer time di frontend.

- **Endpoint:** `GET /api/v1/rooms/:id`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### URL Param & Query Parameters DTO

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class RoomParamDto {
  @ApiProperty({ description: "ID Ruangan berbentuk UUID v4" })
  @IsUUID("4", { message: "ID ruangan harus berupa format UUID v4 yang valid" })
  id: string;
}

export class RoomScheduleQueryDto {
  @ApiPropertyOptional({
    example: "2026-10-15",
    description:
      "Tanggal spesifik untuk mengambil daftar slot terisi (default: tanggal hari ini UTC)",
  })
  @IsOptional()
  @IsDateString({}, { message: "Format tanggal harus YYYY-MM-DD" })
  date?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Detail ruangan dan jadwal ketersediaan berhasil dimuat",
  "data": {
    "id": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
    "code": "AUD-01",
    "name": "Auditorium Utama Lantai 3",
    "capacity": 150,
    "location": "Gedung Rektorat Lt. 3",
    "status": "AVAILABLE",
    "timezone": "Asia/Jakarta",
    "bufferMinutes": 15,
    "manager": {
      "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
      "fullName": "Budi Santoso",
      "phoneNumber": "081234567890"
    },
    "schedule": {
      "selectedDate": "2026-10-15",
      "activeBookings": [
        {
          "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
          "title": "Seminar Nasional AI",
          "startTime": "2026-10-15T09:00:00.000Z",
          "endTime": "2026-10-15T11:00:00.000Z",
          "operationalEndTime": "2026-10-15T11:15:00.000Z",
          "bufferMinutes": 15,
          "status": "APPROVED"
        }
      ],
      "maintenanceBlocks": [
        {
          "id": "d8e3b123-234a-4f55-8911-3ab45c110293",
          "title": "Sterilisasi dan Servis Proyektor",
          "startTime": "2026-10-15T13:00:00.000Z",
          "endTime": "2026-10-15T14:00:00.000Z",
          "operationalEndTime": "2026-10-15T14:00:00.000Z",
          "reason": "Maintenance rutin berkala"
        }
      ]
    },
    "createdAt": "2026-09-01T00:00:00.000Z",
    "updatedAt": "2026-09-10T08:00:00.000Z"
  }
}
```

**Failure (`HTTP 404 Not Found`)**

```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "Ruangan tidak ditemukan",
  "timestamp": "2026-09-25T02:50:00.000Z",
  "path": "/api/v1/rooms/00000000-0000-0000-0000-000000000000"
}
```

- **Error Codes Terkait:**
- `ROOM_NOT_FOUND` (`404`): ID ruangan tidak cocok dengan data apapun pada persistensi.

---

### 3.3 Tambah Ruangan Baru (Admin Only)

Mendaftarkan aset ruangan baru ke dalam sistem. Wajib menyertakan penugasan kode unik dan kapasitas.

- **Endpoint:** `POST /api/v1/rooms`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { RoomStatus } from "@prisma/client";

export class CreateRoomDto {
  @ApiProperty({ example: "Laboratorium Komputer 2", maxLength: 100 })
  @IsString({ message: "Nama ruangan harus berupa teks" })
  @IsNotEmpty({ message: "Nama ruangan tidak boleh kosong" })
  @MaxLength(100, { message: "Nama ruangan maksimal 100 karakter" })
  name: string;

  @ApiProperty({
    example: "LAB-KOMP-02",
    maxLength: 30,
    description: "Kode ruangan unik internal",
  })
  @IsString({ message: "Kode ruangan harus berupa teks" })
  @IsNotEmpty({ message: "Kode ruangan tidak boleh kosong" })
  @MaxLength(30, { message: "Kode ruangan maksimal 30 karakter" })
  code: string;

  @ApiProperty({ example: 40, description: "Kapasitas maksimal orang" })
  @IsInt({ message: "Kapasitas harus berupa bilangan bulat" })
  @Min(1, { message: "Kapasitas minimal 1 orang" })
  @Max(1000, { message: "Kapasitas melebihi batas wajar sistem (maks 1000)" })
  capacity: number;

  @ApiProperty({
    example: "Gedung Lab Terpadu Lt. 2, Sayap Barat",
    maxLength: 255,
  })
  @IsString({ message: "Lokasi harus berupa teks" })
  @IsNotEmpty({ message: "Lokasi gedung/lantai wajib diisi" })
  @MaxLength(255, { message: "Lokasi maksimal 255 karakter" })
  location: string;

  @ApiPropertyOptional({
    example: "Asia/Jakarta",
    default: "Asia/Jakarta",
    description: "Zona waktu IANA operasional fisik ruangan",
  })
  @IsOptional()
  @IsTimeZone({
    message: "Format zona waktu harus berupa IANA Timezone yang valid",
  })
  timezone?: string = "Asia/Jakarta";

  @ApiPropertyOptional({
    example: 15,
    default: 15,
    description: "Waktu jeda pembersihan pasca-reservasi dalam satuan menit",
  })
  @IsOptional()
  @IsInt({ message: "Buffer minutes harus berupa bilangan bulat" })
  @Min(0, { message: "Buffer minutes tidak boleh bernilai negatif" })
  @Max(120, { message: "Buffer minutes maksimal 120 menit" })
  bufferMinutes?: number = 15;

  @ApiPropertyOptional({
    example: "e2a9b340-9a2c-4734-9271-4fb24e883832",
    description: "ID pengguna penanggung jawab (Role: ROOM_MANAGER)",
  })
  @IsOptional()
  @IsUUID("4", { message: "managerId harus berupa format UUID v4 yang valid" })
  managerId?: string;

  @ApiPropertyOptional({ enum: RoomStatus, default: RoomStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(RoomStatus, { message: "Status ruangan tidak valid" })
  status?: RoomStatus = RoomStatus.AVAILABLE;
}
```

#### Response Payloads

**Success (`HTTP 201 Created`)**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Ruangan berhasil didaftarkan",
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Laboratorium Komputer 2",
    "code": "LAB-KOMP-02",
    "capacity": 40,
    "location": "Gedung Lab Terpadu Lt. 2, Sayap Barat",
    "status": "AVAILABLE",
    "timezone": "Asia/Jakarta",
    "bufferMinutes": 15,
    "managerId": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "createdAt": "2026-09-25T02:51:00.000Z",
    "updatedAt": "2026-09-25T02:51:00.000Z"
  }
}
```

**Failure (`HTTP 409 Conflict`)**

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Kode ruangan sudah terdaftar pada sistem",
  "timestamp": "2026-09-25T02:51:02.000Z",
  "path": "/api/v1/rooms"
}
```

- **Error Codes Terkait:**
- `ROOM_CODE_ALREADY_EXISTS` (`409`): Atribut `code` telah digunakan oleh ruangan lain.
- `ROOM_INVALID_MANAGER` (`400`): `managerId` yang ditunjuk tidak ada atau memiliki peran bukan `ROOM_MANAGER`.

---

### 3.4 Perbarui Data & Status Operasional Ruangan (Admin / Room Manager)

Memperbarui data teknis, penanggung jawab, waktu buffer, atau mengubah status operasional (`AVAILABLE`, `MAINTENANCE`, `INACTIVE`).

- **Endpoint:** `PATCH /api/v1/rooms/:id`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

> **Aturan Otorisasi Parsial:** Pengguna dengan peran `ROOM_MANAGER` hanya diizinkan memodifikasi ruangan yang memiliki `managerId` sesuai dengan ID akun miliknya. Super Admin memiliki wewenang penuh tanpa batas.

#### Request Body DTO

```typescript
import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { CreateRoomDto } from "./create-room.dto";

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  // Seluruh properti CreateRoomDto diwarisi sebagai opsional (IsOptional)
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data ruangan berhasil diperbarui",
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Laboratorium Komputer 2 (Renovasi)",
    "code": "LAB-KOMP-02",
    "capacity": 45,
    "location": "Gedung Lab Terpadu Lt. 2, Sayap Barat",
    "status": "MAINTENANCE",
    "timezone": "Asia/Jakarta",
    "bufferMinutes": 20,
    "managerId": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "updatedAt": "2026-09-25T02:52:00.000Z"
  }
}
```

**Failure (`HTTP 403 Forbidden`)**

```json
{
  "success": false,
  "statusCode": 403,
  "error": "ForbiddenException",
  "message": "Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini",
  "timestamp": "2026-09-25T02:52:01.000Z",
  "path": "/api/v1/rooms/f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

- **Error Codes Terkait:**
- `ROOM_NOT_FOUND` (`404`): ID target tidak ditemukan.
- `AUTH_FORBIDDEN_RESOURCE` (`403`): Room Manager mencoba memperbarui ruangan milik unit lain.
- `ROOM_CODE_ALREADY_EXISTS` (`409`): Nilai pembaruan kode bentrok dengan ruangan lain.

---

### 3.5 Nonaktifkan / Soft Delete Ruangan (Admin Only)

Menonaktifkan ruangan dari sistem peminjaman umum secara aman. Mengubah atribut `status` menjadi `INACTIVE` sehingga tidak muncul di katalog umum.

- **Endpoint:** `DELETE /api/v1/rooms/:id`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Aturan Bisnis Penghapusan

Penonaktifan ruangan ditolak apabila masih terdapat reservasi aktif (`PENDING` atau `APPROVED`) yang dijadwalkan pada waktu mendatang (`startTime >= NOW()`). Admin wajib membatalkan secara sepihak atau menyelesaikan jadwal tersebut terlebih dahulu untuk mencegah pembatalan liar.

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Ruangan berhasil dinonaktifkan dari sistem peminjaman",
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "code": "LAB-KOMP-02",
    "status": "INACTIVE",
    "updatedAt": "2026-09-25T02:53:00.000Z"
  }
}
```

**Failure (`HTTP 409 Conflict`)**

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Ruangan tidak dapat dinonaktifkan karena masih memiliki 3 reservasi aktif di masa mendatang",
  "timestamp": "2026-09-25T02:53:02.000Z",
  "path": "/api/v1/rooms/f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

- **Error Codes Terkait:**
  - `ROOM_NOT_FOUND` (`404`): ID ruangan tidak valid.
  - `ROOM_HAS_ACTIVE_BOOKINGS` (`409`): Masih terdapat jadwal reservasi aktif di masa depan pada ruangan terkait.

---

### 3.6 Pembuatan Blok Pemeliharaan Ruangan (Maintenance Block)

Memungkinkan Room Manager atau Super Admin memblokir ketersediaan ruangan secara manual untuk keperluan pemeliharaan rutin, perbaikan teknis, renovasi, atau kegiatan internal institusi. Sistem memvalidasi agar blok pemeliharaan tidak bertabrakan dengan jadwal reservasi yang telah disetujui (`APPROVED`).

- **Endpoint:** `POST /api/v1/rooms/:id/maintenance`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Param DTO

Menggunakan `RoomParamDto` (`id: string` UUID v4).

#### Request Body DTO

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateMaintenanceBlockDto {
  @ApiProperty({
    example: "Servis AC dan Penggantian Filter",
    description: "Judul kegiatan pemeliharaan ruangan",
  })
  @IsString({ message: "Judul pemeliharaan harus berupa teks string" })
  @IsNotEmpty({ message: "Judul pemeliharaan wajib diisi" })
  @MaxLength(100, { message: "Judul pemeliharaan maksimal 100 karakter" })
  title: string;

  @ApiProperty({
    example: "Pemeliharaan berkala unit pendingin udara ruangan",
    description: "Alasan atau rincian pemeliharaan ruangan",
  })
  @IsString({ message: "Alasan pemeliharaan harus berupa teks string" })
  @IsNotEmpty({ message: "Alasan pemeliharaan wajib diisi" })
  @MaxLength(255, { message: "Alasan pemeliharaan maksimal 255 karakter" })
  reason: string;

  @ApiProperty({
    example: "2026-10-15T08:00:00.000Z",
    description: "Waktu mulai pemeliharaan (ISO-8601 UTC)",
  })
  @IsISO8601(
    { strict: true },
    { message: "startTime harus berformat ISO-8601 UTC yang valid" },
  )
  @IsNotEmpty({ message: "startTime wajib diisi" })
  startTime: string;

  @ApiProperty({
    example: "2026-10-15T12:00:00.000Z",
    description: "Waktu selesai pemeliharaan (ISO-8601 UTC)",
  })
  @IsISO8601(
    { strict: true },
    { message: "endTime harus berformat ISO-8601 UTC yang valid" },
  )
  @IsNotEmpty({ message: "endTime wajib diisi" })
  endTime: string;

  @ApiPropertyOptional({
    example: "2026-10-15T12:00:00.000Z",
    description:
      "Waktu selesai operasional (sterilisasi buffer) pemeliharaan (ISO-8601 UTC, default sama dengan endTime)",
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: "operationalEndTime harus berformat ISO-8601 UTC yang valid" },
  )
  operationalEndTime?: string;
}
```

#### Response Payloads

**Success (`HTTP 201 Created`)**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Blok pemeliharaan ruangan berhasil dijadwalkan",
  "data": {
    "id": "b7d2f10a-3c58-4e89-91a2-5e6f7a8b9c0d",
    "roomId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "title": "Servis AC dan Penggantian Filter",
    "reason": "Pemeliharaan berkala unit pendingin udara ruangan",
    "startTime": "2026-10-15T08:00:00.000Z",
    "endTime": "2026-10-15T12:00:00.000Z",
    "operationalEndTime": "2026-10-15T12:00:00.000Z",
    "createdAt": "2026-09-25T03:00:00.000Z"
  }
}
```

**Failure (`HTTP 409 Conflict` — Bentrok dengan Reservasi Approved)**

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Jadwal pemeliharaan bertabrakan dengan jadwal reservasi yang sudah disetujui (APPROVED)",
  "timestamp": "2026-09-25T03:00:01.000Z",
  "path": "/api/v1/rooms/f47ac10b-58cc-4372-a567-0e02b2c3d479/maintenance"
}
```

- **Error Codes Terkait:**
  - `ROOM_NOT_FOUND` (`404`): ID ruangan tidak valid atau tidak ditemukan.
  - `MAINTENANCE_OVERLAP_APPROVED_BOOKING` (`409`): Waktu pemeliharaan menabrak reservasi yang telah disetujui.
  - `MAINTENANCE_TIME_INVALID` (`400`): Waktu selesai kurang dari atau sama dengan waktu mulai (`operationalEndTime <= startTime`).
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Room Manager mencoba menjadwalkan pemeliharaan di luar yurisdiksi unitnya.

---

### 3.7 Riwayat Blok Pemeliharaan Ruangan

Mengambil daftar seluruh jadwal pemeliharaan terdaftar pada ruangan spesifik dalam format paginasi, dengan opsi filter untuk hanya menampilkan jadwal mendatang (*upcoming*) atau seluruh riwayat historis.

- **Endpoint:** `GET /api/v1/rooms/:id/maintenance`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Query Parameters DTO

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";
import { Transform, Type } from "class-transformer";

export class QueryMaintenanceDto {
  @ApiPropertyOptional({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    required: false,
    default: true,
    description:
      "Hanya ambil jadwal pemeliharaan mendatang (operationalEndTime >= NOW())",
  })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  upcomingOnly?: boolean = true;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Daftar jadwal pemeliharaan ruangan berhasil dimuat",
  "data": [
    {
      "id": "b7d2f10a-3c58-4e89-91a2-5e6f7a8b9c0d",
      "roomId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "title": "Servis AC dan Penggantian Filter",
      "reason": "Pemeliharaan berkala unit pendingin udara ruangan",
      "startTime": "2026-10-15T08:00:00.000Z",
      "endTime": "2026-10-15T12:00:00.000Z",
      "operationalEndTime": "2026-10-15T12:00:00.000Z",
      "createdAt": "2026-09-25T03:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

**Failure (`HTTP 404 Not Found`)**

```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "Ruangan dengan ID yang dituju tidak ditemukan",
  "timestamp": "2026-09-25T03:00:30.000Z",
  "path": "/api/v1/rooms/f47ac10b-58cc-4372-a567-0e02b2c3d479/maintenance"
}
```

- **Error Codes Terkait:**
  - `ROOM_NOT_FOUND` (`404`): ID ruangan tidak valid atau tidak ditemukan.
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Room Manager mencoba mengakses riwayat pemeliharaan ruangan di luar unitnya.

---

### 3.8 Batalkan / Hapus Blok Pemeliharaan Ruangan

Membatalkan blok pemeliharaan ruangan sebelum atau selama jadwal berlangsung, sehingga slot ketersediaan ruangan kembali terbuka untuk reservasi umum.

- **Endpoint:** `DELETE /api/v1/rooms/:id/maintenance/:maintenanceId`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)`
- **Route Params:**
  - `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
  - `@Param('maintenanceId', new ParseUUIDPipe({ version: '4' })) maintenanceId: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Param DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class MaintenanceParamDto {
  @ApiProperty({ description: "ID Ruangan (UUID v4)" })
  @IsUUID("4", { message: "ID ruangan harus berupa UUID v4 yang valid" })
  id: string;

  @ApiProperty({ description: "ID Blok Pemeliharaan (UUID v4)" })
  @IsUUID("4", {
    message: "ID blok pemeliharaan harus berupa UUID v4 yang valid",
  })
  maintenanceId: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Blok pemeliharaan ruangan berhasil dibatalkan",
  "data": null
}
```

**Failure (`HTTP 404 Not Found`)**

```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "Blok pemeliharaan dengan ID yang dituju tidak ditemukan pada ruangan ini",
  "timestamp": "2026-09-25T03:01:00.000Z",
  "path": "/api/v1/rooms/f47ac10b-58cc-4372-a567-0e02b2c3d479/maintenance/b7d2f10a-3c58-4e89-91a2-5e6f7a8b9c0d"
}
```

- **Error Codes Terkait:**
  - `MAINTENANCE_NOT_FOUND` (`404`): ID blok pemeliharaan tidak ditemukan pada ruangan terkait.
  - `ROOM_NOT_FOUND` (`404`): Ruangan tidak ditemukan.
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Room Manager mencoba membatalkan pemeliharaan di luar wewenangnya.

---

## 4. Modul Reservasi (`/api/v1/bookings`)

Modul Reservasi merupakan modul inti (_core engine_) SpaceSync yang mengelola siklus hidup pemesanan ruangan, kalkulasi otomatis _operational buffer window_, validasi _zero-overlap_, serta mekanisme persetujuan berjenjang.

---

### 4.1 Pembuatan Reservasi Baru

Mengajukan permohonan reservasi ruangan pada tanggal dan rentang jam tertentu. Backend secara otomatis mengkalkulasi `operationalEndTime` (`endTime` + durasi jeda pembersihan ruangan) dan memvalidasi ketersediaan slot melalui pemeriksaan _zero-overlap_.

- **Endpoint:** `POST /api/v1/bookings`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)` (Dapat diakses oleh seluruh peran terautentikasi: `USER`, `ROOM_MANAGER`, `SUPER_ADMIN`)
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

Menggunakan decorator kustom dan bawaan `class-validator` untuk memastikan kepatuhan ISO-8601 UTC, durasi peminjaman (30 menit s.d. 8 jam), batas waktu pengajuan (_lead time_ minimal 24 jam dan maksimal 30 hari ke depan), serta validasi logis `endTime > startTime`.

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "IsValidLeadTime", async: false })
export class IsValidLeadTimeConstraint implements ValidatorConstraintInterface {
  validate(startTimeValue: string): boolean {
    if (!startTimeValue) return false;
    const start = new Date(startTimeValue).getTime();
    const now = Date.now();
    const minLeadTime = now + 24 * 60 * 60 * 1000; // H+1 (24 Jam)
    const maxLeadTime = now + 30 * 24 * 60 * 60 * 1000; // H+30 Hari
    return start >= minLeadTime && start <= maxLeadTime;
  }

  defaultMessage(): string {
    return "Pemesanan harus diajukan minimal 24 jam dan maksimal 30 hari sebelum acara";
  }
}

@ValidatorConstraint({ name: "IsAfterStartTime", async: false })
export class IsAfterStartTimeConstraint implements ValidatorConstraintInterface {
  validate(endTimeValue: string, args: ValidationArguments): boolean {
    const obj = args.object as CreateBookingDto;
    if (!obj.startTime || !endTimeValue) return false;
    const start = new Date(obj.startTime).getTime();
    const end = new Date(endTimeValue).getTime();
    return end > start;
  }

  defaultMessage(): string {
    return "endTime harus berada setelah startTime";
  }
}

@ValidatorConstraint({ name: "IsValidBookingDuration", async: false })
export class IsValidBookingDurationConstraint implements ValidatorConstraintInterface {
  validate(endTimeValue: string, args: ValidationArguments): boolean {
    const obj = args.object as CreateBookingDto;
    if (!obj.startTime || !endTimeValue) return false;
    const start = new Date(obj.startTime).getTime();
    const end = new Date(endTimeValue).getTime();
    const durationMinutes = (end - start) / (1000 * 60);
    // Minimal 30 menit, Maksimal 8 jam (480 menit)
    return durationMinutes >= 30 && durationMinutes <= 480;
  }

  defaultMessage(): string {
    return "Durasi reservasi minimal 30 menit dan maksimal 8 jam";
  }
}

export class CreateBookingDto {
  @ApiProperty({
    example: "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
    description: "ID target ruangan yang ingin dipinjam (UUID v4)",
  })
  @IsUUID("4", { message: "roomId harus berupa format UUID v4 yang valid" })
  @IsNotEmpty({ message: "roomId wajib diisi" })
  roomId: string;

  @ApiProperty({
    example: "Rapat Koordinasi Infrastruktur Cloud",
    maxLength: 150,
    description: "Tujuan atau judul kegiatan",
  })
  @IsString({ message: "Judul kegiatan harus berupa string" })
  @IsNotEmpty({ message: "Judul kegiatan wajib diisi" })
  @MaxLength(150, { message: "Judul kegiatan maksimal 150 karakter" })
  title: string;

  @ApiPropertyOptional({
    example: "Agenda membahas migrasi database dan scaling pod worker",
    description: "Catatan tambahan atau perlengkapan pendukung yang dibutuhkan",
  })
  @IsOptional()
  @IsString({ message: "Deskripsi harus berupa string" })
  description?: string;

  @ApiProperty({
    example: "2026-10-15T09:00:00.000Z",
    description:
      "Waktu mulai penggunaan ruangan dalam format ISO-8601 UTC penuh",
  })
  @IsISO8601(
    {},
    {
      message:
        "startTime wajib berupa ISO-8601 UTC format (YYYY-MM-DDTHH:mm:ss.sssZ)",
    },
  )
  @IsNotEmpty({ message: "startTime wajib diisi" })
  @Validate(IsValidLeadTimeConstraint)
  startTime: string;

  @ApiProperty({
    example: "2026-10-15T11:00:00.000Z",
    description:
      "Waktu selesai penggunaan ruangan dalam format ISO-8601 UTC penuh",
  })
  @IsISO8601(
    {},
    {
      message:
        "endTime wajib berupa ISO-8601 UTC format (YYYY-MM-DDTHH:mm:ss.sssZ)",
    },
  )
  @IsNotEmpty({ message: "endTime wajib diisi" })
  @Validate(IsAfterStartTimeConstraint)
  @Validate(IsValidBookingDurationConstraint)
  endTime: string;
}
```

#### Response Payloads

**Success (`HTTP 201 Created`)**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Permohonan reservasi berhasil diajukan",
  "data": {
    "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
    "roomId": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
    "userId": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "title": "Rapat Koordinasi Infrastruktur Cloud",
    "description": "Agenda membahas migrasi database dan scaling pod worker",
    "startTime": "2026-10-15T09:00:00.000Z",
    "endTime": "2026-10-15T11:00:00.000Z",
    "operationalEndTime": "2026-10-15T11:15:00.000Z",
    "bufferMinutes": 15,
    "status": "PENDING",
    "room": {
      "name": "Auditorium Utama Lantai 3",
      "code": "AUD-01",
      "location": "Gedung Rektorat Lt. 3"
    },
    "createdAt": "2026-09-25T02:40:00.000Z"
  }
}
```

**Failure (`HTTP 409 Conflict` — Bentrok Waktu / Jeda Buffer)**

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Slot waktu tidak tersedia karena bertubrukan dengan reservasi lain atau jeda sterilisasi ruangan",
  "errors": [
    {
      "field": "startTime",
      "issue": "Waktu yang diminta (09:00 - 11:00) bertubrukan dengan jendela operasional reservasi aktif hingga 09:15 UTC"
    }
  ],
  "timestamp": "2026-09-25T02:40:05.000Z",
  "path": "/api/v1/bookings"
}
```

- **Error Codes Terkait:**
- `BOOKING_TIME_OVERLAPPING` (`409`): Rentang waktu `[startTime, operationalEndTime)` tumpang tindih dengan reservasi aktif (`PENDING`/`APPROVED`) atau `MaintenanceBlock`.
- `BOOKING_ROOM_NOT_AVAILABLE` (`400`): Ruangan target sedang berstatus `INACTIVE` atau `MAINTENANCE`.
- `BOOKING_MIN_DURATION_INVALID` (`422`): Durasi peminjaman kurang dari 30 menit.
- `BOOKING_MAX_DURATION_EXCEEDED` (`422`): Durasi peminjaman melebihi batas 8 jam.
- `BOOKING_LEAD_TIME_INVALID` (`422`): Pengajuan kurang dari $H-1$ (24 jam sebelum acara) atau lebih dari 30 hari kalender ke depan.

> **Catatan Kesiapan Fase 2 (Payment Gateway & Queue):**
> Kontrak `data` di atas disiapkan untuk menampung field opsional: `"paymentStatus": "NOT_REQUIRED" | "UNPAID" | "SETTLED"` dan `"paymentUrl": string | null`. Di latar belakang NestJS, event `booking.created` dipancarkan secara non-blocking; pada Fase 2, event ini dihubungkan langsung ke antrean BullMQ (`notifications-queue`) untuk pengiriman pesan WhatsApp konfirmasi dan penjadwalan kedaluwarsa invoice pembayaran.

---

### 4.2 Daftar Reservasi

Mengambil daftar reservasi dengan sistem paginasi dan filter multidimensi.

- **End-User:** Hanya menerima data reservasi miliknya sendiri (`userId = req.user.id`).
- **Room Manager:** Menerima reservasi atas ruangan yang dikelolanya (atau filter miliknya).
- **Super Admin:** Menerima seluruh reservasi dalam sistem.
- **Endpoint:** `GET /api/v1/bookings`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Query Parameters DTO

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from "class-validator";
import { BookingStatus } from "@prisma/client";

export class QueryBookingsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description: "Filter status reservasi",
  })
  @IsOptional()
  @IsEnum(BookingStatus, { message: "Status booking tidak valid" })
  status?: BookingStatus;

  @ApiPropertyOptional({ example: "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0" })
  @IsOptional()
  @IsUUID("4")
  roomId?: string;

  @ApiPropertyOptional({
    example: "2026-10-01",
    description: "Rentang awal tanggal pencarian (YYYY-MM-DD)",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: "2026-10-31",
    description: "Rentang akhir tanggal pencarian (YYYY-MM-DD)",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: "e2a9b340-9a2c-4734-9271-4fb24e883832",
    description: "Filter pengguna tertentu (Khusus SUPER_ADMIN)",
  })
  @IsOptional()
  @IsUUID("4")
  userId?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Daftar reservasi berhasil dimuat",
  "data": [
    {
      "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
      "title": "Rapat Koordinasi Infrastruktur Cloud",
      "startTime": "2026-10-15T09:00:00.000Z",
      "endTime": "2026-10-15T11:00:00.000Z",
      "operationalEndTime": "2026-10-15T11:15:00.000Z",
      "status": "APPROVED",
      "room": {
        "id": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
        "name": "Auditorium Utama Lantai 3",
        "code": "AUD-01"
      },
      "user": {
        "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
        "fullName": "Budi Santoso",
        "email": "budi.santoso@institution.ac.id"
      },
      "createdAt": "2026-09-25T02:40:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 4.3 Kalender Agregat & Timeline Ketersediaan Seluruh Ruangan

Mengambil seluruh interval waktu terisi (reservasi berstatus `APPROVED`, `PENDING`, serta `MaintenanceBlock`) dalam satu rentang tanggal tertentu pada satu atau seluruh ruangan sekaligus. Endpoint agregasi ini dirancang khusus untuk memenuhi kebutuhan antarmuka kalender frontend (Google Calendar / Gantt chart matrix) guna mengeliminasi _bottleneck_ performa $N+1$ HTTP requests.

- **Endpoint:** `GET /api/v1/bookings/timeline`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)` (Seluruh peran terautentikasi: `USER`, `ROOM_MANAGER`, `SUPER_ADMIN`)
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Query Parameters DTO

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsNotEmpty, IsOptional, IsUUID } from "class-validator";

export class QueryTimelineDto {
  @ApiProperty({
    description: "Batas awal rentang waktu penarikan timeline (ISO-8601 UTC)",
    example: "2026-10-01T00:00:00.000Z",
  })
  @IsNotEmpty({ message: "startDate wajib disertakan" })
  @IsISO8601(
    { strict: true },
    { message: "startDate harus berformat ISO-8601 UTC yang valid" },
  )
  startDate: string;

  @ApiProperty({
    description: "Batas akhir rentang waktu penarikan timeline (ISO-8601 UTC)",
    example: "2026-10-31T23:59:59.999Z",
  })
  @IsNotEmpty({ message: "endDate wajib disertakan" })
  @IsISO8601(
    { strict: true },
    { message: "endDate harus berformat ISO-8601 UTC yang valid" },
  )
  endDate: string;

  @ApiPropertyOptional({
    description:
      "Filter spesifik ID ruangan (opsional, jika kosong mengambil seluruh ruangan aktif)",
    example: "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
  })
  @IsOptional()
  @IsUUID("4", { message: "roomId harus berupa UUID v4 yang valid" })
  roomId?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data timeline jadwal berhasil diambil",
  "data": [
    {
      "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
      "type": "BOOKING",
      "roomId": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
      "roomName": "Auditorium Utama Lantai 3",
      "title": "Rapat Koordinasi Infrastruktur Cloud",
      "startTime": "2026-10-15T09:00:00.000Z",
      "endTime": "2026-10-15T11:00:00.000Z",
      "operationalEndTime": "2026-10-15T11:15:00.000Z",
      "status": "APPROVED",
      "userName": "Budi Santoso",
      "department": "Pusat Data & Sistem Informasi"
    },
    {
      "id": "b7d2f10a-3c58-4e89-91a2-5e6f7a8b9c0d",
      "type": "MAINTENANCE",
      "roomId": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
      "roomName": "Auditorium Utama Lantai 3",
      "title": "Servis AC dan Penggantian Filter",
      "startTime": "2026-10-15T07:30:00.000Z",
      "endTime": "2026-10-15T08:45:00.000Z",
      "operationalEndTime": "2026-10-15T08:45:00.000Z",
      "status": "MAINTENANCE",
      "userName": "Tim Pemeliharaan Fasilitas",
      "department": "Sarana & Prasarana"
    }
  ]
}
```

**Failure (`HTTP 400 Bad Request` — Rentang Tanggal Tidak Valid)**

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Rentang tanggal tidak valid: endDate harus lebih besar dari startDate",
  "timestamp": "2026-09-25T03:05:00.000Z",
  "path": "/api/v1/bookings/timeline"
}
```

- **Error Codes Terkait:**
  - `INVALID_DATE_RANGE` (`400`): Rentang waktu penarikan tidak logis (`endDate <= startDate`).
  - `ROOM_NOT_FOUND` (`404`): Query parameter `roomId` yang ditentukan tidak ditemukan di database.

---

### 4.4 Detail Reservasi

Mengambil informasi menyeluruh dari entitas booking tertentu, mencakup rincian ruangan, identitas pemohon, alasan penolakan/pembatalan (jika ada), dan rekam jejak perubahan status (_audit logs_).

- **Endpoint:** `GET /api/v1/bookings/:id`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Otorisasi Akses:** Pemohon asli, Room Manager penanggung jawab ruangan terkait, atau Super Admin.
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Param DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class BookingParamDto {
  @ApiProperty({ description: "ID Reservasi (UUID v4)" })
  @IsUUID("4", { message: "ID reservasi harus berupa UUID v4 yang valid" })
  id: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Detail reservasi berhasil dimuat",
  "data": {
    "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
    "roomId": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
    "userId": "e2a9b340-9a2c-4734-9271-4fb24e883832",
    "title": "Rapat Koordinasi Infrastruktur Cloud",
    "description": "Agenda membahas migrasi database dan scaling pod worker",
    "startTime": "2026-10-15T09:00:00.000Z",
    "endTime": "2026-10-15T11:00:00.000Z",
    "operationalEndTime": "2026-10-15T11:15:00.000Z",
    "bufferMinutes": 15,
    "status": "APPROVED",
    "rejectionReason": null,
    "cancellationReason": null,
    "room": {
      "id": "a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0",
      "name": "Auditorium Utama Lantai 3",
      "code": "AUD-01",
      "location": "Gedung Rektorat Lt. 3",
      "capacity": 150
    },
    "user": {
      "id": "e2a9b340-9a2c-4734-9271-4fb24e883832",
      "fullName": "Budi Santoso",
      "email": "budi.santoso@institution.ac.id",
      "department": "Teknologi Informasi"
    },
    "auditLogs": [
      {
        "id": "7f8c12a4-56b7-4c8d-90e1-123456789abc",
        "action": "BOOKING_CREATED",
        "oldStatus": null,
        "newStatus": "PENDING",
        "notes": "Pengajuan reservasi via web portal",
        "actor": {
          "fullName": "Budi Santoso",
          "role": "USER"
        },
        "recordedAt": "2026-09-25T02:40:00.000Z"
      },
      {
        "id": "8a9d23b5-67c8-4d9e-01f2-234567890def",
        "action": "BOOKING_APPROVED",
        "oldStatus": "PENDING",
        "newStatus": "APPROVED",
        "notes": "Disetujui untuk kegiatan koordinasi unit",
        "actor": {
          "fullName": "Administrator Ruang",
          "role": "ROOM_MANAGER"
        },
        "recordedAt": "2026-09-25T03:00:00.000Z"
      }
    ],
    "createdAt": "2026-09-25T02:40:00.000Z",
    "updatedAt": "2026-09-25T03:00:00.000Z"
  }
}
```

- **Error Codes Terkait:**
- `BOOKING_NOT_FOUND` (`404`): Entitas reservasi tidak ditemukan di database.
- `AUTH_FORBIDDEN_RESOURCE` (`403`): Pengguna biasa mencoba melihat data reservasi milik pengguna lain.

---

### 4.5 Workflow Persetujuan Reservasi (Approval Engine)

Mengubah status permohonan reservasi berstatus `PENDING` menjadi `APPROVED` atau `REJECTED`.
Eksekusi verifikasi tumpang tindih waktu dilakukan ulang secara ketat di dalam blok isolasi transaksi database sebelum penetapan status `APPROVED` guna menangkal anomali konkurensi.

- **Endpoint:** `PATCH /api/v1/bookings/:id/status`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export enum ApprovalAction {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: ApprovalAction,
    example: ApprovalAction.APPROVED,
    description: "Keputusan verifikasi manajer",
  })
  @IsNotEmpty({ message: "Status keputusan wajib disertakan" })
  @IsEnum(ApprovalAction, {
    message: "Aksi status hanya diizinkan APPROVED atau REJECTED",
  })
  status: ApprovalAction;

  @ApiPropertyOptional({
    example: "Ruangan dialokasikan untuk pemeliharaan pendingin udara darurat",
    description: "Wajib diisi jika status bernilai REJECTED",
  })
  @ValidateIf((o) => o.status === ApprovalAction.REJECTED)
  @IsNotEmpty({
    message:
      "Alasan penolakan (rejectionReason) wajib diisi jika status REJECTED",
  })
  @IsString({ message: "Alasan penolakan harus berupa string" })
  @MaxLength(255, { message: "Alasan penolakan maksimal 255 karakter" })
  rejectionReason?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Status reservasi berhasil diperbarui",
  "data": {
    "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
    "status": "APPROVED",
    "rejectionReason": null,
    "updatedAt": "2026-09-25T03:00:00.000Z"
  }
}
```

**Failure (`HTTP 409 Conflict` — Konflik Saat Approval)**

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Persetujuan gagal: Terdapat reservasi lain yang telah disetujui lebih dahulu pada slot waktu yang sama",
  "timestamp": "2026-09-25T03:00:01.000Z",
  "path": "/api/v1/bookings/c1f7b605-e85d-4f18-a6b1-098e9c1c58aa/status"
}
```

- **Error Codes Terkait:**
- `BOOKING_ALREADY_DECIDED` (`400`): Reservasi sudah bukan berstatus `PENDING` (sudah pernah disetujui, ditolak, atau dibatalkan sebelumnya).
- `BOOKING_TIME_OVERLAPPING` (`409`): Terjadi bentrok slot waktu saat transaksi approval dijalankan.
- `AUTH_FORBIDDEN_RESOURCE` (`403`): Room Manager mencoba memproses reservasi di luar unit yurisdiksinya.
- `BOOKING_REJECTION_REASON_REQUIRED` (`422`): Status `REJECTED` dikirim tanpa menyertakan `rejectionReason`.

---

### 4.6 Pembatalan Mandiri oleh Pemohon

Memungkinkan pemohon membatalkan reservasi aktif miliknya (`PENDING` atau `APPROVED`).
Sistem menegakkan aturan bisnis batas waktu pembatalan (_cancellation deadline_): pembatalan mandiri hanya sah jika dilakukan paling lambat **2 jam sebelum `startTime**`. Kurang dari batas tersebut, sistem menolak aksi dan mengarahkan pengguna ke pengelola fasilitas.

- **Endpoint:** `PATCH /api/v1/bookings/:id/cancel`
- **Akses Guard:** `@UseGuards(JwtAuthGuard)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Otorisasi Akses:** Pemilik reservasi (`userId = req.user.id`) atau `SUPER_ADMIN`.
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Request Body DTO

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CancelBookingDto {
  @ApiPropertyOptional({
    example: "Kegiatan koordinasi diundur karena narasumber berhalangan",
    description: "Alasan pembatalan reservasi",
  })
  @IsOptional()
  @IsString({ message: "Alasan pembatalan harus berupa string" })
  @MaxLength(255, { message: "Alasan pembatalan maksimal 255 karakter" })
  cancellationReason?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reservasi berhasil dibatalkan",
  "data": {
    "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
    "status": "CANCELLED",
    "cancellationReason": "Kegiatan koordinasi diundur karena narasumber berhalangan",
    "updatedAt": "2026-09-25T03:15:00.000Z"
  }
}
```

**Failure (`HTTP 400 Bad Request` — Melewati Batas Waktu Pembatalan)**

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Batas waktu pembatalan mandiri telah terlewati (maksimal 2 jam sebelum waktu mulai acara). Silakan hubungi Unit Manager terkait.",
  "timestamp": "2026-09-25T03:15:02.000Z",
  "path": "/api/v1/bookings/c1f7b605-e85d-4f18-a6b1-098e9c1c58aa/cancel"
}
```

- **Error Codes Terkait:**
  - `BOOKING_CANCELLATION_DEADLINE_EXCEEDED` (`400`): Waktu pembatalan kurang dari 2 jam menuju `startTime`.
  - `BOOKING_CANNOT_CANCEL_PAST` (`400`): Acara telah berlangsung atau waktu `startTime` telah terlewati.
  - `BOOKING_INVALID_STATE_FOR_CANCEL` (`400`): Reservasi telah berstatus `REJECTED`, `CANCELLED`, atau `COMPLETED`.
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Pengguna mencoba membatalkan reservasi milik orang lain.

---

### 4.7 Pembatalan Darurat oleh Manajer (Force Cancel)

Memungkinkan Room Manager atau Super Admin membatalkan reservasi aktif secara sepihak dalam kondisi darurat (misal: kerusakan fasilitas, inspeksi mendadak pimpinan institusi, bencana, atau pemeliharaan tak terduga) dengan **melewati (_bypass_)** batas waktu minimal 2 jam sebelum acara (`FR-WORK-06`). Operasi ini mewajibkan alasan pembatalan minimal 10 karakter, mencatat jejak mutasi ke `AuditLog`, serta menembakkan notifikasi darurat kepada pemohon asli.

- **Endpoint:** `PATCH /api/v1/bookings/:id/force-cancel`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)`
- **Route Param:** `@Param('id', new ParseUUIDPipe({ version: '4' })) id: string`
- **Otorisasi Akses:** Room Manager pengelola unit ruangan terkait atau Super Admin.
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

#### Param DTO

Menggunakan `BookingParamDto` (`id: string` UUID v4).

#### Request Body DTO

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ForceCancelBookingDto {
  @ApiProperty({
    example: "Ruangan dialihkan mendadak untuk kegiatan akreditasi institusi",
    description: "Alasan pembatalan darurat oleh manajer (minimal 10 karakter)",
  })
  @IsString({ message: "Alasan pembatalan harus berupa teks string" })
  @IsNotEmpty({ message: "Alasan pembatalan darurat wajib disertakan" })
  @MinLength(10, {
    message:
      "Alasan pembatalan darurat minimal 10 karakter untuk keperluan audit",
  })
  reason: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reservasi berhasil dibatalkan secara darurat oleh manajer",
  "data": {
    "id": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
    "status": "CANCELLED",
    "cancellationReason": "Ruangan dialihkan mendadak untuk kegiatan akreditasi institusi",
    "cancelledBy": {
      "id": "d1e4c702-8f12-4c28-8921-9876543210ab",
      "fullName": "Siti Rahmawati, S.T.",
      "role": "ROOM_MANAGER"
    },
    "updatedAt": "2026-09-25T03:20:00.000Z"
  }
}
```

**Failure (`HTTP 400 Bad Request` — Status Reservasi Tidak Sah untuk Dibatalkan)**

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": "Reservasi tidak dapat dibatalkan darurat karena sudah berstatus CANCELLED atau COMPLETED",
  "timestamp": "2026-09-25T03:20:01.000Z",
  "path": "/api/v1/bookings/c1f7b605-e85d-4f18-a6b1-098e9c1c58aa/force-cancel"
}
```

**Failure (`HTTP 403 Forbidden` — Di Luar Wewenang Manajer)**

```json
{
  "success": false,
  "statusCode": 403,
  "error": "ForbiddenException",
  "message": "Akses ditolak: Anda tidak memiliki wewenang manajerial atas ruangan pada reservasi ini",
  "timestamp": "2026-09-25T03:20:02.000Z",
  "path": "/api/v1/bookings/c1f7b605-e85d-4f18-a6b1-098e9c1c58aa/force-cancel"
}
```

- **Error Codes Terkait:**
  - `BOOKING_NOT_FOUND` (`404`): ID reservasi tidak valid atau tidak ditemukan.
  - `BOOKING_INVALID_STATE_FOR_CANCEL` (`400`): Reservasi telah berstatus `REJECTED`, `CANCELLED`, atau `COMPLETED`.
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Room Manager mencoba membatalkan reservasi di luar yurisdiksi unitnya.
  - `FORCE_CANCEL_REASON_TOO_SHORT` (`422`): Alasan pembatalan darurat kurang dari 10 karakter.

---

### 4.8 Concurrency Mitigation & Distributed Transaction Architecture

```text
Client Request (POST /bookings)
       │
       ▼
[NestJS Route Handler]
       │
       ▼
[Prisma $transaction Isolation: SERIALIZABLE / SELECT FOR UPDATE]
       │
       ├─► 1. Lock Target Room Record:
       │      SELECT id FROM rooms WHERE id = :roomId FOR UPDATE;
       │
       ├─► 2. In-Memory Mathematical Evaluation:
       │      Assert: newStartTime >= NOW() + 24h
       │      operationalEndTime = newEndTime + room.bufferMinutes
       │
       ├─► 3. Conflict Scan against Active Bookings & Maintenance:
       │      WHERE roomId = :roomId AND status IN ('PENDING', 'APPROVED')
       │      AND (startTime < :operationalEndTime AND operationalEndTime > :newStartTime)
       │
       ├─► 4. If Overlap Exists ──► Throw ConflictException (409)
       │
       ├─► 5. Insert Record into "bookings"
       │      └─► PostgreSQL Exclusion Constraint (btree_gist) acts as Final Arbiter
       │          (Catch SQL Error 23P01 -> Map to 409 Conflict)
       │
       └─► 6. Emit Asynchronous Domain Event:
              this.eventEmitter.emit('booking.created', new BookingCreatedEvent(...))

```

#### Catatan Desain Ekstensibilitas Fase 2 (Redis Distributed Locking)

Pada Fase 2, lapisan _concurrency lock_ akan dinaikkan ke level memori terdistribusi sebelum menyentuh koneksi database:

- Pencegahan tabrakan milidetik menggunakan Redis Redlock key format: `lock:room:{roomId}:date:{YYYY-MM-DD}` dengan batas TTL 5000 ms.
- Jika kunci memori berhasil diperoleh, transaksi eksekusi PostgreSQL berjalan mulus tanpa antrean _row lock_ panjang di tabel `rooms`.
- Kontrak antarmuka DTO di atas dipastikan kompatibel penuh (_100% backwards compatible_) tanpa perubahan field yang memutus integrasi frontend yang telah dibangun di Fase 1.

---

## 5. Modul Audit & Pemantauan Sistem (`/api/v1/audit-logs`, `/api/v1/health`)

Modul ini mengelola pelaporan transparansi dan jejak mutasi kepatuhan (*compliance audit logs*) untuk Super Admin, serta menyediakan instrumen observabilitas (*health check & readiness probes*) untuk memantau integritas kontainer dan keterhubungan basis data secara *real-time*.

---

### 5.1 Log Audit Kepatuhan Global (Khusus Super Admin)

Mengambil daftar seluruh catatan jejak mutasi status reservasi ruangan (misalnya verifikasi persetujuan, penolakan, pembatalan mandiri, dan pembatalan darurat) di seluruh sistem dalam format paginasi dan filter multidimensi.

- **Endpoint:** `GET /api/v1/audit-logs`
- **Akses Guard:** `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.SUPER_ADMIN)`
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

#### Query Parameters DTO

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export enum AuditAction {
  CREATED = "CREATED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
  FORCE_CANCELLED = "FORCE_CANCELLED",
  AUTO_EXPIRED = "AUTO_EXPIRED",
  COMPLETED = "COMPLETED",
}

export class QueryAuditLogsDto {
  @ApiPropertyOptional({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Filter berdasarkan ID reservasi (UUID v4)",
  })
  @IsOptional()
  @IsUUID("4", { message: "bookingId harus berupa UUID v4 yang valid" })
  bookingId?: string;

  @ApiPropertyOptional({
    description: "Filter berdasarkan ID pengguna aktor mutasi (UUID v4)",
  })
  @IsOptional()
  @IsUUID("4", { message: "actorId harus berupa UUID v4 yang valid" })
  actorId?: string;

  @ApiPropertyOptional({
    enum: AuditAction,
    description: "Filter tipe tindakan mutasi status",
  })
  @IsOptional()
  @IsEnum(AuditAction, { message: "Nilai action tidak valid" })
  action?: AuditAction;

  @ApiPropertyOptional({
    description: "Batas awal rentang waktu pencatatan (ISO-8601 UTC)",
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: "startDate harus berformat ISO-8601 UTC yang valid" },
  )
  startDate?: string;

  @ApiPropertyOptional({
    description: "Batas akhir rentang waktu pencatatan (ISO-8601 UTC)",
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: "endDate harus berformat ISO-8601 UTC yang valid" },
  )
  endDate?: string;
}
```

#### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data audit log berhasil dimuat",
  "data": [
    {
      "id": "7f8c12a4-56b7-4c8d-90e1-123456789abc",
      "bookingId": "c1f7b605-e85d-4f18-a6b1-098e9c1c58aa",
      "action": "FORCE_CANCELLED",
      "oldStatus": "APPROVED",
      "newStatus": "CANCELLED",
      "notes": "Ruangan dialihkan mendadak untuk kegiatan akreditasi institusi",
      "actor": {
        "id": "d1e4c702-8f12-4c28-8921-9876543210ab",
        "fullName": "Siti Rahmawati, S.T.",
        "role": "ROOM_MANAGER"
      },
      "recordedAt": "2026-09-25T03:20:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

**Failure (`HTTP 403 Forbidden`)**

```json
{
  "success": false,
  "statusCode": 403,
  "error": "ForbiddenException",
  "message": "Akses ditolak: Anda tidak memiliki otoritas peran SUPER_ADMIN",
  "timestamp": "2026-09-25T03:25:00.000Z",
  "path": "/api/v1/audit-logs"
}
```

- **Error Codes Terkait:**
  - `AUTH_FORBIDDEN_RESOURCE` (`403`): Peran pengguna tidak mencukupi untuk membaca log audit kepatuhan global.

---

### 5.2 Health & Readiness Probe Sistem

Endpoint observabilitas berbasis `@nestjs/terminus` untuk kebutuhan *orchestration probe* (Docker, Kubernetes, Cloud Run) dan pemantauan performa koneksi basis data PostgreSQL serta utilisasi memori secara non-blocking. Seluruh endpoint probe ini dikonfigurasi dengan decorator `@Public()` sehingga dapat diakses tanpa autentikasi JWT token oleh sistem pemantau eksternal.

---

#### 5.2.1 Full Health Check (Agregat Sistem)

Memeriksa kesehatan seluruh komponen sistem (konektivitas basis data PostgreSQL via Prisma dan ambang batas alokasi memori heap) dalam satu agregat respons tunggal.

- **Endpoint:** `GET /api/v1/health`
- **Akses Guard:** `@Public()` (Tanpa Guard)
- **Headers:** None

##### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Sistem beroperasi normal",
  "data": {
    "status": "ok",
    "info": {
      "memory_heap": {
        "status": "up"
      },
      "database": {
        "status": "up"
      }
    },
    "error": {},
    "details": {
      "memory_heap": {
        "status": "up"
      },
      "database": {
        "status": "up"
      }
    }
  }
}
```

**Failure (`HTTP 503 Service Unavailable` — Dependensi Gagal)**

```json
{
  "success": false,
  "statusCode": 503,
  "error": "ServiceUnavailableException",
  "message": "Pemeriksaan kesehatan sistem gagal: Satu atau lebih dependensi down",
  "data": {
    "status": "error",
    "info": {
      "memory_heap": {
        "status": "up"
      }
    },
    "error": {
      "database": {
        "status": "down",
        "message": "Database connection timeout or failed query"
      }
    },
    "details": {
      "database": {
        "status": "down",
        "message": "Database connection timeout or failed query"
      },
      "memory_heap": {
        "status": "up"
      }
    }
  },
  "timestamp": "2026-09-25T03:30:00.000Z",
  "path": "/api/v1/health"
}
```

---

#### 5.2.2 Liveness Probe (Event Loop & Alokasi Memori Heap)

Digunakan oleh orchestrator (misal: Kubernetes `livenessProbe`) untuk memastikan event loop aplikasi tetap hidup dan penggunaan heap memori berada di bawah batas 300 MB. Jika probe ini gagal, orchestrator akan me-restart pod kontainer.

- **Endpoint:** `GET /api/v1/health/liveness`
- **Akses Guard:** `@Public()` (Tanpa Guard)
- **Headers:** None

##### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Liveness probe sehat: Event loop dan alokasi memori beroperasi normal",
  "data": {
    "status": "ok",
    "info": {
      "memory_heap": {
        "status": "up"
      }
    },
    "error": {},
    "details": {
      "memory_heap": {
        "status": "up"
      }
    }
  }
}
```

**Failure (`HTTP 503 Service Unavailable` — Alokasi Memori Melampaui Batas)**

```json
{
  "success": false,
  "statusCode": 503,
  "error": "ServiceUnavailableException",
  "message": "Liveness probe gagal: Alokasi heap memori melampaui batas aman",
  "data": {
    "status": "error",
    "info": {},
    "error": {
      "memory_heap": {
        "status": "down",
        "message": "Used heap size exceeds the threshold of 300MB"
      }
    },
    "details": {
      "memory_heap": {
        "status": "down",
        "message": "Used heap size exceeds the threshold of 300MB"
      }
    }
  },
  "timestamp": "2026-09-25T03:30:00.000Z",
  "path": "/api/v1/health/liveness"
}
```

---

#### 5.2.3 Readiness Probe (Koneksi Pool Basis Data PostgreSQL)

Digunakan oleh orchestrator (misal: Kubernetes `readinessProbe` / Ingress) untuk memastikan Prisma Client berhasil terhubung dan siap menerima query ke database PostgreSQL sebelum mengalirkan trafik pengguna. Jika probe ini gagal, kontainer ditandai tidak siap menerima trafik tanpa di-restart paksa.

- **Endpoint:** `GET /api/v1/health/readiness`
- **Akses Guard:** `@Public()` (Tanpa Guard)
- **Headers:** None

##### Response Payloads

**Success (`HTTP 200 OK`)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Readiness probe sehat: Koneksi database PostgreSQL siap menerima query",
  "data": {
    "status": "ok",
    "info": {
      "database": {
        "status": "up"
      }
    },
    "error": {},
    "details": {
      "database": {
        "status": "up"
      }
    }
  }
}
```

**Failure (`HTTP 503 Service Unavailable` — Koneksi PostgreSQL Gagal)**

```json
{
  "success": false,
  "statusCode": 503,
  "error": "ServiceUnavailableException",
  "message": "Readiness probe gagal: Sambungan ke database PostgreSQL terputus",
  "data": {
    "status": "error",
    "info": {},
    "error": {
      "database": {
        "status": "down",
        "message": "PrismaClientInitializationError: Can't reach database server at localhost:5432"
      }
    },
    "details": {
      "database": {
        "status": "down",
        "message": "PrismaClientInitializationError: Can't reach database server at localhost:5432"
      }
    }
  },
  "timestamp": "2026-09-25T03:30:00.000Z",
  "path": "/api/v1/health/readiness"
}
```

- **Error Codes Terkait:**
  - `HEALTH_CHECK_FAILED` (`503`): Sambungan database PostgreSQL atau alokasi memori melewati ambang batas aman (*heap limit*).
