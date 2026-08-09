#!/usr/bin/env node
/**
 * PENJAGA: MENU INDUK YANG BELUM PUNYA HALAMAN IKHTISAR.
 *
 * ── Pertanyaan founder yang melahirkan penjaga ini
 *
 * 2026-08-09: *"kalo nanti ada menu lain dari taksonomi menu yg emang perlu
 * dashboard biar ga lupa dibangun halaman dashboard nya gimana?"*
 *
 * Jawabannya harus penjaga, bukan catatan di dokumen — dan repo ini sudah
 * membuktikannya sendiri: TUJUH sub-menu pernah bertanda 🔴 di taksonomi
 * padahal UI-nya sudah hidup berbulan-bulan (`F5-1` §3a/§3b). Catatan tak
 * menahan apa-apa.
 *
 * ── Yang diperiksa
 *
 * Menu induk yang punya anak WAJIB punya halaman ikhtisar — halaman satu-ruas
 * yang menaungi anak-anaknya (`/keuangan` bagi `/keuangan/invoice` dst).
 * Aturan pemilihannya SATU-SATUNYA sumber: `lib/tujuan-grup.ts`, yang juga
 * dipakai sidebar untuk memutuskan apakah baris induk bisa diklik.
 *
 * Memakai fungsi yang sama disengaja: kalau penjaga memakai aturannya sendiri,
 * ia akan hijau untuk grup yang di layar tetap tak bisa diklik — penjaga yang
 * mengukur hal berbeda dari yang dilihat pemakai.
 *
 * ── STATIS, dan itu keputusan sadar
 *
 * Versi pertama membaca DOM lewat Playwright, dan angkanya memang lebih jujur
 * (ia melihat hasil sesudah saringan izin). Tapi CI repo ini TAK menjalankan
 * satu pun penjaga berbasis peramban — `audit-a11y-runtime` dan
 * `uji-sidebar-disiplin` pun dijalankan manual. Penjaga yang butuh server
 * hidup akan merah di CI karena servernya tak ada, lalu dimatikan orang.
 * Yang dimatikan tidak menjaga apa-apa.
 *
 * Jadi sumbernya berkas migrasi: satu-satunya tempat struktur menu ditulis,
 * dan tempat menu BARU pasti lewat. Persis titik yang perlu dijaga.
 *
 * ── RATCHET, bukan larangan
 *
 * Tiga grup memang belum punya ikhtisar hari ini. Menjadikannya error berarti
 * CI merah sejak menit pertama. Angkanya LANTAI: tak boleh bertambah.
 *
 * Pakai:  node apps/web/scripts/uji-induk-punya-ikhtisar.mjs
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();
const DIR_MIGRASI = join(AKAR, "db", "migrations");
const DIR_APP = join(AKAR, "apps", "web", "app", "(dashboard)");

/**
 * LANTAI — jumlah grup induk yang boleh tanpa halaman ikhtisar.
 *
 * Hanya boleh TURUN. Menurunkannya berarti sebuah grup baru saja mendapat
 * halaman ikhtisarnya; turunkan angkanya di commit yang SAMA supaya
 * kemunduran berikutnya merah.
 *
 *   3 → 2  (2026-08-09) Gudang dapat `/gudang` — dashboard ikhtisar aset &
 *          material yang kembali sesudah proyek selesai (migrasi 238-240).
 *
 * Sisa 2: Estimasi & Biaya, Mutu & Kepatuhan.
 */
const LANTAI = 2;

// ── Aturan pemilihan: dipinjam dari lib/tujuan-grup.ts ──────────────────────
//
// Ditranspile seadanya karena Node tak bisa meng-import `.ts` langsung.
// Yang penting BUKAN kerapiannya melainkan bahwa aturannya satu sumber:
// menyalin logikanya ke sini berarti dua aturan yang akan menyimpang.
const srcTs = readFileSync(
  join(AKAR, "apps", "web", "lib", "tujuan-grup.ts"), "utf8",
);
const js = srcTs
  .replace(/export interface[\s\S]*?\n}\n/g, "")
  .replace(/\bexport\b /g, "")
  .replace(/: NodeMenuRingkas\[\] \| null/g, "")
  .replace(/: NodeMenuRingkas/g, "")
  .replace(/: string \| null/g, "")
  .replace(/: string/g, "")
  .replace(/: number/g, "")
  .replace(/\(a\): a is [^=]*=>/g, "(a) =>")
  .replace(/let terpilih[^=]*=/, "let terpilih =")
  .replace(/const skor = \(href\)/, "const skor = (href)");
let tujuanGrup;
try {
  const mod = { exports: {} };
  new Function("module", "exports", js + "\nmodule.exports = { tujuanGrup };")(mod, mod.exports);
  tujuanGrup = mod.exports.tujuanGrup;
  if (typeof tujuanGrup !== "function") throw new Error("bukan fungsi");
} catch (e) {
  console.error("✗ Gagal memuat aturan dari lib/tujuan-grup.ts:", e.message);
  console.error("  Penjaga ini SENGAJA tak menyalin aturannya. Kalau transpile");
  console.error("  seadanya di sini patah, perbaiki di sini — jangan gandakan aturannya.");
  process.exit(1);
}

