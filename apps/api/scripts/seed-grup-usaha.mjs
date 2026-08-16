#!/usr/bin/env node
// ============================================================
// SEEDER GRUP USAHA → companies (induk-anak) + company_members + proyek
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA DISEMAI, PADAHAL PURALOKA HARI INI CUMA SATU PT
// ══════════════════════════════════════════════════════════════════════════
//
// Keputusan founder 2026-08-16: kapabilitas multi-PT dibangun karena produk
// ini DIJUAL sebagai SaaS, bukan karena Puraloka membutuhkannya sekarang.
// Satu pemilik dengan beberapa PT adalah bentuk lazim kontraktor Indonesia
// (PT utama + PT khusus tender pemerintah + PT properti), dan tanpa satu pun
// contoh di basis, tool 1.15 tak akan pernah bisa diuji.
//
// Diukur 2026-08-16 sebelum seeder ini: 632 companies, hanya SATU punya
// `parent_company_id`, dan itu pun sisa test (`[UJI] Anak Grup Waris`).
// NOL user jadi anggota lebih dari satu PT.
//
// ══════════════════════════════════════════════════════════════════════════
// MENGIKUTI JALUR PRODUK, BUKAN MENGARANG BENTUK SENDIRI
// ══════════════════════════════════════════════════════════════════════════
//
// `POST /api/v1/companies` sudah melakukan pendirian lengkap: company →
// keanggotaan pembuat → rantai approval → audit. Seeder ini menirunya LANGKAH
// DEMI LANGKAH, bukan sekadar INSERT ke `companies`.
//
// Alasannya bukan kerapian. Rute itu sendiri mencatat kenapa tiap langkah
// ada: company tanpa anggota "TAK BISA DIMASUKI siapa pun, termasuk
// pembuatnya", dan company tanpa rantai approval punya "alur persetujuan yang
// MATI — pengajuan masuk, lalu tak pernah bisa diputuskan siapa pun".
//
// Data dummy yang melewatkan langkah itu bukan cuma tak lengkap; ia MENIPU,
// karena tool yang diuji terhadapnya akan lulus sementara PT sungguhan yang
// dibuat lewat UI berperilaku lain.
//
// ══════════════════════════════════════════════════════════════════════════
// ROLE ITU PER-TENANT — DAN INI JEBAKAN YANG MUDAH TERLEWAT
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur: `roles` punya 21 baris ber-`company_id` NULL (template bersama) DAN
// 21 baris milik Puraloka. Rute produk memakai `.shared('roles')` — yakni
// template ber-`company_id` NULL — untuk keanggotaan admin pendiri.
//
// Seeder ini mengikuti persis itu. Menyalin role Puraloka ke PT baru akan
// membuat PT anak memakai role milik PT lain, dan itu bukan sekadar
// tak rapi: `role_id` menentukan permission, jadi salah salin berarti salah
// izin di tenant yang berbeda.
//
// IDEMPOTEN: PT bertanda kode `grup-uji-*` dibuang lebih dulu tiap jalan,
// berikut keanggotaan dan proyeknya.
//
// PEMAKAIAN (dari apps/api):
//   node scripts/seed-grup-usaha.mjs            # dry-run
//   node scripts/seed-grup-usaha.mjs --execute  # tulis ke DB
// ============================================================
import 'dotenv/config'
import pg from 'pg'

const DEV_REF = 'tgozokxyvwmyvajgqfxw'
const EXECUTE = process.argv.includes('--execute')

/** Awalan kode PT yang dibuat seeder ini — dipakai untuk pembersihan idempoten. */
const AWALAN = 'grup-uji-'

/**
 * Dua PT anak yang mewakili bentuk nyata kontraktor Indonesia.
 *
 * Nilainya dibedakan dengan sengaja: satu PT berkinerja baik, satu tertinggal.
 * Grup yang semua anaknya seragam membuat tool 1.15 tak bisa dibedakan dari
 * tool yang cuma menjumlah — perbandingan butuh sesuatu untuk dibandingkan.
 */
