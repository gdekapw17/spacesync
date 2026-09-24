# Architectural Blueprint & System Design — SpaceSync

**Nama Proyek:** SpaceSync  
**Tipe Dokumen:** Software Architecture Document (SAD)  
**Versi:** 1.0.0 (Fase 1 - MVP & Fase 2 Readiness)  
**Status:** Approved  
**Target Platform:** Next.js (App Router) + NestJS (Modular Monolith)

---

## 1. High-Level System Architecture

SpaceSync dibangun menggunakan pendekatan **Modular Monolith** terpisah (_decoupled repository / multi-folder structure_) yang memisahkan client application (`frontend/`) dan application core (`backend/`). Sistem dirancang agar dapat bertransisi dari penanganan _in-memory transaction/events_ di Fase 1 menuju _distributed queue & caching_ di Fase 2 tanpa merombak domain layer.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Next.js 15 App Router)                                       │
│                                                                        │
│   ┌──────────────────────────┐    ┌──────────────────────────────────┐ │
│   │ Server Components (RSC)  │    │ Client Components ("use client") │ │
│   │ - Route Handlers/Proxy   │    │ - React Hook Form + Zod          │ │
│   │ - Server Actions         │    │ - TanStack Query v5 (Cache)      │ │
│   │ - Auth Middleware        │    │ - Zustand (Global UI State)      │ │
│   └────────────┬─────────────┘    └────────────────┬─────────────────┘ │
└────────────────┼───────────────────────────────────┼───────────────────┘
                 │                                   │
                 │ HTTP / JSON (Axios + Interceptors)│
                 ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BACKEND (NestJS Enterprise Core)                                       │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Global Pipeline: TransformPipe -> JwtAuthGuard -> RolesGuard   │   │
│   │ -> LoggingInterceptor -> Business Logic -> ResponseInterceptor │   │
│   │ (Exceptions caught by Global HttpExceptionFilter)              │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌─────────────────┬─────────────┴───────────────┬────────────────┐   │
│   │ AuthModule      │ BookingModule               │ RoomModule     │   │
│   │ (Passport)      │ (Pessimistic Lock & Buffer) │ (Inventory)    │   │
│   └────────┬────────┴─────────────┬───────────────┴────────┬───────┘   │
│            │                      │                        │           │
│            │        EventEmitter2 (Domain Events)          │           │
│            │                      ▼                        │           │
│            │        ┌───────────────────────────┐          │           │
│            │        │ AuditLogModule & Cron     │          │           │
│            │        └─────────────┬─────────────┘          │           │
│            ▼                      ▼                        ▼           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Prisma ORM Layer                                               │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ DATA PERSISTENCE LAYER                                                 │
│                                                                        │
│ PostgreSQL Database (Engine Level Constraints & GiST Index)            │
│ - btree_gist extension (Exclusion Constraint on tsrange)               │
│ - Serialized Transactions & Read Replicas (Read-heavy Calendar)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure Blueprint

### 2.1 Frontend (`/frontend`)

Struktur folder memanfaatkan paradigma App Router Next.js dengan pemisahan ketat antara routing domain, layer presentasi, state cache, dan abstraksi network.

