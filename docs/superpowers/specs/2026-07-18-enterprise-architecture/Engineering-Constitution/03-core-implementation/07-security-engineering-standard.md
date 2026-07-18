# 07 — Security Engineering Standard

> **Maturity:** 🟡 Partial — RLS aktif di 50 tabel dan fail-closed sudah prinsip desain existing, tapi RLS-RBAC desync (lihat [05-database-engineering-standard.md](05-database-engineering-standard.md)) dan permission engine tiga-jalur (lihat [06-api-engineering-standard.md](06-api-engineering-standard.md)) adalah dua gap keamanan terbesar yang belum tertutup.

**Kedudukan:** Batch 3 — Implementasi Inti. Mengonsolidasikan requirement keamanan dari [02-security-and-compliance-architecture.md](../../02-security-and-compliance-architecture.md) dan [Phase1/07-security-review.md](../../Phase1/07-security-review.md) menjadi aturan wajib per-PR. Melengkapi [05-database-engineering-standard.md](05-database-engineering-standard.md) (RLS) dan [06-api-engineering-standard.md](06-api-engineering-standard.md) (otorisasi endpoint).

---

## 1. Purpose

Menerjemahkan threat model dan checklist keamanan di level arsitektur ([02-security-and-compliance-architecture.md](../../02-security-and-compliance-architecture.md)) menjadi aturan konkret yang **MUST** dipatuhi setiap PR yang menyentuh data sensitif (finansial, kredensial, data pribadi klien) — bukan checklist yang hanya dibaca sekali saat audit tahunan.

## 2. Background

