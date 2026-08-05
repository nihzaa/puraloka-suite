#!/usr/bin/env node
/**
 * RAPIKAN IZIN — `hasPermission()` saat render → `useIzin()`.
 *
 * ── Kenapa
 *
 * `hasPermission()` membaca localStorage: `false` di server, `true` di
 * klien. Memanggilnya saat render membuat pohon server dan klien
 * berbeda, sehingga React membuang hasil SSR dan merender ulang seluruh
 * halaman. Alasan lengkap ada di `lib/use-izin.ts`.
 *
 * ── Yang DITAMBAL, dan yang tidak
 *
 * Hanya bentuk yang tak ambigu:
 *
 *     const bolehX = hasPermission("kunci");     ← ditambal
 *
 * TIDAK ditambal:
 *
 *   • `hasPermission()` di dalam handler (onClick, submit) — di sana
 *     tak ada masalah hydration sama sekali, dan mengubahnya jadi hook
 *     akan melanggar aturan hooks.
 *   • `hasPermission()` sebaris di dalam JSX (`{hasPermission(..) && ..}`)
 *     — perlu diangkat jadi variabel lebih dulu, dan menempatkannya
 *     otomatis di posisi yang benar (setelah hook lain, sebelum
 *     pemakaian) tak bisa dilakukan andal dengan regex.
 *   • berkas yang SUDAH memakai `useSyncExternalStore` untuk kunci itu.
 *
 * Sisanya dilaporkan supaya bisa dikerjakan tangan — lebih baik daripada
 * ditambal salah lalu terlihat selesai.
 *
 * Pakai: node scripts/rapikan-izin-hydration.mjs [--tulis]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TULIS = process.argv.includes("--tulis");

const berkas = execSync(`grep -rl "hasPermission(" app --include=*.tsx`, {
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

let totalTambal = 0;
const sisa = [];

for (const f of berkas) {
  const asli = readFileSync(f, "utf8");
  let teks = asli;
  let tambal = 0;

  // `const X = hasPermission("kunci");` di tingkat komponen.
  teks = teks.replace(
    /const (\w+) = hasPermission\((["'][^"']+["'])\);/g,
    (_, nama, kunci) => {
      tambal++;
      return `const ${nama} = useIzin(${kunci});`;
    },
  );

  if (tambal > 0) {
    // Impor `useIzin`; `hasPermission` DIPERTAHANKAN bila masih dipakai
    // di tempat lain (handler, JSX sebaris).
    if (!/from "@\/lib\/use-izin"/.test(teks)) {
      teks = teks.replace(
        /(import \{[^}]*\} from "@\/lib\/api";)/,
        `$1\nimport { useIzin } from "@/lib/use-izin";`,
      );
    }
    // Buang impor `hasPermission` yang jadi tak terpakai.
    if (!/hasPermission\(/.test(teks)) {
      teks = teks
        .replace(/\{ hasPermission, /g, "{ ")
        .replace(/, hasPermission \}/g, " }")
        .replace(/, hasPermission,/g, ",")
        .replace(/\{ hasPermission \}/g, "{ }");
    }
    totalTambal += tambal;
    console.log(`  ${String(tambal).padStart(2)}  ${f}`);
    if (TULIS && teks !== asli) writeFileSync(f, teks);
  }

  // Sisa panggilan yang tak bisa ditambal aman.
  const sisaPanggilan = [...teks.matchAll(/hasPermission\(/g)].length;
  if (sisaPanggilan > 0) sisa.push([f, sisaPanggilan]);
}

console.log(`\n  ditambal jadi useIzin : ${totalTambal}`);
if (sisa.length) {
  console.log(`\n  perlu tangan (handler / JSX sebaris):`);
  for (const [f, n] of sisa) console.log(`    ${String(n).padStart(2)}  ${f}`);
}
console.log(TULIS ? "\n✅ ditulis." : "\n(uji coba — pakai --tulis untuk menerapkan)");