```text
frontend/
├── src/
│   ├── app/                             # Next.js App Router (Routes & Layouts)
│   │   ├── (auth)/                      # Route Group: Unauthenticated Layout
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/                 # Route Group: Authenticated App Shell
│   │   │   ├── layout.tsx               # Sidebar, Header, User Nav Shell
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── rooms/
│   │   │   │   ├── page.tsx             # Catalog & Filter
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx         # Detail & Interactive Booking Calendar
│   │   │   ├── my-bookings/
│   │   │   │   └── page.tsx             # End-User Booking History & Actions
│   │   │   └── management/              # Manager & Super Admin Protected Routes
│   │   │       ├── approvals/
│   │   │       │   └── page.tsx         # Pending Approval Queue
│   │   │       ├── rooms/
│   │   │       │   └── page.tsx         # Room CRUD & Maintenance Scheduler
│   │   │       └── users/
│   │   │           └── page.tsx         # Super Admin User/Role Management
│   │   ├── api/                         # Next.js Route Handlers (BFF / Cookie Proxy)
│   │   │   └── auth/
│   │   │       ├── refresh/route.ts     # Silent Token Refresh Rotation Handler
│   │   │       └── logout/route.ts      # HttpOnly Cookie Eviction
│   │   ├── layout.tsx                   # Root HTML, Providers (Theme, QueryClient)
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   ├── components/                      # UI Building Blocks
│   │   ├── ui/                          # Shadcn UI Primitives (Button, Modal, Form, etc.)
│   │   ├── feedback/                    # Error Boundaries, Empty States, Skeletons
│   │   ├── forms/                       # Domain Specific Form Blocks (React Hook Form)
│   │   │   ├── BookingForm.tsx
│   │   │   └── RoomForm.tsx
│   │   └── modules/                     # Complex Feature Organisms
│   │       ├── calendar/                # Timeline, Slot Picker, Buffer Zone Render
│   │       ├── rooms/                   # Room Cards, Amenity Badges
│   │       └── approvals/               # Decision Modal, Rejection Dialog
│   ├── hooks/                           # Custom React Hooks
│   │   ├── use-debounce.ts
│   │   └── use-permission.ts
│   ├── lib/                             # Infrastruktur Client & Tooling
│   │   ├── api/
│   │   │   ├── client.ts                # Axios Instance + Auth Interceptors
│   │   │   └── endpoints.ts             # Endpoint Constant Declarations
│   │   ├── query/
│   │   │   ├── query-client.ts          # TanStack QueryClient Defaults & Stale Times
│   │   │   └── query-keys.ts            # Centralized Factory Query Keys
│   │   └── utils.ts                     # Formatter, Date Utils, Tailwind cn()
│   ├── stores/                          # Zustand Stores (Client/UI State Only)
│   │   ├── use-auth-store.ts            # In-memory User Session & Permissions
│   │   └── use-calendar-store.ts        # Selected Date, View Mode, Range Filters
│   ├── types/                           # TypeScript Contracts (Generated from OpenAPI)
│   │   ├── api.d.ts                     # Standard API Response Envelope & Enums
│   │   ├── booking.d.ts
│   │   └── room.d.ts
│   └── middleware.ts                    # Next.js Edge Middleware (Route Protection & Cookie Inspection)
├── public/
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 2.2 Backend (`/backend`)

Mengikuti arsitektur modular NestJS berbasis DDD (_Domain-Driven Design_) ringan. Setiap modul mengenkapsulasi Controller, Service, DTO, Entity/Schema, dan Repository.

```text
backend/
├── prisma/
│   ├── schema.prisma                    # Master Data Schema Models & Enums
│   └── migrations/                      # SQL Migrations (including manual GiST SQL)
├── src/
│   ├── app.module.ts                    # Root Application Orchestrator
│   ├── main.ts                          # Bootstrap, Global Pipes, Filters, Swagger
│   ├── common/                          # Cross-Cutting Shared Modules
│   │   ├── constants/                   # Business Constraints, Error Codes, Tokens
│   │   ├── decorators/                  # @CurrentUser(), @Roles(), @Public()
│   │   ├── filters/                     # AllExceptionsFilter, PrismaClientExceptionFilter
│   │   ├── guards/                      # JwtAuthGuard, RolesGuard
│   │   ├── interceptors/                # TransformResponseInterceptor, LoggingInterceptor
│   │   ├── interfaces/                  # Generic API Response, Pagination Contract
│   │   └── pipes/                       # StrictValidationPipe (class-validator)
│   ├── config/                          # Configuration Loader (Zod Env Validation)
│   │   └── app.config.ts
│   ├── database/                        # Persistence Infrastructure
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts            # Lifecycle hook & Query Tracing
│   └── modules/                         # Feature Modules (Bounded Contexts)
│       ├── auth/
│       │   ├── dto/                     # LoginDto, RegisterDto, TokenDto
│       │   ├── strategies/              # JwtAccessStrategy, JwtRefreshStrategy
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   └── auth.module.ts
│       ├── users/
│       │   ├── dto/
│       │   ├── users.controller.ts
│       │   ├── users.service.ts
│       │   └── users.module.ts
│       ├── rooms/
│       │   ├── dto/                     # CreateRoomDto, FilterRoomDto
│       │   ├── rooms.controller.ts
│       │   ├── rooms.service.ts
│       │   └── rooms.module.ts
│       ├── bookings/
│       │   ├── dto/                     # CreateBookingDto, ApprovalDecisionDto
│       │   ├── events/                  # BookingCreatedEvent, BookingStatusChangedEvent
│       │   ├── services/
│       │   │   ├── bookings.service.ts  # Core Orchestrator & Workflow
│       │   │   └── conflict-engine.service.ts # Mathematical Zero-Overlap & Buffer Logic
│       │   ├── bookings.controller.ts
│       │   └── bookings.module.ts
│       ├── maintenance/
│       │   ├── dto/
│       │   ├── maintenance.service.ts
│       │   ├── maintenance.controller.ts
│       │   └── maintenance.module.ts
│       ├── audit-logs/
│       │   ├── listeners/               # BookingEventsListener (Consumes EventEmitter2)
│       │   ├── audit-logs.service.ts
│       │   └── audit-logs.module.ts
│       ├── scheduler/
│       │   ├── cron.service.ts          # Auto-Expire PENDING & Auto-Complete Finished Bookings
│       │   └── scheduler.module.ts
│       └── health/
│           ├── health.controller.ts     # Terminus Liveness & Readiness Probes
│           └── health.module.ts
├── test/                                # E2E Test Suites
├── tsconfig.json
└── package.json
```

---

## 3. Authentication & Authorization Deep Dive

Sistem menggunakan strategi **Dual-Token Mechanism** berbasis JWT. Access token bersifat _stateless_ dan berumur pendek untuk otentikasi performa tinggi, sedangkan Refresh token disimpan di cookie terenkripsi dengan proteksi browser tingkat tinggi untuk rotasi sesi.

```text
 ┌─────────┐                               ┌──────────────────┐                              ┌─────────┐
 │ Browser │                               │Next.js (Edge/BFF)│                              │ NestJS  │
 └───┬─────┘                               └────────┬─────────┘                              └───┬─────┘
     │                                              │                                            │
     │ 1. POST /api/v1/auth/login                   │                                            │
     ├─────────────────────────────────────────────►│ Forward Request                            │
     │                                              ├───────────────────────────────────────────►│
     │                                              │                                            │ 2. Validate Credentials
     │                                              │                                            │    Generate:
     │                                              │                                            │    - Access Token (15m)
     │                                              │                                            │    - Refresh Token (7d)
     │                                              │ 3. Response + Payload                      │
     │                                              │◄───────────────────────────────────────────┤
     │ 4. Set HttpOnly Cookie (RT)                  │                                            │
     │    Return AT in JSON Memory                  │                                            │
     │◄─────────────────────────────────────────────┤                                            │
     │                                              │                                            │
     │ 5. API Request (Header: Bearer AT)                                                        │
     ├──────────────────────────────────────────────┴───────────────────────────────────────────►│
     │                                              │                                            │ 6. JwtAuthGuard Validate
     │                                              │                                            │    Attach req.user
     │ 7. Return Data (HTTP 200)                                                                 │
     │◄─────────────────────────────────────────────┴────────────────────────────────────────────┤
     │                                              │                                            │
     │ [Scenario: Access Token Expired (HTTP 401)]                                               │
     │                                              │                                            │
     │ 8. Catch 401 via Axios Interceptor                                                        │
     │ 9. POST /api/auth/refresh (Cookie automatically included)                                 │
     ├─────────────────────────────────────────────►│                                            │
     │                                              │ 10. Extract RT from Cookie                 │
     │                                              │     POST /api/v1/auth/refresh              │
     │                                              ├───────────────────────────────────────────►│
     │                                              │                                            │ 11. Verify RT in DB/Secret
     │                                              │                                            │     Issue New Pair
     │                                              │ 12. Return New AT & RT                     │
     │                                              │◄───────────────────────────────────────────┤
     │ 13. Update RT Cookie                         │                                            │
     │     Return New AT to Client                  │                                            │
     │◄─────────────────────────────────────────────┤                                            │
     │                                              │                                            │
     │ 14. Retry Original Failed Request with New AT                                             │
     ├──────────────────────────────────────────────┴───────────────────────────────────────────►│
     │                                              │                                            │
