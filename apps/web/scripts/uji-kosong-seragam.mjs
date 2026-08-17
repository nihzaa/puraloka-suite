#!/usr/bin/env node
/**
 * PENJAGA KEADAAN KOSONG — satu bentuk untuk satu maksud.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-10: **37 halaman** menulis keadaan kosongnya sendiri, dan
 * bentuknya menyimpang satu sama lain — padding 40 vs 48, ikon 26px vs 32px,
 * judul kadang `<p>` kadang `<div>`, sebagian punya kalimat penjelas dan
 * sebagian hanya "Belum ada X".
 *
 * Yang terakhir itu yang paling merugikan. `operate.md` menyebutnya:
 * *"empty states that teach the interface, not 'nothing here'"*. Layar kosong
 * yang cuma berkata "Belum ada data" meninggalkan orang tanpa langkah
 * berikutnya — dan pada halaman yang BARU dibuka, itulah satu-satunya isi
 * yang ia lihat.
 *
 * ── Yang dijaga: bentuknya, bukan kalimatnya
 *
 * Mesin tak bisa menilai apakah sebuah kalimat mengajari. Yang bisa diukur:
 * halaman yang menggambar keadaan kosongnya SENDIRI alih-alih memakai
 * `<Kosong>` — dan yang digambar sendiri akan menyimpang, cepat atau lambat.
 *
 * ── RATCHET, bukan ambang nol
 *
 * Sebagian "Belum ada …" memang bukan keadaan kosong halaman: teks di sel
 * tabel, pesan toast, komentar kode. Memaksa semuanya jadi `<Kosong>` akan
 * salah. Yang ditegakkan: jumlahnya TAK BOLEH NAIK.
 *
 * Jalankan: node apps/web/scripts/uji-kosong-seragam.mjs
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = dirname(fileURLToPath(import.meta.url));
const AKAR = join(DI_SINI, "..", "app", "(dashboard)");
const LANTAI = join(DI_SINI, "lantai-kosong.json");

function halaman(dir) {
  const h = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { h.push(...halaman(join(dir, e.name))); continue; }
    if (e.name === "page.tsx") h.push(join(dir, e.name));
  }
  return h;
}

/** Komentar dibuang: "Belum ada" di dalam penjelasan bukan UI. */
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const temuan = [];

for (const f of halaman(AKAR)) {
  const isi = tanpaKomentar(readFileSync(f, "utf8"));
  const rel = f.slice(f.indexOf("app")).replace(/\\/g, "/");

  const baris = isi.split("\n");
  baris.forEach((b, i) => {
    if (!/(Belum ada|Tidak ada|Data kosong)/.test(b)) return;

    /*
     * Hanya yang berada di CABANG DATA-NOL. Konteks enam baris ke atas
     * diperiksa untuk `length === 0` dan sejenisnya — tanpa saringan ini,
     * teks sel tabel dan pesan toast ikut terhitung dan penjaganya jadi
     * cerewet. Penjaga cerewet akan dimatikan orang.
     */
    const konteks = baris.slice(Math.max(0, i - 6), i + 1).join("\n");
    if (!/length === 0|length < 1|!\w+\.length|length\)\s*===\s*0/.test(konteks)) return;

    /*
      Sudah memakai komponen kekosongan bersama di blok yang sama? Berarti
      sudah benar.

      DUA nama yang sah, bukan satu:

        <Kosong>       @/components/ui-dasar        — dipakai seluruh aplikasi
        <LayarKosong>  estimasi/_bersama/layar-kosong — modul CECEP

      `<LayarKosong>` bukan penyimpangan yang ditoleransi, melainkan bentuk
      yang LEBIH KETAT: ia MEWAJIBKAN `apa` + `kenapa` + `aksi` (spec rombak
      CECEP §5), sementara `<Kosong>` hanya menganjurkan `sebab`. Menolaknya
      berarti penjaga ini menyuruh menurunkan mutu.

      Tanpa baris ini, tujuh keadaan kosong yang justru PALING lengkap di
      repo terhitung sebagai pelanggaran — dan angka pelanggaran naik persis
      karena cacatnya diperbaiki. Penjaga yang menghukum perbaikan akan
      diabaikan orang, lalu berhenti menjaga apa pun.
    */
    const blok = baris.slice(Math.max(0, i - 8), i + 3).join("\n");
    if (/<(Kosong|LayarKosong)/.test(blok)) return;

    temuan.push(`${rel}:${i + 1}  ${b.trim().slice(0, 62)}`);
  });
}

console.log(`Keadaan kosong digambar sendiri: ${temuan.length}`);

const lantai = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, "utf8")) : null;

if (!lantai) {
  writeFileSync(
    LANTAI,
    JSON.stringify(
      {
        _catatan:
          "Keadaan kosong yang digambar sendiri, bukan lewat <Kosong>. " +
          "Boleh TURUN, tidak boleh NAIK.",
        _kenapa:
          "operate.md: empty states that teach the interface, not 'nothing here'. " +
          "Yang digambar sendiri menyimpang bentuknya dan biasanya lupa menyebut " +
          "langkah berikutnya.",
        jumlah: temuan.length,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Lantai dibuat pertama kali.");
  process.exit(0);
}

if (temuan.length > lantai.jumlah) {
  console.error(`\n❌ BERTAMBAH: ${temuan.length} > lantai ${lantai.jumlah}\n`);
  console.error("   Pakai `<Kosong ikon judul sebab />` dari @/components/ui-dasar.");
  console.error("   `sebab` menyebut LANGKAH BERIKUTNYA, bukan mengulang judulnya.\n");
  temuan.slice(0, 12).forEach((t) => console.error(`     ${t}`));
  console.error("");
  process.exit(1);
}

if (temuan.length < lantai.jumlah) {
  console.log(`\n📉 Turun (${temuan.length} < ${lantai.jumlah}) — kencangkan angkanya.`);
}
console.log("✅ Tidak bertambah.");
