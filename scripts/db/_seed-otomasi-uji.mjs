#!/usr/bin/env node
/**
 * SEED katalog otomasi — data dummy untuk menilai UI-nya.
 *
 * Halaman kosong tak bisa dinilai: yang paling mudah rusak justru baris yang
 * PENUH — nama panjang, pesan galat berbaris-baris, kolom waktu yang tak
 * berbaris. Seed ini sengaja memuat ketiganya.
 *
 * Aman diulang: memakai kode yang stabil dan ON CONFLICT DO NOTHING.
 *
 *   node scripts/db/_seed-otomasi-uji.mjs
 */
import { buatClient } from './_koneksi.mjs'

const ALUR = [
  {
    kode: 'pengingat-invoice-jatuh-tempo',
    nama: 'Pengingat invoice jatuh tempo',
    keterangan: 'Mengirim WhatsApp ke PIC klien H-3, H-1, dan pada hari jatuh tempo.',
    pemicu: 'jadwal', jadwal_cron: '0 8 * * *', kategori: 'keuangan',
    n8n_id: 'wf-inv-due-001', aktif: true,
  },
  {
    kode: 'ringkasan-harian-proyek',
    nama: 'Ringkasan harian proyek ke pemilik',
    keterangan: 'Progres, absensi, dan temuan mutu kemarin dalam satu pesan.',
    pemicu: 'jadwal', jadwal_cron: '0 18 * * 1-6', kategori: 'proyek',
    n8n_id: 'wf-daily-002', aktif: true,
  },
  {
    kode: 'peringatan-stok-menipis',
    nama: 'Peringatan stok material menipis',
    keterangan: 'Dipicu saat saldo gudang menyentuh titik pesan ulang.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/stok-menipis', kategori: 'gudang',
    n8n_id: 'wf-stock-003', aktif: true,
  },
  {
    kode: 'arsip-dokumen-ke-drive',
    nama: 'Arsip dokumen kontrak ke Google Drive',
    keterangan: 'Menyalin dokumen berstatus final. NONAKTIF sementara — kredensial Drive kedaluwarsa.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/arsip-dokumen', kategori: 'dokumen',
    n8n_id: 'wf-arsip-005', aktif: false,
  },
  {
    kode: 'sinkron-absensi-mandor',
    nama: 'Sinkron absensi mandor dari perangkat lapangan',
    // Sengaja TANPA n8n_id: alur yang didaftarkan sebelum dibuat di n8n
    // adalah keadaan sah, dan UI harus menyatakannya — bukan menampilkannya
    // seolah siap dijalankan.
    pemicu: 'manual', kategori: 'lapangan', aktif: true,
  },
]

/** Jejak: sukses, gagal ber-pesan panjang, dan yang masih 'jalan'. */
const JEJAK = {
  'pengingat-invoice-jatuh-tempo': [
    { status: 'sukses', sumber: 'jadwal', durasi_ms: 1_842, menitLalu: 60 },
    { status: 'sukses', sumber: 'jadwal', durasi_ms: 2_104, menitLalu: 1_500 },
    { status: 'sukses', sumber: 'manual', durasi_ms: 1_690, menitLalu: 2_940 },
  ],
  'ringkasan-harian-proyek': [
    { status: 'sukses', sumber: 'jadwal', durasi_ms: 12_483, menitLalu: 300 },
  ],
  'peringatan-stok-menipis': [
    {
      status: 'gagal', sumber: 'peristiwa', durasi_ms: 15_002, menitLalu: 45,
      pesan:
        'Tak ada jawaban dalam 15 detik — periksa apakah instance n8n hidup dan ' +
        'jalur webhook "puraloka/stok-menipis" masih terpasang di alur yang aktif.',
    },
    { status: 'sukses', sumber: 'peristiwa', durasi_ms: 934, menitLalu: 1_200 },
  ],
}

const db = buatClient()
await db.connect()

const { rows: c } = await db.query(`
  SELECT c.id FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
   ORDER BY c.created_at LIMIT 1`)
if (c.length === 0) {
  console.error('tak ada company ber-anggota — seed dilewati')
  process.exit(1)
}
const comp = c[0].id

for (const a of ALUR) {
  await db.query(
    `INSERT INTO otomasi_alur
       (company_id, kode, nama, keterangan, n8n_id, jalur_webhook, pemicu, jadwal_cron, kategori, aktif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (company_id, kode) DO NOTHING`,
    [comp, a.kode, a.nama, a.keterangan ?? null, a.n8n_id ?? null, a.jalur_webhook ?? null,
     a.pemicu, a.jadwal_cron ?? null, a.kategori, a.aktif],
  )
}

for (const [kode, jejak] of Object.entries(JEJAK)) {
  const { rows } = await db.query(
    `SELECT id FROM otomasi_alur WHERE company_id = $1 AND kode = $2`, [comp, kode])
  if (rows.length === 0) continue
  const alurId = rows[0].id

  const { rows: sudah } = await db.query(
    `SELECT count(*)::int AS n FROM otomasi_jalan WHERE alur_id = $1`, [alurId])
  if (sudah[0].n > 0) continue

  for (const j of jejak) {
    const mulai = new Date(Date.now() - j.menitLalu * 60_000)
    const selesai = j.status === 'jalan' ? null
      : new Date(mulai.getTime() + (j.durasi_ms ?? 0))
    await db.query(
      `INSERT INTO otomasi_jalan
         (company_id, alur_id, status, sumber, dimulai_pada, selesai_pada, durasi_ms, pesan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [comp, alurId, j.status, j.sumber, mulai.toISOString(),
       selesai?.toISOString() ?? null, j.durasi_ms ?? null, j.pesan ?? null],
    )
  }

  // Kesehatan diturunkan dari jejaknya — sama seperti `segarkanKesehatanAlur`
  // di kode, supaya seed tak menciptakan keadaan yang mustahil (mis. "sehat"
  // padahal jalan terakhirnya gagal).
  await db.query(
    `UPDATE otomasi_alur a SET
       kesehatan = CASE t.status WHEN 'sukses' THEN 'sehat'
                                 WHEN 'gagal'  THEN 'gagal'
                                 ELSE 'jalan' END,
       kesehatan_pada  = now(),
       jalan_terakhir  = t.dimulai_pada,
       sukses_terakhir = (SELECT max(dimulai_pada) FROM otomasi_jalan
                           WHERE alur_id = a.id AND status = 'sukses'),
       gagal_terakhir  = (SELECT max(dimulai_pada) FROM otomasi_jalan
                           WHERE alur_id = a.id AND status = 'gagal'),
       pesan_gagal     = CASE WHEN t.status = 'gagal' THEN t.pesan ELSE NULL END
     FROM (SELECT status, dimulai_pada, pesan FROM otomasi_jalan
            WHERE alur_id = $1 ORDER BY dimulai_pada DESC LIMIT 1) t
    WHERE a.id = $1`,
    [alurId],
  )
}

const { rows: hitung } = await db.query(
  `SELECT (SELECT count(*) FROM otomasi_alur  WHERE company_id = $1) AS alur,
          (SELECT count(*) FROM otomasi_jalan WHERE company_id = $1) AS jalan`, [comp])
console.log(`✓ katalog otomasi: ${hitung[0].alur} alur, ${hitung[0].jalan} jejak jalan`)
await db.end()
