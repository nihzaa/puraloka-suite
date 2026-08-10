#!/usr/bin/env node
/**
 * KATALOG ALUR OTOMASI — rekomendasi yang DITURUNKAN dari sistem, bukan dikarang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DARI MANA DAFTAR INI BERASAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan dari imajinasi. Tiap alur di bawah punya pemicu yang SUDAH ADA di
 * basis, diukur 2026-08-10:
 *
 *   · 14 baris `notification_rules`, SEMUANYA aktif — invoice (dibuat, jatuh
 *     tempo, terlambat, dibayar), milestone (mendekat, selesai, terlambat),
 *     kasbon (diajukan, menunggu), material request, change order, laporan
 *     upah, deadline proyek, status proyek berubah.
 *   · 2 baris `jadwal_tugas` yang sudah jalan: `cek-tenggat` 07:00 dan
 *     `cek-milestone` 07:05.
 *   · Kanal WhatsApp DUA ARAH (kirim + webhook masuk) dan template pesan
 *     yang isinya bisa diubah tanpa deploy.
 *
 * Seed sebelumnya (`_seed-otomasi-uji.mjs`) memuat nama karangan dengan id
 * n8n palsu — berguna untuk menilai TAMPILAN, menyesatkan sebagai isi katalog.
 * Berkas ini menggantinya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SEMUANYA DIDAFTARKAN TANPA `n8n_id`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Workflow-nya BELUM dibuat di n8n, dan menuliskan id karangan akan membuat
 * katalog berbohong: alur terlihat siap jalan, tombolnya bisa ditekan, dan
 * yang dipanggil tak pernah ada. Semua masuk sebagai "belum tersambung" —
 * keadaan yang jujur, dan UI memang menyatakannya.
 *
 * Jalur webhook DIISI karena itu keputusan penamaan kita, bukan milik n8n:
 * begitu workflow-nya dibuat, path itulah yang dipasang di node Webhook.
 *
 *   node scripts/db/seed-alur-otomasi.mjs            # tambah/perbarui
 *   node scripts/db/seed-alur-otomasi.mjs --bersihkan # buang seed dummy lama
 */
import { buatClient } from './_koneksi.mjs'

/**
 * `prioritas` bukan kolom — ia urutan saran pengerjaan, ditulis di keterangan
 * supaya founder tahu mana yang paling cepat berbuah.
 */