```

### 3.1 Edge Middleware Protection (`middleware.ts`)

Next.js Edge Middleware bertindak sebagai garis pertahanan pertama rute browser untuk menghindari _flash of unauthenticated content_.

```typescript
// frontend/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/rooms",
  "/my-bookings",
  "/management",
];
const MANAGER_ROUTES = ["/management/approvals", "/management/rooms"];
const ADMIN_ROUTES = ["/management/users"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route),
  );

  if (isProtected && !refreshToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token decoding payload preview (Stateless check at Edge)
  // Granular verification remains at NestJS Guards
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/public).*)"],
};
```

### 3.2 NestJS Roles Guard Decorator Pattern

Otorisasi granular di backend dijamin menggunakan metadata reflection:

```typescript
// backend/src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException(
        "Akses ditolak: Identitas pengguna tidak valid",
      );
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        "Akses ditolak: Anda tidak memiliki izin peran yang sesuai",
      );
    }
    return true;
  }
}
```

### 3.3 Concurrency-Safe Axios 401 Interceptor with Mutex/Queue Pattern

Dalam arsitektur frontend dengan banyak komponen independen (seperti dashboard yang memicu _queries_ paralel secara serentak), kedaluwarsanya Access Token dapat menyebabkan beberapa request menghasilkan galat `HTTP 401` pada waktu bersamaan. Tanpa penanganan khusus, hal ini memicu _multiple concurrent refresh token requests_, yang berujung pada _race condition_ dan kegagalan rotasi sesi (_session lock-out_).

SpaceSync memecahkan masalah ini dengan memisahkan **BFF Boundary** dan menerapkan **Pola Request Mutex & Pending Queue** pada Axios interceptor:

1. **BFF Boundary Separation:** Seluruh alur autentikasi sensitif (`/login`, `/refresh`, `/logout`) wajib melalui Next.js Route Handler internal (`frontend/src/app/api/auth/*`). Route Handler ini bertindak sebagai BFF yang membaca dan menulis cookie `HttpOnly` secara aman pada domain yang sama, mengeliminasi risiko kerentanan CORS _credentials_.
2. **Mutex Flag (`isRefreshing`) & Pending Queue (`failedQueue`):** Request pertama yang mendeteksi `401` akan mengunci flag `isRefreshing = true` dan mengeksekusi refresh token ke BFF. Request-request lain yang gagal `401` secara paralel ditangguhkan (_queued_) ke dalam antrean _Pending Promises_. Setelah refresh token berhasil, seluruh antrean request dijalankan ulang (_replayed_) secara serial dengan Access Token baru.

```typescript
// frontend/src/lib/api/client.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/use-auth-store";

interface FailedRequestPromise {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1",
  headers: { "Content-Type": "application/json" },
});

let isRefreshing = false;
let failedQueue: FailedRequestPromise[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Sisipkan Access Token dari Memory Zustand
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Tangani 401 via Mutex Queue
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      !error.response ||
      error.response.status !== 401 ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    // Hindari pemanggilan refresh berulang pada request autentikasi itu sendiri
    if (
      originalRequest.url?.includes("/api/auth/refresh") ||
      originalRequest.url?.includes("/api/auth/login")
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Masukkan request yang gagal ke antrean tunggu sampai refresh token selesai
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          },
          reject: (err: unknown) => reject(err),
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Panggil Next.js Route Handler (BFF) yang membawa cookie HttpOnly refreshToken
      const { data } = await axios.post("/api/auth/refresh");
      const newAccessToken = data.data.accessToken;

      // Update token di client runtime store
      useAuthStore.getState().setAccessToken(newAccessToken);

      // Jalankan seluruh request yang tertunda
      processQueue(null, newAccessToken);

      // Ulangi request asli dengan token baru
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      useAuthStore.getState().clearSession();
      if (typeof window !== "undefined") {
        window.location.href = "/login?session_expired=true";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
```

---

## 4. State Management & Data Fetching (TanStack Query v5)

Arsitektur frontend memisahkan **Server/Cache State** (data yang dimiliki server) dan **Client State** (interaksi visual lokal):

- **TanStack Query v5:** Mengelola seluruh server state, caching, refetching, deduping, dan optimasi mutasi.
- **Zustand:** Khusus menangani client state transien (misal: state buka-tutup modal, layout sidebar, filter tanggal visual kalender).

### 4.1 Query Key Factory Pattern

Mencegah _cache-invalidation bug_ akibat salah ketik string key dengan memusatkan hierarki key:

```typescript
// frontend/src/lib/query/query-keys.ts
export const queryKeys = {
  rooms: {
    all: ["rooms"] as const,
    lists: () => [...queryKeys.rooms.all, "list"] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.rooms.lists(), filters] as const,
    details: () => [...queryKeys.rooms.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.rooms.details(), id] as const,
    availability: (id: string, date: string) =>
      [...queryKeys.rooms.detail(id), "availability", date] as const,
  },
  bookings: {
    all: ["bookings"] as const,
    myBookings: (page: number) =>
      [...queryKeys.bookings.all, "my-bookings", { page }] as const,
    pendingApprovals: () =>
      [...queryKeys.bookings.all, "pending-approvals"] as const,
  },
};
```

### 4.2 Optimistic Updates & Cache Mutation Flow

Ketika pengguna membatalkan reservasi, UI langsung mengupdate status secara optimis sebelum server merespons, meminimalkan _perceived latency_.

```typescript
// frontend/src/hooks/use-cancel-booking.ts
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      apiClient.patch(`/bookings/${bookingId}/cancel`),
    onMutate: async (bookingId) => {
      // 1. Cancel ongoing outgoing queries to prevent overwriting optimistic cache
      await queryClient.cancelQueries({ queryKey: queryKeys.bookings.all });

      // 2. Snapshot current cache value for rollback
      const previousBookings = queryClient.getQueryData(
        queryKeys.bookings.myBookings(1),
      );

      // 3. Optimistically set booking status to CANCELLED in cache
      queryClient.setQueryData(queryKeys.bookings.myBookings(1), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((item: any) =>
            item.id === bookingId ? { ...item, status: "CANCELLED" } : item,
          ),
        };
      });

      return { previousBookings };
    },
    onError: (err, bookingId, context) => {
      // 4. Rollback to original state on failure
      if (context?.previousBookings) {
        queryClient.setQueryData(
          queryKeys.bookings.myBookings(1),
          context.previousBookings,
        );
      }
    },
    onSettled: () => {
      // 5. Invalidate relevant queries to guarantee consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
  });
}
```

---

## 5. Backend Internal Architecture & Execution Pipeline

Setiap HTTP Request yang masuk ke NestJS melalui urutan filter, guard, dan interceptor yang deterministik:

```text
Request
  ──► Global Logging Interceptor (Capture Timestamp & Request IP)
  ──► StrictValidationPipe (Whitelist, Strip Non-DTO, Transform)
  ──► JwtAuthGuard (Passport JWT Validation -> Invalidate Blacklist)
  ──► RolesGuard (Reflector Verification against Endpoint Metadata)
  ──► Controller (Route Binding & DTO Assignment)
  ──► Service Orchestrator (Business Validation & Database Transaction)
  ──► TransformResponseInterceptor (Standard Envelope Formatting)
  ──► Response (JSON)

Exception Pipeline:
  Any Error ──► Global AllExceptionsFilter ──► Standard Error Envelope
```

### 5.1 NestJS Module Topology

Modul didesain secara otonom (_high cohesion, low coupling_):

- `AuthModule`: Mengelola token JWT, rotasi, hashing password via service provider.
- `RoomsModule`: Bertanggung jawab atas katalog, spesifikasi kapasitas, relasi manajer unit, dan status ruangan.
- `BookingsModule`: Jantung sistem. Memiliki dependensi ke `RoomsModule` untuk memvalidasi keberadaan ruangan dan mengimpor `ConflictEngineService` khusus kalkulasi matematis.
- `MaintenanceModule`: Menyediakan fungsi blokir jadwal teknis dan memutus reservasi tertabrak.
- `AuditLogsModule`: Menampung listener event tanpa diekspos langsung ke modul pemesanan.
- `SchedulerModule`: Menyediakan background cron `@nestjs/schedule` untuk penanganan _auto-expire_ dan _auto-complete_.

### 5.2 Decoupled Event-Driven Domain Event Pipeline

Pola pengiriman event internal menggunakan `@nestjs/event-emitter` mengisolasi pencatatan log dari thread utama:

```typescript
// backend/src/modules/bookings/services/bookings.service.ts
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictEngine: ConflictEngineService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async approveBooking(bookingId: string, actorId: string): Promise<Booking> {
    return await this.prisma.$transaction(
      async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { room: true },
        });

        if (!booking || booking.status !== BookingStatus.PENDING) {
          throw new BadRequestException(
            "Hanya reservasi berstatus PENDING yang dapat disetujui",
          );
        }

        // Lock baris ruangan secara eksklusif untuk mencegah phantom reads
        await tx.$executeRaw`
          SELECT id FROM "Room" 
          WHERE id = ${booking.roomId}::uuid 
          FOR UPDATE
        `;

        // Re-verify conflicts inside isolation transaction
        await this.conflictEngine.assertNoOverlap(tx, {
          roomId: booking.roomId,
          startTime: booking.startTime,
          operationalEndTime: booking.operationalEndTime,
          excludeBookingId: booking.id,
        });

        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.APPROVED },
        });

        // Emit event outside database lock contention
        this.eventEmitter.emit(
          "booking.status_changed",
          new BookingStatusChangedEvent({
            bookingId: updatedBooking.id,
            actorId,
            previousStatus: BookingStatus.PENDING,
            newStatus: BookingStatus.APPROVED,
          }),
        );

        return updatedBooking;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
```

### 5.3 Database Concurrency Control & Explicit Transaction Isolation Levels

Pada basis data PostgreSQL, tingkat isolasi transaksi bawaan (_default_) adalah **Read Committed**. Pada tingkat ini, evaluasi konflik jadwal menggunakan query penelusuran (`findFirst` / `findMany`) rentan terhadap fenomena **Phantom Reads** pada beban operasional tinggi: dua transaksi konkuren yang mengecek ruangan yang sama dapat membaca slot yang sama-sama kosong, lalu keduanya sama-sama melakukan _insert/update_, menyebabkan _double booking_.

SpaceSync mengimplementasikan strategi pertahanan berlapis untuk menjamin isolasi ACID mutlak:

#### 1. Strategi Baris Tunggal: Pessimistic Row Locking (`SELECT ... FOR UPDATE`)

Untuk mencegah _phantom read_ tanpa membebani basis data dengan _serialization aborts_ yang agresif, service melakukan penguncian baris eksklusif pada entitas `Room` sebelum menjalankan kalkulasi overlap:

```typescript
// Mengunci baris ruangan agar transaksi lain untuk ruangan yang sama menunggu antrean
await tx.$executeRaw`
  SELECT id FROM "Room" 
  WHERE id = ${booking.roomId}::uuid 
  FOR UPDATE
`;
```

#### 2. Strategi Transaksional Penuh: Explicit `Serializable` Isolation Level

Pada alur persetujuan (`approveBooking`) dan reservasi kritis, transaksi dibungkus dengan level isolasi eksplisit:

```typescript
await this.prisma.$transaction(
  async (tx) => {
    // 1. Lock baris ruangan (Pessimistic)
    await tx.$executeRaw`SELECT id FROM "Room" WHERE id = ${booking.roomId}::uuid FOR UPDATE`;

    // 2. Evaluasi bentrokan dengan Booking aktif & MaintenanceBlock
    await this.conflictEngine.assertNoOverlap(tx, {
      roomId: booking.roomId,
      startTime: booking.startTime,
      operationalEndTime: booking.operationalEndTime,
      excludeBookingId: booking.id,
    });

    // 3. Mutasi status & persistensi
    return await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.APPROVED },
    });
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000, // Maksimal waktu antre mendapatkan koneksi: 5 detik
    timeout: 10000, // Timeout eksekusi transaksi: 10 detik
  },
);
```

Jika terjadi konflik konkurensi pada level `Serializable`, PostgreSQL menghasilkan kode galat `40001` (_serialization_failure_). Filter global `PrismaClientExceptionFilter` secara otomatis menangkap galat ini dan mengembalikannya sebagai respon terstandarisasi `409 Conflict`.

### 5.4 Health Check, Graceful Shutdown & Observability Layer

Untuk kesiapan operasional pada arsitektur berbasis kontainer (Docker / Kubernetes), NestJS dilengkapi dengan modul kesehatan `@nestjs/terminus` dan penanganan sinyal terminasi sistem (_clean connection pool teardown_).

#### 1. Liveness & Readiness Probes (`HealthController`)

Modul `HealthModule` mengekspos endpoint `/api/v1/health` yang membedakan kesiapan operasional server:

- **Liveness Probe (`/api/v1/health/liveness`):** Memverifikasi apakah event loop aplikasi tetap hidup dan penggunaan alokasi heap memori berada dalam ambang batas aman.
- **Readiness Probe (`/api/v1/health/readiness`):** Memverifikasi bahwa Prisma Client berhasil melakukan _ping_ ke basis data PostgreSQL dan dapat menerima query sebelum menerima trafik jaringan dari Ingress/Load Balancer.

```typescript
// backend/src/modules/health/health.controller.ts
import { Controller, Get } from "@nestjs/common";
import {
  HealthCheckService,
  HealthCheck,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from "@nestjs/terminus";
import { PrismaService } from "@/database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get("liveness")
  @HealthCheck()
  checkLiveness() {
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 300 * 1024 * 1024), // 300MB
    ]);
  }

  @Get("readiness")
  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      () => this.prismaHealth.pingCheck("database", this.prisma),
    ]);
  }
}
```

#### 2. Graceful Shutdown Lifecycle Hooks

Saat container menerima sinyal `SIGTERM` atau `SIGINT` (misalnya saat proses rolling deployment atau restart pod), aplikasi tidak boleh memutus koneksi transaksi aktif secara tiba-tiba:

```typescript
// backend/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Mengaktifkan lifecycle hook shutdown NestJS
  app.enableShutdownHooks();

  await app.listen(process.env.PORT || 4000);
}
```

Mekanisme ini menjamin bahwa seluruh transaksi basis data yang sedang berlangsung diselesaikan atau di-_rollback_ dengan rapi, worker cron/scheduler menyelesaikan tugas yang sedang dieksekusi, dan _connection pool_ PostgreSQL dilepaskan tanpa menyisakan _dangling locks_.

---

## 6. Fase 2 Extensibility Architecture: Redis & Queues

Di Fase 2, komponen performa tinggi disuntikkan tanpa merombak logika bisnis yang sudah stabil di Fase 1.

```text
                                  FASE 2 EXTENSION
                                 ┌─────────────────┐
                                 │   Redis Server  │
                                 └────────┬────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                      ┌────────────────────────┐
     │  Distributed Locking   │                      │  Message Queue System  │
     │   (Redlock Algorithm)  │                      │    (BullMQ Engine)     │
     └────────────▲───────────┘                      └────────────▲───────────┘
                  │                                               │
                  │ Intercepts CreateBooking                      │ Listens to Domain Events
                  │                                               │
┌─────────────────┴───────────────────────────────────────────────┴───────────────────┐
│ BookingsService Core (NestJS)                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Distributed Locking (Pencegahan Race Condition Ekstrem)

Pada Fase 1, mitigasi dilakukan via `SELECT ... FOR UPDATE` dan _PostgreSQL Exclusion Constraint_. Pada Fase 2, distributed locking dieksekusi di layer memori sebelum query menyentuh database:

- **Pola Desain:** AOP (_Aspect-Oriented Programming_) melalui Custom Method Decorator `@DistributedLock()`.
- **Mekanisme Kunci:** Mengunci spesifik key gabungan: `lock:room:<roomId>:date:<YYYY-MM-DD>`.
- **TTL (Time-To-Live):** Kunci dilepas maksimal dalam 5 detik untuk mencegah _deadlock_ jika pod backend crash di tengah jalan.

```typescript
// Implementasi Fase 2 via Decorator
@Post()
@DistributedLock((req) => `room:${req.body.roomId}:date:${req.body.bookingDate}`)
async createBooking(@Body() dto: CreateBookingDto) {
  return this.bookingsService.create(dto);
}

```

### 6.2 Asynchronous Job Queue (BullMQ)

Memisahkan seluruh operasi I/O jaringan lambat ke proses latar belakang mandiri (_background worker process_).

- **Queue Name:** `notifications-queue`
- _Job `send-whatsapp-approval`:_ Mengirim notifikasi pesan instan ke pemohon saat disetujui.
- _Job `send-email-cancellation`:_ Mengirim notifikasi pembersihan jadwal.

- **Queue Name:** `payment-reconciliation-queue`
- _Job `verify-payment-expiry`:_ Menangani kedaluwarsa tagihan pembayaran (Fase 2) setiap 1 menit.

- **Integrasi Bersih:** Listener `AuditLogListener` di Fase 1 diubah menjadi publisher BullMQ di Fase 2:

```typescript
// backend/src/modules/audit-logs/listeners/booking-events.listener.ts
@Injectable()
export class BookingEventsListener {
  constructor(
    @InjectQueue("notifications-queue") private readonly notifyQueue: Queue,
    private readonly auditService: AuditLogsService,
  ) {}

  @OnEvent("booking.status_changed")
  async handleBookingStatusChanged(event: BookingStatusChangedEvent) {
    // 1. Catat Audit Log lokal (Tetap berjalan sinkron/cepat)
    await this.auditService.record(event);

    // 2. Lempar ke Antrean Asinkron (Fase 2)
    await this.notifyQueue.add(
      "dispatch-notification",
      {
        bookingId: event.bookingId,
        status: event.newStatus,
        timestamp: new Date(),
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
      },
    );
  }
}
```

---

## 7. Security, Error Handling & API Envelope Standards

### 7.1 Standar Format Respons Global

#### Sukses (`HTTP 200 / 201`)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operasi berhasil dieksekusi",
  "data": {
    "id": "6a9e1e2d-304a-4d7a-b5ff-813f56e927c4",
    "status": "APPROVED"
  },
  "meta": {
    "timestamp": "2026-09-24T07:36:31.000Z",
    "requestId": "req-987216a-bca"
  }
}
```

#### Gagal (`HTTP 4xx / 5xx`)

```json
{
  "success": false,
  "statusCode": 409,
  "error": "ConflictException",
  "message": "Slot waktu tidak tersedia karena bertubrukan dengan reservasi lain atau jeda sterilisasi ruangan.",
  "errors": [
    {
      "field": "startTime",
      "issue": "Waktu 10:00 - 11:00 melanggar batas operasional hingga 10:15."
    }
  ],
  "timestamp": "2026-09-24T07:36:31.000Z",
  "path": "/api/v1/bookings"
}
```

### 7.2 Type-Safety Pipeline (OpenAPI to Frontend Zod)

Untuk menjaga integritas kontrak data tanpa monorepo package yang saling mengikat:

1. NestJS menghasilkan spesifikasi OpenAPI valid (`/api/docs-json`) saat build.
2. Frontend menjalankan skrip `npm run codegen:api` yang menggunakan pustaka generator klien untuk mengonversi skema OpenAPI menjadi:

- Tipe data TypeScript lengkap (`src/types/api.d.ts`).
- Skema validasi Zod klien yang otomatis sinkron dengan anotasi `class-validator` backend.

### 7.3 Timezone Normalization Contract Pipeline (UTC Wire Format)

Salah satu sumber kerentanan utama pada sistem reservasi adalah ambiguitas zona waktu (_timezone mismatch_) antara perangkat klien yang tersebar di berbagai belahan wilayah (misal: pengguna di Bali dengan WITA UTC+8, Jakarta dengan WIB UTC+7) dan server yang beroperasi pada zona waktu UTC.

SpaceSync menetapkan standardisasi protokol data temporal secara ketat:

#### 1. Wire Format Standard (UTC ISO-8601)

Semua parameter waktu yang dikirimkan melalui payload HTTP (request body, query string, dan response JSON) **wajib menggunakan format ISO-8601 UTC penuh**:
`YYYY-MM-DDTHH:mm:ss.sssZ` (contoh: `2026-09-24T02:00:00.000Z`).

Sistem melarang pengiriman format tanggal atau jam parsial tanpa penanda _offset_ (seperti `"2026-09-24"` atau `"09:00"`) pada endpoint transaksional booking.

#### 2. DTO Validation Schema

Backend memvalidasi seluruh input waktu menggunakan decorator ketat:

```typescript
// backend/src/modules/bookings/dto/create-booking.dto.ts
import { IsISO8601, IsUUID, IsNotEmpty } from "class-validator";

export class CreateBookingDto {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @IsISO8601({ strict: true })
  @IsNotEmpty()
  startTime: string; // Misal: "2026-09-24T02:00:00.000Z" (09:00 WIB)

  @IsISO8601({ strict: true })
  @IsNotEmpty()
  endTime: string; // Misal: "2026-09-24T04:00:00.000Z" (11:00 WIB)
}
```

#### 3. Database Layer (`timestamptz` & `tstzrange`)

Pada tingkat PostgreSQL, seluruh kolom waktu (`startTime`, `endTime`, `operationalEndTime`) disimpan sebagai tipe `TIMESTAMP WITH TIME ZONE` (`timestamptz`). Indeks GiST dan Exclusion Constraint beroperasi pada rentang waktu `tstzrange`, menjamin evaluasi matematis interval _zero-overlap_ dieksekusi secara instan dan kebal terhadap pergeseran kalender lokal.

#### 4. Frontend Localization Pipeline

Frontend bertanggung jawab penuh mengonversi waktu lokal menjadi UTC saat submit, dan mengonversi UTC ke zona waktu ruangan saat menampilkan jadwal:

- Setiap entitas `Room` memiliki atribut `timezone` (misal: `"Asia/Jakarta"`).
- Komponen kalender dan slot picker me-render waktu dalam basis zona waktu ruangan tersebut, terlepas dari zona waktu fisik browser pengguna.
- Sebelum payload dikirimkan ke API, utilitas `date-fns-tz` mengonversi waktu seleksi lokal ke string UTC ISO-8601 deterministik.
