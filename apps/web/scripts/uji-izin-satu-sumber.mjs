#!/usr/bin/env node
/**
 * PENJAGA IZIN — `hasPerm` lokal tak boleh bertambah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SALINAN LOKAL MERUGIKAN, BUKAN SEKADAR "TIDAK RAPI"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Salinan `hasPerm` membaca `localStorage` LANGSUNG saat render. Di server
 * localStorage tak ada → `false`; di klien → `true`. Pohon server dan pohon
 * klien berbeda, React membuang hasil server dan merender ulang seluruhnya.
 *
 * Halaman yang menyalinnya menambal itu dengan penjaga `mounted` manual
 * (`useReducer` + `if (!mounted) return null`) — yang berarti halaman merender
 * NULL pada putaran pertama. Layar kosong sepersekian detik pada TIAP muat,
 * yang terbaca sebagai aplikasi lambat.
 *
 * `useIzin` (`lib/use-izin.ts`) memakai `useSyncExternalStore`: React sendiri
 * yang menangani beda server/klien, tanpa layar kosong dan tanpa tambalan.
 *
 * ── RATCHET, bukan ambang nol
 *
 * Enam berkas masih memakai bentuk `hasPerm` yang berbeda-beda (sebagian
 * menerima daftar kunci, sebagian dipakai di luar komponen). Memindahkannya
 * menuntut membaca tiap berkas — hook tak boleh dipanggil bersyarat, dan
 * konversi buta melanggar aturan hook: kerusakan yang baru terlihat saat
 * dijalankan, bukan saat dikompilasi.
 *
 * Yang ditegakkan: jumlahnya TAK BOLEH NAIK.
 *
 * Jalankan: node apps/web/scripts/uji-izin-satu-sumber.mjs
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = dirname(fileURLToPath(import.meta.url));
const AKAR = join(DI_SINI, "..", "app");
const LANTAI = join(DI_SINI, "lantai-izin.json");

function berkas(dir) {
  const h = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { h.push(...berkas(join(dir, e.name))); continue; }
    if (e.name.endsWith(".tsx")) h.push(join(dir, e.name));
  }
  return h;
}

const temuan = [];
for (const f of berkas(AKAR)) {
  const isi = readFileSync(f, "utf8");
  if (!/function hasPerm\b/.test(isi)) continue;
  // `localStorage` di dalamnya — itu penandanya, bukan sekadar nama fungsi.
  if (!/puraloka_permissions/.test(isi)) continue;
  temuan.push(f.slice(f.indexOf("app")).replace(/\\/g, "/"));
}

console.log(`Salinan hasPerm lokal: ${temuan.length}`);

const lantai = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, "utf8")) : null;

if (!lantai) {
  writeFileSync(
    LANTAI,
    JSON.stringify(
      {
        _catatan: "Salinan `hasPerm` lokal. Boleh TURUN, tidak boleh NAIK.",
        _kenapa:
          "Membaca localStorage saat render membuat pohon server ≠ klien; " +
          "tambalannya (`mounted`) merender NULL pada putaran pertama. " +
          "`useIzin` memakai useSyncExternalStore — tanpa layar kosong.",
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
  console.error("   Pakai `useIzin(\"kunci\")` dari @/lib/use-izin — bukan salinan lokal.");
  console.error("   Ia juga membuat penjaga `mounted` tak diperlukan.\n");
  temuan.slice(0, 10).forEach((t) => console.error(`     ${t}`));
  console.error("");
  process.exit(1);
}

if (temuan.length < lantai.jumlah) {
  console.log(`\n📉 Turun (${temuan.length} < ${lantai.jumlah}) — kencangkan angkanya.`);
}
console.log("✅ Tidak bertambah.");
