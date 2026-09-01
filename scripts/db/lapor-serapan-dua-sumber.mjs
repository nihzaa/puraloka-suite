#!/usr/bin/env node
/**
 * Berapa BEDANYA kalau kasbons ikut dihitung sebagai realisasi?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LAPORAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `RATIFIKASI-2.9` menunggu satu keputusan founder: apakah `analisaProyek`
 * ikut menghitung `kasbons` sebagai serapan anggaran?
 *
 * Itu keputusan bisnis, bukan teknis — ia mengubah angka yang tampil di
 * layar Portofolio Biaya dan yang dipakai otomasi 2.9 mengirim peringatan.
 *
 * Tetapi keputusan bisnis pun lebih baik diambil dari ANGKA daripada dari
 * konsep. Laporan ini menyandingkan keduanya per proyek supaya bedanya
 * terlihat, bukan dibayangkan.
 *
 * ── Yang dibandingkan
 *
 *   sekarang   project_expenses berstatus approved  (satu-satunya sumber)
 *   usulan     + kasbons yang sudah dicairkan
 *
 * ── Kenapa ini bukan sekadar penasaran
 *
 * Diukur 2026-08-16: `project_expenses` NOL baris, sementara kasbons memuat
 * Rp 545 juta di 11 proyek — satu di antaranya 45% dari nilai kontraknya.
 * Otomasi 2.9 apa adanya akan melaporkan 0% untuk proyek yang sebenarnya
 * sudah menyerap hampir separuh anggaran.
 *
 * Angka di bawah diukur ULANG tiap kali skrip ini dijalankan; yang di atas
 * bisa saja sudah basi.
 *
 *     node scripts/db/lapor-serapan-dua-sumber.mjs
 */
import { buatClient } from './_koneksi.mjs'

const c = buatClient()
await c.connect()

const rp = (n) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n ?? 0))

try {
  /*
    Status kasbon yang dihitung: yang UANGNYA SUDAH KELUAR.

    Diambil dari basis, bukan didaftar tangan — daftar tangan akan diam-diam
    tertinggal saat status baru ditambahkan, dan diamnya terbaca seperti
    "tak ada kasbon berstatus itu".
  */
  const st = await c.query(`SELECT DISTINCT status FROM public.kasbons ORDER BY 1`)
  console.log('══ Serapan: satu sumber vs dua sumber ═════════════════════════')
  console.log(`  status kasbon yang ADA di basis : ${st.rows.map((r) => r.status).join(', ')}`)
  console.log('')

  /*
    Daftar keinginan DISARING terhadap enum yang benar-benar ada.

    Versi pertama memakai daftar tangan apa adanya dan mati dengan
    `invalid input value for enum kasbon_status: "disbursed"` — nilai yang
    saya kira ada, tak pernah ada. Menyaringnya membuat skrip ini tetap
    jalan saat status ditambah/dikurangi, dan MENYEBUTKAN yang dilewati
    supaya ketiadaannya tak lolos diam-diam.
  */
  const ADA = st.rows.map((r) => r.status)
  const DIINGINKAN = ['approved', 'disbursed', 'settled', 'paid']
  const CAIR = DIINGINKAN.filter((s) => ADA.includes(s))
  const TAK_ADA = DIINGINKAN.filter((s) => !ADA.includes(s))

  if (CAIR.length === 0) {
    console.error('❌ Nol status "uang keluar" cocok dengan enum di basis.')
    console.error(`   Diinginkan: ${DIINGINKAN.join(', ')}`)
    console.error(`   Yang ada  : ${ADA.join(', ')}`)
    process.exit(1)
  }

  console.log(`  dihitung sebagai "uang keluar"  : ${CAIR.join(', ')}`)
  if (TAK_ADA.length) {
    console.log(`  dilewati (tak ada di enum)      : ${TAK_ADA.join(', ')}`)
  }
  console.log('')

  const r = await c.query(
    `SELECT p.name AS proyek,
            p.contract_value::numeric      AS kontrak,
            COALESCE(e.jml, 0)::numeric    AS expenses,
            COALESCE(k.jml, 0)::numeric    AS kasbon
       FROM public.projects p
       LEFT JOIN (
         SELECT project_id, SUM(total_amount) jml
           FROM public.project_expenses WHERE status = 'approved'
          GROUP BY project_id
       ) e ON e.project_id = p.id
       LEFT JOIN (
         SELECT project_id, SUM(amount) jml
           FROM public.kasbons WHERE status = ANY($1)
          GROUP BY project_id
       ) k ON k.project_id = p.id
      WHERE p.contract_value IS NOT NULL AND p.contract_value > 0
      ORDER BY COALESCE(k.jml, 0) DESC
      LIMIT 15`,
    [CAIR]
  )

  if (r.rowCount === 0) {
    console.error('❌ Nol proyek bernilai kontrak — tak ada yang bisa dibandingkan.')
    console.error('   Hijau dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }

  console.log('  proyek                          kontrak      sekarang   +kasbon')
  console.log('  ' + '─'.repeat(70))

  let bedaTerbesar = { nama: null, selisih: 0 }
  let jmlExp = 0
  let jmlKas = 0

  for (const x of r.rows) {
    const kontrak = Number(x.kontrak)
    const pctSekarang = kontrak > 0 ? (Number(x.expenses) / kontrak) * 100 : 0
    const pctUsulan = kontrak > 0 ? ((Number(x.expenses) + Number(x.kasbon)) / kontrak) * 100 : 0
    const selisih = pctUsulan - pctSekarang
    jmlExp += Number(x.expenses)
    jmlKas += Number(x.kasbon)
    if (selisih > bedaTerbesar.selisih) bedaTerbesar = { nama: x.proyek, selisih }

    console.log(
      '  ' + String(x.proyek).slice(0, 30).padEnd(32)
      + rp(kontrak).padStart(12)
      + (pctSekarang.toFixed(1) + '%').padStart(11)
      + (pctUsulan.toFixed(1) + '%').padStart(10)
      + (selisih > 0.05 ? '  ←' : '')
    )
  }

  console.log('')
  console.log(`  total project_expenses (approved) : Rp ${rp(jmlExp)}`)
  console.log(`  total kasbon cair                 : Rp ${rp(jmlKas)}`)
  console.log('')

  if (bedaTerbesar.nama) {
    console.log(`  beda terbesar : ${bedaTerbesar.nama} — ${bedaTerbesar.selisih.toFixed(1)} poin persen`)
  } else {
    console.log('  beda terbesar : NOL — kedua sumber memberi angka yang sama.')
  }

  console.log('')
  console.log('  Yang harus diputuskan: apakah kolom "+kasbon" yang benar?')
  console.log('')
  console.log('  Kalau YA  → analisaProyek & Portofolio Biaya ikut berubah, dan')
  console.log('              otomasi 2.9 berhenti melaporkan 0% untuk proyek yang')
  console.log('              sebenarnya sudah menyerap anggaran.')
  console.log('  Kalau TIDAK → kasbon dianggap uang muka, bukan realisasi; angka')
  console.log('              sekarang benar, dan otomasi 2.9 perlu sumber lain.')
} finally {
  await c.end()
}
