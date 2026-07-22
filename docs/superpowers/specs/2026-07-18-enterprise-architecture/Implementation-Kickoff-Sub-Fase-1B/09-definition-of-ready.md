# 09 — Definition of Ready (Sub-Fase 1B)

Kondisi yang harus dipenuhi agar satu Task boleh dimulai.

## Umum (semua Task)

1. Dependency task sebelumnya `completed` (bukan `in_progress`) — lihat [05](05-feature-implementation-order.md).
2. CI hijau di `main` saat Task dimulai.
3. Branch dari `main` terbaru.
4. Evidence file:line diverifikasi ulang via grep langsung (bukan warisan dokumen — pelajaran tax hardcode `termin-payment.ts:175` yang usang).

## Task Migration Additive (1B.1-1B.3 schema)

- [ ] Nomor migration diverifikasi (`ls db/migrations`) — tidak collision.
- [ ] Migration additive murni (CREATE/ADD nullable), nol ALTER destruktif.
- [ ] Kembar 2 folder direncanakan identik.
- [ ] Verifikasi column-level pasca-apply direncanakan (bukan "tabel ada").

## Task Finansial (1B.1 F1.3 — tax calc config)

- [ ] 8 test tax existing dibaca + dipahami sebelum sentuh `tax-calculation.ts`.
- [ ] Fallback aman didesain (config kosong → default hardcoded, tidak pernah 0).
- [ ] **DANGER GATE ringan** disiapkan (Red-Line #2) — ack founder sebelum ubah calc.

## Task UI (1B.1 F1.5, 1B.2 F2.3)

- [ ] Skill `frontend-design` dibaca sebelum tulis komponen (AUTOPILOT §1).
- [ ] Additive-first: baseline menu/UI existing dicatat, nol yang hilang.

## Task Auth-Critical (1B.4 — enum→FK)

**Syarat tambahan (tidak cukup DoR umum):**
- [ ] **Keputusan founder Opsi A** sudah didapat eksplisit.
- [ ] Gate Core 1B (1B.1-1B.3) `completed`.
- [ ] **DANGER GATE penuh** disiapkan: diff/SQL, rollback, blast-radius analysis (setiap pembaca `users.role`), verdict risiko.
- [ ] Smoke test 4 role + role custom direncanakan (nol lockout — pelajaran 1A).
- [ ] Maintenance window + backup verified (pola contract Epic 4).

## Anti-pattern (TIDAK ready)

- ❌ "Migration 1B.4 mirip contract Epic 4, langsung saja" — enum→FK beda; butuh DANGER GATE sendiri.
- ❌ "Refactor sidebar, nanti cek menu hilang di akhir" — additive-first diverifikasi PER commit.
- ❌ "Tax rate tinggal pindah ke config" — tanpa fallback + regression test = Red-Line dilewati.
