# Phase 2 (Program B) — Configuration Driven Platform · STATUS

**Status: SELESAI** · Sub-Fase 2A (Approval Engine) + 2B (Notification Routing Engine)
Penomoran: lihat `NUMBERING-GLOSSARY.md` — **Program B = Phase 2**.

## Ringkas: apa yang berubah untuk pemilik

| Sebelum | Sesudah |
|---|---|
| Jumlah level approval & siapa yang boleh menyetujui = hardcoded per modul | **Data**, diubah dari `/pengaturan/approval` tanpa rilis |
| Siapa dapat notifikasi apa = 3 fungsi hardcoded di 15 tempat | **Data**, diubah dari `/pengaturan/notifikasi` tanpa rilis |

Mandat founder yang ditutup: *"bisa berjenjang tapi di UI nantinya saya mau bisa
dikonfigurasikan lagi — bisa berjenjang atau enggaknya, dan role apa yang bisa
approve-nya juga dinamis, semuanya jangan hardcode."*

## Yang mendarat

| Slice | Isi | PR |
|---|---|---|
| 2A-1/2 | Fondasi: migration 099, `lib/approval-engine.ts` (16 unit test) | #43 |
| 2A-3 | Modul pertama `kasbon` (strangler-fig) + bugfix trigger pre-existing (migration 100) | #44 |
| 2A-4 | UI kelola rantai + anti-lockout + fix flake harness | #45 |
| 2A-5 | `change_order`, `material_request`, `project_expense` + test berjenjang | #46 |
| — | **Hotfix**: 4 sisa kolom `users.role` yang di-drop | #47 |
| 2B | Notification Routing Engine: migration 101 + engine + UI + ADR-008 | #48 |

Test: **291 → 327** hijau (40 file). Semua gerbang otorisasi baru mutation-tested.

## Dua invariant yang sekarang dijaga CI

1. **Uang tidak bergerak sebelum level terakhir.** Approve level 1 pada rantai
   2 level tidak mengubah status entitas maupun nilai kontrak
   (`approval-chain-berjenjang.test.ts`). Sebelumnya janji "bisa berjenjang" hanya
   dibuktikan skrip manual — nol penjaga di CI.
2. **Hilangnya notifikasi berisik.** Event yang dipakai kode tanpa aturan, atau
   aturan aktif tanpa target, memerahkan CI dan menyebut nama event-nya.

## Temuan yang tidak direncanakan (ditemukan, bukan dicari)

| Temuan | Sifat | Tindakan |
|---|---|---|
| `fn_kasbon_approved_create_expense()` — `ON CONFLICT` vs index parsial → **setiap** approve kasbon ber-scope gagal 500 | pre-existing sejak 051 | migration 100 (#44) |
| Kolom `users.role` di-drop, 4 pemakai tertinggal → **admin berhenti terima notifikasi**, dropdown mandor 500, hitung user role 0 | pre-existing sejak 1B.4 | #47 |
| `resetTestSchema()` menggantung tanpa batas saat lock ditahan (`lock_timeout=0`) → suite penuh gagal intermiten ~30–50% | flake harness | #45 |
| MR tanpa kolom total → "kosongkan harga untuk lewati ambang direktur" | celah desain | fail-closed, `lib/mr-amount.ts` (#46) |
| `getProjectMandors()` nol pemakai di kode produksi | kode mati | dihapus bersama resolver lama (#48) |

## Keputusan arsitektur yang dicatat

- **ADR-007** — Approval Engine berbasis konfigurasi (revival ber-bukti setelah
  ADR-006 me-retire workflow engine 1C). Ditambah catatan implementasi + aturan
  fail-closed untuk nilai entitas yang tidak diketahui.
- **ADR-008** — Notification Routing Engine. Memuat alasan **kenapa gate ADR-006
  terlewati**: ini mengganti resolver di jalur hidup, bukan bayangan; resolver lama
  dihapus, bukan didampingi.

## Yang SENGAJA tidak dibangun (batas tegas)

- Template engine isi pesan notifikasi — belum ada bukti kebutuhan (ADR-008).
- SLA/eskalasi/delegasi approval — batas ADR-007 tetap berlaku.
- Kanal tambahan (email/WA) di lapis routing.

## Utang yang masih terbuka

- **OPEN-1** — kasbon status `settled` belum punya code path (backlog produk).
- **OPEN-3** — RLS PM belum project-scoped (gerbang mobile).
- Checklist kunci service_role sebelum production.
- Perluasan cakupan test 403 ke endpoint sensitif lain.
