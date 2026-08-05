#!/usr/bin/env node
/**
 * PENJAGA BENTUK BALASAN — kunci yang dibaca web harus benar-benar
 * dikirim API.
 *
 * ── Bug yang melahirkan penjaga ini
 *
 * `GET /api/v1/projects` mengembalikan `{ total, projects }`. Lima
 * halaman membacanya sebagai `r.data?.data ?? []`:
 *
 *     app/(dashboard)/lapangan/inspeksi/page.tsx
 *     app/(dashboard)/lapangan/punch-list/page.tsx
 *     app/(dashboard)/lapangan/submittal/page.tsx
 *     app/(dashboard)/kontrak/rfi/page.tsx
 *     app/(dashboard)/estimasi/page.tsx
 *
 * `r.data.data` selalu `undefined`, jadi `?? []` menghasilkan daftar
 * kosong — dan pemilih proyek di lima modul lapangan itu KOSONG BAGI
 * SIAPA PUN, selamanya. Tombol di sebelahnya mati. Modulnya tak bisa
 * dipakai sama sekali.
 *
 * Yang membuatnya bertahan bukan kesulitan teknis, melainkan bahwa
 * kegagalannya menyamar sebagai keadaan sah: "belum ada proyek" adalah
 * kalimat yang masuk akal, jadi tak ada yang curiga. Kelas yang sama
 * dengan `(logs ?? [])` di /aset yang menyembunyikan query gagal.
 *
 * ── Yang diperiksa
 *
 * Untuk setiap `api.get("<path literal>")` di web, cari handler-nya di
 * `apps/api/src/routes/v1/`, baca kunci puncak yang dikembalikan, lalu
 * bandingkan dengan kunci yang dibaca web di baris-baris berikutnya.
 *
 * Hanya path LITERAL tanpa template — path bertemplat butuh penyelesaian
 * rute yang tak bisa dilakukan andal secara statis, dan penjaga yang
 * menebak akan menghasilkan alarm palsu yang membuat dirinya diabaikan.
 *
 * Pakai: node scripts/uji-bentuk-balasan.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

/**
 * Akar rute API — dicari, tidak diasumsikan dari `cwd`.
 *
 * Versi lama menghitungnya sebagai `cwd/../api/...` lalu `exit(0)` bila tak
 * ketemu. Dijalankan dari akar repo, ia mencetak "penjaga dilewati" dan
 * LOLOS HIJAU tanpa memeriksa satu berkas pun — penjaga yang mati diam-diam
 * adalah persis jenis kegagalan yang penjaga ini dibuat untuk menangkap.
 *
 * Kini dicoba dari beberapa titik, dan kalau benar-benar tak ada ia GAGAL —
 * karena "tak ketemu" berarti penjaganya rusak, bukan berarti kodenya bersih.
 */
const KANDIDAT = [
  join(process.cwd(), "..", "api", "src", "routes", "v1"),
  join(process.cwd(), "apps", "api", "src", "routes", "v1"),
  join(process.cwd(), "..", "..", "apps", "api", "src", "routes", "v1"),
];
const AKAR_API = KANDIDAT.find((p) => existsSync(p));

if (!AKAR_API) {
  console.error("❌ Direktori rute API tak ditemukan di satu pun kandidat:");
  for (const p of KANDIDAT) console.error("   " + p);
  console.error("   Penjaga tak bisa memeriksa apa pun — ini kegagalan, bukan izin lewat.");
  process.exit(1);
}

/** Kunci puncak yang dikembalikan tiap path literal, dari kode API. */
function petaBentukApi() {
  const peta = new Map();

  for (const berkas of readdirSync(AKAR_API)) {
    if (!berkas.endsWith(".ts") || berkas.endsWith(".test.ts")) continue;
    const teks = readFileSync(join(AKAR_API, berkas), "utf8");

    // `app.get('/api/v1/xxx', ...)` — hanya GET, hanya path tanpa `:param`.
    const rx = /app\.get(?:<[^>]*>)?\(\s*'(\/api\/v1\/[^':]+)'/g;
    let m;
    while ((m = rx.exec(teks))) {
      const path = m[1];
      // Badan handler: dari posisi cocok sampai `app.` berikutnya.
      const mulai = m.index;
      const berikut = teks.indexOf("\n  app.", mulai + 10);
      const badan = teks.slice(mulai, berikut === -1 ? teks.length : berikut);

      // Kunci puncak balasan.
      //
      // DUA bentuk harus ditangkap, dan versi pertama penjaga ini hanya
      // menangkap satu:
      //
      //     return { assignments: x }
      //     return reply.send({ assignments: x })      ← terlewat
      //
      // Akibatnya `/api/v1/mandor/assignments` terpetakan dari `return {}`
      // milik HELPER di dalam handler, dan kunci `assignments` yang sah
      // dilaporkan sebagai hantu. Penjaga yang petanya tak lengkap
      // berbohong dengan percaya diri — persis kegagalan yang ia cari.
      const kunci = new Set();
      const rxRet = /return\s+(?:reply\.(?:status\(\d+\)\.)?send\(\s*)?\{([^}]*)\}/g;
      let r;
      while ((r = rxRet.exec(badan))) {
        for (const bagian of r[1].split(",")) {
          const nama = bagian.trim().split(":")[0].trim();
          if (/^[a-z_][a-z0-9_]*$/i.test(nama)) kunci.add(nama);
        }
      }
      // `error` muncul di balasan galat, bukan bentuk sukses — kalau
      // dianggap kunci sah ia menutupi ketidakcocokan yang sungguhan.
      kunci.delete("error");
      if (kunci.size) peta.set(path, kunci);
    }
  }
  return peta;
}

