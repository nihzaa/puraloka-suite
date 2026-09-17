#!/usr/bin/env node
/**
 * PENJAGA: tombol primer halaman memakai GRADASI, bukan navy padat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `<Tombol jenis="utama">` (components/dasar.tsx) memakai `var(--grad-aksen)`.
 * Itu konvensi tombol aksi utama di repo ini. Tapi puluhan halaman menulis
 * gayanya SENDIRI — `background: C.navy` — alih-alih memakai komponennya.
 *
 * Diukur 2026-08-16 saat founder bertanya "apakah styling setiap tombol udh
 * sama? pake yg gradasi?": 115 tombol bergradasi, 29 navy padat. Dua konvensi
 * hidup berdampingan untuk elemen yang sama, dan selisihnya baru terasa saat
 * BERPINDAH halaman — tiap halaman terlihat wajar sendirian.
 *
 * ── Kenapa RATCHET, bukan ambang nol
 *
 * Ada empat tempat yang navy padatnya BENAR, dan semuanya di luar aliran
 * tombol halaman biasa:
 *
 *   • `rail-pengingat.tsx` — kartu "FOKUS HARI INI", satu-satunya blok navy
 *     di rail. Ia jangkar visual; semua kartu rail lain `var(--surface)`.
 *     Gradasi di sini melanggar "satu aksen per layar" (ui-dasar.tsx), DAN
 *     ujung terangnya di mode gelap (#7ABDFF) cuma berkontras 1.99 dengan
 *     teks putih — jauh di bawah WCAG AA 4.5.
 *   • `rail-asisten.tsx` (2) — tombol konfirmasi 11.5px di dalam kartu
 *     `navyLight`. Gradasi bertabrakan dengan latar bernada sama.
 *   • `not-found.tsx` — halaman 404 di luar shell dashboard.
 *
 * Karena itu lantainya 4, bukan 0: yang dijaga adalah jumlahnya TIDAK
 * BERTAMBAH, sehingga halaman baru memakai `<Tombol jenis="utama">` alih-alih
 * mengarang latar sendiri.
 *
 * ── Kenapa <div> DIKECUALIKAN
 *
 * Versi pertama menghitung setiap `background: C.navy*` dan melapor 127
 * "tombol padat". Sebagian besar bukan tombol: ubin ikon dan lencana status
 * memakai `C.navyLight`, dan itu memang benar. Yang dihitung sekarang hanya
 * elemen <button>/<a>/<Link>, dan `navyLight` tak pernah ikut.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG DIJAGA BERKAS INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Tombol berlatar navy PADAT — warna yang SALAH.  Ambang: lantai 4→0.
 *   2. Tombol bergradasi yang DIGAMBAR SENDIRI — warna benar, bentuk buatan
 *      tangan, tak memakai `<Tombol jenis="utama">`.  Ratchet, lantai 106.
 *
 * Yang kedua ditambahkan 2026-09-15 karena yang pertama buta terhadapnya:
 * bagi (1) gradasi memang yang diminta, jadi 106 tombol buatan tangan lewat
 * tanpa suara. Alasan lengkapnya di kepala BAGIAN KEDUA, di bawah.
 *
 * Jalankan       : node apps/web/scripts/uji-tombol-primer-seragam.mjs
 * Lihat pelakunya: node apps/web/scripts/uji-tombol-primer-seragam.mjs --daftar-gradasi
 * Kencangkan     : node apps/web/scripts/uji-tombol-primer-seragam.mjs --naikkan-gradasi
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = dirname(fileURLToPath(import.meta.url));
const AKAR = join(DI_SINI, "..");
const LANTAI = join(DI_SINI, "lantai-tombol-primer.json");

/** Latar navy/aksen PENUH. `navyLight` sengaja tak cocok — itu latar ubin. */
const LATAR_PADAT =
  /background:\s*(?:"var\(--navy\)"|"var\(--aksen\)"|C\.navy\b(?!Light)|C\.aksen\b)/;

/** Hanya elemen yang benar-benar bisa diklik. */
const KLIKABEL = /^(button|a|Link)$/;

function berkas(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", ".layar"].includes(e.name)) continue;
      berkas(p, out);
      continue;
    }
    if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const temuan = [];

