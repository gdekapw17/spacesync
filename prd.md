# Product Requirement Document (PRD) — SpaceSync

**Nama Proyek:** SpaceSync  
**Tipe Dokumen:** Product Requirement Document (PRD)  
**Versi:** 1.0.0 (Fase 1 - MVP)  
**Status:** Approved  
**Target Rilis:** Q4 2026

---

## 1. Executive Summary & Problem Statement

### 1.1 Background

Pengelolaan ruang bersama (ruang rapat, auditorium, laboratorium komputer, dan area kerja komunal) di lingkungan institusi sering mengalami friksi operasional akibat bentrok jadwal (_double booking_), ketiadaan jeda pembersihan/sterilisasi fasilitas antar-sesi, serta alur persetujuan manual yang lambat dan tidak terdokumentasi.

### 1.2 Objective

SpaceSync hadir sebagai platform manajemen reservasi ruangan yang mengedepankan prinsip ketersediaan _zero-overlap_, transparansi jadwal harian terintegrasi, dan pemisahan wewenang operasional berbasis peran (_Role-Based Access Control_). Sistem ini menjamin kepastian ketersediaan slot melalui perhitungan otomatis jendela operasional fasilitas (_operational buffer window_).

---

## 2. Actors & Personas

- **Super Admin:** Pengelola infrastruktur data global. Mengendalikan data master pengguna, penugasan peran (_role assignment_), registrasi unit kerja, dan pemantauan audit log seluruh organisasi.
- **Room/Unit Manager:** Penanggung jawab operasional fasilitas pada unit/gedung tertentu. Berwenang memvalidasi permohonan reservasi (_approval/rejection_), mengelola detail fasilitas ruangan, serta menjadwalkan blok pemeliharaan (_maintenance blocks_).
- **End-User (Karyawan/Mahasiswa/Staf):** Pengguna terautentikasi yang memerlukan fasilitas ruangan untuk kegiatan temporer dalam rentang waktu harian tertentu.

---

## 3. Product Scope: Fase 1 (MVP) vs Fase 2 Roadmap

### 3.1 Scope MVP (Fase 1)

- Sistem autentikasi JWT stateless (Access Token & HttpOnly Refresh Token).
- RBAC granular (Super Admin, Room Manager, End-User).
- CRUD inventaris ruangan beserta kapasitas, fasilitas, dan unit penanggung jawab.
- Pengecekan ketersediaan slot waktu harian dengan resolusi interval 15 menit.
- Reservasi ruangan dengan mitigasi _zero-overlap_ dan otomatisasi _buffer time_ pembersihan (15 menit).
- Workflow persetujuan dan siklus hidup reservasi lengkap: _Pending_ $\rightarrow$ _Approved_ / _Rejected_, pembatalan mandiri oleh pemohon, pembatalan darurat (_force cancel_) oleh Manager, serta mutasi otomatis _Expired_ dan _Completed_ via background worker.
- Standardisasi data temporal berbasis UTC (ISO-8601) dengan dukungan pengikatan zona waktu lokal fasilitas.
- Blok pemeliharaan fasilitas terjadwal (_maintenance blocks_) dengan proteksi isolasi jadwal terhadap reservasi aktif.
- Audit log pencatatan mutasi status reservasi.

### 3.2 Non-Scope (Fase 1)

- Integrasi sistem pembayaran (_Payment Gateway_).
- Notifikasi asinkron pihak ketiga (WhatsApp Gateway, Email SMTP, Push Notifications).
- Pemesanan berulang berkala (_recurring booking_ otomatis).
- Pemesanan lintas hari (_cross-midnight/multi-day stay_).
- Distributed caching dan locking eksternal (Redis/Redlock).

### 3.3 Extensibility Strategy (Menuju Fase 2)

