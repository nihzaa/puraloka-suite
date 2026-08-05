#!/usr/bin/env node
/**
 * PENJAGA IZIN-HYDRATION — `hasPermission()` tak boleh dipanggil saat
 * render.
 *
 * ── Bug yang melahirkannya
 *
 * `hasPermission()` membaca localStorage: `false` di server, `true` di
 * klien untuk pemakai berwenang. Dipanggil saat render, ia membuat
 * pohon server dan pohon klien berbeda:
 *
 *     const bolehKelola = hasPermission("gl:manage");
 *     ...
 *     {bolehKelola && <button>Jurnal Baru</button>}
 *
 * Server merender lima tombol, klien enam. React menemukan
 * ketidakcocokan, MEMBUANG seluruh hasil SSR, lalu merender ulang
 * semuanya di klien.
 *
 * Terlihat sebagai "2 Issues" di overlay Next.js pada 17 halaman, dan
 * ongkosnya nyata: render ganda di muat pertama — paling terasa di HP
 * lapangan — plus keuntungan SSR yang praktis hilang.
 *
 * Yang paling parah adalah gerbang akses (`/audit`, `/sistem`):
 *
 *     if (!hasPermission("audit:view")) return <TidakPunyaAkses />;
 *
 * Di situ SELURUH halaman berbeda antara server dan klien.
 *
 * ── Perbaikannya
 *
 *     const bolehKelola = useIzin("gl:manage");
 *
 * `useSyncExternalStore` memang dirancang untuk nilai yang berbeda
 * antara server dan klien: argumen ketiganya adalah snapshot server,
 * dan React beralih ke nilai klien setelah hydration TANPA menganggapnya
 * ketidakcocokan. Alasan lengkap di `lib/use-izin.ts`.
 *
 * ── Yang BOLEH tetap memakai `hasPermission`
 *
 * Panggilan di dalam handler (`onClick`, submit, callback) — di sana tak
 * ada hydration sama sekali, dan mengubahnya jadi hook justru melanggar
 * aturan hooks. Penjaga ini hanya menolak panggilan yang jelas berada di
 * jalur render.
 *
 * Pakai: node scripts/uji-izin-hydration.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const berkas = execSync(`grep -rl "hasPermission(" app components --include=*.tsx || true`, {
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

const temuan = [];

for (const f of berkas) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);

  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    if (!/hasPermission\(/.test(b)) continue;
    if (/^\s*(\/\/|\*|\/\*)/.test(b)) continue;             // komentar

    // Di dalam `useSyncExternalStore(...)` — itu justru pola yang benar.
    const jendela = baris.slice(Math.max(0, i - 3), i + 1).join("\n");
    if (/useSyncExternalStore/.test(jendela)) continue;

    // ── Bentuk yang JELAS di jalur render.
    //
    //   const X = hasPermission("...")     deklarasi tingkat komponen
    //   if (!hasPermission("..."))         gerbang akses
    //   {hasPermission("...") && ...}      bersyarat di dalam JSX
    //
    // Panggilan di dalam handler tidak cocok dengan ketiganya, jadi ia
    // lewat — dan itu memang benar.
    const deklarasi = /^\s*const \w+ = hasPermission\(/.test(b);
    const gerbang = /^\s*if \(\s*!?\s*hasPermission\(/.test(b);
    const diJsx = /\{\s*!?\s*hasPermission\(/.test(b) && !/=>/.test(b);

    if (deklarasi || gerbang || diJsx) {
      temuan.push({
        di: `${f}:${i + 1}`,
        jenis: gerbang ? "gerbang akses" : deklarasi ? "deklarasi render" : "bersyarat JSX",
        isi: b.trim().slice(0, 92),
      });
    }
  }
}

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} panggilan \`hasPermission()\` di jalur render.\n`);
  console.error("   localStorage tak ada di server, jadi nilainya SELALU false di");
  console.error("   sana dan true di klien. React menemukan pohon yang berbeda,");
  console.error("   membuang hasil SSR, lalu merender ulang seluruh halaman.\n");
  console.error("   Perbaikan:  const boleh = useIzin(\"kunci\");   // lib/use-izin.ts\n");
  for (const t of temuan) {
    console.error(`   ${t.di}   [${t.jenis}]`);
    console.error(`      ${t.isi}\n`);
  }
  process.exit(1);
}

console.log(`✅ Izin-hydration: nol \`hasPermission()\` di jalur render (${berkas.length} berkas dipindai)`);