const ALUR = [
  // ── Keuangan: paling cepat terasa, karena menyangkut uang masuk ──────────
  {
    kode: 'tagih-invoice-jatuh-tempo',
    nama: 'Pengingat invoice jatuh tempo',
    keterangan:
      'H-3, H-1, dan hari-H: kirim WhatsApp ke PIC klien beserta nomor invoice dan nominalnya. '
      + 'Sumber: notification_rules invoice_due. Ini yang paling cepat berbuah — uang masuk lebih awal '
      + 'tanpa siapa pun harus mengingat tanggal.',
    pemicu: 'jadwal', jadwal_cron: '0 8 * * 1-6', kategori: 'keuangan',
    jalur_webhook: null,
  },
  {
    kode: 'eskalasi-invoice-terlambat',
    nama: 'Eskalasi invoice terlambat',
    keterangan:
      'Lewat jatuh tempo: hari ke-3 ingatkan PIC, ke-7 naik ke manajer proyek, ke-14 ke direktur. '
      + 'Sumber: notification_rules invoice_overdue. Yang dijaga bukan pesannya — tetapi bahwa '
      + 'keterlambatan TIDAK berhenti di satu orang yang kebetulan sedang sibuk.',
    pemicu: 'jadwal', jadwal_cron: '0 9 * * 1-6', kategori: 'keuangan',
    jalur_webhook: null,
  },
  {
    kode: 'konfirmasi-invoice-dibayar',
    nama: 'Konfirmasi pembayaran diterima',
    keterangan:
      'Begitu pembayaran tercatat: kirim konfirmasi ke klien dan hentikan seluruh pengingat untuk '
      + 'invoice itu. Sumber: notification_rules invoice_paid. Tanpa ini, klien yang SUDAH bayar '
      + 'tetap ditagih — kerusakan hubungan yang jauh lebih mahal daripada invoice-nya.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/invoice-dibayar', kategori: 'keuangan',
  },

  // ── Proyek ───────────────────────────────────────────────────────────────
  {
    kode: 'ringkasan-harian-pemilik',
    nama: 'Ringkasan harian ke pemilik',
    keterangan:
      'Sore hari: progres, absensi, temuan mutu, dan pengeluaran hari itu dalam SATU pesan. '
      + 'Menggantikan kebiasaan membuka lima halaman untuk tahu keadaan. Sumber: data progress_logs, '
      + 'absensi, punch_items, project_expenses.',
    pemicu: 'jadwal', jadwal_cron: '0 18 * * 1-6', kategori: 'proyek',
    jalur_webhook: null,
  },
  {
    kode: 'peringatan-milestone-mendekat',
    nama: 'Peringatan milestone mendekat',
    keterangan:
      'H-7 dan H-3 sebelum tenggat milestone, ke PM dan mandor terkait. Sumber: notification_rules '
      + 'milestone_approaching + jadwal_tugas cek-milestone yang sudah jalan 07:05.',
    pemicu: 'jadwal', jadwal_cron: '10 7 * * *', kategori: 'proyek',
    jalur_webhook: null,
  },
  {
    kode: 'eskalasi-milestone-terlambat',
    nama: 'Eskalasi milestone terlambat',
    keterangan:
      'Milestone lewat tenggat dan belum 100%: naik ke PM, lalu direktur setelah 3 hari. '
      + 'Sumber: notification_rules milestone_overdue.',
    pemicu: 'jadwal', jadwal_cron: '15 7 * * *', kategori: 'proyek',
    jalur_webhook: null,
  },
  {
    kode: 'lapor-status-proyek-berubah',
    nama: 'Kabar perubahan status proyek',
    keterangan:
      'Status proyek berpindah (mis. jadi "dikerjakan" atau "selesai"): kabari klien dan tim inti. '
      + 'Sumber: notification_rules project_status_changed.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/status-proyek', kategori: 'proyek',
  },

  // ── Persetujuan: yang menunggu keputusan paling mahal kalau diam ─────────
  {
    kode: 'ingatkan-persetujuan-tertahan',
    nama: 'Pengingat persetujuan tertahan',
    keterangan:
      'Kasbon, material request, dan change order yang menunggu putusan lebih dari 2 hari kerja: '
      + 'ingatkan penyetujunya, sebutkan sudah berapa lama tertahan. Sumber: notification_rules '
      + 'kasbon_pending, material_request_submitted, change_order_submitted. Yang tertahan diam '
      + 'adalah biaya yang tak pernah muncul di laporan mana pun.',
    pemicu: 'jadwal', jadwal_cron: '0 10 * * 1-5', kategori: 'proyek',
    jalur_webhook: null,
  },
  {
    kode: 'teruskan-kasbon-diajukan',
    nama: 'Teruskan kasbon yang baru diajukan',
    keterangan:
      'Mandor mengajukan kasbon: teruskan ke penyetuju lewat WhatsApp dengan nominal dan alasannya, '
      + 'tanpa perlu membuka aplikasi. Sumber: notification_rules kasbon_submitted.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/kasbon-diajukan', kategori: 'mandor',
  },
  {
    kode: 'teruskan-laporan-upah',
    nama: 'Teruskan laporan upah mingguan',
    keterangan:
      'Laporan upah diajukan: kirim ringkasannya (jumlah tukang, total, selisih vs minggu lalu) ke '
      + 'penyetuju. Sumber: notification_rules wage_report_submitted.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/laporan-upah', kategori: 'mandor',
  },

  // ── Gudang & mutu ────────────────────────────────────────────────────────
  {
    kode: 'peringatan-stok-menipis',
    nama: 'Peringatan stok material menipis',
    keterangan:
      'Saldo gudang menyentuh titik pesan ulang: kabari pengadaan sebelum pekerjaan berhenti. '
      + 'Pemicunya dari mutasi stok, bukan jadwal — keterlambatan satu hari di sini menghentikan '
      + 'orang di lapangan.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/stok-menipis', kategori: 'gudang',
  },
  {
    kode: 'eskalasi-ncr-belum-ditutup',
    nama: 'Eskalasi NCR yang belum ditutup',
    keterangan:
      'Temuan ketidaksesuaian lewat tenggat penutupan: naik ke PM setelah 3 hari, ke direktur '
      + 'setelah 7. Mutu yang dibiarkan menumpuk jadi pekerjaan ulang yang dibayar dua kali.',
    pemicu: 'jadwal', jadwal_cron: '30 9 * * 1-6', kategori: 'mutu',
    jalur_webhook: null,
  },

  // ── Administrasi ─────────────────────────────────────────────────────────
  {
    kode: 'cadangkan-dokumen-final',
    nama: 'Arsip dokumen final ke penyimpanan luar',
    keterangan:
      'Dokumen berstatus final (kontrak, BAST, sertifikat) disalin ke penyimpanan luar. '
      + 'Bukan pengganti backup basis — ini supaya dokumen yang mengikat secara hukum punya '
      + 'salinan yang tak ikut hilang kalau satu sistem bermasalah.',
    pemicu: 'webhook', jalur_webhook: 'puraloka/dokumen-final', kategori: 'dokumen',
  },
  {
    kode: 'laporan-mingguan-klien',
    nama: 'Laporan mingguan ke klien',
    keterangan:
      'Setiap Sabtu: progres per proyek, foto lapangan terbaru, dan milestone terdekat, dikirim ke '
      + 'PIC klien. Yang dijaga adalah klien tak perlu BERTANYA untuk tahu — pertanyaan "gimana '
      + 'progresnya?" hampir selalu datang setelah kepercayaan mulai turun.',
    pemicu: 'jadwal', jadwal_cron: '0 16 * * 6', kategori: 'proyek',
    jalur_webhook: null,
  },
]

