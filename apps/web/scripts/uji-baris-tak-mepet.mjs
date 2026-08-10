#!/usr/bin/env node
/**
 * PENJAGA: baris di dalam `<Panel padat>` tak boleh lebih sempit dari kepalanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `<Panel padat>` menyetel padding badan jadi NOL — itu memang gunanya, supaya
 * tabel dan daftar mengatur jaraknya sendiri. Tapi kepalanya tetap memakai
 * `var(--pad-kartu-lega)` (16px), dan baris yang memberi dirinya padding lebih
 * kecil membuat isi terlihat MENEPI: judul panel menjorok, isinya tidak.
 *
 * Founder menunjuk ini 2026-08-10 dengan satu kata — "mepet" — pada halaman
 * Alur Otomasi dan Riwayat Asisten. Diperiksa: keduanya memakai 14px, sementara
 * kepalanya 16px. Selisih 2px terdengar sepele, dan justru itu masalahnya —
 * cukup kecil untuk lolos tinjauan, cukup besar untuk terasa salah.
 *
 * ── Kenapa RATCHET, bukan ambang nol
 *
 * Padding kecil kadang benar: baris rapat di tabel padat, sel angka, bilah
 * ringkas. Yang ditegakkan bukan satu angka untuk semua — melainkan bahwa
 * jumlahnya TIDAK BERTAMBAH, sehingga halaman baru mengikuti konvensi yang
 * sudah ada (`12px 16px`, dipakai 44 kali) alih-alih mengarang varian baru.
 *
 * Jalankan: node apps/web/scripts/uji-baris-tak-mepet.mjs
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = dirname(fileURLToPath(import.meta.url));
const AKAR = join(DI_SINI, "..");
const LANTAI = join(DI_SINI, "lantai-mepet.json");

/** Padding horizontal minimum agar sejajar kepala Panel. */
const MIN_X = 16;

function berkas(dir) {
  const h = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (["node_modules", ".next", ".layar"].includes(e.name)) continue;
      h.push(...berkas(join(dir, e.name)));
      continue;
    }
    if (e.name.endsWith(".tsx")) h.push(join(dir, e.name));
  }
  return h;
}

const temuan = [];

for (const f of [...berkas(join(AKAR, "app")), ...berkas(join(AKAR, "components"))]) {
  const isi = readFileSync(f, "utf8");
  // Hanya berkas yang MEMAKAI `padat` — di panel biasa, padding badan sudah
  // diurus komponennya dan padding baris kecil memang wajar.
  if (!/padat/.test(isi)) continue;

  const rel = f.slice(f.indexOf("app") >= 0 ? f.indexOf("app") : f.indexOf("components"))
    .replace(/\\/g, "/");

  /*
   * Hanya BARIS DAFTAR yang diperiksa — bukan tiap `padding` di berkas.
   *
   * Versi pertama menghitung semuanya dan menemukan 189, sebagian besar
   * padding TOMBOL (`6px 10px`) dan SEL TABEL (`6px 10px`) yang memang benar
   * kecil. Penjaga yang memerahkan hal yang bukan cacat akan dimatikan orang,
   * dan setelah dimatikan ia tak menjaga apa pun.
   *
   * Ciri baris daftar: padding vertikalnya >= 10px. Tombol dan sel tabel di
   * repo ini seragam <= 8px, jadi ambang itu memisahkan keduanya tanpa perlu
   * menebak dari nama variabel.
   */
  const baris = isi.split("\n");
  baris.forEach((b, i) => {
    const m = b.match(/padding:\s*"(\d+)px\s+(\d+)px"/);
    if (!m) return;
    const y = Number(m[1]);
    const x = Number(m[2]);
    if (y < 10) return; // tombol / sel tabel — kecil memang benar
    if (x >= MIN_X) return;
    temuan.push(`${rel}:${i + 1}  ${y}px ${x}px (X < ${MIN_X})  ${b.trim().slice(0, 52)}`);
  });
}

console.log(`Baris lebih sempit dari kepala panel: ${temuan.length}`);

const lantai = existsSync(LANTAI)
  ? JSON.parse(readFileSync(LANTAI, "utf8"))
  : null;

if (!lantai) {
  writeFileSync(
    LANTAI,
    JSON.stringify(
      {
        _catatan:
          "Baris ber-padding-X < 16px di berkas yang memakai <Panel padat>. " +
          "Boleh TURUN, tidak boleh NAIK. Konvensi repo: 12px 16px (44 pemakaian).",
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
  console.error(`\n❌ MEPET BERTAMBAH: ${temuan.length} > lantai ${lantai.jumlah}\n`);
  console.error("   `<Panel padat>` menyetel padding badan jadi NOL, tetapi kepalanya");
  console.error("   tetap 16px. Baris yang lebih sempit membuat isi terlihat menepi —");
  console.error('   founder menyebutnya "mepet" (2026-08-10).');
  console.error("\n   Perbaikan: pakai `var(--pad-kartu-lega)` untuk padding horizontal.\n");
  temuan.slice(0, 15).forEach((t) => console.error(`     ${t}`));
  console.error("");
  process.exit(1);
}

if (temuan.length < lantai.jumlah) {
  console.log(`\n📉 Turun dari lantai (${temuan.length} < ${lantai.jumlah}) — kencangkan angkanya.`);
}
console.log("✅ Tidak bertambah.");
