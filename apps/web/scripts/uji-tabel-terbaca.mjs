#!/usr/bin/env node
/**
 * PENJAGA TABEL TERBACA — ratchet untuk cacat tabel yang menutup akses.
 *
 * ── Tiga cacat, tiga akibat nyata
 *
 * 1. `fontVariantNumeric: tabular-nums` — AMBANG NOL, tak boleh ada
 *    pelanggaran. Ini bisa ditambal mesin (`rapikan-tabel.mjs`), jadi
 *    tak ada alasan menoleransinya. Tanpa ini kolom rupiah bergoyang
 *    dan tabel berhenti bisa dibandingkan sekilas.
 *
 * 2. `<caption>` — RATCHET. Pembaca layar mengumumkan tabel tanpa
 *    caption sebagai "tabel, 7 kolom, 24 baris" — tanpa satu petunjuk
 *    pun tentang isinya. Tidak bisa ditambal mesin: caption butuh
 *    kalimat yang benar, dan caption yang salah lebih berbahaya
 *    daripada tak ada, karena dibacakan dengan percaya diri.
 *
 * 3. `scope="row"` — RATCHET. Tanpa kepala baris, pembaca layar
 *    membacakan sel sebagai "Rp 4.500.000" tanpa menyebut itu milik
 *    proyek yang mana. Di tabel keuangan, itu angka tanpa pemilik.
 *
 * ── Kenapa ratchet, bukan ambang nol untuk ketiganya
 *
 * Kalau penjaga menuntut nol pada hal yang butuh 84 keputusan manusia,
 * yang terjadi bukan 84 caption yang benar — yang terjadi penjaganya
 * dimatikan. Ratchet menahan kemunduran sambil membiarkan utangnya
 * dilunasi bertahap. Menurunkan ambang = ratifikasi tak diperlukan;
 * MENAIKKAN ambang = melemahkan penjaga (Gerbang Keras G-5).
 *
 * Pakai: node scripts/uji-tabel-terbaca.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DI_SINI = dirname(fileURLToPath(import.meta.url));
const AMBANG = join(DI_SINI, "ambang-tabel.json");

const berkas = execSync(`grep -rl "<table" app components --include=*.tsx`, {
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

let tabel = 0, tanpaNum = 0, tanpaCaption = 0, tanpaScope = 0;
const contohNum = [], contohCaption = [], contohScope = [];

/**
 * Ganti isi komentar dengan spasi, PERTAHANKAN jumlah barisnya.
 *
 * Versi pertama penjaga ini tidak melakukan ini, dan langsung memberi
 * dua positif palsu dengan sebab berbeda:
 *
 *   • `dasar.tsx:34` — kalimat dokumentasi yang menyebut `<table>`
 *     dihitung sebagai tabel sungguhan.
 *   • `dasar.tsx:333` — tabel yang BENAR punya `fontVariantNumeric`,
 *     tapi ada `>` di dalam komentar penjelas di antara pembuka elemen
 *     dan properti itu; jendela pemeriksaan terpotong di sana.
 *
 * Panjang baris sengaja dipertahankan supaya nomor baris di pesan galat
 * tetap menunjuk tempat yang benar di editor.
 */
