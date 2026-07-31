# Runbook — Cutover Kasbon ke Workflow Engine (produksi)

> **⛔ TIDAK BISA DIJALANKAN LAGI — objek DB-nya sudah dihapus.**
> Migrasi 092 mem-`DROP` `workflow_instances/transitions/states/definitions` +
> `approval_delegations`; migrasi 095 menyapu sisa tabel orphan-nya. Workflow
> Engine Sub-Fase 1C **dibangun lalu diretire** — rasional di
> [ADR-006](../Engineering-Constitution/adr/ADR-006-retire-workflow-engine-shadow.md) —
> jadi tak ada engine yang bisa dituju cutover ini.
>
> **Approval berjenjang yang hidup sekarang** lahir dari Program B (Phase 2):
> konfigurasi lewat UI, bukan engine 1C. Lihat `../PHASE-2-STATUS.md` dan
> migrasi 099 (`approval_engine_config`).
>
> Berkas ini disimpan sebagai **riwayat keputusan** — jangan dieksekusi, jangan
> dikutip sebagai prosedur aktif. Ditandai sebagai bagian ROADMAP #7 (2026-07-31),
> setelah audit menemukan ia masih berstatus "prosedur siap pakai".

**Status historis (saat ditulis): PROSEDUR, belum dieksekusi.** Puraloka Suite belum di-deploy; tidak ada produksi. Dokumen ini menyiapkan prosedur cutover untuk **saat** ada data kasbon nyata (uang & mandor beneran). Di dev hari ini, langkah "jendela waktu" adalah **no-op** (data seed dummy, tak ada approval nyata yang menunggu).

Backfill & dual-write sudah dibangun dan diuji **sekarang** (mumpung taruhan nol) supaya mekanismenya matang sebelum dipakai di uang sungguhan.

---

## Prinsip

- **Dual-write (fase sekarang):** `kasbons.status` = sumber kebenaran; `workflow_instances` = bayangan. Perpindahan sumber kebenaran (fase CONTRACT) adalah **Red-Line terpisah** — DANGER GATE lain, butuh bukti nol divergensi.
- **Backfill idempoten & fail-loud:** aman dijalankan ulang; berhenti keras bila ada status tak terpetakan (mekanisme R7 — approval tak boleh hilang jejak).

---

## Kriteria fase CONTRACT (kapan pindah sumber kebenaran)

> **Koreksi founder (2026-07-24):** kriteria "tunggu dual-write matang / tunggu traffic nyata" **DITOLAK** — traffic baru ada setelah deploy, deploy baru setelah Phase 1. Kriteria itu tak akan pernah terpenuhi dan malah memaksa deploy dengan dual-write aktif = **DUA sumber kebenaran di jalur uang** (justru yang mau dihindari).

CONTRACT dijalankan ketika **ketiganya** benar:

1. **Engine stabil:** engine (`workflow_transitions` + `canTransition()`) **tidak butuh perubahan selama 2 migrasi modul berturut-turut**. (Menghindari mengunci desain engine berdasar n=1.)
2. **Nol divergensi lintas modul:** rekonsiliasi nol divergensi di **semua** modul yang sudah dual-write.
3. **SEBELUM deployment produksi** — bukan sesudah. **TIDAK boleh deploy dengan dual-write masih aktif.**

Alasan Arah A (perluas dual-write dulu, bukan langsung contract): risiko generalisasi engine — `canTransition()` baru teruji terhadap n=1 (kasbon, itupun sebagian: `settled` tak ada code path → realistis 3 transisi). Contract sekarang = mengunci desain engine berdasar satu modul. Kalau modul berikutnya butuh perubahan engine, lebih baik ketahuan selagi modul awal masih reversible.

---

## Prosedur cutover produksi (jalankan berurutan)

### 0. Prasyarat
- [ ] Kode dual-write sudah ter-deploy ke API produksi (helper `syncKasbonWorkflowInstance` aktif di jalur create + PATCH kasbon).
- [ ] Migration 081 (skema workflow) sudah applied ke DB produksi.
- [ ] Backup DB produksi terkini + PITR aktif (operasi menyentuh data finansial).

### 1. Jendela waktu (pengaman R7 — RELEVAN DI PRODUKSI, no-op di dev)
Kasbon berstatus `pending` saat backfill = approval **in-flight**. Backfill sendiri aman (idempoten, tidak mengubah `kasbons`), tapi jendela sepi mengurangi peluang race antara backfill dan approval yang sedang berjalan.

- [ ] Pilih jendela operasional sepi (mis. malam/akhir pekan) — **founder menentukan** jendela yang aman secara operasional.
- [ ] Umumkan freeze singkat approval kasbon selama backfill (menit, bukan jam).
- [ ] Catat jumlah kasbon `pending` sebelum mulai (untuk rekonsiliasi).

