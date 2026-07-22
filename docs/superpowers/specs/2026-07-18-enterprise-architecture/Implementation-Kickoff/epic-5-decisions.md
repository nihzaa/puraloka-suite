# Epic 5 — Audit Trail Helper: Keputusan & Temuan

Epic 5 F5.1-F5.4 selesai otonom (helper terpusat + instrumentasi event). Dokumen ini mencatat tiga hal yang **bukan** keputusan teknis murni — untuk founder.

## 1. F5.5 — Append-Only Trigger (butuh keputusan founder)

**Apa:** trigger DB yang menolak `UPDATE`/`DELETE` pada `audit_logs` — menjadikan audit trail immutable (append-only). Sekali aktif, **tidak seorang pun** (termasuk admin) bisa mengubah/menghapus baris audit lewat jalur normal.

**Kenapa keputusan founder, bukan teknis:** ini trade-off governance nyata —
- **Untung:** audit trail jadi bukti forensik yang kuat (tidak bisa dimanipulasi setelah fakta) — standar compliance.
- **Rugi:** tidak ada koreksi/pembersihan audit log yang salah; baris audit menumpuk selamanya (butuh strategi retensi terpisah nanti); admin kehilangan kontrol hapus.

DoR ([09-definition-of-ready.md](09-definition-of-ready.md)) eksplisit: F5.5 **MUST NOT** dimulai tanpa keputusan founder — berbeda dari task lain yang DoR-nya murni teknis.

**Status:** migration disiapkan (`db/migrations/073_audit_append_only.sql`) tapi **TIDAK di-apply** sampai founder memutuskan. Default: tidak aktif.

**Keputusan yang dibutuhkan:** aktifkan append-only sekarang? (ya → aku apply 073; tidak → 073 tetap sebagai file dorman, audit tetap mutable seperti sekarang).

## 2. Temuan: `payment.deleted` tidak bisa diinstrumentasi

Migration 046 mendaftar `payment.deleted` sebagai event wajib-log. Audit kode: **tidak ada endpoint delete/void payment di seluruh codebase** — aksi ini belum diimplementasikan. Jadi tidak ada tempat memasang instrumentasi.

**Tindakan:** 5 dari 6 event terinstrumentasi (kasbon.status, project.status, user.role, invoice.amount, rab_materials.override, + change_order dari F5.3). `payment.deleted` dicatat sebagai **N/A sampai fitur delete payment ada** — bukan membuat endpoint baru (itu fitur + keputusan bisnis "boleh hapus payment?", di luar scope Epic 5). Saat fitur delete payment dibuat kelak, instrumentasi audit ditambahkan bersamaan.

## 3. Bug drift ditemukan & diperbaiki: migration 046 tidak ter-apply

Saat menulis test audit, ditemukan `audit_logs` DB **tidak punya kolom `diff`/`severity`** — migration 046 tidak pernah ter-apply ke DB ini (view `critical_audit_events` & index severity juga hilang). Root cause: `supabase_migrations.schema_migrations` tracking berhenti di **057**; migration 058+ di-apply manual via `pg` langsung (bukan `supabase db push`), dan 046 rupanya terlewat lebih awal.

**Fix:**
- Migration 046 di-apply (idempotent) → kolom + view + index kembali.
- Migration 072 dibuat **self-contained**: menambahkan `diff`/`severity` dengan `IF NOT EXISTS` juga, jadi environment bersih tetap dapat skema audit lengkap tanpa bergantung 046 ter-apply lebih dulu.

**Rekomendasi jangka panjang (bukan Epic 5):** rekonsiliasi jalur migration — `supabase db push` vs apply manual `pg` menyebabkan drift tracking. Kandidat pekerjaan terpisah (mirip Finding F3 dulu). Dicatat, tidak diperbaiki di sini karena menyentuh proses deployment, bukan Epic 5.