// ── Susun pohon menu dari seluruh berkas migrasi ────────────────────────────
//
// Dibaca berurutan supaya migrasi belakangan menimpa yang lebih awal, persis
// seperti `ON CONFLICT (key) DO UPDATE` saat di-replay.
const item = new Map();   // key -> { key, href, parent, aktif }

const berkas = readdirSync(DIR_MIGRASI).filter((f) => f.endsWith(".sql")).sort();
for (const f of berkas) {
  const sql = readFileSync(join(DIR_MIGRASI, f), "utf8");

  // VALUES ('key', 'Label', '/href', 'Icon', 101, 'main',
  //   (SELECT id FROM menu_items WHERE key = 'g-induk'), true)
  const re = /\(\s*'([a-z0-9-]+)'\s*,\s*'[^']*'\s*,\s*(NULL|'[^']*')\s*,\s*'[^']*'\s*,\s*\d+\s*,\s*'[^']*'\s*,\s*(?:\(\s*SELECT\s+id\s+FROM\s+menu_items\s+WHERE\s+key\s*=\s*'([a-z0-9-]+)'\s*\)|NULL)\s*,\s*(true|false)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const [, key, hrefRaw, indukKey, aktif] = m;
    item.set(key, {
      key,
      href: hrefRaw.toUpperCase() === "NULL" ? null : hrefRaw.slice(1, -1),
      induk: indukKey ?? null,
      aktif: aktif.toLowerCase() === "true",
    });
  }

  // Penonaktifan massal: UPDATE menu_items SET is_active = false WHERE key IN (...)
  for (const blok of sql.matchAll(/is_active\s*=\s*false[\s\S]{0,400}?key\s+IN\s*\(([^)]*)\)/gi)) {
    for (const k of blok[1].matchAll(/'([a-z0-9-]+)'/g)) {
      const it = item.get(k[1]);
      if (it) it.aktif = false;
    }
  }
}

const aktif = [...item.values()].filter((x) => x.aktif);
const grup = aktif
  .filter((x) => x.induk === null)
  .map((g) => ({
    key: g.key,
    children: aktif.filter((x) => x.induk === g.key).map((x) => ({ href: x.href })),
  }))
  .filter((g) => g.children.length > 0);

if (grup.length === 0) {
  console.error("✗ Tak satu pun grup induk terbaca dari migrasi — polanya mungkin berubah.");
  console.error("  Penjaga yang tak memeriksa apa-apa lebih buruk daripada tak ada penjaga.");
  process.exit(1);
}

/** Halaman itu benar-benar ada di disk? `/keuangan?tab=x` → app/(dashboard)/keuangan/page.tsx */
function halamanAda(href) {
  const path = href.split("?")[0].replace(/^\//, "");
  return existsSync(join(DIR_APP, path, "page.tsx"));
}

const tanpaIkhtisar = [];
const ikhtisarHilang = [];

for (const g of grup) {
  const tujuan = tujuanGrup(g);
  if (tujuan === null) { tanpaIkhtisar.push(g); continue; }
  // Ikhtisar yang ditunjuk WAJIB ada berkasnya. Menu yang menunjuk halaman
  // tak ada adalah 404 yang menunggu diklik.
  if (!halamanAda(tujuan)) ikhtisarHilang.push({ ...g, tujuan });
}

console.log("══ Menu induk vs halaman ikhtisar ══════════════════════════");
console.log(`  grup induk           : ${grup.length}`);
console.log(`  punya ikhtisar       : ${grup.length - tanpaIkhtisar.length}`);
console.log(`  BELUM punya ikhtisar : ${tanpaIkhtisar.length} (lantai ${LANTAI})\n`);
for (const g of tanpaIkhtisar) console.log(`  · ${g.key}`);

if (ikhtisarHilang.length > 0) {
  console.error(`\n✗ ${ikhtisarHilang.length} grup menunjuk halaman ikhtisar yang TAK ADA di disk:\n`);
  for (const g of ikhtisarHilang) console.error(`   ${g.key} → ${g.tujuan}`);
  console.error("\n   Mengklik nama grup akan membawa pemakai ke 404.\n");
  process.exit(1);
}

if (tanpaIkhtisar.length > LANTAI) {
  console.error(`
✗ BERTAMBAH: ${tanpaIkhtisar.length} grup tanpa halaman ikhtisar, lantai ${LANTAI}.

   Menu induk baru wajib datang bersama halaman ikhtisarnya — halaman
   satu-ruas yang menaungi anak-anaknya (mis. /keuangan bagi /keuangan/invoice).

   Tanpa itu, mengklik nama grup di sidebar hanya membuka/menutup, dan
   pemakai tak punya tempat untuk melihat gambaran keseluruhan modul itu.
`);
  process.exit(1);
}

if (tanpaIkhtisar.length < LANTAI) {
  console.log(`
ℹ Turun dari ${LANTAI} ke ${tanpaIkhtisar.length} — sebuah grup baru dapat ikhtisarnya.
   TURUNKAN 'LANTAI' di berkas ini pada commit yang sama.
`);
}

console.log("✓ Tidak bertambah.");
