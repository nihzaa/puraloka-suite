#!/usr/bin/env node
/**
 * PENJAGA RAMP URGENSI — `--data-*` tak boleh dipakai untuk tingkatan
 * gawat.
 *
 * ── Bedanya dua jenis palet
 *
 *   `--data-1..5`   deret KATEGORI. Lima warna yang dipilih supaya saling
 *                   terbedakan; tak ada urutan gawat di antaranya.
 *                   "Pembayaran" tidak lebih genting daripada "Kasbon".
 *
 *   `--warning`,    token SEMANTIK. Membawa makna, dan punya varian mode
 *   `--danger`      gelapnya sendiri yang mempertahankan makna itu.
 *
 * Keduanya berperilaku berbeda saat mode berganti, dan itu bukan
 * kebetulan: deret kategori mode gelap SENGAJA mengorbankan kesetiaan
 * rona demi keterbedaan bagi pemakai buta warna (alasan lengkap di
 * `globals.css`). Jadi `--data-5` yang oranye di mode terang menjadi
 * `#CBD5E1` — abu-abu terang — di mode gelap.
 *
 * ── Apa yang rusak karenanya
 *
 * `/piutang` memakai `--data-5` untuk bucket umur 31–60 hari, di tengah
 * ramp `--warning → --danger`. Di mode gelap bucket TENGAH jadi paling
 * pucat, sehingga Rp 119,6 juta yang menua terbaca sebagai keadaan
 * paling ringan. `/procurement` punya cacat yang sama, plus dua bucket
 * berwarna identik.
 *
 * Keduanya lolos `uji-deret-data.mjs` — penjaga itu memeriksa apakah
 * kelima warna saling terbedakan, bukan apakah dipakai di tempat yang
 * benar. Penjaga yang mengukur satu sumbu akan dilewati oleh
 * pelanggaran di sumbu lain sambil tampak hijau.
 *
 * ── Cara mendeteksi
 *
 * Blok yang memuat label bertingkat umur ("1–30 hari", ">90 hari",
 * dst.) TIDAK boleh menyebut `--data-N` di dekatnya. Label umur adalah
 * penanda paling andal untuk ramp urgensi — jauh lebih andal daripada
 * menebak dari nama variabel.
 *
 * Pakai: node scripts/uji-ramp-urgensi.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** Label yang menandakan tingkatan umur/gawat, bukan kategori. */
const LABEL_RAMP = /["'](?:>\s*)?\d+\s*[–-]\s*\d+\s*[Hh]ari|["']>\s*\d+\s*[Hh]ari|[Bb]elum [Jj]atuh [Tt]empo/;

const berkas = execSync(`grep -rl "data-[0-9]" app components --include=*.tsx`, {
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

const temuan = [];

for (const f of berkas) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);

  for (let i = 0; i < baris.length; i++) {
    if (!/var\(--data-[1-5]\)/.test(baris[i])) continue;
    // Komentar penjelas boleh menyebutnya — itu justru dokumentasi
    // kenapa token itu TIDAK dipakai di sini.
    if (/^\s*(\/\/|\*|\/\*)/.test(baris[i])) continue;

    // Ada label bertingkat umur di sekitarnya? Kalau ya, ini ramp.
    const sekitar = baris.slice(Math.max(0, i - 4), i + 5);
    if (!sekitar.some((b) => LABEL_RAMP.test(b))) continue;

    temuan.push({
      di: `${f}:${i + 1}`,
      isi: baris[i].trim().slice(0, 96),
    });
  }
}

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} pemakaian \`--data-*\` di dalam ramp urgensi.\n`);
  console.error("   `--data-*` adalah deret KATEGORI — di mode gelap ronanya");
  console.error("   sengaja bergeser demi keterbedaan buta warna, jadi ia bisa");
  console.error("   memutus ramp gawat tepat di tengah dan membuat bucket tua");
  console.error("   tampil paling ringan.\n");
  console.error("   Pakai token semantik yang punya varian gelapnya sendiri:");
  console.error("     var(--warning) · var(--danger)");
  console.error("     color-mix(in srgb, var(--warning) 45%, var(--danger))\n");
  for (const t of temuan) console.error(`   ${t.di}\n      ${t.isi}\n`);
  process.exit(1);
}

console.log("✅ Ramp urgensi: nol pemakaian `--data-*` sebagai tingkatan gawat");