const ANAK = [
  {
    kode: `${AWALAN}nusantara`,
    nama: 'PT Puraloka Nusantara',
    legal: 'PT Puraloka Nusantara Konstruksi',
    prefix: 'PLN',
    catatan: 'PT khusus tender pemerintah',
    klien: 'Dinas PUPR Kabupaten Bandung',
    telepon: '022-5891234',
    kontak: 'Ir. Suryana',
    proyek: [
      { nama: 'Rehabilitasi Jembatan Cikapundung', lokasi: 'Kab. Bandung', nilai: 4_800_000_000, status: 'active', selesai: '2026-11-30' },
      { nama: 'Peningkatan Jalan Kabupaten Ruas 12', lokasi: 'Rancaekek', nilai: 6_200_000_000, status: 'active', selesai: '2026-12-20' },
      { nama: 'Gedung Puskesmas Rancaekek', lokasi: 'Rancaekek', nilai: 3_100_000_000, status: 'completed', selesai: '2026-07-31' },
    ],
  },
  {
    kode: `${AWALAN}properti`,
    nama: 'PT Puraloka Properti',
    legal: 'PT Puraloka Properti Sejahtera',
    prefix: 'PLP',
    catatan: 'PT pengembangan properti',
    klien: 'PT Griya Asri Investama',
    telepon: '022-7654321',
    kontak: 'Bu Ratna Wijayanti',
    proyek: [
      { nama: 'Kavling Ruko Cileunyi Tahap 1', lokasi: 'Cileunyi', nilai: 2_400_000_000, status: 'active', selesai: '2026-10-15' },
      { nama: 'Perumahan Griya Asri Blok C', lokasi: 'Cileunyi', nilai: 1_750_000_000, status: 'on_hold', selesai: '2027-02-28' },
    ],
  },
]

