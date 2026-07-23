# 1B.2 Menu Registry — Bukti Paritas Visual (F2.4)

**Slice:** Sub-Fase 1B.2 Menu Registry. **Requirement DoD:** NOL menu hilang, urutan & visibility per-role identik sebelum/sesudah refactor sidebar dari JSX hardcode → DB-driven (`menu_items`).

**Metode:** Karena eksekusi non-interaktif (tanpa browser untuk screenshot), paritas dibuktikan secara **komputasi**: menghitung menu yang terlihat per role dari (a) logika JSX lama (kondisi `perms.has()` di sidebar.tsx asli, di-hardcode ulang di skrip verifikasi) vs (b) data `menu_items` + logika `canSee()` match-ANY baru. Set permission per role diambil langsung dari DB (`role_permissions` → `permissions.key`). Jika kedua daftar identik untuk keempat role, visibility & urutan terjamin sama.

## Hasil — ✅ SEMUA 4 ROLE IDENTIK

| Role | Perms | OLD (JSX) = NEW (DB)? |
|---|---|---|
| **admin** | 51 | ✅ IDENTIK |
| **pm** | 40 | ✅ IDENTIK |
| **mandor** | 10 | ✅ IDENTIK |
| **client** | 3 | ✅ IDENTIK |

### Detail menu terlihat (OLD ≡ NEW, urutan persis)

**admin:** Dashboard · Proyek · Klien · Keuangan [Invoice & Bayar, Kas & Pengeluaran] · Pengadaan · Mandor · Laporan · Kalender · User · Audit Trail · Pengaturan [Profil Perusahaan, Role & Akses]

**pm:** Dashboard · Proyek · Klien · Keuangan [Invoice & Bayar, Kas & Pengeluaran] · Pengadaan · Mandor · Laporan · Kalender · Pengaturan (link tunggal)

**mandor:** Dashboard · Proyek · Keuangan [Invoice & Bayar] · Pengadaan · Mandor · Laporan · Kalender · Pengaturan (link tunggal)

**client:** Dashboard · Proyek · Keuangan [Invoice & Bayar] · Kalender · Pengaturan (link tunggal)

### Catatan
- **Match-ANY terverifikasi:** mandor & client hanya punya `finance:view` (bukan `cash:view`) → Keuangan hanya menampilkan child "Invoice & Bayar", parent tetap muncul. Reproduksi persis kondisi OR di JSX lama.
- **Conditional shape Pengaturan terverifikasi:** hanya admin (`users:roles:manage`) mendapat dropdown 2-anak; pm/mandor/client mendapat link tunggal `/pengaturan`. Identik dengan cabang `!collapsed && perms.has("users:roles:manage") ? dropdown : link` di JSX lama.
- **client & sidebar dashboard:** client memakai layout `/portal` terpisah, bukan sidebar ini. Perhitungan client di atas untuk kelengkapan paritas, bukan indikasi regresi.

## Bukti pendukung
- Seed `menu_items` = 15 baris (10 main root + 2 keuangan children + 1 pengaturan parent + 2 pengaturan children), verifikasi column-level via koneksi baru.
- `sidebar.tsx` refactor: **0 error TypeScript baru** (`tsc --noEmit` — 5 error `components/ui/*` yang ada adalah baseline pre-existing, terbukti muncul dengan/ tanpa perubahan sidebar).
- API suite: **119 test hijau**.
- Styling, collapse/expand, tooltip collapsed, dropdown animation, active-state — markup dipertahankan verbatim; hanya sumber struktur (daftar menu) yang pindah dari JSX → fetch `/api/v1/menu` (+ cache localStorage, revalidate on mount).

## Rollback
`git revert` sidebar.tsx (JSX lama di history) + `DROP TABLE menu_items`.
