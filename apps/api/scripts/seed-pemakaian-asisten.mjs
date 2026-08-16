#!/usr/bin/env node
/**
 * SEED PEMAKAIAN ASISTEN — data yang lahir dari MEMANGGIL tool, bukan INSERT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MEMANGGIL TOOL, BUKAN MENYISIPKAN BARIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-16: "bikin data dummy dulu aja, isinya semua masih data
 * dummy". Benar — dan itu membuka jalan yang tadinya tertutup.
 *
 * Tapi INSERT langsung ke `ai_token_tulis`/`pengingat_asisten` tak
 * membuktikan apa pun: barisnya ada, dan pertanyaan "apakah toolnya bekerja"
 * tetap tak terjawab. Yang dibuat justru ilusi pemakaian.
 *
 * Skrip ini memanggil tool YANG SEBENARNYA lewat `KATALOG_TOOL`. Datanya jadi
 * BYPRODUK eksekusi nyata — kalau ada tool yang rusak, ia gagal di sini, bukan
 * nanti saat founder mencoba.
 *
 * ── Yang TIDAK dilakukan
 *
 * Tak memanggil model AI. Ronde percakapan sungguhan butuh saldo, dan yang
 * diuji di sini lapisan TOOL-nya — bukan kemampuan model memilih tool.
 * Percakapan nyata tetap harus dicoba manusia.
 *
 * ── Aman dijalankan berulang
 *
 * Semua baris yang dibuat bertanda `[SEED-PAKAI]` dan dibersihkan lebih dulu.
 * Tanpa itu, menjalankan dua kali menghasilkan pengingat kembar yang membuat
 * angka "berapa yang dipakai" jadi bohong.
 *
 *     node -r dotenv/config scripts/seed-pemakaian-asisten.mjs
 *     node -r dotenv/config scripts/seed-pemakaian-asisten.mjs --bersihkan
 */
import { createTenantDb } from '../src/utils/tenant-db.js'
import { KATALOG_TOOL, jalankanTool } from '../src/lib/ai-tool.js'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const TANDA = '[SEED-PAKAI]'
const hanyaBersih = process.argv.includes('--bersihkan')

const c = buatClient()
await c.connect()

// ── Tenant & pengguna sungguhan ────────────────────────────────────────────
const { rows: t } = await c.query(`
  SELECT p.company_id, m.user_id
    FROM projects p
    JOIN company_members m ON m.company_id = p.company_id
   WHERE p.is_deleted = false
   GROUP BY p.company_id, m.user_id
   ORDER BY count(*) DESC
   LIMIT 1`)

if (t.length === 0) {
  console.error('✗ Tak ada tenant berproyek. Basis kosong?')
  process.exit(1)
}

const companyId = t[0].company_id
const userId = t[0].user_id

// ── Bersih-bersih SELALU dulu — idempoten ───────────────────────────────────
/*
 * `progress_logs` IKUT dibersihkan — jalur tulis benar-benar membuat baris di
 * modul ERP, bukan cuma token. Menjalankan skrip ini dua kali tanpa
 * membersihkannya menaruh dua catatan progres palsu di proyek sungguhan, dan
 * angka progres proyek itu jadi bohong.
 *
 * Tokennya dibersihkan lewat `hasil_id` yang menunjuk baris itu — jejak
 * niat→hasil yang memang disimpan `tulis-klaim.ts`.
 */
const hapus = await Promise.all([
  c.query(`DELETE FROM pengingat_asisten WHERE isi LIKE $1`, [`${TANDA}%`]),
  c.query(`DELETE FROM ai_ingatan WHERE nilai LIKE $1`, [`${TANDA}%`]),
  c.query(`DELETE FROM ai_token_tulis WHERE ringkasan LIKE $1`, [`%${TANDA}%`]),
  c.query(`DELETE FROM progress_logs WHERE notes LIKE $1`, [`%${TANDA}%`]),
])
console.log(
  `bersih: ${hapus[0].rowCount} pengingat, ${hapus[1].rowCount} ingatan, ` +
    `${hapus[2].rowCount} token, ${hapus[3].rowCount} catatan progres`,
)

if (hanyaBersih) {
  await c.end()
  process.exit(0)
}

