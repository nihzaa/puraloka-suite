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
 * Jalankan: node apps/web/scripts/uji-tombol-primer-seragam.mjs
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