async function main() {
  const conn = process.env.DIRECT_URL
  if (!conn?.includes(DEV_REF)) {
    throw new Error(`TOLAK: koneksi bukan proyek dev (${DEV_REF}).`)
  }
  const c = new pg.Client({ connectionString: conn })
  await c.connect()

  console.log(`\n=== Seed grup usaha — ${EXECUTE ? 'EKSEKUSI' : 'DRY-RUN'} ===\n`)

  // Induk = company yang BENAR-BENAR punya pemilik grup. Tanpa `owner_user_id`
  // terisi, rute produk menolak pendirian anak (403 "bukan pemilik grup"), dan
  // seeder yang memaksanya lewat INSERT akan menghasilkan grup yang tak bisa
  // dikelola lewat UI.
  const induk = (await c.query(
    `SELECT c.id, c.name, c.owner_user_id
       FROM companies c
      WHERE c.owner_user_id IS NOT NULL AND c.parent_company_id IS NULL
        AND EXISTS (SELECT 1 FROM projects p
                     WHERE p.company_id = c.id AND p.is_deleted = false)
      ORDER BY c.created_at LIMIT 1`,
  )).rows[0]
  if (!induk) throw new Error('Tak ada company berpemilik grup yang punya proyek.')

  const pemilik = induk.owner_user_id

  // Role template BERSAMA (company_id NULL) — persis yang dipakai rute produk.
  const roleAdmin = (await c.query(
    `SELECT id FROM roles WHERE name = 'admin' AND company_id IS NULL LIMIT 1`,
  )).rows[0]
  if (!roleAdmin) throw new Error('Role template `admin` (company_id NULL) tak ada.')

  console.log(`Induk   : ${induk.name} (${induk.id})`)
  console.log(`Pemilik : ${pemilik}`)
  console.log(`Role    : template admin ${roleAdmin.id}\n`)

  for (const a of ANAK) {
    const nilai = a.proyek.reduce((s, p) => s + p.nilai, 0)
    console.log(`  ${a.nama.padEnd(24)} ${a.kode.padEnd(20)} ${a.proyek.length} proyek · Rp ${nilai.toLocaleString('id-ID')}`)
    console.log(`    ${a.catatan}`)
  }

  if (!EXECUTE) {
    console.log('\nDRY-RUN — tidak ada yang ditulis. Tambahkan --execute.\n')
    await c.end()
    return
  }

  await c.query('BEGIN')
  try {
    /*
     * ══════════════════════════════════════════════════════════════════════
     * IDEMPOTEN TANPA MENGHAPUS COMPANY — dan kenapa versi pertama SALAH
     * ══════════════════════════════════════════════════════════════════════
     *
     * Percobaan pertama membuang PT lama dengan `DELETE FROM companies`.
     * Basis menolaknya, dan penolakan itu BENAR:
     *
     *   "Company tidak boleh dihapus. Nonaktifkan (is_active=false) atau
     *    jalankan prosedur off-boarding tenant. Penghapusan tenant =
     *    kehilangan data lintas puluhan tabel dan tidak dapat di-rollback."
     *
     * Seeder yang memaksa lewat penjaga itu bukan cuma melanggar aturan
     * repo; ia melatih kebiasaan yang salah pada data sungguhan. Sebuah PT
     * bukan baris yang bisa dibuat-buang seperti baris harga.
     *
     * Maka: PT yang sudah ada DIPAKAI ULANG. Yang disegarkan hanya isinya —
     * proyek dan klien, yang memang milik seeder ini dan aman dibuang.
     */
    const lama = (await c.query(
      `SELECT id, code FROM companies WHERE code LIKE $1`, [`${AWALAN}%`],
    )).rows

    const idLama = lama.map((r) => r.id)
    if (idLama.length > 0) {
      await c.query(`DELETE FROM projects WHERE company_id = ANY($1)`, [idLama])
      await c.query(`DELETE FROM clients WHERE company_id = ANY($1)`, [idLama])
    }

    /** Kode PT → id, untuk memakai ulang alih-alih membuat duplikat. */
    const adaKode = new Map(lama.map((r) => [r.code, r.id]))

    let dibuat = 0
    let proyekDibuat = 0

    for (const a of ANAK) {
      // 1. Badan usaha — dipakai ulang bila sudah ada (lihat catatan di atas).
      const sudahAda = adaKode.get(a.kode)
      const baru = sudahAda
        ? { id: sudahAda }
        : (await c.query(
            `INSERT INTO companies
               (code, name, legal_name, invoice_prefix, parent_company_id,
                owner_user_id, created_by, updated_by, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,true) RETURNING id`,
            [a.kode, a.nama, a.legal, a.prefix, induk.id, pemilik, pemilik],
          )).rows[0]

      /*
       * 2. Keanggotaan pemilik. `is_default = false` DISENGAJA: tenant aktif
       *    bawaan pemilik tetap PT induk. Menyetelnya true di sini akan
       *    memindahkan seluruh sesi founder ke PT anak begitu seeder jalan —
       *    perubahan perilaku yang tak diminta siapa pun.
       */
      await c.query(
        `INSERT INTO company_members
           (company_id, user_id, role_id, is_default, is_active, created_by)
         SELECT $1,$2,$3,false,true,$2
          WHERE NOT EXISTS (SELECT 1 FROM company_members
                             WHERE company_id = $1 AND user_id = $2)`,
        [baru.id, pemilik, roleAdmin.id],
      )

      /*
       * 3. Klien milik PT ini sendiri.
       *
       * `projects.client_id` NOT NULL, dan `clients` kategori B (ber-
       * `company_id`). Memakai ulang klien PT induk akan membuat proyek PT
       * anak menunjuk baris milik tenant lain — persis kebocoran yang seluruh
       * pembungkus tenancy dibangun untuk mencegah, diselundupkan lewat data
       * dummy.
       */
      const klien = (await c.query(
        `INSERT INTO clients
           (company_id, company_name, contact_person, phone, client_type, is_active, created_by)
         VALUES ($1,$2,$3,$4,'perusahaan',true,$5) RETURNING id`,
        [baru.id, a.klien, a.kontak, a.telepon, pemilik],
      )).rows[0]

      // 4. Proyek — grup tanpa proyek tak punya apa pun untuk dibandingkan.
      for (const p of a.proyek) {
        await c.query(
          `INSERT INTO projects
             (company_id, client_id, pm_id, name, location, contract_value,
              status, start_date, end_date, created_by, is_deleted)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$3,false)`,
          [baru.id, klien.id, pemilik, p.nama, p.lokasi, p.nilai, p.status,
           '2026-05-01', p.selesai],
        )
        proyekDibuat++
      }

      dibuat++
      console.log(`  ✓ ${a.nama} — ${a.proyek.length} proyek`)
    }

    await c.query('COMMIT')
    console.log(
      `\n✓ ${idLama.length} PT dipakai ulang (company TIDAK dihapus), ` +
      `${dibuat} PT disiapkan, ${proyekDibuat} proyek ditulis.\n`,
    )
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }

  // Verifikasi lewat pertanyaan yang sama dengan yang akan ditanyakan tool.
  const cek = (await c.query(
    `SELECT c.name, c.code,
            (SELECT count(*) FROM projects p
              WHERE p.company_id = c.id AND p.is_deleted = false)::int AS proyek,
            (SELECT count(*) FROM company_members m WHERE m.company_id = c.id)::int AS anggota
       FROM companies c
      WHERE c.id = $1 OR c.parent_company_id = $1
      ORDER BY c.parent_company_id NULLS FIRST, c.created_at`,
    [induk.id],
  )).rows
  console.log('Grup sekarang:')
  for (const r of cek) {
    console.log(`  ${r.name.padEnd(26)} ${r.proyek} proyek · ${r.anggota} anggota`)
  }

  const lintas = (await c.query(
    `SELECT count(*)::int n FROM (
       SELECT user_id FROM company_members GROUP BY 1 HAVING count(DISTINCT company_id) > 1
     ) x`,
  )).rows[0].n
  console.log(`\nUser beranggota >1 PT: ${lintas}\n`)

  await c.end()
}

main().catch((e) => {
  console.error('GAGAL:', e.message)
  process.exit(1)
})
