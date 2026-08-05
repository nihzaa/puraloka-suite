#!/usr/bin/env node
/**
 * UKUR TERPOTONG — isi yang jatuh di luar wadahnya dan tak pernah
 * terlihat.
 *
 * ── Kenapa perlu diukur, bukan dilihat
 *
 * Widget arus kas di /dashboard memuat grafik 200px + legenda + tiga
 * metrik ringkasan, tapi tinggi gridnya `h: 5`. Baris metriknya jatuh
 * 46px di luar wadah, dan `overflow: hidden` menyembunyikannya TANPA
 * scrollbar — jadi tak ada satu pun petunjuk bahwa ada yang hilang.
 *
 * Angka yang tak pernah terbaca: Pemasukan Rp 651 Jt · Pengeluaran est.
 * Rp 39 Jt · Selisih +Rp 613 Jt — persis ringkasan yang jadi alasan
 * orang membuka widget itu.
 *
 * Memandangi tangkapan layar tak menemukan ini dengan andal: yang
 * terlihat cuma "grafik berakhir agak mendadak". Yang menemukannya
 * adalah membandingkan `scrollHeight` dengan `clientHeight`.
 *
 * ── Yang dikecualikan
 *
 * Wadah yang memang BOLEH bergulir — sidebar, area tabel, apa pun
 * dengan `overflow: auto/scroll`. Di situ isi yang melebihi wadah bukan
 * cacat; itu rancangan, dan scrollbar memberi tahu pemakainya.
 *
 * Yang dilaporkan hanya `overflow: hidden` — tempat isi hilang diam-diam.
 *
 * Pakai:
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/ukur-terpotong.mjs
 */
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const BASIS = process.env.LAYAR_BASIS ?? "http://localhost:3000";
const EMAIL = process.env.LAYAR_EMAIL;
const SANDI = process.env.LAYAR_SANDI;
const GELAP = process.argv.includes("--gelap");

/** Ambang: di bawah ini biasanya pembulatan sub-piksel, bukan cacat. */
const AMBANG_PX = 12;

function halamanDariBerkas() {
  const akar = join(process.cwd(), "apps", "web", "app");
  const hasil = [];
  const telusuri = (dir, rute) => {
    for (const isi of readdirSync(dir, { withFileTypes: true })) {
      if (isi.isDirectory()) {
        if (isi.name.startsWith("[") || isi.name.startsWith("_")) continue;
        telusuri(join(dir, isi.name), rute + (isi.name.startsWith("(") ? "" : `/${isi.name}`));
      } else if (isi.name === "page.tsx") {
        hasil.push(rute || "/");
      }
    }
  };
  telusuri(akar, "");
  return [...new Set(hasil)].sort();
}

const peramban = await chromium.launch();
const konteks = await peramban.newContext({ viewport: { width: 1600, height: 1000 } });
await konteks.addInitScript((g) => localStorage.setItem("theme", g ? "dark" : "light"), GELAP);
const hal = await konteks.newPage();

if (EMAIL && SANDI) {
  await hal.goto(`${BASIS}/login`, { waitUntil: "networkidle" });
  await hal.waitForSelector("#login-email", { timeout: 15_000 });
  await hal.fill("#login-email", EMAIL);
  await hal.fill("#login-password", SANDI);
  await hal.click('button[type="submit"]');
  await hal.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25_000 }).catch(() => {});
} else {
  console.log("⚠️  LAYAR_EMAIL/LAYAR_SANDI tak diisi — hanya halaman publik yang terukur.\n");
}

const temuan = [];

for (const url of halamanDariBerkas()) {
  await hal.goto(`${BASIS}${url}`, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
  await hal.waitForTimeout(1400);

  const potong = await hal.evaluate((ambang) => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const g = getComputedStyle(el);
      const sembunyi = g.overflowY === "hidden" || g.overflow === "hidden";
      if (!sembunyi) continue;
      if (el.clientHeight < 60) continue;                  // terlalu kecil untuk berarti
      const lebih = el.scrollHeight - el.clientHeight;
      if (lebih < ambang) continue;
      // Abaikan yang isinya memang panjang tak terbatas (daftar, tabel).
      if (lebih > el.clientHeight) continue;

      // ── Ada ANAK yang bisa digulir → isinya tetap terjangkau.
      //
      // Sidebar memakai `overflow: hidden` untuk memotong sudut membulat,
      // sementara daftar menunya digulir oleh anak di dalamnya. Tanpa
      // pengecualian ini alat melaporkannya "606px tersembunyi" di SETIAP
      // halaman — 23 dari 46 temuan awal, semuanya palsu, dan alat yang
      // separuh temuannya palsu berhenti dipercaya.
      const adaAnakBergulir = [...el.querySelectorAll("*")].some((x) => {
        const s = getComputedStyle(x);
        return (s.overflowY === "auto" || s.overflowY === "scroll") &&
               x.scrollHeight > x.clientHeight;
      });
      if (adaAnakBergulir) continue;
      out.push({
        potong: lebih,
        teks: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 56),
      });
    }
    // Yang terdalam saja — induk ikut terhitung kalau anaknya terpotong.
    return out.sort((a, b) => b.potong - a.potong).slice(0, 3);
  }, AMBANG_PX);

  for (const p of potong) temuan.push({ url, ...p });
}

await peramban.close();

if (temuan.length === 0) {
  console.log(`✅ Terpotong: nol isi yang hilang di balik \`overflow: hidden\` (mode ${GELAP ? "gelap" : "terang"})`);
} else {
  console.log(`\n⚠️  ${temuan.length} isi terpotong (mode ${GELAP ? "gelap" : "terang"}):\n`);
  for (const t of temuan) {
    console.log(`   ${t.url}  —  ${t.potong}px tersembunyi`);
    console.log(`      "${t.teks}"\n`);
  }
  console.log("   `overflow: hidden` menyembunyikan tanpa scrollbar, jadi tak ada");
  console.log("   satu pun petunjuk bagi pemakai bahwa ada yang hilang.\n");
}
