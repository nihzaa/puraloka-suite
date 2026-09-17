#!/usr/bin/env node
/**
 * PENJAGA — counter penomoran dokumen tak boleh tertinggal di belakang nomor
 * yang SUDAH BEREDAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-14, dari test merah `t6-penomoran-per-company`:
 *
 *     invoice tertinggi beredar : 27   (INV/2026/09/027)
 *     counter 9 dari 12 bulan   : 26   → berikutnya 027  ❌ KEMBAR
 *
 * ── Kenapa basis TIDAK menahannya
 *
 * Keunikan invoice adalah `UNIQUE (project_id, invoice_number)` — **per
 * PROYEK**, bukan per company. Dua invoice di proyek BERBEDA milik company
 * yang sama boleh bernomor sama, dan basis tak mengeluh.
 *
 * Jadi nomor kembar tak gagal saat disimpan. Ia lahir diam-diam lalu keluar
 * ke klien sebagai dokumen tagihan bernomor yang sudah dipakai. Migrasi 135
 * menyebut akibatnya: *"untuk dokumen yang keluar ke pihak ketiga, nomor
 * kembar bukan ketidakrapian — itu cacat audit."*
 *
 * ── Kenapa migrasi 135 tidak cukup, dan ia TIDAK salah
 *
 * 135 menyinkronkan counter dari MAX nomor yang ada — dengan benar, termasuk
 * menyalin nomor format lama ke tiap bulan supaya tak ada bulan mulai dari
 * 001. Yang tak bisa dilakukannya: menjaga keadaan SESUDAH ia berjalan.
 *
 * `INV/2026/09/027` lahir 2026-09-04, jauh sesudah 135. Ia menaikkan counter
 * bulannya sendiri dan tak menyentuh sebelas bulan lain.
 *
 * **Sinkronisasi sekali-jalan yang benar, lalu data baru menggesernya lagi.**
 * Migrasi 574 memperbaiki keadaannya; penjaga ini yang menjaganya tetap benar.
 *
 * ⚠ BATAS — ditulis supaya tak disalahbaca sebagai jaminan:
 *
 *   · yang dibaca KEADAAN BASIS, bukan kode generatornya. Ia tahu counter
 *     hari ini tertinggal; ia tak tahu apakah `next_document_number()`
 *     menaikkannya dengan benar;
 *   · hanya dokumen yang nomornya berakhiran `/NNN` atau `-NNN`;
 *   · nomor yang dibuat DI LUAR `document_number_series` (impor, migrasi
 *     data) tetap terhitung "beredar" — memang begitu yang diinginkan.
 *
 * Butuh basis, jadi TAK BOLEH ditabelkan di CLAUDE.md §6.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const c = buatClient()
await c.connect()

try {
  /*
    Invoice: periode per BULAN (`YYYY-MM`), tetapi nomor format LAMA hanya
    membawa tahun. Jadi pembandingnya nomor tertinggi per (company, TAHUN),
    dan tiap bulan di tahun itu wajib >= angka tersebut — persis aturan yang
    dipakai migrasi 135 dan 574.
  */
  const { rows: invoice } = await c.query(`
    WITH tertinggi AS (
      SELECT project_company_id(project_id) AS company_id,
             substring(invoice_number FROM '(\\d{4})') AS tahun,
             max(NULLIF(regexp_replace(invoice_number, '^.*/', ''), '')::BIGINT) AS urut
        FROM public.invoices
       WHERE invoice_number ~ '/\\d+$'
         AND substring(invoice_number FROM '(\\d{4})') IS NOT NULL
         AND project_company_id(project_id) IS NOT NULL
       GROUP BY 1, 2
    )
    SELECT co.name AS company, s.period, s.last_number, t.urut AS beredar
      FROM public.document_number_series s
      JOIN tertinggi t
        ON t.company_id = s.company_id AND s.period LIKE t.tahun || '-%'
      LEFT JOIN public.companies co ON co.id = s.company_id
     WHERE s.doc_type = 'invoice' AND s.last_number < t.urut
     ORDER BY co.name, s.period`)

  /* MR / PO / GR: periode per TAHUN, nomor berpola `XX-YYYY-NNN`. */
  const lain = []
  for (const [jenis, tabel, kolom, pola] of [
    ['mr', 'material_requests', 'mr_number', '^MR-'],
    ['po', 'purchase_orders', 'po_number', '^PO-'],
    ['gr', 'goods_receipts', 'gr_number', '^GR-'],
  ]) {
    const { rows } = await c.query(
      `WITH tertinggi AS (
         SELECT project_company_id(project_id) AS company_id,
                substring(${kolom} FROM '-(\\d{4})-') AS tahun,
                max(NULLIF(regexp_replace(${kolom}, '^.*-', ''), '')::BIGINT) AS urut
           FROM public.${tabel}
          WHERE ${kolom} ~ $1 AND ${kolom} ~ '-\\d+$'
            AND project_company_id(project_id) IS NOT NULL
          GROUP BY 1, 2
       )
       SELECT co.name AS company, s.period, s.last_number, t.urut AS beredar
         FROM public.document_number_series s
         JOIN tertinggi t
           ON t.company_id = s.company_id AND s.period = t.tahun
         LEFT JOIN public.companies co ON co.id = s.company_id
        WHERE s.doc_type = $2 AND s.last_number < t.urut`,
      [pola, jenis])
    for (const r of rows) lain.push({ jenis, ...r })
  }

  const total = invoice.length + lain.length

  console.log('── counter dokumen tak tertinggal ──')
  console.log(`  invoice tertinggal : ${invoice.length}`)
  console.log(`  mr/po/gr tertinggal: ${lain.length}`)

  if (total > 0) {
    console.error(`\n❌ ${total} counter menerbitkan nomor yang SUDAH BEREDAR.`)
    for (const r of invoice) {
      console.error(`   invoice · ${r.company} ${r.period}: counter ${r.last_number} < beredar ${r.beredar}`)
    }
    for (const r of lain) {
      console.error(`   ${r.jenis} · ${r.company} ${r.period}: counter ${r.last_number} < beredar ${r.beredar}`)
    }
    console.error('\n   ⚠ Basis TIDAK menahan ini: invoice unik hanya per `project_id`,')
    console.error('   jadi dua proyek satu company boleh bernomor sama tanpa galat.')
    console.error('   Nomornya lahir diam-diam lalu keluar ke klien.')
    console.error('\n   Pulihkan lewat migrasi maju (pola 574): naikkan counter ke')
    console.error('   GREATEST(last_number, nomor tertinggi yang beredar) — hanya NAIK.')
    process.exit(1)
  }

  console.log('\n✅ Nol counter tertinggal — tak ada dokumen berikutnya yang bernomor kembar.')
} finally {
  await c.end()
}
