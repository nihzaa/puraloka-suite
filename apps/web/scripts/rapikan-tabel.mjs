#!/usr/bin/env node
/**
 * RAPIKAN TABEL — menambal cacat tabel yang bisa ditambal secara mekanis.
 *
 * ── Kenapa mekanis, bukan menulis ulang 19 halaman
 *
 * Semua tabel di repo ini memakai bentuk yang sama:
 *
 *     <table style={{ width: "100%", borderCollapse: "collapse" }}>
 *
 * Cacatnya juga sama di mana-mana, dan tiga dari empat bisa diperbaiki
 * dengan menambah properti pada elemen `<table>` itu sendiri — tidak
 * perlu menyentuh satu pun `<td>`:
 *
 *   • `fontVariantNumeric: "tabular-nums"` DIWARISI seluruh sel. Satu
 *     penambahan memperbaiki setiap kolom rupiah di dalam tabel itu.
 *
 * Yang TIDAK ditambal di sini, dan alasannya:
 *
 *   • `<caption>` butuh kalimat yang menjelaskan tabel ini tentang apa.
 *     Mesin tidak tahu jawabannya; menebak akan menghasilkan caption
 *     yang salah, dan caption salah lebih buruk daripada tak ada —
 *     pembaca layar akan membacakan kebohongan dengan percaya diri.
 *   • `scope="row"` butuh keputusan kolom mana yang jadi kepala baris.
 *     Sama: itu penilaian, bukan pola.
 *
 * Keduanya dicatat sebagai utang di penjaga, bukan ditambal asal.
 *
 * ── Kenapa tabular-nums penting, bukan kosmetik
 *
 * Di font proporsional, "1" jauh lebih sempit daripada "8". Kolom
 * "Rp 111.111" dan "Rp 888.888" jadi punya lebar berbeda meski jumlah
 * digitnya sama. Efeknya: mata tak bisa membandingkan besaran dari
 * panjangnya — harus membaca setiap angka. Untuk halaman piutang yang
 * tugasnya "mana yang paling besar", itu menghapus gunanya tabel.
 *
 * Pakai: node scripts/rapikan-tabel.mjs [--tulis]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TULIS = process.argv.includes("--tulis");

// `components/` WAJIB ikut. Versi pertama alat ini cuma memindai `app/`,
// dan penjaga `uji-tabel-terbaca.mjs` langsung menemukan 5 tabel yang
// terlewat di sini — komponen bersama justru muncul di banyak halaman,
// jadi melewatkannya berdampak paling luas.
const berkas = execSync(
  `grep -rl "<table" app components --include=*.tsx`,
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

let totalTabel = 0, totalTambal = 0;
const perBerkas = [];

for (const f of berkas) {
  const asli = readFileSync(f, "utf8");
  let teks = asli;
  let tambal = 0;

  // Hanya sentuh `<table style={{ ... }}>` yang BELUM punya
  // fontVariantNumeric. Regex dibatasi ke dalam satu `style={{...}}`
  // supaya tidak pernah melewati batas elemen.
  teks = teks.replace(
    /<table(\s+[^>]*?)?style=\{\{([^}]*)\}\}/g,
    (cocok, sebelum, isi) => {
      totalTabel++;
      if (/fontVariantNumeric/.test(isi)) return cocok;
      tambal++;
      const rapi = isi.trimEnd().replace(/,\s*$/, "");
      return `<table${sebelum ?? " "}style={{${rapi}, fontVariantNumeric: "tabular-nums" }}`;
    },
  );

  if (tambal > 0) {
    perBerkas.push([f, tambal]);
    totalTambal += tambal;
    if (TULIS && teks !== asli) writeFileSync(f, teks);
  }
}

for (const [f, n] of perBerkas) console.log(`  ${String(n).padStart(3)}  ${f}`);
console.log(`\n  tabel ber-style : ${totalTabel}`);
console.log(`  ditambal        : ${totalTambal}  (fontVariantNumeric)`);
console.log(TULIS ? "\n✅ ditulis." : "\n(uji coba — pakai --tulis untuk menerapkan)");