- **Decoupled Domain Events:** Setiap mutasi status reservasi memicu event internal (`booking.created`, `booking.approved`, `booking.cancelled`) melalui NestJS `EventEmitter2`. Modul notifikasi dan analitik di Fase 2 dapat langsung mengonsumsi event ini tanpa mengubah _core booking service_.
- **Extensible Payment Interface:** Skema `Booking` mengalokasikan kolom status transaksi serta relasi opsional terhadap entitas pembayaran agar implementasi `IPaymentProcessor` di Fase 2 dapat langsung dipetakan.
- **Slot Locking Boundary:** Logika isolasi transaksi dirancang dalam batas abstraksi interface `ILockManager`, sehingga transisi dari _database-level pessimistic locking/exclusion constraint_ ke _Redis distributed lock_ tidak merusak arsitektur modul.

---

## 4. Functional Requirements (FR)

### 4.1 Modul Autentikasi & Otorisasi (AUTH)

- **FR-AUTH-01:** Sistem harus menyediakan endpoint pendaftaran akun (_registration_) dengan validasi format email institusional, kekuatan kata sandi, dan enkripsi menggunakan `bcrypt` (_salt rounds_ minimal 10).
- **FR-AUTH-02:** Sistem harus mengautentikasi pengguna menggunakan pasangan JSON Web Token:
  - _Access Token:_ Masa aktif 15 menit, dikirim via header `Authorization: Bearer <token>`.
  - _Refresh Token:_ Masa aktif 7 hari, disimpan dalam cookie aman (`HttpOnly`, `SameSite=Strict`, `Secure`).
- **FR-AUTH-03:** Sistem harus mengimplementasikan Guard berbasis peran (_Role Guard_) untuk membatasi akses endpoint sesuai matriks otorisasi.

### 4.2 Modul Inventaris Ruangan (ROOM)

- **FR-ROOM-01:** Room Manager dan Super Admin dapat membuat, membaca, memperbarui, dan menonaktifkan (_soft-delete/archive_) data ruangan.
- **FR-ROOM-02:** Setiap ruangan wajib memiliki atribut kode unik, nama, kapasitas maksimal, lokasi (lantai/gedung), penanggung jawab (_managerId_), zona waktu operasional lokal (IANA timezone, default: `Asia/Jakarta`), durasi buffer default (default: 15 menit), dan status operasional (`AVAILABLE`, `MAINTENANCE`, `INACTIVE`).
- **FR-ROOM-03:** Sistem harus menyediakan endpoint katalog publik (bagi user terautentikasi) yang dapat difilter berdasarkan tanggal, rentang kapasitas, ketersediaan fasilitas pendukung, dan lokasi.

### 4.3 Modul Engine Reservasi (BOOKING)

- **FR-BOOK-01:** Pengguna dapat mengajukan reservasi ruangan untuk tanggal tertentu dengan menentukan `startTime` dan `endTime` dalam hari yang sama.
- **FR-BOOK-02:** Sistem wajib mengkalkulasi secara otomatis nilai `operationalEndTime`:

  $$\text{operationalEndTime} = \text{endTime} + \Delta t_{\text{buffer}}$$

  Di mana $\Delta t_{\text{buffer}}$ bernilai default 15 menit (atau mengikuti konfigurasi spesifik ruangan).

- **FR-BOOK-03:** Sistem wajib menolak pembuatan reservasi baru apabila rentang operasional $[\text{startTime}, \text{operationalEndTime})$ tumpang tindih dengan reservasi aktif (`PENDING`, `APPROVED`) atau jadwal `MAINTENANCE` pada ruangan dan tanggal yang sama.
- **FR-BOOK-04:** Batasan durasi pemesanan:
  - Durasi pemakaian minimal: 30 menit.
  - Durasi pemakaian maksimal: 8 jam per reservasi.
  - Rentang waktu reservasi (_lead time_): Paling cepat $H+1$ (24 jam sebelum pemakaian) dan paling lambat $H+30$ hari kalender.
