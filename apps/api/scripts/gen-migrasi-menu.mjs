#!/usr/bin/env node
/**
 * GENERATOR MIGRASI MENU — dari `apps/web/lib/peta-menu.ts` ke SQL.
 *
 * ── Kenapa di-generate, bukan diketik
 *
 * 222 baris `INSERT` (20 grup + 202 item) mustahil dibaca sebagai SQL, dan
 * tiap perubahan urutan berarti menulis ulang seluruhnya. Yang lebih buruk:
 * ia akan berbeda dari `peta-menu.ts` begitu salah satunya disunting, dan
 * perbedaan itu tak akan berbunyi — sidebar memakai DB, halaman coming-soon
 * memakai peta, jadi menu bisa muncul tanpa halaman atau sebaliknya.
 *
 * Satu sumber (`peta-menu.ts`), dua konsumen. Migrasi ini turunannya.
 *
 * ── Kenapa ikon anak seragam
 *
 * Grup memakai ikon khasnya; anak memakai `Dot`. 202 ikon berbeda justru
 * MENGHAPUS fungsi ikon: saat semuanya bergambar, tak ada yang menonjol dan
 * mata berhenti memakainya sebagai penanda. Yang membedakan anak adalah
 * label — dan label lebih cepat dibaca daripada ikon yang harus ditafsir.
 *
 * Jalankan: node apps/api/scripts/gen-migrasi-menu.mjs
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PETA_MENU } from '../../web/lib/peta-menu.ts'

const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)

const rows = []
for (const g of PETA_MENU) {
  // Grup: `href` NULL — ia tombol buka-tutup, bukan tautan.
  rows.push(`  (${q(g.key)}, ${q(g.label)}, NULL, ${q(g.icon)}, NULL, ${g.urutan * 10}, 'main')`)
  g.items.forEach((it, i) => {
    // Menu tanpa halaman sendiri → `/m/<key>`, halaman peta yang menjelaskan
    // apa yang akan dibangun di situ dan kenapa belum ada.
    const href = it.href ?? `/m/${it.key}`
    rows.push(`  (${q(it.key)}, ${q(it.label)}, ${q(href)}, 'Dot', ${q(g.key)}, ${g.urutan * 10 + i + 1}, 'main')`)
  })
}

const jumlahGrup = PETA_MENU.length
const jumlahItem = PETA_MENU.reduce((s, g) => s + g.items.length, 0)

const sql = `-- Migration 153: Peta menu penuh — ${jumlahGrup} grup, ${jumlahItem} sub-menu
--
-- ⚠️ BERKAS INI DI-GENERATE. Jangan sunting langsung.
--    Sumber: apps/web/lib/peta-menu.ts
--    Perintah: node apps/api/scripts/gen-migrasi-menu.mjs
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA MENDAFTARKAN MENU YANG HALAMANNYA BELUM ADA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Sampai sekarang sidebar hanya memuat 26 menu — yang kebetulan sudah
-- dibangun. Akibatnya tak seorang pun bisa melihat PETA: apa yang ada, apa
-- yang belum, dan di mana sebuah fitur akan tinggal nanti. Founder memintanya
-- eksplisit: daftarkan semua yang nantinya akan ada.
--
-- Menu tanpa halaman sendiri menunjuk ke \`/m/<key>\` — halaman yang menjelaskan
-- APA yang akan dikerjakan di situ, KENAPA belum ada, dan KE MANA sementara
-- ini. Bukan "coming soon" seragam: "menunggu tender mensyaratkan" berbeda
-- jauh dari "belum sempat", dan menyamakannya membuat 100+ halaman terbaca
-- sebagai utang padahal sebagian adalah keputusan sadar.
--
-- ── Yang SENGAJA tidak dilakukan
--
-- Tidak menambah permission baru. Seluruh menu memakai \`required_permissions\`
-- kosong (terlihat semua role yang bisa masuk dashboard) KECUALI yang mewarisi
-- dari menu lamanya. Alasannya: 202 permission baru berarti 202 baris yang
-- harus di-seed ke tiap role, dan satu yang terlewat = menu hilang tanpa
-- pesan kesalahan. Pembatasan akses per-menu adalah pekerjaan tersendiri yang
-- pantas dilakukan setelah halamannya benar-benar ada.

BEGIN;

-- Menu lama yang kini jadi anak salah satu grup dinonaktifkan lebih dulu,
-- supaya tak muncul dua kali (sekali sebagai menu tingkat atas, sekali di
-- dalam grup). Data lamanya TIDAK dihapus — \`is_active=false\` bisa dibalik.
UPDATE menu_items SET is_active = false, updated_at = now()
 WHERE parent_id IS NULL
   AND key NOT IN (SELECT unnest(ARRAY[${PETA_MENU.map((g) => q(g.key)).join(', ')}]));

-- Tabel sementara: memuat seluruh baris apa adanya, lalu parent-nya
-- di-resolve dari \`key\` ke UUID. Menulis UUID langsung mustahil — id grup
-- baru diketahui setelah baris grupnya masuk.
CREATE TEMP TABLE _menu_baru (
  key TEXT, label TEXT, href TEXT, icon TEXT,
  parent_key TEXT, sort_order INT, section TEXT
) ON COMMIT DROP;

INSERT INTO _menu_baru (key, label, href, icon, parent_key, sort_order, section) VALUES
${rows.join(',\n')};

-- 1. Grup (parent_key NULL) — harus lebih dulu supaya anaknya punya induk.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT n.key, n.label, n.href, n.icon, NULL, ARRAY[]::text[], n.sort_order, n.section, true
  FROM _menu_baru n WHERE n.parent_key IS NULL
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, href = EXCLUDED.href, icon = EXCLUDED.icon,
      parent_id = NULL, sort_order = EXCLUDED.sort_order,
      section = EXCLUDED.section, is_active = true, updated_at = now();

-- 2. Anak — parent_id di-resolve dari key induknya.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT n.key, n.label, n.href, n.icon, p.id, ARRAY[]::text[], n.sort_order, n.section, true
  FROM _menu_baru n
  JOIN menu_items p ON p.key = n.parent_key
 WHERE n.parent_key IS NOT NULL
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, href = EXCLUDED.href, icon = EXCLUDED.icon,
      parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order,
      section = EXCLUDED.section, is_active = true, updated_at = now();

-- ── Verifikasi — gagal BERISIK ─────────────────────────────────────────────
DO $$
DECLARE v_grup INT; v_anak INT; v_yatim INT;
BEGIN
  SELECT count(*) INTO v_grup FROM menu_items
   WHERE parent_id IS NULL AND is_active AND section = 'main'
     AND key IN (SELECT key FROM _menu_baru WHERE parent_key IS NULL);
  IF v_grup <> ${jumlahGrup} THEN
    RAISE EXCEPTION '153 GAGAL: % grup aktif, seharusnya ${jumlahGrup}', v_grup;
  END IF;

  SELECT count(*) INTO v_anak FROM menu_items m
    JOIN _menu_baru n ON n.key = m.key
   WHERE n.parent_key IS NOT NULL AND m.is_active;
  IF v_anak <> ${jumlahItem} THEN
    RAISE EXCEPTION '153 GAGAL: % sub-menu aktif, seharusnya ${jumlahItem}', v_anak;
  END IF;

  -- Anak tanpa induk tak akan muncul di sidebar sama sekali — dan itu gagal
  -- dalam diam: menunya "hilang" tanpa pesan apa pun.
  SELECT count(*) INTO v_yatim FROM menu_items m
    JOIN _menu_baru n ON n.key = m.key
   WHERE n.parent_key IS NOT NULL AND m.parent_id IS NULL;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '153 GAGAL: % sub-menu tanpa induk — takkan muncul di sidebar', v_yatim;
  END IF;

  RAISE NOTICE '153 OK: % grup + % sub-menu aktif, nol yatim', v_grup, v_anak;
END $$;

COMMIT;
`

const target = join(import.meta.dirname, '..', '..', '..', 'db', 'migrations', '153_peta_menu_penuh.sql')
writeFileSync(target, sql, 'utf8')
console.log(`✅ ${target}`)
console.log(`   ${jumlahGrup} grup · ${jumlahItem} sub-menu · ${rows.length} baris INSERT`)