for (const f of [...berkas(join(AKAR, "app")), ...berkas(join(AKAR, "components"))]) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);
  const rel = relative(AKAR, f).split(sep).join("/");

  baris.forEach((l, i) => {
    if (!LATAR_PADAT.test(l)) return;

    // Tag pembuka terdekat ke atas menentukan pemilik gaya ini.
    let tag = null;
    for (let j = i; j >= Math.max(0, i - 14); j--) {
      const m = baris[j].match(/<([a-zA-Z][\w.]*)\b/);
      if (m) { tag = m[1]; break; }
    }
    if (!KLIKABEL.test(tag || "")) return;

    temuan.push(`${rel}:${i + 1}  <${tag}>`);
  });
}

console.log(`Tombol primer berlatar navy padat: ${temuan.length}`);

const lantai = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, "utf8")) : null;

if (!lantai) {
  writeFileSync(
    LANTAI,
    JSON.stringify(
      {
        _catatan:
          "Tombol <button>/<a>/<Link> berlatar navy PADAT (bukan --grad-aksen). " +
          "Boleh TURUN, tidak boleh NAIK. Konvensi: <Tombol jenis=\"utama\"> → var(--grad-aksen).",
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
  console.error(`\n❌ TOMBOL PADAT BERTAMBAH: ${temuan.length} > lantai ${lantai.jumlah}\n`);
  console.error("   Tombol aksi utama di repo ini memakai `var(--grad-aksen)`.");
  console.error("   Menulis `background: C.navy` sendiri membuat dua konvensi hidup");
  console.error("   berdampingan — selisihnya terasa saat BERPINDAH halaman.\n");
  console.error("   Perbaikan: pakai `<Tombol jenis=\"utama\">` dari components/dasar.tsx,");
  console.error("   atau `background: \"var(--grad-aksen)\"` bila menulis gaya sendiri.\n");
  temuan.slice(0, 20).forEach((t) => console.error(`     ${t}`));
  console.error("");
  process.exit(1);
}

if (temuan.length < lantai.jumlah) {
  console.log(`\n📉 Turun dari lantai (${temuan.length} < ${lantai.jumlah}) — kencangkan angkanya.`);
}
console.log("✅ Tidak bertambah.");

/* ═══════════════════════════════════════════════════════════════════════════
 * BAGIAN KEDUA — tombol primer yang DIGAMBAR SENDIRI, bukan <Tombol>.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── Celah yang ditutup bagian ini
 *
 * Bagian pertama di atas menjaga tombol yang memakai navy PADAT — warna yang
 * SALAH. Lantainya 0, dan ia hijau.
 *
 * Tapi ia buta terhadap kebalikannya: tombol yang warnanya BENAR
 * (`var(--grad-aksen)`) namun digambar dengan tangan alih-alih memakai
 * `<Tombol jenis="utama">`. Bagi bagian pertama itu bukan pelanggaran —
 * gradasinya memang yang diminta — jadi ia lewat tanpa suara.
 *
 * Diukur 2026-09-15 atas 159 `page.tsx` di `app/(dashboard)`:
 *
 *     <button> mentah                     590  di 117 berkas
 *     di antaranya bergaya --grad-aksen   106  di  54 berkas
 *     halaman yang memakai <Tombol>        26
 *
 * Artinya: mengubah rupa tombol aksi utama — radius, tinggi sentuh, transisi,
 * keadaan disabled — berarti menyunting 106 tempat, dan yang terlewat akan
 * tetap berupa tombol versi lama di sebelah tombol versi baru, di layar yang
 * sama. Itu persis keluhan yang melahirkan bagian pertama, hanya sumbernya
 * lain: di sana WARNANYA yang menyimpang, di sini BENTUKNYA.
 *
 * Yang hilang saat tombol digambar sendiri bukan cuma keseragaman rupa.
 * `<Tombol>` membawa `minHeight: 38` (32 untuk `kecil`) dengan alasan yang
 * tertulis di komponennya: "target sentuh minimum ... di bawah itu jempol
 * meleset, dan pemakai terbanyak sistem ini mandor & tukang, sering sambil
 * berdiri dengan sarung tangan". Tombol buatan tangan tak mewarisi apa pun
 * dari itu, dan tak ada yang memberi tahu.
 *
 * ── Kenapa RATCHET, bukan nol
 *
 * Menuntut nol berarti menulis ulang 106 tombol dalam satu langkah — dan
 * sebagian memang punya alasan sah menggambar sendiri (tombol di dalam sel
 * tabel, tombol dengan tata letak isi yang tak muat di API `<Tombol>`).
 * Memaksanya sekaligus menghasilkan pembungkus yang dipaksakan, atau —
 * yang lebih mungkin — penjaganya dimatikan.
 *
 * Yang ditegakkan: jumlahnya TIDAK BERTAMBAH. Halaman baru memakai
 * `<Tombol jenis="utama">`; yang lama ikut saat kebetulan disentuh.
 *
 * ── Kenapa elemen dipindai dengan PENCOCOKAN KURUNG, bukan jendela baris
 *
 * Bagian pertama menebak pemilik gaya dengan menengok maksimal 14 baris ke
 * atas. Itu cukup untuk tombol pendek dan MELEWATKAN yang panjang: diukur
 * 2026-09-15, dua tombol primer sungguhan lolos karena badan atributnya
 * lebih dari 14 baris —
 *
 *     laporan/page.tsx:642          <button> dengan handler ekspor XLSX
 *     master/karyawan/page.tsx:166  <button> dengan komentar 6 baris
 *
 * Keduanya tombol aksi utama yang digambar tangan, persis yang dicari.
 * Karena itu bagian ini mencocokkan kurung `{}` untuk menemukan ujung tag
 * pembuka yang SEBENARNYA — 106, bukan 104. Selisih dua itu bukan kehalusan
 * statistik: ia tepat berupa dua pelanggaran yang tak akan pernah terlihat.
 */

const LANTAI_GRAD = join(DI_SINI, "lantai-tombol-gradasi.json");

/** Hanya `page.tsx` di app/(dashboard) — cakupan yang diukur. */
function halamanDasbor(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".layar"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { halamanDasbor(p, out); continue; }
    if (e.name === "page.tsx") out.push(p);
  }
  return out;
}

/**
 * Ujung tag pembuka `<button ...>` dengan pencocokan kurung.
 *
 * `>` di dalam `{}` (mis. `onClick={() => x}`, `a > b`) BUKAN penutup tag.
 * Menganggapnya penutup memotong badan atribut terlalu dini, dan gaya yang
 * ada sesudahnya jadi tak terlihat.
 */
function ujungTagPembuka(isi, mulai) {
  let dalam = 0;
  for (let i = mulai; i < isi.length; i++) {
    const c = isi[i];
    if (c === "{") dalam++;
    else if (c === "}") dalam--;
    else if (c === ">" && dalam === 0) return i;
  }
  return isi.length;
}

const perBerkasGrad = {};
let totalGrad = 0;

for (const f of halamanDasbor(join(AKAR, "app", "(dashboard)"))) {
  const isi = readFileSync(f, "utf8");
  const rel = relative(AKAR, f).split(sep).join("/");
  const rx = /<button\b/g;
  let m;
  let n = 0;
  while ((m = rx.exec(isi))) {
    const atribut = isi.slice(m.index, ujungTagPembuka(isi, m.index + "<button".length));
    if (/var\(--grad-aksen\)/.test(atribut)) n++;
  }
  if (n > 0) { perBerkasGrad[rel] = n; totalGrad += n; }
}

const gradUrut = Object.entries(perBerkasGrad).sort(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
);

if (process.argv.includes("--daftar-gradasi")) {
  for (const [f, n] of gradUrut) console.log(`${String(n).padStart(4)}  ${f}`);
  console.log(`\n  ${totalGrad} <button> bergradasi di ${gradUrut.length} berkas`);
  process.exit(0);
}

const isiLantaiGrad = () => ({
  _catatan:
    "Lantai <button> MENTAH yang digambar sendiri dengan var(--grad-aksen), " +
    "di app/(dashboard)/**/page.tsx. Boleh TURUN, tidak boleh NAIK.",
  _kenapa:
    "Warnanya benar, bentuknya digambar tangan. Mengubah rupa tombol aksi utama " +
    "(radius, tinggi sentuh, transisi, keadaan disabled) berarti menyunting tiap " +
    "tempat, dan yang terlewat jadi tombol versi lama di sebelah yang baru. " +
    "<Tombol> juga membawa minHeight 38px untuk jempol bersarung tangan; tombol " +
    "buatan tangan tak mewarisi itu.",
  _cara: 'Pakai <Tombol jenis="utama"> dari components/dasar.tsx.',
  _cakupan: "159 page.tsx di apps/web/app/(dashboard) — bukan components/, bukan seluruh repo.",
  _diukur: new Date().toISOString().slice(0, 10),
  total: totalGrad,
  berkas: Object.fromEntries(gradUrut),
});

console.log(`\nTombol <button> mentah bergradasi: ${totalGrad} di ${gradUrut.length} berkas`);

if (!existsSync(LANTAI_GRAD)) {
  writeFileSync(LANTAI_GRAD, JSON.stringify(isiLantaiGrad(), null, 2) + "\n");
  console.log("Lantai gradasi dibuat pertama kali.");
  process.exit(0);
}

const lantaiGrad = JSON.parse(readFileSync(LANTAI_GRAD, "utf8"));

if (process.argv.includes("--naikkan-gradasi")) {
  writeFileSync(
    LANTAI_GRAD,
    JSON.stringify(
      {
        ...isiLantaiGrad(),
        _riwayat: [...(lantaiGrad._riwayat || []), `${lantaiGrad.total} -> ${totalGrad}`],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Lantai gradasi diperbarui: ${lantaiGrad.total} -> ${totalGrad}`);
  process.exit(0);
}

console.log(`Lantai gradasi (maks)            : ${lantaiGrad.total} di ${Object.keys(lantaiGrad.berkas || {}).length} berkas`);

// Selisih PER-BERKAS: satu berkas +2 sementara yang lain -2 membuat total
// diam padahal ada dua tombol buatan tangan yang baru.
const lamaGrad = lantaiGrad.berkas || {};
const naikGrad = [];
for (const [f, n] of gradUrut) {
  const sebelum = lamaGrad[f] ?? 0;
  if (n > sebelum) naikGrad.push(`${f}: ${sebelum} -> ${n}  (+${n - sebelum})`);
}

if (totalGrad > lantaiGrad.total || naikGrad.length) {
  console.error(`\n❌ TOMBOL PRIMER BUATAN TANGAN BERTAMBAH: ${lantaiGrad.total} -> ${totalGrad}\n`);
  console.error("   Warnanya benar, tapi bentuknya digambar sendiri. Mengubah rupa");
  console.error("   tombol aksi utama lalu berarti menyunting tiap tempat, dan yang");
  console.error("   terlewat jadi tombol versi lama di sebelah yang baru.\n");
  console.error("   `<Tombol>` juga membawa minHeight 38px — target sentuh untuk");
  console.error("   mandor & tukang yang menekan sambil bersarung tangan. Tombol");
  console.error("   buatan tangan tak mewarisi itu, dan tak ada yang memberi tahu.\n");
  console.error('   Perbaikan: pakai `<Tombol jenis="utama">` dari components/dasar.tsx.\n');
  console.error("   Berkas yang BERTAMBAH:");
  naikGrad.slice(0, 20).forEach((b) => console.error(`     ${b}`));
  if (naikGrad.length > 20) console.error(`     ... dan ${naikGrad.length - 20} berkas lagi`);
  console.error("\n   Daftar lengkap: node apps/web/scripts/uji-tombol-primer-seragam.mjs --daftar-gradasi\n");
  process.exit(1);
}

if (totalGrad < lantaiGrad.total) {
  writeFileSync(
    LANTAI_GRAD,
    JSON.stringify(
      {
        ...isiLantaiGrad(),
        _riwayat: [...(lantaiGrad._riwayat || []), `${lantaiGrad.total} -> ${totalGrad} (otomatis)`],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n  ✅ TURUN ${lantaiGrad.total} -> ${totalGrad}. Lantai ikut turun — terkunci.`);
  process.exit(0);
}

console.log("✅ Tombol bergradasi tidak bertambah.");