- **FR-BOOK-05:** Pengguna dapat membatalkan reservasi aktif miliknya secara mandiri maksimal $N$ jam (default: 2 jam) sebelum waktu `startTime`. Kurang dari batas tersebut, aksi pembatalan ditolak dan dialihkan ke permohonan pembatalan oleh Manager.
- **FR-BOOK-06 (Timezone Normalization & Storage):** Seluruh data temporal di tingkat API (payload request/response) dan basis data wajib disimpan dalam format ISO-8601 UTC penuh (`timestamptz`). Setiap entitas `Room` memiliki atribut zona waktu lokal (misal: `timezone: "Asia/Jakarta"`). Sebelum evaluasi durasi, batasan pemesanan harian (00:00 - 23:59 waktu lokal), dan kalkulasi tumpang tindih (_zero-overlap_) dijalankan, seluruh rentang waktu wajib dinormalisasi secara deterministik ke basis UTC yang seragam guna mengeliminasi ambiguitas pergeseran tanggal/jam antara server UTC dan browser klien (WIB/WITA/WIT).

### 4.4 Modul Persetujuan & Pemeliharaan (WORKFLOW & MAINTENANCE)

- **FR-WORK-01:** Room Manager hanya berhak menyetujui (`APPROVED`) atau menolak (`REJECTED`) reservasi untuk ruangan yang berada di bawah wewenangnya. Super Admin berhak memproses seluruh ruangan.
- **FR-WORK-02:** Setiap penolakan reservasi (`REJECTED`) mewajibkan aktor pengelola mengisi kolom `rejectionReason`.
- **FR-WORK-03:** Room Manager dapat membuat blok pemeliharaan (`MaintenanceBlock`) yang secara otomatis mengunci ketersediaan ruangan dari pemesanan reguler pada jendela waktu terkait.
- **FR-WORK-04:** Setiap transisi status (`PENDING` $\rightarrow$ `APPROVED`, `PENDING` $\rightarrow$ `REJECTED`, dsb.) wajib mencatat entri baru ke dalam tabel `AuditLog` dengan mencantumkan identitas aktor, status lama, status baru, dan waktu pencatatan.
- **FR-WORK-05 (SLA Expiration & Auto-Completion):** Sistem wajib menyediakan penjadwalan otomatis via _scheduled background worker_ (misal: berjalan setiap 15 menit menggunakan `@nestjs/schedule`) untuk mengelola mutasi siklus hidup status secara otonom:
  - _Auto-Expiration SLA (Pending Expiration):_ Permohonan berstatus `PENDING` yang tidak ditinjau oleh Room Manager hingga melampaui batas waktu SLA (default: $H-6$ jam sebelum `startTime` atau $1 \times 24$ jam pasca-pengajuan) akan secara otomatis diubah statusnya menjadi `REJECTED` oleh sistem dengan `rejectionReason: "Kedaluwarsa oleh sistem (SLA Expiration)"`. Tindakan ini seketika membebaskan jendela operasional ruangan agar slot waktu kembali tersedia bagi pengguna lain.
  - _Auto-Completion:_ Worker memindai secara periodik seluruh reservasi berstatus `APPROVED` di mana `operationalEndTime <= NOW()` (berbasis waktu UTC) untuk dimutasi statusnya menjadi `COMPLETED` dan dicatat ke dalam `AuditLog`.
- **FR-WORK-06 (Emergency Manager Force-Cancel):** Room Manager dan Super Admin memiliki hak istimewa pembatalan darurat (_Force Cancel_) untuk membatalkan reservasi yang sudah berstatus `APPROVED` sewaktu-waktu (termasuk ketika batas waktu pembatalan mandiri 2 jam telah terlewati), apabila ruangan mendadak tidak dapat digunakan (misal: kerusakan fasilitas vital, perbaikan darurat, atau bencana). Aksi ini mewajibkan pengisian `cancellationReason`, mengubah status menjadi `CANCELLED`, mencatat identitas eksekutor dan alasan ke `AuditLog`, serta langsung melepaskan kuncian slot waktu pada kalender.