const db = createTenantDb(companyId)
const izin = new Set(KATALOG_TOOL.map((x) => x.izin))
const konteks = { db, companyId, userId, izin }

/*
 * Argumen per tool — hanya yang WAJIB.
 *
 * Tool tanpa entri di sini dipanggil tanpa argumen; yang menuntut argumen
 * wajib akan menolak, dan penolakan itu justru salah satu yang diuji.
 */
const ARGUMEN = {
  rab: { proyek: 'Dago' },
  grafik_kurva_s: { proyek: 'Dago' },
  harga_satuan: { cari: 'semen' },
  hitung_pekerjaan: { pekerjaan: 'DIREKSI KEET' },
  jejak_audit: { tabel: 'kasbons' },
  simulasi_kas: { nominal: 5_000_000, keterangan: `${TANDA} uji` },
  tukang_cocok: { keahlian: 'plester' },
  ingat_percakapan: {},
  siapkan_persetujuan: { nomor: 1 },
  titip_pengingat: { isi: `${TANDA} cek stok besok`, kapan: 'besok' },
  siapkan_tulis: { jenis: 'catatan_progres', proyek: 'Dago', persen: 41 },
  titip_pesan: { kepada: 'zzz-sengaja-tak-ada', pesan: `${TANDA} uji tolak` },
}

let hijau = 0
const merah = []
const kosong = []

for (const tool of KATALOG_TOOL) {
  const arg = ARGUMEN[tool.nama] ?? {}
  try {
    const hasil = await jalankanTool(konteks, tool.nama, arg)

    if (!hasil.ok) {
      merah.push(`${tool.nama}: ${hasil.alasan} — ${hasil.pesan}`)
      continue
    }

    /*
     * `isError: true` BUKAN kegagalan skrip.
     *
     * Sebagian besar penolakan di sini justru perilaku yang benar: nomor
     * persetujuan yang tak ada, nama rekan yang sengaja dikarang. Yang
     * dicatat: apakah toolnya BERJALAN, bukan apakah ia menjawab "ya".
     */
    if (hasil.hasil.isError) {
      kosong.push(`${tool.nama}: ${hasil.hasil.isi.slice(0, 70).replace(/\s+/g, ' ')}`)
    } else {
      hijau += 1
    }
  } catch (e) {
    // Lemparan = cacat sungguhan. Tool baca tak boleh melempar; pemanggilnya
    // di produksi tak menangkapnya per-tool.
    merah.push(`${tool.nama}: MELEMPAR — ${String(e?.message ?? e).slice(0, 90)}`)
  }
}

console.log(`\n${KATALOG_TOOL.length} tool dipanggil:`)
console.log(`  ${hijau} menjawab dengan data`)
console.log(`  ${kosong.length} menolak/kosong (sebagian memang benar)`)
console.log(`  ${merah.length} GAGAL`)

if (kosong.length > 0) {
  console.log('\nMenolak/kosong:')
  for (const k of kosong) console.log(`  · ${k}`)
}

if (merah.length > 0) {
  console.error('\n✗ GAGAL — ini cacat, bukan penolakan yang benar:')
  for (const m of merah) console.error(`  · ${m}`)
  await c.end()
  process.exit(1)
}

/*
 * ── JALUR TULIS: token diterbitkan LALU diklaim ────────────────────────────
 *
 * Ini bagian yang selama ini nol, dan yang paling penting dibuktikan:
 * `ai_token_tulis` 0 dari 0 terpakai sejak fiturnya dibangun.
 *
 * Dipanggil lewat `terbitkanTokenWa` + `klaimTokenTulis` — fungsi yang SAMA
 * dengan yang dipakai WhatsApp dan tombol web. Kalau salah satunya rusak, ia
 * gagal di sini.
 *
 * Yang dipilih `catatan_progres`: satu-satunya jenis yang tak menyentuh uang
 * dan tak masuk antrean approval siapa pun. Kasbon/pengeluaran sengaja TIDAK —
 * seed tak boleh menaruh permintaan palsu di meja orang.
 */
const { terbitkanTokenWa } = await import('../src/lib/tulis-konfirmasi-wa.js')
const { klaimTokenTulis } = await import('../src/lib/tulis-klaim.js')

