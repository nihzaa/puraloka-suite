#!/usr/bin/env node
/**
 * PENJAGA WARNA BUTA-MODE — rgba warna merek yang dipaku sebagai ISI.
 *
 * ── Bug yang melahirkannya
 *
 * Kartu KPI di `/procurement` memakai `color: "rgba(0,51,102,0.2)"` untuk
 * ikonnya. Di latar terang itu abu-abu samar yang memang disengaja. Di
 * latar gelap `#12141F`, navy gelap dengan opasitas 20% praktis TAK
 * TERLIHAT — ikonnya hilang, dan lima kartu KPI tampil dengan kotak
 * kosong di pojok kanan.
 *
 * Dua tempat lain punya cacat yang sama: pembatas kartu terpilih di
 * dashboard (`rgba(0,51,102,0.25)`) dan latar tab aktif di `/proyek`
 * (`rgba(0,51,102,0.12)`).
 *
 * ── Kenapa penjaga lama tak menangkapnya
 *
 * `hex-ratchet` menghitung hex mentah (`#003366`), bukan rgba.
 * `uji-token-merek` memeriksa apakah token merek berbalik di mode gelap.
 * `kontras-hex-ratchet` memeriksa pasangan warna SEBARIS.
 *
 * Tak satu pun menangkap "warna merek ditulis sebagai rgba, sehingga tak
 * punya varian mode gelap sama sekali". Setiap penjaga mengukur satu
 * sumbu, dan pelanggaran di sumbu lain lewat begitu saja sambil semuanya
 * tampak hijau.
 *
 * ── Kenapa `boxShadow` DIKECUALIKAN
 *
 * Bayangan navy 10% memang tak terlihat di latar gelap, tapi itu tidak
 * merusak apa pun: bayangan adalah hiasan kedalaman, bukan pembawa
 * informasi. Yang merusak adalah rgba yang dipakai sebagai `color`,
 * `background`, atau `border` — di situ hilangnya warna berarti
 * hilangnya isi.
 *
 * Perbaikannya: `color-mix(in srgb, var(--aksen) N%, transparent)`.
 * `--aksen` punya varian gelapnya sendiri, jadi campurannya ikut
 * menyesuaikan tanpa perlu menulis nilai kedua.
 *
 * Pakai: node scripts/uji-warna-buta-mode.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** Warna merek yang ditulis mentah sebagai rgba, dengan spasi opsional. */
const RGBA_MEREK = /rgba\(\s*0\s*,\s*51\s*,\s*102\s*,/;

/** Properti tempat hilangnya warna berarti hilangnya ISI. */
const PROP_ISI = /(?:^|[^a-zA-Z])(color|background|backgroundColor|border|borderColor|fill|stroke)\s*:/;

const berkas = execSync(
  `grep -rl "rgba(0,\\s*51,\\s*102" app components --include=*.tsx || true`,
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

const temuan = [];

for (const f of berkas) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);
  for (let i = 0; i < baris.length; i++) {
    if (!RGBA_MEREK.test(baris[i])) continue;
    if (/^\s*(\/\/|\*|\/\*)/.test(baris[i])) continue;      // komentar
    // Bayangan dikecualikan — lihat alasan di header.
    if (/boxShadow|box-shadow|textShadow|filter\s*:/.test(baris[i])) continue;
    if (!PROP_ISI.test(baris[i])) continue;

    temuan.push({ di: `${f}:${i + 1}`, isi: baris[i].trim().slice(0, 100) });
  }
}

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} warna merek dipaku sebagai rgba pada properti ISI.\n`);
  console.error("   rgba tak punya varian mode gelap. `rgba(0,51,102,0.2)` yang");
  console.error("   samar-tapi-terlihat di latar putih menjadi TAK TERLIHAT di");
  console.error("   latar `#12141F` — isinya hilang, bukan sekadar meredup.\n");
  console.error("   Perbaikan:");
  console.error("     color-mix(in srgb, var(--aksen) 30%, transparent)\n");
  for (const t of temuan) console.error(`   ${t.di}\n      ${t.isi}\n`);
  process.exit(1);
}

console.log("✅ Warna buta-mode: nol rgba merek pada properti isi");