---

## 5. Non-Functional Requirements (NFR)

### 5.1 Performa & Skalabilitas (Performance)

- **NFR-PERF-01:** Waktu respons API untuk pengecekan ketersediaan ruangan (_availability query_) tidak boleh melebihi 200 ms pada persentil 95 (P95) dalam beban operasional normal.
- **NFR-PERF-02:** Pembuatan transaksi booking wajib selesai dalam waktu kurang dari 500 ms (P95) termasuk eksekusi validasi overlap dan penulisan audit log.
- **NFR-PERF-03:** Desain indeks basis data (B-Tree dan GiST) harus mengoptimasi pencarian rentang waktu harian pada tabel transaksi booking.

### 5.2 Keamanan & Integritas Data (Security & Data Integrity)

- **NFR-SEC-01:** Seluruh lalu lintas komunikasi data wajib terenkripsi menggunakan protokol HTTPS / TLS 1.3.
- **NFR-SEC-02:** Sistem wajib mengimplementasikan sanitasi input dan validasi DTO ketat menggunakan `class-validator` (Backend) dan Zod (Frontend) untuk mencegah serangan injeksi (SQL Injection, XSS).
- **NFR-SEC-03:** Pencegahan _race condition_ pada level transaksi basis data wajib dijamin ganda melalui kombinasi transaksi _pessimistic locking_ (`FOR UPDATE`) dan _PostgreSQL Exclusion Constraint_ (`tsrange`).
- **NFR-SEC-04:** Token JWT harus ditandatangani menggunakan algoritma asimetrik (RS256) atau simetrik kuat (HS256 dengan _secret_ minimal 256-bit) serta menerapkan rotasi token berkala.
- **NFR-SEC-05 (Database Concurrency across Maintenance & Bookings):** Sistem wajib menjamin isolasi integritas transaksional yang konsisten antara entitas `Booking` dan `MaintenanceBlock`. Mengingat _PostgreSQL Exclusion Constraint_ (`tsrange`) secara _native_ hanya membatasi baris pada satu tabel tunggal (`bookings`), proteksi tabrakan jadwal lintas tabel wajib diterapkan secara berlapis di tingkat backend:
  - Pembuatan entri `MaintenanceBlock` baru wajib memverifikasi ketiadaan reservasi aktif (`PENDING`, `APPROVED`) pada rentang waktu terkait di dalam blok transaksi terisolasi (_Serializable_ atau _pessimistic lock_ `FOR UPDATE`) sebelum blok pemeliharaan disimpan.
  - Pembuatan `Booking` baru wajib melakukan pengecekan silang ganda (_cross-table check_) terhadap tabel `maintenance_blocks` di dalam blok transaksi terisolasi yang sama sebelum data reservasi disimpan.
  - Jika terjadi bentrokan konkurensi antar-entitas, transaksi wajib dibatalkan (_rollback_) dan sistem mengembalikan respon kesalahan terstandarisasi `409 Conflict`.

### 5.3 Ketersediaan & Keandalan (Availability & Reliability)

- **NFR-REL-01:** Target ketersediaan layanan (_uptime_) sistem adalah 99.5% per bulan di luar jadwal pemeliharaan terencana.
- **NFR-REL-02:** Transaksi basis data yang mengalami konflik integritas konkuren harus mengembalikan penanganan status HTTP terstandarisasi tanpa menyebabkan _server crash_ (_graceful failure_).

### 5.4 Usabilitas (Usability)

- **NFR-USA-01:** Desain antarmuka kalender harus secara visual membedakan waktu penggunaan aktual penyewa dengan waktu sterilisasi buffer fasilitas.
- **NFR-USA-02:** Form reservasi wajib memberikan visual feedback instan saat rentang waktu yang dipilih berstatus tidak valid sebelum user menekan tombol submit.

---

## 6. Detailed User Flows