const db = buatClient('DIRECT_URL')
await db.connect()

const bersihkan = process.argv.includes('--bersihkan')

const { rows: c } = await db.query(`
  SELECT c.id FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
   ORDER BY c.created_at LIMIT 1`)
if (c.length === 0) {
  console.error('tak ada company ber-anggota — dihentikan')
  process.exit(1)
}
const comp = c[0].id

if (bersihkan) {
  /*
   * Hanya seed DUMMY yang dibuang, dan namanya disebut satu per satu.
   * `DELETE ... WHERE kode NOT IN (daftar baru)` akan ikut menghapus alur yang
   * didaftarkan founder lewat UI — dan yang terhapus karena "bukan bagian dari
   * seed" tak akan pernah dilaporkan siapa pun.
   */
  const DUMMY = [
    'pengingat-invoice-jatuh-tempo', 'ringkasan-harian-proyek',
    'arsip-dokumen-ke-drive', 'sinkron-absensi-mandor',
  ]
  const { rowCount } = await db.query(
    `DELETE FROM otomasi_alur WHERE company_id = $1 AND kode = ANY($2)`, [comp, DUMMY])
  console.log(`✓ ${rowCount} alur dummy dibuang`)
}

let baru = 0
let diperbarui = 0
for (const a of ALUR) {
  const { rows } = await db.query(
    `INSERT INTO otomasi_alur
       (company_id, kode, nama, keterangan, jalur_webhook, pemicu, jadwal_cron, kategori, aktif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
     ON CONFLICT (company_id, kode) DO UPDATE
       SET nama = EXCLUDED.nama,
           keterangan = EXCLUDED.keterangan,
           jalur_webhook = EXCLUDED.jalur_webhook,
           pemicu = EXCLUDED.pemicu,
           jadwal_cron = EXCLUDED.jadwal_cron,
           kategori = EXCLUDED.kategori,
           diperbarui_pada = now()
     RETURNING (xmax = 0) AS disisipkan`,
    [comp, a.kode, a.nama, a.keterangan, a.jalur_webhook ?? null,
     a.pemicu, a.jadwal_cron ?? null, a.kategori],
  )
  if (rows[0].disisipkan) baru++
  else diperbarui++
}

const { rows: total } = await db.query(
  `SELECT count(*)::int AS n,
          count(*) FILTER (WHERE n8n_id IS NULL AND jalur_webhook IS NULL)::int AS tanpa_alamat
     FROM otomasi_alur WHERE company_id = $1`, [comp])

console.log(`✓ ${baru} alur baru · ${diperbarui} diperbarui · total ${total[0].n}`)
console.log(`  ${total[0].tanpa_alamat} belum punya alamat sama sekali (pemicu jadwal — wajar)`)
console.log('\nSemua didaftarkan TANPA n8n_id: workflow-nya belum dibuat di n8n.')
console.log('UI menandainya "belum tersambung" — isi id-nya lewat tombol Ubah setelah dibuat.')

await db.end()
