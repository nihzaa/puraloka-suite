#!/usr/bin/env node
/**
 * UKUR LAYAR KOSONG — memisahkan yang sudah menolong dari yang buntu.
 *
 * ── Kenapa hitungan string menyesatkan
 *
 * `grep "Belum ada"` menemukan 31 tempat. Tapi setelah dibaca, sebagian
 * SUDAH baik: `/aset` memakai primitif `Kosong` dengan penjelasan, dan
 * `/mutu/ncr` bahkan membedakan "gagal dimuat" dari "memang kosong" —
 * pembedaan yang sering dilewatkan dan berakibat orang menunggu data
 * yang tak akan pernah datang.
 *
 * Jadi 31 itu hitungan KALIMAT, bukan hitungan CACAT. Skrip ini
 * menghitung cacatnya.
 *
 * ── Apa yang membuat layar kosong buntu
 *
 * Layar kosong yang baik menjawab tiga hal:
 *
 *   1. APA yang kosong          — hampir semua sudah menjawab ini
 *   2. KENAPA kosong            — "belum pernah diisi" vs "tersaring habis"
 *                                 vs "gagal dimuat" menuntut tindakan yang
 *                                 sama sekali berbeda
 *   3. APA yang bisa dilakukan  — tombol/tautan, atau kalimat yang menyebut
 *                                 di mana pekerjaannya dimulai
 *
 * Yang hanya menjawab (1) adalah jalan buntu: pemakai tahu tak ada isinya,
 * tapi tidak tahu apakah itu salahnya, salah sistem, atau memang wajar.
 *
 * Perhatian khusus: layar kosong yang muncul saat pencarian/saringan aktif
 * TIDAK boleh berbunyi sama dengan layar kosong "belum ada data sama
 * sekali". Yang pertama minta saringannya dilonggarkan; yang kedua minta
 * data dibuat. Menyamakan keduanya membuat orang menghapus saringan yang
 * benar, atau membuat data ganda karena mengira yang lama hilang.
 *
 * Pakai: node scripts/ukur-layar-kosong.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const berkas = execSync(
  `grep -rlE "(Tidak|Belum) ada" app components --include=*.tsx`,
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

/**
 * Sudah memakai primitif bersama — `Kosong` MEWAJIBKAN `sebab` lewat
 * TypeScript, jadi tak perlu ditebak lagi dari teks sekitarnya.
 */
const PAKAI_PRIMITIF = /<Kosong[\s>]/;
/** Petunjuk bahwa ada jalan keluar di dekat kalimatnya. */
const ADA_AKSI = /<(button|Link|Tombol)\b|onClick=|href=|aksi=/i;
/** Kalimat yang menjelaskan, bukan cuma menyatakan kekosongan. */
const ADA_SEBAB =
  /sebab=|keterangan=|supaya|karena|coba |mulai|buat |daftarkan|longgar|hanya |belum dicatat|kata kunci/i;

/**
 * Label SEL, bukan layar. Versi pertama skrip ini menandai
 * `audit/page.tsx:63` sebagai "layar kosong buntu", padahal itu
 * `<span>Tidak ada data</span>` di dalam satu sel tabel diff — memberinya
 * tombol dan penjelasan sebab justru akan merusak tabelnya.
 *
 * Cirinya: berada di dalam elemen inline pendek (`<span>`, `<td>`) pada
 * baris yang sama.
 */
const LABEL_SEL = /<(span|td|small|em|strong)\b[^>]*>[^<]{0,40}(Tidak|Belum) ada/;

const rapi = [], buntu = [];

for (const f of berkas) {
  if (/\.test\.tsx$/.test(f)) continue;                     // berkas uji
  const isi = readFileSync(f, "utf8");
  const baris = isi.split(/\r?\n/);

  for (let i = 0; i < baris.length; i++) {
    if (!/(Tidak|Belum) ada/.test(baris[i])) continue;
    if (/^\s*(\/\/|\*|\/\*)/.test(baris[i])) continue;      // komentar
    if (LABEL_SEL.test(baris[i])) continue;                 // label sel, bukan layar

    // Layar kosong hampir selalu satu blok pendek; lihat sekelilingnya.
    const sekitar = baris.slice(Math.max(0, i - 8), i + 8).join("\n");

    // Primitif bersama sudah menjamin sebab ada — tak perlu ditebak.
    const viaPrimitif = PAKAI_PRIMITIF.test(sekitar);
    const sebab = viaPrimitif || ADA_SEBAB.test(sekitar);
    const aksi = ADA_AKSI.test(sekitar);

    const catatan = {
      di: `${f}:${i + 1}`,
      teks: (baris[i].match(/"([^"]{3,70})"/)?.[1] ?? baris[i].trim()).slice(0, 62),
      sebab, aksi, viaPrimitif,
    };
    // Sebab adalah syarat minimum: tanpa itu pemakai tak tahu apakah ini
    // salahnya, salah sistem, atau memang wajar. Aksi menyusul.
    (sebab ? rapi : buntu).push(catatan);
  }
}

const total = rapi.length + buntu.length;
const pakaiPrimitif = rapi.filter((r) => r.viaPrimitif).length;
const tanpaAksi = rapi.filter((r) => !r.aksi).length;

console.log(`\n  layar kosong (label sel dikecualikan) : ${total}`);
console.log(`  menjelaskan sebabnya                 : ${rapi.length}  (${pakaiPrimitif} lewat <Kosong>)`);
console.log(`  BUNTU — tak menyebut sebab           : ${buntu.length}`);
console.log(`  menjelaskan tapi tanpa jalan keluar  : ${tanpaAksi}\n`);

for (const b of buntu) {
  console.log(`  ${b.di}`);
  console.log(`     "${b.teks}"`);
}