### 6.1 Alur Pemesanan Ruangan oleh End-User (Flow: Booking Submission)

```text
[Start: User masuk ke Detail Ruangan]
│
▼
[Pilih Tanggal Penggunaan]
│
▼
[Sistem panggil API Availability] ──> [Render Kalender: Blok Booked & Buffer 15m]
│
▼
[Pilih Slot Waktu (startTime & endTime)]
│
▼
[Validasi Sisi Klien: Durasi 30m - 8h & Interval 15m]
│
├─────────────────────────┐
│                         │
▼                         ▼
(Tidak Valid)          (Valid)
│                         │
▼                         ▼
[Tampilkan Pesan Error]   [User Klik Tombol "Ajukan Reservasi"]
                          │
                          ▼
                          [Kirim POST /api/v1/bookings]
                          │
                          ▼
                          [Backend Transaksi Database]
                          - Hitung operationalEndTime
                          - Cek Overlap Window
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
      (Ada Konflik)               (Bebas Konflik)
            │                           │
            ▼                           ▼
   [HTTP 409 Conflict]         [HTTP 201 Created]
   [Render Pesan Gagal]        [Status: PENDING]
                               [Emit Event: booking.created]
                               [Arahkan ke Tab "Reservasi Saya"]
```

### 6.2 Alur Persetujuan oleh Room Manager (Flow: Approval Process)

```text
[Manager Buka Menu "Daftar Persetujuan"]
│
▼
[Sistem Ambil Data Booking Status PENDING sesuai Unit Wewenang]
│
▼
[Manager Memilih Entri Permohonan]
│
▼
[Keputusan Manajer]
│
├─────────────────────────────────────┐
│                                     │
▼                                     ▼
[Klik "Setujui"]                      [Klik "Tolak"]
│                                     │
│                                     ▼
│                                     [Wajib Isi Alasan Penolakan]
│                                     │
▼                                     ▼
[PATCH /bookings/:id/approve]         [PATCH /bookings/:id/reject]
│                                     │
├─────────────────────────────────────┘
│
▼
[Database Transaction]
- Mutasi Status (APPROVED / REJECTED)
- Tulis Rekam Jejak ke AuditLog
- Emit Event (booking.approved / booking.rejected)
│
▼
[Tampilkan Feedback Sukses & Refresh Antrean Persetujuan]
```

### 6.3 Alur Pembatalan Mandiri oleh End-User (Flow: Cancellation)

```text
[User Buka Halaman "Riwayat Reservasi"]
│
▼
[Pilih Reservasi Aktif (Status PENDING atau APPROVED)]
│
▼
[Klik Tombol "Batalkan Reservasi"]
│
▼
[Cek Kondisi: Waktu Sekarang <= (startTime - 2 Jam)?]
│
├─────────────────────────────────────┐
│                                     │
▼                                     ▼
(Ya)                                  (Tidak)
│                                     │
▼                                     ▼
[Dialog Konfirmasi Pembatalan]        [Aksi Ditolak: Batas Waktu Terlewati]
│                                     [Informasikan Hubungi Manager Unit]
▼
[PATCH /api/v1/bookings/:id/cancel]
│
▼
[Database: Ubah Status -> CANCELLED & Lepas Jendela Operasional]
[Tulis AuditLog]
[Slot Waktu Kembali Terbuka di Kalender]
```

---

## 7. Edge Cases & Error Handling Specifications