const diam = () => {}
let jalurTulis = 'dilewati'

const terbit = await terbitkanTokenWa(
  db,
  companyId,
  userId,
  { jenis: 'catatan_progres', argumen: { proyek: 'Dago', persen: 41, catatan: `${TANDA} uji jalur tulis` } },
  diam,
  'web',
)

if (!terbit.ok) {
  jalurTulis = `GAGAL terbit: ${terbit.pesan}`
} else {
  const { rows: tok } = await c.query(
    `SELECT token FROM ai_token_tulis
      WHERE user_id=$1 AND dipakai_pada IS NULL
      ORDER BY dibuat_pada DESC LIMIT 1`, [userId])

  if (tok.length === 0) {
    jalurTulis = 'GAGAL: token terbit tapi tak terbaca'
  } else {
    const klaim = await klaimTokenTulis({
      db, userId, izin: new Set(['ai:tulis']), token: tok[0].token, catatGalat: diam,
    })
    jalurTulis = klaim.ok
      ? `berhasil — ${klaim.jenis} tersimpan (id ${String(klaim.id).slice(0, 8)})`
      : `GAGAL klaim: ${klaim.sebab} — ${klaim.pesan}`
  }
}

console.log(`\njalur tulis: ${jalurTulis}`)
if (jalurTulis.startsWith('GAGAL')) {
  await c.end()
  process.exit(1)
}

/*
 * ── INGATAN: disimpan, lalu DIBACA lewat jalur yang dipakai prompt ─────────
 *
 * `ai_ingatan` 0 baris sejak dibangun. Ia disisipkan langsung (rutenya
 * menuntut sesi login), TETAPI dibaca kembali lewat `bacaIngatan()` — fungsi
 * yang sama dengan yang menyusun blok ingatan di prompt.
 *
 * Jadi yang dibuktikan bukan "barisnya ada", melainkan "penyaringan lapis,
 * izin, dan proyek benar-benar meloloskannya".
 */
await c.query(
  `INSERT INTO ai_ingatan (company_id, user_id, lapis, kunci, nilai, izin_minimum)
   VALUES ($1, $2, 'pribadi', 'gaya-laporan', $3, NULL),
          ($1, NULL, 'bersama', 'jam-rapat-mingguan', $4, NULL)`,
  [
    companyId,
    userId,
    `${TANDA} Suka ringkasan pendek, angka dulu baru penjelasan.`,
    `${TANDA} Rapat proyek tiap Senin pagi.`,
  ],
)

const { bacaIngatan, susunBlokIngatan } = await import('../src/lib/ai-ingatan.js')
const ingatan = await bacaIngatan(db, {
  userId,
  izin: new Set(KATALOG_TOOL.map((x) => x.izin)),
  catatGalat: diam,
})
const blok = susunBlokIngatan(ingatan)

const ingatanOk = ingatan.length >= 2 && blok.includes(TANDA)
console.log(
  `ingatan     : ${ingatan.length} terbaca lewat bacaIngatan()` +
    (ingatanOk ? ' — masuk blok prompt' : '  ⚠ TAK masuk blok prompt'),
)

if (!ingatanOk) {
  console.error('✗ Ingatan tersimpan tetapi tak terbaca jalur prompt — itu cacat.')
  await c.end()
  process.exit(1)
}

// ── Jejak pemakaian yang tertinggal ────────────────────────────────────────
const { rows: sisa } = await c.query(
  `SELECT (SELECT count(*)::int FROM pengingat_asisten WHERE isi LIKE $1) pengingat,
          (SELECT count(*)::int FROM ai_token_tulis) token,
          (SELECT count(*)::int FROM ai_token_tulis WHERE dipakai_pada IS NOT NULL) terpakai`,
  [`${TANDA}%`],
)
console.log(
  `\njejak tersimpan: ${sisa[0].pengingat} pengingat · ` +
    `${sisa[0].token} token tulis (${sisa[0].terpakai} terpakai)`,
)
console.log(`bersihkan: node -r dotenv/config scripts/seed-pemakaian-asisten.mjs --bersihkan`)

await c.end()