const API = petaBentukApi();

// Sisi web diturunkan dari akar API yang sudah ditemukan, BUKAN dari `cwd` —
// supaya penjaga ini memberi hasil yang sama dijalankan dari mana pun. Versi
// lama memakai `app components` relatif dan meledak di akar repo.
const AKAR_WEB = join(AKAR_API, "..", "..", "..", "..", "web");
const berkasWeb = execSync(`grep -rl "api.get(" app components --include=*.tsx`, {
  encoding: "utf8",
  cwd: AKAR_WEB,
}).trim().split("\n").filter(Boolean).map((f) => join(AKAR_WEB, f));

const temuan = [];

for (const f of berkasWeb) {
  const baris = readFileSync(f, "utf8").split(/\r?\n/);

  for (let i = 0; i < baris.length; i++) {
    // Hanya path literal — template string dilewati dengan sengaja.
    const m = baris[i].match(/api\.get(?:<[^>]*>)?\(\s*"(\/api\/v1\/[^"$]+)"/);
    if (!m) continue;

    const bentuk = API.get(m[1]);
    if (!bentuk) continue;              // path tak dikenali → diam

    // ── Hanya panggilan TUNGGAL yang diperiksa.
    //
    // Versi pertama penjaga ini memindai 10 baris setelah tiap panggilan
    // dan mencocokkan setiap `r.data.x` yang ditemukan. Hasilnya 25
    // temuan, SEMUANYA palsu: di dalam `Promise.all([...])` ada beberapa
    // panggilan berdampingan, dan hasilnya di-destructure jadi nama
    // berbeda (`[ur, pr]`). Jendela itu mencampur pembacaan milik satu
    // panggilan dengan path milik panggilan lain — mis. melaporkan
    // "/api/v1/users membaca .projects".
    //
    // Memasangkan hasil destructured ke panggilannya butuh analisis alur
    // yang tak bisa dilakukan andal dengan regex. Dan penjaga yang
    // memberi 25 alarm palsu tidak menghasilkan 25 perbaikan — ia
    // menghasilkan penjaga yang dimatikan.
    //
    // Jadi cakupannya dipersempit ke bentuk yang TIDAK ambigu:
    //
    //     api.get("/path").then((r) => ... r.data.kunci ...)
    //     const r = await api.get("/path");  ... r.data.kunci
    //
    // Panggilan di dalam `Promise.all` sengaja dilewati. Cakupan yang
    // lebih sempit tapi jujur mengalahkan cakupan luas yang berisik —
    // dan bug yang melahirkan penjaga ini justru berbentuk panggilan
    // tunggal, jadi kelas itu tetap terjaga.
    const dalamPromiseAll = baris
      .slice(Math.max(0, i - 4), i)
      .some((b) => /Promise\.all\(\s*\[/.test(b));
    if (dalamPromiseAll) continue;

    // Jendela BERHENTI di `api.get` berikutnya.
    //
    // `estimasi/page.tsx:172-173` memuat dua panggilan berurutan yang
    // sama-sama memakai nama hasil `r`. Tanpa batas ini, pembacaan
    // `r.data.data` milik `/cecep/editions` di baris 173 terhitung
    // sebagai milik `/projects` di baris 172 — dan dilaporkan sebagai
    // ketidakcocokan yang sebenarnya tidak ada.
    const mentah = baris.slice(i + 1, i + 8);
    const batas = mentah.findIndex((b) => /api\.get\s*[<(]/.test(b));
    const jendela = [baris[i], ...(batas === -1 ? mentah : mentah.slice(0, batas))].join("\n");
    const namaHasil =
      jendela.match(/\.then\(\s*\(?\s*([A-Za-z_$][\w$]*)/)?.[1] ??
      baris[i].match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+api\.get/)?.[1];
    if (!namaHasil) continue;

    const rxBaca = new RegExp(`\\b${namaHasil}\\.data\\??\\.([a-z_][a-z0-9_]*)`, "gi");
    let b;
    while ((b = rxBaca.exec(jendela))) {
      const kunci = b[1];
      if (bentuk.has(kunci)) continue;
      temuan.push({
        di: `${f}:${i + 1}`,
        path: m[1],
        dibaca: kunci,
        tersedia: [...bentuk].join(", "),
      });
    }
  }
}

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} pembacaan kunci yang TIDAK dikirim API.\n`);
  console.error("   Ini tak pernah melempar galat — `?? []` mengubahnya jadi");
  console.error("   daftar kosong yang terbaca sebagai \"belum ada data\".\n");
  for (const t of temuan) {
    console.error(`   ${t.di}`);
    console.error(`      ${t.path} membaca .${t.dibaca}, yang dikirim: ${t.tersedia}\n`);
  }
  process.exit(1);
}

console.log(`✅ Bentuk balasan: ${API.size} path API dipetakan · nol kunci hantu`);