| Kode Skenario   | Titik Kejadian                     | Kondisi Pemicu                                                                                                               | Respon Sistem / HTTP Status                                        | Tindakan Korektif & UX Feedback                                                                                                                                            |
| :-------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ERR-EDGE-01** | `POST /bookings`                   | Dua pengguna mengajukan slot ruangan dan tanggal yang sama pada milidetik yang identik (_Race Condition_).                   | `409 Conflict` (Ditangkap oleh Exclusion Constraint atau Lock DB). | Request pertama berhasil (`201`). Request kedua ditolak dengan pesan: _"Ruangan telah dipesan oleh pengguna lain beberapa saat yang lalu. Silakan pilih slot waktu lain."_ |
| **ERR-EDGE-02** | `POST /bookings`                   | Pengguna memilih slot waktu yang menabrak jendela pembersihan buffer 15 menit dari reservasi sebelumnya.                     | `422 Unprocessable Entity` / `409 Conflict`.                       | Form menandai kolom waktu dengan warna merah dan pesan: _"Waktu mulai bertubrukan dengan 15 menit jeda sterilisasi reservasi sebelumnya."_                                 |
| **ERR-EDGE-03** | `PATCH /cancel`                    | Pengguna membatalkan reservasi ketika waktu pemakaian tinggal 1 jam lagi (kurang dari batas minimum pembatalan 2 jam).       | `400 Bad Request`.                                                 | Modal error muncul: _"Pembatalan mandiri hanya diizinkan maksimal 2 jam sebelum acara dimulai. Silakan hubungi pengelola fasilitas."_                                      |
| **ERR-EDGE-04** | `POST /bookings`                   | Pengguna memesan ruangan yang memiliki blok pemeliharaan aktif (`MaintenanceBlock`) pada jam tersebut.                       | `409 Conflict`.                                                    | Kalender otomatis menampilkan slot berstatus disabled dengan label abu-abu _"Dalam Pemeliharaan Rutin"_.                                                                   |
| **ERR-EDGE-05** | `POST /bookings`                   | Input waktu selesai lebih awal daripada waktu mulai (`startTime >= endTime`) atau durasi kurang dari 30 menit.               | `400 Bad Request` (Validasi Zod / class-validator).                | Input field secara real-time menampilkan error inline: _"Waktu selesai harus lebih besar minimal 30 menit dari waktu mulai."_                                              |
| **ERR-EDGE-06** | `PATCH /approve`                   | Room Manager mencoba menyetujui reservasi ruangan yang bukan di bawah yurisdiksi unit kerjanya.                              | `403 Forbidden`.                                                   | Sistem menolak aksi dan mencatat insiden keamanan: _"Anda tidak memiliki otoritas operasional terhadap fasilitas ruangan ini."_                                            |
| **ERR-EDGE-07** | `GET /rooms`                       | Pengguna memfilter kalender ruangan yang berstatus `INACTIVE` atau diarsipkan.                                               | `404 Not Found`.                                                   | Tampilan visual dialihkan ke halaman kosong dengan notifikasi _"Ruangan ini sedang dinonaktifkan dari sistem peminjaman."_                                                 |
| **ERR-EDGE-08** | `POST /maintenance-blocks`         | Room Manager membuat jadwal pemeliharaan pada rentang waktu yang telah memiliki reservasi aktif (`PENDING` atau `APPROVED`). | `409 Conflict`.                                                    | Transaksi dibatalkan. Manager menerima notifikasi bentrok jadwal dan diwajibkan melakukan pembatalan darurat (_Force Cancel_) atau penjadwalan ulang terlebih dahulu.      |
| **ERR-EDGE-09** | `Background Worker`                | Reservasi berstatus `PENDING` melampaui batas SLA peninjauan ($H-6$ jam atau 24 jam setelah pengajuan).                      | `200 OK` (Internal Job Execution).                                 | Status reservasi otomatis dimutasi menjadi `REJECTED` dengan catatan _"Kedaluwarsa oleh sistem (SLA Expiration)"_, dan slot ruangan dilepaskan ke kalender ketersediaan.   |
| **ERR-EDGE-10** | `PATCH /bookings/:id/force-cancel` | Room Manager mengeksekusi Force Cancel pada reservasi `APPROVED` tanpa menyertakan alasan pembatalan.                        | `400 Bad Request`.                                                 | Form validasi menolak aksi dan mewajibkan input `cancellationReason` yang jelas untuk dicatat dalam rekam jejak AuditLog.                                                  |
