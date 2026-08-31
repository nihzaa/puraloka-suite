#!/usr/bin/env node
/**
 * audit-peran-tak-kelebihan.mjs — ambang NOL
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-29: peran `client` — PIHAK LUAR yang membayar kontraktor —
 * memegang lima izin yang membuka pembukuan perusahaan:
 *
 *     gl:view            bagan akun, jurnal, buku besar
 *     gudang:susut:view  rencana susut per material  ← MARGIN kontraktor
 *     assets:view        register aset, penyusutan, sewa alat
 *     gudang:view        isi gudang + riwayat pergerakan
 *     finance:view       dashboard keuangan, invoice, kasbon karyawan
 *
 * Dan `mandor` — pekerja lapangan — memegang empat dari lima yang sama,
 * padahal `mandor-portal` (18 halaman) tak memanggil satu pun rute
 * `gl`/`assets`/`finance`. Diukur: nol pemanggilan.
 *
 * ── Kenapa middleware tidak cukup
 *
 * Middleware Next.js menahan klien di `/portal`. Tapi itu menjaga HALAMAN,
 * bukan API. Rute GL dijaga hanya `requirePermission('gl:view')` — tak ada
 * pemeriksaan peran tambahan. Klien yang memanggil `GET /api/v1/gl/…` dengan
 * tokennya sendiri menerima buku besar, dan tak satu pun galat muncul.
 *
 * ── Kenapa harus penjaga, bukan cukup migrasi 526
 *
 * Migrasi memperbaiki keadaan HARI INI. Yang mengembalikannya cukup satu baris
 * `INSERT INTO role_permissions` di seed, migrasi berikutnya, atau UI
 * pengaturan peran — dan kebocorannya tak mengeluarkan gejala apa pun. Yang
 * bocor bukan sesuatu yang terlihat di layar orang dalam; ia terlihat di layar
 * PELANGGAN, yang tak akan melapor bahwa ia melihat terlalu banyak.
 *
 * ── Yang TIDAK dijaga di sini
 *
 * Penjaga ini tidak menuntut peran punya izin tertentu — hanya melarang dua
 * peran memegang izin yang salah. Menambah tuntutan "peran X wajib punya Y"
 * akan merah setiap kali tenant mengurasi perannya sendiri, dan peran adalah
 * data konfigurasi per-tenant (ADR-004).
 *
 * Ambang NOL — di company MANA PUN, termasuk template.
 */
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error('❌ DIRECT_URL/DATABASE_URL kosong — penjaga tak mengukur apa pun.')
  console.error('   Nol temuan tanpa koneksi BUKAN bukti tak ada pelanggaran.')
  process.exit(1)
}

/**
 * Peran → izin yang TIDAK BOLEH dipegangnya, dengan alasan yang bisa dibaca
 * orang yang menemukan penjaga ini merah tanpa konteks.
 */
