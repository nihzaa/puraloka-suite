# ADR-008 — Notification Routing Engine (penerima notifikasi jadi konfigurasi)

**Status:** Diterima · **Fase:** Phase 2 / Program B, Sub-Fase 2B
**Terkait:** [ADR-004](ADR-004-permission-is-architecture-role-is-configuration.md) (permission = arsitektur, role = konfigurasi) ·
[ADR-006](ADR-006-retire-workflow-engine-shadow.md) (jangan bangun engine bayangan) ·
[ADR-007](ADR-007-configurable-approval-engine.md) (pola engine berbasis konfigurasi)

## Konteks

Sebelum ini, siapa yang menerima notifikasi ditentukan tiga fungsi hardcoded
(`getAllAdmins`, `getProjectAdminsAndPM`, `getProjectMandors`) yang dipanggil dari
15 tempat di 8 file route. Mengubah "siapa dapat notif apa" berarti ubah kode + rilis.

Roadmap Phase 2 (item #5-6) memang mencakup ini. Tapi ADR-006 memasang gate keras
setelah kegagalan 1C: **jangan bangun engine tanpa bukti kebutuhan.**

### Kenapa gate ADR-006 terlewati di sini

Mode kegagalan 1C adalah **engine bayangan**: `workflow_instances` ditulis lewat
dual-write, nol pembaca bisnis, jadi permukaan bug tanpa nilai. Bentuk itu **tidak
mungkin terjadi** pada keputusan ini:

| 1C (diretire) | ADR-008 |
|---|---|
| Shadow di samping jalur asli | **Mengganti** resolver — satu jalur, tanpa dual-write |
| Nol pembaca bisnis | Dibaca di **setiap** notifikasi sejak hari pertama |
| Sumber kebenaran kedua | Tak ada; `notifications` tetap penyimpanan tunggal |

Resolver lama **DIHAPUS**, bukan disisakan sebagai pembungkus — dua jalur resolusi
akan menyimpang diam-diam, kesalahan yang sama.

### Bukti tambahan dari lapangan

Saat discovery, ketiga resolver itu ternyata **sudah rusak**: kolom `users.role`
di-drop di 1B.4, `error` PostgREST tak pernah diperiksa, hasilnya `[]` tanpa jejak —
setiap admin berhenti menerima notifikasi tanpa ada yang tahu (diperbaiki di PR #47).
Kejadian itu menetapkan syarat desain yang lebih penting daripada fleksibilitas:
**hilangnya notifikasi harus berisik.**

## Keputusan

Penerima tiap event = **data** di `notification_rules` + `notification_rule_targets`.

1. **Kunci aturan = event semantik**, terpisah dari `notifications.type` (kategori
   tampilan). Beberapa event boleh memakai `type` yang sama (mis. `general`) tapi
   aturan penerimanya tetap bisa dibedakan.
2. **Target boleh peran, kapabilitas, atau konteks** (`project_pm`, `project_mandors`).
   `permission` ada dan sejalan ADR-004: "kabari siapa pun yang boleh menyetujui"
   lebih tahan lama daripada "kabari admin" — begitu founder memberi kapabilitas
   approve ke direktur, notifikasinya ikut tanpa deploy.
3. **Seed = perilaku hari ini persis**, diturunkan dari 15 call site nyata
   (`getAllAdmins` → role admin; `getProjectAdminsAndPM` → role admin + PM proyek).
   Perpindahan ke target berbasis kapabilitas adalah keputusan founder lewat UI,
   bukan perubahan diam-diam.
4. **Integritas ditegakkan DB**: `role_name` FK ke `roles(name)`, `permission_key`
   FK ke `permissions(key)`, plus CHECK bentuk nilai per `target_type`. Salah ketik
   ditolak, tidak berujung notifikasi hilang.
5. **Tetap fire-and-forget.** Resolusi TIDAK PERNAH melempar — notifikasi tak boleh
   merusak alur utama. Tapi juga tidak sunyi: kegagalan dicatat.

## Aturan

- **Hilangnya notifikasi wajib berisik.** Test CI menolak: (a) event dipakai kode
  tapi tak punya aturan, (b) aturan **aktif** tapi nol target. Aturan yang **sengaja
  dinonaktifkan** bukan pelanggaran — test tidak boleh menghukum pemakaian fitur.
- **Aturan aktif tak boleh kehilangan penerima terakhirnya** lewat UI. Kalau memang
  tak ingin dikirim: nonaktifkan aturannya, supaya niatnya eksplisit dan terekam
  audit. (Sejajar anti-lockout ADR-007.)
- **JANGAN** menghidupkan kembali fungsi resolver hardcoded. Kebutuhan penerima baru
  = tambah `target_type`, bukan fungsi baru di `utils/notifications.ts`.
- Dedup penerima wajib dipertahankan: admin yang sekaligus PM proyek menerima
  **satu** notifikasi, bukan dua.

## Yang TIDAK dibangun (batas tegas)

- **Tanpa** template engine untuk isi pesan. Judul/pesan tetap di call site — belum
  ada bukti kebutuhan mengubahnya dari UI, dan tiap pesan memakai variabel berbeda.
  Bila kelak dibutuhkan: ADR baru, aturan ADR-006 tetap berlaku.
- **Tanpa** penjadwalan/digest/kanal tambahan (email, WA) di lapis ini.
