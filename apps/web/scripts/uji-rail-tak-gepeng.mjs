#!/usr/bin/env node
/**
 * PENJAGA: KARTU RAIL TAK BOLEH GEPENG.
 *
 * ── Cacat yang melahirkan penjaga ini
 *
 * 2026-08-09, founder: *"pastikan kalender itu jangan kepotong"*. Diukur di
 * tiga tinggi layar, dan kenyataannya lebih buruk daripada terpotong: pada
 * viewport 1600x800 kartu Kalender menyusut dari 146px menjadi **2px**.
 * Seluruh kisi tanggalnya lenyap, menyisakan sepotong garis.
 *
 * Sebabnya satu properti yang hilang. Rail adalah kolom flex; `flex-shrink`
 * bernilai 1 secara bawaan. Begitu isi rail lebih tinggi daripada layar,
 * browser MENGECILKAN anak yang boleh mengecil, bukan menggulirkannya. Empat
 * dari lima kartu rail kebetulan sudah ber-`flexShrink: 0`; kalender tidak,
 * sehingga seluruh kelebihan tinggi ditimpakan kepadanya sendirian.
 *
 * ── Kenapa harus penjaga, bukan sekadar diperbaiki
 *
 * Cacat ini TAK TERLIHAT di layar besar: pada 1600x1000 rail masih muat, tak
 * ada yang perlu dikecilkan, dan kalender tampil normal 146px. Ia hanya
 * muncul pada laptop — tempat sebagian besar orang justru bekerja.
 *
 * Kartu rail berikutnya yang ditambahkan orang akan mewarisi jebakan yang
 * sama persis, dan tangkapan layar di mesin pengembang tak akan menunjukkan
 * apa pun. Jadi yang diperiksa bukan "apakah kalender benar" melainkan
 * "apakah ADA kartu rail yang bisa dikecilkan".
 *
 * ── Cara periksanya: statis, bukan peramban
 *
 * Sengaja tidak memakai Playwright. Penjaga yang butuh server hidup + login
 * akan dimatikan orang saat CI-nya rewel, dan penjaga yang dimatikan tak
 * menjaga apa-apa. Membaca berkasnya cukup: yang dicari satu properti.
 *
 * Pakai:  node apps/web/scripts/uji-rail-tak-gepeng.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "apps", "web", "components", "shell");

/**
 * Berkas rail yang MERENDER KARTU. `rail-isi.tsx` cuma menyusun anak dan tak
 * punya kotak sendiri, jadi ia bukan sasaran.
 */
const BUKAN_KARTU = new Set(["rail-isi.tsx"]);

/**
 * Membuang komentar sebelum memeriksa.
 *
 * INI BUKAN KERAPIAN — tanpa ini penjaganya buta.
 *
 * Terbukti saat uji mutasi penjaga ini sendiri: properti `flexShrink: 0`
 * dicabut dari `rail-kalender.tsx`, penjaga tetap HIJAU. Sebabnya komentar
 * panjang di berkas itu — yang saya tulis sendiri untuk menjelaskan kenapa
 * `flexShrink: 0` wajib — memuat frasa itu tiga kali. Pencarian teks polos
 * menemukan penjelasannya, bukan kodenya.
 *
 * Repo ini pernah kena persis pola yang sama pada `hex-ratchet` (komentar
 * berisi contoh hex membuat penjaga merah tanpa pelanggaran nyata). Arah
 * salahnya berlawanan, penyebabnya identik: komentar dibaca sebagai kode.
 */
function tanpaKomentar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // blok  /* ... */
    .replace(/^\s*\/\/.*$/gm, "");      // baris // ...
}

const pelanggaran = [];
let diperiksa = 0;

for (const nama of readdirSync(DIR)) {
  if (!nama.startsWith("rail-") || !nama.endsWith(".tsx")) continue;
  if (BUKAN_KARTU.has(nama)) continue;

  const isi = tanpaKomentar(readFileSync(join(DIR, nama), "utf8"));

  /*
    Kartu dikenali dari `borderRadius: "var(--rad-besar)"` — itu bentuk baku
    kotak kartu di rail. Berkas yang tak punya kotak (pembungkus, helper)
    memang tak perlu `flexShrink`.
  */
  const kotak = isi.indexOf('borderRadius: "var(--rad-besar)"');
  if (kotak === -1) continue;
  diperiksa++;

  /*
    PERIKSA DI DALAM BLOK GAYA KOTAK ITU SAJA, bukan seluruh berkas.

    Uji mutasi kedua penjaga ini menemukan cacat berikutnya: setelah properti
    dicabut dari kotak terluar kalender, penjaga TETAP hijau — karena berkas
    yang sama punya `flexShrink: 0` di tempat lain (div tombol geser bulan).
    Properti itu benar di sana dan sama sekali tak melindungi kartunya.

    Pencarian tingkat-berkas tak bisa membedakan keduanya. Jadi yang dibaca
    hanya potongan dari `borderRadius` kartu sampai penutup blok gayanya:
    `flexShrink` harus bertetangga dengan `borderRadius` yang menandai kartu.

    Batas blok dicari dengan menghitung kurung kurawal, bukan mencari `}}`
    literal — gaya sebaris di dalam blok (mis. `padding: "0 12px"`) tak
    berkurung, tetapi nilai objek bersarang bisa ada dan akan memotong terlalu
    cepat kalau dihitung asal.
  */
  const sesudah = isi.slice(kotak);
  let dalam = 1;
  let ujung = sesudah.length;
  for (let i = 0; i < sesudah.length; i++) {
    if (sesudah[i] === "{") dalam++;
    else if (sesudah[i] === "}") {
      dalam--;
      if (dalam === 0) { ujung = i; break; }
    }
  }
  const blokGaya = sesudah.slice(0, ujung);

  if (!/flexShrink:\s*0/.test(blokGaya)) {
    pelanggaran.push(nama);
  }
}

if (diperiksa === 0) {
  console.error("✗ Tak satu pun kartu rail terdeteksi — pengenalnya mungkin berubah.");
  console.error("  Penjaga yang tak memeriksa apa-apa lebih buruk daripada tak ada penjaga.");
  process.exit(1);
}

if (pelanggaran.length > 0) {
  console.error(`✗ ${pelanggaran.length} kartu rail bisa DIGEPENGKAN oleh flexbox:\n`);
  for (const p of pelanggaran) console.error(`   components/shell/${p}`);
  console.error(`
   Rail adalah kolom flex. Tanpa 'flexShrink: 0', kartu ini akan MENYUSUT
   (bukan menggulir) begitu isi rail melebihi tinggi layar — kalender pernah
   jadi 2px karenanya, dan itu tak terlihat di layar besar.

   Perbaikan: tambahkan 'flexShrink: 0' pada gaya kotak terluar kartu.
`);
  process.exit(1);
}

console.log(`✓ ${diperiksa} kartu rail semuanya ber-flexShrink:0 — tak ada yang bisa digepengkan.`);
