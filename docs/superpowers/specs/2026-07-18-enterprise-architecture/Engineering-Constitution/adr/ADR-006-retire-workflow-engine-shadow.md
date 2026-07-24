# ADR-006 — Pensiun Workflow Engine (dual-write shadow diretire, permission derive cukup)

**Status:** Diterima (keputusan founder 2026-07-24 + bukti engineering)
**Tanggal:** 2026-07-24
**Kedudukan:** Menutup eksperimen Sub-Fase 1C (workflow foundation 081-083). Melengkapi [ADR-004](ADR-004-permission-is-architecture-role-is-configuration.md) (permission = arsitektur). Konsekuensi didokumentasikan di AUDIT_REPORT OPEN-2 + runbook-kasbon-workflow-cutover.

---

## Konteks

Sub-Fase 1C membangun **workflow engine** generik (state-machine terpusat) via strangler-fig:

- **081** — foundation: `workflow_definitions/states/transitions/instances` + `approval_delegations` (SLA, eskalasi, approval_mode sequential/parallel/any_one, delegasi).
- **082/083** — dual-write **shadow**: kasbon & change_order menulis state ke `workflow_instances` di samping kolom `status` mereka. Kolom `status` tabel sumber **tetap otoritatif**; `workflow_instances` hanya bayangan fire-and-forget.

Tujuannya: kelak memindahkan sumber kebenaran status ke engine (SLA/eskalasi/state-machine terpusat), menggantikan status-logic yang terduplikasi di beberapa route.

Setelah 2 migrasi modul (kasbon, change_order) dengan engine tak berubah, kriteria fase CONTRACT terpenuhi. Founder memilih **CONTRACT** (pensiunkan shadow) alih-alih menambah modul ke-3 (procurement).

## Keputusan

**Workflow engine di-retire.** Dual-write shadow dihapus; **kolom `status` tabel sumber (`kasbons.status`, `change_orders.status`) menjadi satu-satunya sumber kebenaran.** Kode dual-write + 7 modul workflow dihapus (PR #34). Tabel `workflow_*` menjadi **yatim** (nol pembaca/penulis) — dipertahankan sementara sebagai temuan terbuka (AUDIT_REPORT OPEN-2), drop menunggu keputusan founder lewat migration terpisah.

Prasyarat dibuktikan sebelum retire: **rekonsiliasi NOL divergensi** — kasbon 56/56 cocok, change_order 2/2 cocok, nol orphan dua arah (fungsi mapping nyata vs DB dev nyata).

## Kenapa engine di-retire (bukan diteruskan)

1. **Permission derive-capability (ADR-004) ternyata CUKUP.** Kebutuhan nyata approval hari ini = "siapa boleh melakukan transisi" — sudah dijawab `requirePermission(...)` + guard di handler (mis. `change_order:approve` diturunkan di AKTA 0-3, `mandor:kasbon:approve`). Approval Puraloka bersifat **satu-langkah** (ajukan → setujui/tolak). State-machine terpusat = kompleksitas tanpa kebutuhan yang menuntutnya.
2. **Nol fitur engine terpakai.** SLA, eskalasi, approval berjenjang (sequential/parallel/any_one), delegasi — nol modul memakainya. Semuanya scaffolding aspiratif.
3. **Shadow = permukaan bug tanpa nilai berjalan.** Dual-write fire-and-forget bisa menyimpang diam-diam; menjaga konsistensinya butuh rekonsiliasi berkala. Biaya pemeliharaan tanpa pembaca bisnis.
4. **Behavior-preserving untuk retire.** Karena `status` sumber selalu otoritatif, menghapus shadow **tidak mengubah perilaku apa pun** — bukti nol divergensi memastikan tak ada state yang hilang.

## Apa yang HILANG (sadar diterima)

- State-machine terpusat (validasi transisi via tabel `workflow_transitions`).
- SLA + eskalasi otomatis (mis. approval menunggu > N jam → eskalasi ke atasan).
- Approval berjenjang / paralel / any-one.
- Delegasi approval sementara (mis. PM cuti).

**Nol dari ini dibutuhkan modul mana pun saat ini.** Kebutuhan approval = satu-langkah, dijawab permission. Yang tersisa untuk transisi status kompleks di masa depan dijawab **per-kebutuhan** dengan bukti, bukan engine spekulatif.

## Kapan engine LAYAK dihidupkan lagi (syarat revival)

Revival = **keputusan arsitektur BARU dengan bukti konkret**, bukan default/otomatis. Layak dipertimbangkan HANYA bila muncul kebutuhan nyata seperti:

- **Approval berjenjang bersyarat:** mis. PO di atas nominal tertentu wajib approval > 1 level (PM → Direktur). Ini butuh state-machine + approval_mode.
- **SLA + eskalasi:** approval yang menggantung wajib eskalasi otomatis setelah tenggat.
- **Delegasi approval:** pejabat approver cuti → wewenang berpindah sementara.

Bila kebutuhan itu tiba: hidupkan engine untuk modul SPESIFIK yang menuntutnya (bukan generik untuk semua), dengan ADR baru yang mengutip bukti kebutuhannya. Tabel `workflow_*` yang saat ini yatim boleh jadi titik awal (jangan buru-buru drop bila revival tampak dekat) — TAPI tanpa kebutuhan konkret, mempertahankan tabel yatim = technical debt (drop dianjurkan).

## Aturan

- **JANGAN** menghidupkan kembali dual-write/engine tanpa ADR baru yang mengutip kebutuhan approval multi-langkah nyata. "Mungkin berguna kelak" bukan alasan.
- **JANGAN** menambahkan status-transition logic tersebar yang menduplikasi apa yang dulu jadi alasan engine — bila transisi jadi kompleks di > 1 modul, itu SINYAL untuk revival ber-ADR, bukan menyebar `if status ==` di banyak file.
- Sumber kebenaran status = kolom `status` tabel sumber, ditegakkan permission di handler + RLS `has_permission`.