const TERLARANG = [
  ['client', 'gl:view', 'buku besar perusahaan — klien adalah pihak luar'],
  ['client', 'assets:view', 'register aset & penyusutan perusahaan'],
  ['client', 'gudang:view', 'stok & pergerakan material lintas proyek'],
  ['client', 'gudang:susut:view', 'rencana susut = MARGIN kontraktor'],
  ['client', 'finance:view', 'dashboard keuangan termasuk kasbon karyawan'],
  ['mandor', 'gl:view', 'buku besar — tak dipakai mandor-portal (diukur: nol)'],
  ['mandor', 'assets:view', 'register aset — tak dipakai mandor-portal'],
  ['mandor', 'gudang:susut:view', 'margin material — tak dipakai mandor-portal'],
  ['mandor', 'finance:view', 'dashboard keuangan — tak dipakai mandor-portal'],

  /*
    PM tak boleh MEMINDAHKAN atau MENYETUJUI uang — ditambahkan 2026-08-31.

    Cacatnya nyata dan besar. Migrasi 050 memberi PM "semua izin kecuali
    sepuluh", dan izin keuangan tak ada di sepuluh larangan itu — sebagian
    karena BELUM LAHIR saat 050 ditulis. Akibatnya pemberian borongan itu
    menyerap tiap izin keuangan baru secara diam-diam.

    Diukur dengan memutar ulang pemberian 050 di transaksi yang dibatalkan:
    EMPAT BELAS izin uang masuk ke pm, di 72 tenant. Ditutup migrasi 550.

    Kenapa dijaga di sini, bukan cukup dengan migrasinya: 550 memperbaiki
    yang SUDAH ada. Yang tak dijaga adalah izin keuangan BERIKUTNYA yang
    belum lahir hari ini — dan bentuk pemberian "semua kecuali sepuluh"
    akan menyerapnya lagi dengan cara yang sama persis.

    R-017 memutuskan PM dapat 19 izin LAPANGAN (migrasi 545). Yang dilarang
    di sini hanya yang menyentuh uang dan kewenangan.
  */
  ['pm', 'klaim:bayar', 'membayar klaim — memindahkan uang'],
  ['pm', 'klaim:setujui', 'menyetujui klaim — kewenangan finansial'],
  ['pm', 'finance:invoice:create', 'menerbitkan tagihan ke klien'],
  ['pm', 'finance:invoice:pay', 'mencatat pembayaran masuk — memindahkan uang'],
  ['pm', 'finance:termin:pay', 'membayar termin — memindahkan uang'],
  ['pm', 'finance:penalty:waive', 'memutihkan denda — mengurangi tagihan'],
  ['pm', 'mandor:kasbon:approve', 'menyetujui uang muka mandor'],
  ['pm', 'mandor:wage:approve', 'menyetujui upah — memindahkan uang'],
  ['pm', 'backcharge:setujui', 'memotong pembayaran subkontraktor'],
  ['pm', 'change_order:approve', 'MENGUBAH NILAI KONTRAK, rutenya nol ambang nominal'],
  ['pm', 'cash:expense:approve', 'menyetujui pengeluaran kas'],
  ['pm', 'cash:transfer:confirm', 'mengonfirmasi transfer kas'],
  ['pm', 'approval:chains:manage', 'mengubah SIAPA menyetujui apa'],
  ['pm', 'settings:finance:manage', 'mengubah konfigurasi finansial (PPN, retensi)'],
  ['pm', 'users:roles:manage', 'memberi peran — bisa memberi dirinya sendiri apa saja'],
]

/* Izin yang sengaja TAK dipegang siapa pun. Bukan kelalaian — keputusan. */
const KOSONG = [
  ['approval:override_sod', 'menyetujui pengajuan SENDIRI — membatalkan pemisahan tugas'],
  ['mitra:daftar_hitam', 'menutup penghidupan orang — lewat proses, bukan satu klik'],
]

const c = new pg.Client({ connectionString: url })
await c.connect()

const temuan = []

for (const [peran, key, sebab] of TERLARANG) {
  const { rows } = await c.query(
    `SELECT count(*)::int n,
            count(*) FILTER (WHERE r.company_id IS NULL)::int tmpl
       FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE r.name = $1 AND p.key = $2`,
    [peran, key]
  )
  if (rows[0].n > 0) {
    temuan.push(
      `${peran}.${key} — ${rows[0].n} baris` +
        (rows[0].tmpl ? ' (TERMASUK template)' : '') +
        `\n        ${sebab}`
    )
  }
}

for (const [key, sebab] of KOSONG) {
  const { rows } = await c.query(
    `SELECT count(*)::int n FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = $1`,
    [key]
  )
  if (rows[0].n > 0) {
    temuan.push(`${key} dipegang ${rows[0].n} peran — seharusnya NOL\n        ${sebab}`)
  }
}

/* Berapa yang diperiksa — nol pemeriksaan terbaca sama dengan nol pelanggaran. */
const { rows: [{ n: nPeran }] } = await c.query(
  `SELECT count(*)::int n FROM roles WHERE name IN ('client','mandor')`
)
await c.end()

console.log('══ Peran tak boleh kelebihan izin ═════════════════════════════')
console.log('  aturan diperiksa :', TERLARANG.length + KOSONG.length)
console.log('  baris peran      :', nPeran, '(client + mandor, semua company)')
console.log('  pelanggaran      :', temuan.length)

if (nPeran === 0) {
  console.error('\n❌ NOL baris peran terbaca — kueri meleset, bukan basis yang bersih.')
  process.exit(1)
}

if (temuan.length > 0) {
  console.error(`\n❌ ${temuan.length} pelanggaran:`)
  for (const t of temuan) console.error('     ·', t)
  console.error(`
   Peran ini memegang izin yang membuka data di luar wewenangnya. Middleware
   TIDAK menahannya: ia menjaga halaman web, sementara rute API dijaga
   permission saja — pemanggilan langsung ke /api/v1/… akan dijawab.

   Perbaikan: cabut lewat migrasi maju (pola 526), bukan lewat UI — supaya
   berlaku juga untuk tenant yang sudah ada, dan tercatat alasannya.`)
  process.exit(1)
}

console.log('\n✅ Nol peran memegang izin di luar wewenangnya.')
