#!/usr/bin/env node
/**
 * PENJAGA: STRUKTUR SIDEBAR sesuai standar ERP.
 *
 * ── Kenapa ada
 *
 * Founder 2026-08-09: *"apakah sudah benar semua sesuai standar ERP
 * penempatannya seperti ini? yg saya lihat gaada data master"* — dan ia
 * benar. Audit menemukan tiga cacat struktural yang bertahan berbulan-bulan
 * tanpa ada yang menyadarinya:
 *
 *   1. TIDAK ADA grup Master Data, padahal taksonomi §1 punya 19 item.
 *      Isinya tersebar ke lima grup berbeda.
 *   2. "Estimasi & Biaya" isinya AKUNTANSI — enam dari tujuh anaknya milik
 *      taksonomi §14, bukan §5.
 *   3. `sort_order` bertabrakan antar-grup (240 memberi Gudang 1301, sama
 *      dengan Administrasi).
 *
 * Ketiganya jenis cacat yang tak menimbulkan error, tak membuat test merah,
 * dan tak terlihat kecuali seseorang duduk membandingkan sidebar dengan
 * dokumen taksonomi baris per baris. Persis yang perlu dijaga mesin.
 *
 * ── Yang diperiksa (dari MIGRASI, bukan DB)
 *
 * Statis, supaya bisa jalan di CI tanpa server maupun basis data — pelajaran
 * dari `uji-induk-punya-ikhtisar` yang versi Playwright-nya harus dibuang.
 *
 *   S-1  grup wajib ADA: Master Data, Akuntansi
 *   S-2  akuntansi TIDAK boleh berada di grup estimasi/anggaran
 *   S-3  master data TIDAK boleh tercecer di grup transaksi
 *   S-4  sort_order induk unik, kelipatan 50/100 (blok ratusan, R-4)
 *   S-5  menu ber-`kesiapan` selain 'rencana' WAJIB punya berkas halaman
 *
 * Pakai:  node apps/web/scripts/uji-sidebar-struktur.mjs
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();
const DIR_MIGRASI = join(AKAR, "db", "migrations");
const DIR_APP = join(AKAR, "apps", "web", "app", "(dashboard)");

// ── Susun keadaan akhir menu dari SELURUH migrasi, berurutan ───────────────
const induk = new Map();   // key -> { key, label, urut }
const anak = new Map();    // key -> { key, label, href, induk, kesiapan }
const nonaktif = new Set();

for (const f of readdirSync(DIR_MIGRASI).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(DIR_MIGRASI, f), "utf8");

  // Grup induk: INSERT ... VALUES ('g-x', 'Label', NULL, 'Ikon', 100, 'main', NULL, true, ...)
  for (const m of sql.matchAll(
    /\(\s*'(g-[a-z0-9-]+)'\s*,\s*'([^']*)'\s*,\s*NULL\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*'[^']*'\s*,\s*NULL\s*,\s*true/gi)) {
    induk.set(m[1], { key: m[1], label: m[2], urut: Number(m[3]) });
    nonaktif.delete(m[1]);
  }

  /*
   * Koreksi `sort_order` lewat UPDATE — migrasi MAJU, bukan edit migrasi lama.
   *
   * Tanpa cabang ini, penjaga membaca nilai yang PERTAMA kali ditulis dan
   * mengabaikan setiap perbaikan sesudahnya. Kepala berkas ini menjanjikan
   * "keadaan akhir dari SELURUH migrasi, berurutan"; sebelum baris ini
   * janji itu tak ditepati untuk sort_order.
   *
   * Ditemukan 2026-08-10: `g-ai` diperbaiki 185 → 150 lewat migrasi 262
   * (185 melanggar S-4), basis sudah benar, tapi penjaga tetap merah karena
   * masih membaca angka di migrasi 253. Satu-satunya cara menghijaukannya
   * adalah MENGEDIT migrasi lama — persis yang dilarang §5.5. Penjaga yang
   * memaksa pelanggaran aturan lain untuk dipuaskan adalah penjaga yang rusak.
   */
  for (const m of sql.matchAll(
    /UPDATE\s+menu_items\s+SET\s+sort_order\s*=\s*(\d+)[\s\S]{0,200}?key\s*=\s*'(g-[a-z0-9-]+)'/gi)) {
    const g = induk.get(m[2]);
    if (g) g.urut = Number(m[1]);
  }

  // Anak lewat helper: SELECT pasang_menu('key', 'Label', '/href', 'g-induk', 101[, 'kesiapan'])
  for (const m of sql.matchAll(
    /pasang_menu\(\s*'([a-z0-9-]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'(g-[a-z0-9-]+)'\s*,\s*(\d+)\s*(?:,\s*'([a-z]+)')?\s*\)/gi)) {
    anak.set(m[1], {
      key: m[1], label: m[2], href: m[3], induk: m[4],
      urut: Number(m[5]), kesiapan: m[6] ?? "hidup",
    });
    nonaktif.delete(m[1]);
  }

  // Anak lewat INSERT langsung (migrasi lama)
  for (const m of sql.matchAll(
    /\(\s*'([a-z0-9-]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*'[^']*'\s*,\s*\(\s*SELECT\s+id\s+FROM\s+menu_items\s+WHERE\s+key\s*=\s*'(g-[a-z0-9-]+)'\s*\)\s*,\s*true/gi)) {
    anak.set(m[1], {
      key: m[1], label: m[2], href: m[3], induk: m[5],
      urut: Number(m[4]), kesiapan: "hidup",
    });
    nonaktif.delete(m[1]);
  }

  for (const blok of sql.matchAll(/is_active\s*=\s*false[\s\S]{0,300}?key\s+IN\s*\(([^)]*)\)/gi)) {
    for (const k of blok[1].matchAll(/'([a-z0-9-]+)'/g)) nonaktif.add(k[1]);
  }
}

for (const k of nonaktif) { induk.delete(k); anak.delete(k); }
// Anak yang induknya nonaktif ikut hilang.
for (const [k, a] of [...anak]) if (!induk.has(a.induk)) anak.delete(k);

const gagal = [];

// ── S-1 grup wajib ────────────────────────────────────────────────────────
for (const [key, nama] of [["g-master-data", "Master Data"], ["g-akuntansi", "Akuntansi"]]) {
  if (!induk.has(key)) gagal.push(`S-1 grup wajib hilang: ${nama} (${key})`);
}

// ── S-2 akuntansi tak boleh di grup anggaran ──────────────────────────────
//
// Cacat asli: Jurnal Umum, Bagan Akun, Neraca, Buku Besar semuanya anak dari
// "Estimasi & Biaya". Taksonomi §14 menempatkannya di Keuangan & Akuntansi.
for (const a of anak.values()) {
  if (a.href.startsWith("/akuntansi") && a.induk !== "g-akuntansi") {
    gagal.push(`S-2 menu akuntansi di grup salah: ${a.label} (${a.href}) → ${a.induk}`);
  }
}

// ── S-3 master data tak boleh tercecer ────────────────────────────────────
const MASTER = [
  "/klien", "/procurement/supplier", "/mandor/tukang",
  "/pengaturan/satuan", "/pengaturan/kategori-pekerjaan",
  "/pengaturan/kasbon-purposes", "/pengaturan/perusahaan",
];
for (const href of MASTER) {
  const a = [...anak.values()].find((x) => x.href === href);
  if (!a) { gagal.push(`S-3 menu master data hilang: ${href}`); continue; }
  if (a.induk !== "g-master-data") {
    gagal.push(`S-3 master data di grup salah: ${a.label} (${href}) → ${a.induk}`);
  }
}

// ── S-4 sort_order induk unik & blok ratusan ──────────────────────────────
const urutTerpakai = new Map();
for (const g of induk.values()) {
  if (urutTerpakai.has(g.urut)) {
    gagal.push(`S-4 sort_order ${g.urut} dipakai dua grup: ${g.key} & ${urutTerpakai.get(g.urut)}`);
  }
  urutTerpakai.set(g.urut, g.key);
  if (g.urut % 50 !== 0) {
    gagal.push(`S-4 sort_order grup bukan kelipatan 50: ${g.key} = ${g.urut}`);
  }
}

// ── S-5 menu 'hidup' wajib punya berkas halaman ───────────────────────────
//
// Inti label kesiapan: yang ditandai `rencana` memang belum ada, dan itu
// SAH. Yang tak ditandai TAPI berkasnya hilang adalah janji yang tak
// ditepati — persis kekhawatiran R-3 migrasi 232.
for (const a of anak.values()) {
  if (a.kesiapan === "rencana") continue;
  const path = a.href.split("?")[0].replace(/^\//, "");
  if (!path) continue;
  if (!existsSync(join(DIR_APP, path, "page.tsx"))) {
    gagal.push(`S-5 menu '${a.kesiapan}' tanpa halaman: ${a.label} → ${a.href}`);
  }
}

// ── Laporan ───────────────────────────────────────────────────────────────
const nRencana = [...anak.values()].filter((a) => a.kesiapan === "rencana").length;
console.log("══ Struktur sidebar vs standar ERP ═════════════════════════");
console.log(`  grup induk       : ${induk.size}`);
console.log(`  menu anak        : ${anak.size}`);
console.log(`  berlabel rencana : ${nRencana}`);
console.log(`  master data      : ${[...anak.values()].filter((a) => a.induk === "g-master-data").length} item\n`);

if (induk.size < 15) {
  console.error(`✗ Grup induk hanya ${induk.size} — parsernya mungkin patah.`);
  console.error("  Penjaga yang tak memeriksa apa-apa lebih buruk daripada tak ada penjaga.");
  process.exit(1);
}

if (gagal.length > 0) {
  console.error(`✗ ${gagal.length} pelanggaran struktur:\n`);
  for (const g of gagal) console.error(`   ${g}`);
  console.error(`
   Aturan lengkap: docs/design/STRUKTUR-SIDEBAR-ERP.md
`);
  process.exit(1);
}

console.log("✓ Struktur sidebar sesuai standar.");
