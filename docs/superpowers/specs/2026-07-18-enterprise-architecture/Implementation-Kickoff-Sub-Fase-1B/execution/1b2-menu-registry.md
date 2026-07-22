# Execution Plan — 1B.2 Menu Registry

**Kenapa execution plan sendiri:** refactor `sidebar.tsx` (530 baris, ~24 menu hardcoded) → DB-driven bukan additive murni — menyentuh UI yang dipakai setiap halaman, butuh caching + invalidation + jaminan additive-first (nol menu hilang). Kompleksitas tinggi (playbook § Siklus Penuh: execution/ untuk Epic kompleks).

## Prinsip mengikat

**ADDITIVE-FIRST (AUTOPILOT §1):** NOL menu existing boleh hilang. Seed `menu_items` **MUST 1:1** dengan menu hardcoded sekarang. Diverifikasi count + visual per-role.

## Kondisi awal (verified 2026-07-23)

`apps/web/components/sidebar.tsx`: 530 baris, visibility via `perms.has("...")` inline (baris 244-313). ~24 menu (projects, clients, finance, cash, procurement, mandor, reports, users, audit, kalender, sistem, pengaturan, dst). Collapse/expand state ada.

## Tahapan

### F2.1 — Schema + seed 1:1
1. Migration 076 `menu_items` (skema di [04](../04-database-migration-plan.md)).
2. Seed: **ekstrak setiap menu dari sidebar.tsx existing** → baris `menu_items` dengan `required_permission` = argumen `perms.has()` yang sekarang dipakai. label/href/icon/sort_order dipertahankan persis.
3. **Verifikasi:** `SELECT count(*) FROM menu_items` = jumlah menu di sidebar (hitung manual dari JSX).

### F2.2 — API
`GET /api/v1/menu` — return menu_items (tree via parent_id), **tanpa** filter permission di server (visibility tetap di client via `perms.has()`, konsisten desain existing). RLS: read authenticated.

### F2.3 — Refactor sidebar (hati-hati)
1. Fetch menu dari API + **cache client-side**.
2. **Invalidation:** revalidate saat admin ubah menu (keputusan founder: revalidate-on-change vs TTL — default revalidate-on-change kalau tak dijawab).
3. Render tree dari data; **pertahankan `perms.has(item.required_permission)`** untuk visibility (hanya sumber struktur yang pindah dari JSX → DB).
4. Pertahankan collapse/expand + active state + styling (design system).

### F2.4 — Verifikasi additive-first
- [ ] Count menu terlihat per-role SAMA sebelum/sesudah (test + manual 4 role).
- [ ] Tiap menu existing punya padanan di menu_items (audit 1:1).
- [ ] Visual identik (screenshot before/after).

## Rollback
Revert sidebar.tsx ke JSX (git) + DROP menu_items. JSX lama di history = jaring pengaman.

## DoD
Semua ~24 menu muncul identik per-role; visibility sama; caching+invalidation bekerja; nol menu hilang (verified count + visual); full suite hijau.

## Red-Line check
Bukan Red-Line (additive + UI reversible). TAPI kalau di tengah refactor ada menu yang **hilang** dan sulit dikembalikan → itu melanggar additive-first (Red-Line #1 spirit) → STOP + lapor.
