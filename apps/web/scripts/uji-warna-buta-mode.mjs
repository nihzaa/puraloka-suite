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

/**
 * PUTIH dipaku sebagai LATAR.
 *
 * Kelas kedua dari cacat yang sama, ditemukan setelah penjaga ini
 * dibuat. `/laporan` memakai
 *
 *     linear-gradient(135deg, var(--surface-subtle) 0%, #fff 100%)
 *
 * untuk kartu kepala proyek. Di mode gelap ujung gradasinya tetap PUTIH
 * TERANG sementara teks di atasnya ikut menjadi terang — nama proyek di
 * sisi kanan nyaris tak terbaca. Delapan tempat lain memakai
 * `background: "#fff"` polos.
 *
 * `--surface` punya varian gelapnya sendiri, jadi ia ikut berbalik.
 *
 * Hanya LITERAL yang ditolak — `#fff`, `#ffffff`, atau kata `white` di
 * dalam tanda kutip. Versi pertama regex ini mencocokkan `white` di mana
 * pun setelah `background:`, dan langsung memberi SEPULUH positif palsu
 * dari `background: C.white` — yang nilainya `var(--surface)` dan justru
 * sudah beradaptasi mode.
 *
 * (Nama `C.white` memang menyesatkan untuk token yang berubah warna,
 * tapi mengganti namanya adalah perubahan lain; penjaga ini tak boleh
 * memaksakannya lewat alarm palsu.)
 */
const PUTIH_LATAR =
  /background(?:Color)?\s*:\s*(?:"[^"]*|`[^`]*|'[^']*)(#fff\b|#ffffff\b|\bwhite\b)/i;

/** Properti tempat hilangnya warna berarti hilangnya ISI. */
const PROP_ISI = /(?:^|[^a-zA-Z])(color|background|backgroundColor|border|borderColor|fill|stroke)\s*:/;

const berkas = execSync(
  `grep -rlE "rgba\\(0, *51, *102|#fff|#ffffff|white" app components --include=*.tsx || true`,
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

const temuan = [];

for (const f of berkas) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(b)) continue;             // komentar
    // Bayangan dikecualikan — lihat alasan di header.
    if (/boxShadow|box-shadow|textShadow|filter\s*:/.test(b)) continue;

    // ── rgba merek pada properti isi
    if (RGBA_MEREK.test(b) && PROP_ISI.test(b)) {
      temuan.push({ di: `${f}:${i + 1}`, jenis: "rgba-merek", isi: b.trim().slice(0, 100) });
      continue;
    }

    // ── putih dipaku sebagai LATAR
    //
    // `color-mix(... , white)` DIKECUALIKAN: di situ putih dipakai untuk
    // MENCERAHKAN warna lain, dan warna dasarnya sudah beradaptasi mode.
    // Menolaknya akan mematikan pola pencerahan yang benar di grafik
    // profitabilitas dan umur piutang.
    if (PUTIH_LATAR.test(b) && !/color-mix/.test(b)) {
      temuan.push({ di: `${f}:${i + 1}`, jenis: "putih-latar", isi: b.trim().slice(0, 100) });
    }
  }
}

if (temuan.length) {
  const rgba = temuan.filter((t) => t.jenis === "rgba-merek");
  const putih = temuan.filter((t) => t.jenis === "putih-latar");

  console.error(`\n❌ ${temuan.length} warna yang tak punya varian mode gelap.\n`);

  if (rgba.length) {
    console.error(`   ── ${rgba.length} rgba merek pada properti isi`);
    console.error("      Yang samar-tapi-terlihat di latar putih menjadi TAK");
    console.error("      TERLIHAT di latar gelap — isinya hilang, bukan meredup.");
    console.error("      Perbaikan: color-mix(in srgb, var(--aksen) 30%, transparent)\n");
    for (const t of rgba) console.error(`      ${t.di}\n         ${t.isi}\n`);
  }

  if (putih.length) {
    console.error(`   ── ${putih.length} putih dipaku sebagai latar`);
    console.error("      Latar tetap PUTIH TERANG di mode gelap sementara teks di");
    console.error("      atasnya ikut menjadi terang — isinya jadi tak terbaca.");
    console.error("      Perbaikan: var(--surface) / var(--surface-subtle)\n");
    for (const t of putih) console.error(`      ${t.di}\n         ${t.isi}\n`);
  }
  process.exit(1);
}

console.log("✅ Warna buta-mode: nol rgba merek pada isi · nol putih dipaku sebagai latar");