function lucutiKomentar(teks) {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

for (const f of berkas) {
  const teks = lucutiKomentar(readFileSync(f, "utf8"));
  // Baris tempat setiap <table> dibuka — untuk pesan galat yang bisa diklik.
  const baris = teks.split(/\r?\n/);

  for (let i = 0; i < baris.length; i++) {
    if (!/<table[\s>]/.test(baris[i])) continue;
    tabel++;

    // `style={{...}}` bisa membentang beberapa baris; lihat jendela
    // pendek setelah pembuka elemen.
    const jendela = baris.slice(i, i + 10).join("\n");

    // Kepala elemen = dari `<table` sampai `>` yang benar-benar menutup
    // tag, yaitu `>` pertama saat kedalaman kurung kurawal nol. Memakai
    // `.split(">")[0]` (versi pertama penjaga ini) salah: `>` di dalam
    // `style={{...}}` — perbandingan, panah, atau generic — memotong
    // jendela sebelum propertinya sempat terbaca.
    const mulai = jendela.indexOf("<table");
    let dalam = 0, kepala = jendela;
    for (let j = mulai; j < jendela.length; j++) {
      const c = jendela[j];
      if (c === "{") dalam++;
      else if (c === "}") dalam--;
      else if (c === ">" && dalam === 0) { kepala = jendela.slice(mulai, j + 1); break; }
    }

    if (!/fontVariantNumeric/.test(kepala)) {
      tanpaNum++;
      if (contohNum.length < 5) contohNum.push(`${f}:${i + 1}`);
    }
    // caption & scope=row dicari di seluruh berkas, bukan per-tabel:
    // beberapa berkas punya satu komponen tabel yang dipakai berulang.
    if (!/<caption/.test(jendela) && !/<caption/.test(teks)) {
      tanpaCaption++;
      if (contohCaption.length < 5) contohCaption.push(`${f}:${i + 1}`);
    }
    if (!/scope="row"/.test(teks)) {
      tanpaScope++;
      if (contohScope.length < 5) contohScope.push(`${f}:${i + 1}`);
    }
  }
}

const sekarang = { tanpaCaption, tanpaScope };
const dasar = existsSync(AMBANG)
  ? JSON.parse(readFileSync(AMBANG, "utf8"))
  : sekarang;

let gagal = false;

// 1 — ambang nol, bisa ditambal mesin.
if (tanpaNum > 0) {
  gagal = true;
  console.error(`\n❌ ${tanpaNum} tabel tanpa \`fontVariantNumeric: "tabular-nums"\`.\n`);
  console.error("   Kolom angka akan bergoyang: \"Rp 111.111\" lebih sempit");
  console.error("   daripada \"Rp 888.888\" meski digitnya sama, jadi besaran");
  console.error("   tak bisa dibandingkan dari panjang kolom.\n");
  console.error("   Perbaikan otomatis:  node scripts/rapikan-tabel.mjs --tulis\n");
  for (const c of contohNum) console.error(`     ${c}`);
}

// 2 & 3 — ratchet.
for (const [kunci, label, alasan, contoh] of [
  ["tanpaCaption", "<caption>", "pembaca layar tak tahu tabel ini tentang apa", contohCaption],
  ["tanpaScope", 'scope="row"', "sel angka dibacakan tanpa menyebut miliknya siapa", contohScope],
]) {
  if (sekarang[kunci] > dasar[kunci]) {
    gagal = true;
    console.error(`\n❌ Tabel tanpa ${label} BERTAMBAH: ${dasar[kunci]} → ${sekarang[kunci]}`);
    console.error(`   Akibatnya: ${alasan}.\n`);
    for (const c of contoh) console.error(`     ${c}`);
  }
}

if (gagal) {
  console.error("\n   Ambang boleh TURUN (utang dilunasi), tak boleh NAIK.");
  console.error(`   Berkas ambang: ${AMBANG}\n`);
  process.exit(1);
}

// Turun = utang dilunasi; catat lantai baru supaya tak bisa naik lagi.
let turun = "";
for (const k of ["tanpaCaption", "tanpaScope"]) {
  if (sekarang[k] < dasar[k]) turun += ` ${k} ${dasar[k]}→${sekarang[k]}`;
}
if (turun || !existsSync(AMBANG)) {
  writeFileSync(AMBANG, JSON.stringify(sekarang, null, 2) + "\n");
}

console.log(
  `✅ Tabel terbaca: ${tabel} tabel · tabular-nums 0 pelanggaran · ` +
  `caption ${tanpaCaption}/${dasar.tanpaCaption} · scope=row ${tanpaScope}/${dasar.tanpaScope}` +
  (turun ? `\n   ↓ utang berkurang:${turun}` : ""),
);
