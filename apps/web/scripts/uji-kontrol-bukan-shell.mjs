#!/usr/bin/env node
/**
 * PENJAGA: padding SHELL HALAMAN tak boleh dipakai pada KONTROL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `var(--pad-atas) var(--pad-x) var(--pad-bawah)` adalah padding SATU-SATUNYA
 * milik shell halaman: 32px atas, 36px samping, 64px bawah pada layar lebar.
 * Angka itu benar untuk sebuah <div> yang membungkus seluruh halaman.
 *
 * Ia SALAH TOTAL untuk sebuah <select>. Dan itulah yang terjadi: sebuah
 * dropdown "Semua Status" setinggi 108px, selebar hampir sepertiga layar,
 * karena `style` shell disalin ke kontrolnya.
 *
 * Founder menunjuknya 2026-08-16: *"ada tombol/dropdown filter yg terlalu
 * besar"*. Diukur saat itu: 6 kontrol di 6 halaman — dua dropdown pengadaan,
 * dua dropdown kas, dua tombol mandor. Semuanya lolos tinjauan justru karena
 * memakai TOKEN: `kerapatan-ratchet` dan `hex-ratchet` melihat `var(--…)` dan
 * menyatakan patuh. Token yang benar di tempat yang salah tetap cacat.
 *
 * ── Kenapa AMBANG NOL, bukan ratchet
 *
 * Tak ada satu pun kasus sah sebuah `<select>`/`<button>`/`<input>` memakai
 * padding shell halaman. Ini bukan selera yang bisa berbeda per halaman —
 * ini kekeliruan salin-tempel yang punya token penggantinya sendiri:
 * `--pad-tombol` (8px 14px) dan `--pad-tombol-kcl` (5px 11px).
 *
 * ── Kenapa `>` polos tak dipakai untuk mencari penutup tag
 *
 * Versi pertama penjaga ini melapor NOL temuan pada berkas yang jelas-jelas
 * memuat cacatnya. Sebabnya `onChange={e => …}`: tanda `=>` mengandung `>`,
 * dan menghitungnya sebagai penutup tag membuat pemilik `style` salah tebak
 * — penjaga yang buta pada cacat yang melahirkannya. Penutup dicari dengan
 * mengabaikan `>` yang didahului `=`.
 *
 * Jalankan: node apps/web/scripts/uji-kontrol-bukan-shell.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = dirname(fileURLToPath(import.meta.url));
const AKAR = join(DI_SINI, "..");

/** Padding milik shell halaman — dilarang muncul di kontrol. */
const TOKEN_SHELL = "var(--pad-atas) var(--pad-x) var(--pad-bawah)";

/** Elemen yang tak boleh memakainya. */
const KONTROL = /^(select|input|button|textarea)$/i;

/** Sejauh apa ke atas tag pembuka dicari dari baris `padding`. */
const JANGKAUAN = 12;

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

/**
 * Posisi `>` yang benar-benar menutup tag.
 *
 * `=>` (arrow function) TIDAK dihitung — lihat catatan di kepala berkas.
 */
function posisiPenutup(teks) {
  const re = />/g;
  let m;
  while ((m = re.exec(teks))) {
    if (teks[m.index - 1] !== "=") return m.index;
  }
  return -1;
}

const temuan = [];

for (const f of [...berkas(join(AKAR, "app")), ...berkas(join(AKAR, "components"))]) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);
  const rel = f.slice(AKAR.length + 1).split(sep).join("/");

  baris.forEach((l, i) => {
    if (!l.includes(TOKEN_SHELL)) return;

    // Tag pembuka TERDEKAT ke atas yang masih terbuka saat `padding` ditulis
    // adalah pemilik `style` ini.
    for (let j = i; j >= Math.max(0, i - JANGKAUAN); j--) {
      const m = baris[j].match(/<([a-zA-Z][\w.]*)\b/);
      if (!m) continue;

      const seg = baris.slice(j, i + 1).join(" ");
      const tutup = posisiPenutup(seg);
      const posPad = seg.indexOf(TOKEN_SHELL);

      // Tag sudah ditutup sebelum `padding` → bukan pemiliknya, berhenti.
      if (tutup !== -1 && tutup < posPad) break;

      if (KONTROL.test(m[1])) {
        temuan.push({ rel, baris: i + 1, tag: m[1] });
      }
      break;
    }
  });
}

if (temuan.length > 0) {
  console.error(`❌ KONTROL memakai padding SHELL halaman: ${temuan.length}\n`);
  console.error(
    `   \`${TOKEN_SHELL}\` adalah padding shell halaman (32px 36px 64px),\n` +
      `   bukan padding kontrol. Dipasang di <select>/<button>, ia menghasilkan\n` +
      `   dropdown raksasa yang terlihat seperti kartu.\n`,
  );
  console.error(`   Perbaikan: \`var(--pad-tombol)\` — atau \`var(--pad-tombol-kcl)\` untuk kontrol kecil.\n`);
  for (const t of temuan) console.error(`     ${t.rel}:${t.baris}  <${t.tag}>`);
  process.exit(1);
}

console.log("✅ Nol kontrol memakai padding shell halaman");