[02-security-and-compliance-architecture.md § Current State](../../02-security-and-compliance-architecture.md#current-state--postur-keamanan-terverifikasi) mengonfirmasi RLS aktif di 50 tabel, soft-delete untuk proyek, pagination cap, file size guard, dan `audit_logs.user_id ON DELETE SET NULL` sudah diterapkan — postur keamanan dasar sudah lebih baik dari banyak aplikasi tahap serupa. Namun [Phase1/07-security-review.md § OWASP Top 10](../../Phase1/07-security-review.md#owasp-top-10--relevansi-langsung-ke-phase-1) mengidentifikasi Broken Access Control (A01) sebagai risiko tertinggi langsung — bukan karena RLS tidak ada, tapi karena RLS dan RBAC v2 berjalan sebagai dua sistem independen yang bisa divergen tanpa peringatan.

## 3. Principles

1. **Fail-closed selalu, tanpa pengecualian implisit.** Saat otorisasi tidak bisa dievaluasi (permission key tidak dikenal, RLS policy tidak match kondisi manapun), hasil default **MUST** adalah tolak akses — preseden: `has_permission()` return `false` untuk key tak dikenal ([GLOSSARY.md — Fail-Closed](../GLOSSARY.md)).
2. **Defense in depth, bukan satu lapis tunggal.** RLS di database dan otorisasi di API layer **MUST** keduanya aktif dan konsisten — satu lapis gagal tidak boleh berarti seluruh sistem terbuka.
3. **Secrets tidak pernah ada di kode atau commit history.** `.env` sudah di-gitignore secara konsisten hari ini; ini bukan aturan baru, hanya diformalkan sebagai gate PR.

## 4. Mandatory Rules

1. Endpoint atau fungsi yang mengevaluasi otorisasi **MUST** fail-closed — kondisi yang tidak eksplisit diizinkan **MUST** dianggap ditolak, **MUST NOT** ada jalur kode yang default mengizinkan akses saat evaluasi gagal atau tidak lengkap.
2. Kredensial (API key, service role key, JWT secret, VAPID private key) **MUST NOT** pernah muncul di kode sumber, commit message, atau log aplikasi — **MUST** hanya lewat environment variable, konsisten pola `.env`/`.env.local` existing.
3. Input dari user (body request, query param) yang dipakai langsung dalam query SQL **MUST** memakai parameterized query (Supabase client sudah menerapkan ini secara default) — **MUST NOT** ada string concatenation SQL manual untuk input user di kode baru.
4. Endpoint yang menerima file upload **MUST** memvalidasi tipe MIME dan ukuran sebelum diproses — **MUST NOT** mempercayai ekstensi file dari nama file sebagai satu-satunya validasi.
5. Data finansial-kritis yang di-expose ke role tertentu (mis. serapan aktual kas ke client portal) **MUST** diperiksa eksplisit terhadap keputusan desain "Client portal — full transparansi kecuali serapan aktual kas & cashflow kas" (CLAUDE.md § ERP Proyek Upgrade — Keputusan Desain, internal) sebelum endpoint baru dibuka ke portal client/mandor — **MUST NOT** meng-expose kolom finansial baru ke portal tanpa keputusan eksplisit ini direview ulang.
6. Perubahan yang memperluas RLS policy atau permission scope **MUST** disertai audit log entry atau setidaknya justifikasi eksplisit di deskripsi PR — **MUST NOT** memperluas akses secara diam-diam tanpa jejak.

## 5. Recommended Rules

1. Rate limiting pada endpoint autentikasi (`/auth/login`) **SHOULD** dipertimbangkan begitu volume trafik nyata membutuhkan (belum ada insiden brute-force teramati hari ini — [02-security-and-compliance-architecture.md § Threat Model](../../02-security-and-compliance-architecture.md#threat-model)).
2. Dependency dengan kerentanan diketahui (`npm audit`) **SHOULD** direview tiap penambahan package baru (lihat [06-governance/32-library-selection-policy.md](../06-governance/32-library-selection-policy.md)) — belum ada gate otomatis CI hari ini.

## 6. Anti-Pattern

**Otorisasi Fail-Open Tersembunyi** — kode yang secara tidak sengaja mengizinkan akses saat kondisi gagal, mis. `if (permission) { deny() } else { allow() }` (terbalik dari fail-closed) atau `try { checkPermission() } catch { /* lanjut saja */ }`. Bahaya: bug ini nyaris tidak pernah terdeteksi lewat testing manual karena "jalur normal" tetap terlihat benar — hanya muncul saat evaluasi gagal, yang justru kondisi paling penting untuk aman.

**Secret di Commit History** — sekali kredensial masuk ke git history, rotasi kredensial menjadi wajib (menghapus dari commit terbaru tidak menghapusnya dari history). Puraloka Suite belum pernah mengalami insiden ini secara tercatat — dicantumkan sebagai pencegahan eksplisit, bukan insiden nyata.

## 7. Example Good

```ts
// pola has_permission() (target Sub-Fase 1A) — fail-closed konsisten Mandatory Rule #1
export function hasPermission(role: string, key: string): boolean {
  const granted = ROLE_PERMISSIONS[role]?.includes(key);
  return granted === true; // eksplisit true, bukan truthy — undefined/null/apa pun lain = false
}
```

## 8. Example Bad

```ts
// Anti-pattern hipotetis — TIDAK ditemukan di codebase, dicantumkan sebagai pencegahan
function checkAccess(user, resource) {
  if (!resource.restricted) return true; // fail-open: field 'restricted' lupa di-set = akses terbuka
  return user.role === resource.allowedRole;
}
```
Default `true` saat field tidak eksplisit di-set adalah fail-open — bertentangan langsung Mandatory Rule #1. Satu row data yang lupa mengisi `restricted` berarti akses terbuka untuk semua orang.

## 9. Migration Strategy

**Untuk Mandatory Rule #1 (fail-closed otorisasi)** — N/A untuk kode existing yang sudah diverifikasi fail-closed (`has_permission()` desain di [Phase1/02 § 1A.1](../../Phase1/02-target-architecture.md#1a1-permission-engine-v2--desain-konsolidasi)); berlaku penuh untuk seluruh fungsi otorisasi baru sejak commit pertama.

**Untuk Mandatory Rule #6 (RLS/permission expansion tercatat)** — 🔵 Designed, bergantung pada [Phase1/02 § 1A.3 Audit Trail v2](../../Phase1/02-target-architecture.md#1a3-audit-trail-v2--helper-terpusat) tersedia (helper `audit.ts` yang direferensikan migration 046 belum ada — [Phase1/00 § 3](../../Phase1/00-current-state-audit.md#3-audit-trail--current-state)). Sampai helper tersedia, justifikasi PR manual di deskripsi commit adalah mekanisme sementara yang cukup.

**Untuk Mandatory Rule #2, #3, #4, #5** — N/A, sudah konsisten diterapkan di kode existing.

## 10. Checklist

- [ ] Fungsi otorisasi baru fail-closed (default tolak, bukan default izin)
- [ ] Tidak ada kredensial baru di kode/commit/log
- [ ] Input user ke SQL memakai parameterized query
- [ ] File upload baru divalidasi MIME type + ukuran
- [ ] Ekspansi RLS/permission scope tercatat di PR description atau audit log

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Fungsi otorisasi baru yang fail-open (terdeteksi review) | 0 | Code review checklist |
| Kredensial ditemukan di git history baru | 0 | Pre-commit secret scanning (target [05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)) |
| RLS policy baru hardcode role string | 0 | Lihat [05-database-engineering-standard.md § Success Metrics](05-database-engineering-standard.md#11-success-metrics) |

## 12. References

- [02-security-and-compliance-architecture.md](../../02-security-and-compliance-architecture.md)
- [Phase1/07-security-review.md](../../Phase1/07-security-review.md)
- [05-database-engineering-standard.md](05-database-engineering-standard.md)
- [06-api-engineering-standard.md](06-api-engineering-standard.md)
- [GLOSSARY.md — Fail-Closed](../GLOSSARY.md)
- [08-metrics-and-closing/38-security-checklist.md](../08-metrics-and-closing/38-security-checklist.md)

---

*File selanjutnya: [34-schema-migration-policy.md](34-schema-migration-policy.md)*