> Di DEV: lewati langkah ini — tidak ada mandor nyata, 3 "pending" adalah seed dummy.

### 2. Apply backfill
- [ ] Jalankan migration `082_backfill_kasbon_workflow.sql` ke DB produksi.
- [ ] Bila gagal dengan "status tak dikenal" → **BERHENTI**. Ada nilai `kasbons.status` di luar peta {pending,approved,rejected,settled}. Tambahkan pemetaan eksplisit di `lib/kasbon-workflow.ts` + `KASBON_STATUS_TO_STATE` + migration, jangan paksa lanjut.

### 3. Bukti rekonsiliasi (WAJIB — tampilkan, jangan asumsikan)
Jalankan query rekonsiliasi kanonik:

```sql
SELECT k.id, k.status::text AS kasbon_status, wi.current_state,
       CASE WHEN wi.id IS NULL THEN 'missing_instance' ELSE 'state_mismatch' END AS problem
FROM kasbons k
LEFT JOIN workflow_instances wi
  ON wi.entity_type = 'kasbon' AND wi.entity_id = k.id
WHERE wi.id IS NULL OR wi.current_state <> k.status::text;
```

- [ ] Hasil **0 baris** = setiap kasbon punya tepat satu instance dengan state cocok. Bila ada baris → investigasi sebelum buka freeze.
- [ ] Verifikasi tepat-satu: `SELECT entity_id, count(*) FROM workflow_instances WHERE entity_type='kasbon' GROUP BY entity_id HAVING count(*)>1;` → **0 baris**.

### 4. Buka freeze & pantau
- [ ] Buka kembali approval kasbon.
- [ ] Verifikasi jalur `pending` masih normal: ajukan kasbon uji → approve → cek `workflow_instances.current_state` ikut berubah (dual-write hidup).
- [ ] Jadwalkan rekonsiliasi berkala (`reconcileKasbonWorkflow()`) selama fase dual-write untuk menangkap divergensi dini.

### 5. Mobile app
- [ ] ⏳ **PENDING** — mobile app (Expo) belum disetup. Saat dibangun, verifikasi alur kasbon mobile (ajukan/approve/notif) tidak terganggu. Jangan gate cutover ke ini sekarang.

---

## Rollback

- **Fase dual-write (sekarang):** revert kode dual-write + `DELETE FROM workflow_instances WHERE entity_type='kasbon'`. `kasbons.status` tak tersentuh → nol dampak ke sumber kebenaran, instan.
- **Fase CONTRACT (nanti):** rollback berat — di luar scope runbook ini; direncanakan saat DANGER GATE CONTRACT.

---

## Divergence detection (selama dual-write)

`reconcileKasbonWorkflow()` (utils/kasbon-workflow.ts) mengembalikan `{ totalKasbons, totalInstances, matched, mismatches[], ok }`. Dual-write best-effort bisa menyimpang diam-diam bila upsert gagal (di-log keras, tapi tetap tak menjatuhkan operasi kasbon) — rekonsiliasi adalah jaring pengaman yang membuktikan konsistensi sebelum fase CONTRACT. **Nol divergensi selama dual-write = prasyarat DANGER GATE CONTRACT.**

---

## OUTCOME — Fase CONTRACT DIEKSEKUSI (2026-07-24, PR #34)

**Keputusan founder:** setelah 2 migrasi modul (kasbon 082 + change_order 083) dengan engine stabil, jalankan **CONTRACT** — bukan menambah modul ke-3 (procurement), melainkan **mempensiunkan dual-write shadow**; `kasbons.status`/`change_orders.status` jadi **satu-satunya sumber kebenaran**.

**Prasyarat terbukti:** rekonsiliasi **NOL divergensi** — kasbon 56/56 cocok, change_order 2/2 cocok, nol orphan dua arah (fungsi mapping nyata vs DB dev nyata).

**Dieksekusi:** hapus 6 call-site dual-write + 7 modul shadow + 5 test; migration 092 `DROP` `workflow_instances/transitions/states/definitions` + `approval_delegations`. Behavior-preserving (shadow selalu fire-and-forget, nol pembaca bisnis). Reversible via `git revert`.

**Konsekuensi untuk AKTA 5 (procurement):** dual-write **tidak lagi berlaku** — tak ada workflow engine untuk di-dual-write. Procurement sudah punya status sendiri (MR/PO/GR) sebagai sumber kebenaran. Melanjutkan workflow-engine untuk procurement = **keputusan arsitektur BARU** (menghidupkan kembali engine), bukan kelanjutan otomatis. Menunggu arahan founder.
