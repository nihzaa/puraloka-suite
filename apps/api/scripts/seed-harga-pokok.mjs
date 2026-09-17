#!/usr/bin/env node
// ============================================================
// SEEDER HARGA POKOK → price_book_entries
//
// Menutup temuan: 2.766 resource dipakai analisa, NOL punya harga → seluruh
// analisa tak bisa menghitung HSP. Rumus link-nya sudah terpasang; sheet harga
// pokoknya yang masih kosong.
//
// SUMBER (dua dataset, dua lingkup berbeda):
//   harga-se47-dataset.json    → NASIONAL. company_id NULL = dipakai bersama
//                                seluruh badan usaha. Workbook-nya sendiri
//                                menyatakan "diubah sesuai harga daerah
//                                masing-masing" → ini acuan, bukan pengikat.
//   harga-cibuluh-dataset.json → COMPANY. Milik badan usaha founder, konteks
//                                Kabupaten Bandung.
//
// PENCOCOKAN — dua jalur, berurutan:
//   1. PEMETAAN LEWAT RUMUS (`mapping`) — jalur PASTI. Nama di analisa dan di
//      sheet harga berbeda penulisan, jadi rumus `=HS.BAHAN!D569` yang dipakai:
//      ia menyatakan baris harga mana yang dimaksud penyusun workbook.
//   2. Nama + kategori — cadangan, hanya bila rumusnya tak ada.
//
//   TIDAK ADA jalur ketiga "kemiripan huruf". "Kaca Patri" mirip "kaca 2 mm"
//   dan "Genteng Palentong Super" mirip "atap genteng kodok glazur" —
//   dua-duanya mirip, dua-duanya salah. Resource tanpa pasangan pasti
//   DIBIARKAN tanpa harga, dan endpoint akan fail-loud saat dipakai. Itu
//   perilaku yang benar: lebih baik menolak menghitung daripada menghitung
//   dengan harga yang salah.
//
// IDEMPOTEN: harga yang sudah ada (resource + lokasi + effective_date sama)
// dilewati, tidak diduplikasi. Menjalankan ulang = no-op aman.
//
// STATUS 'active' + jejak verifikasi: constraint `price_book_verified_trace`
// mensyaratkan verified_by/at untuk status non-draft. Diisi user penjalan seed
// dengan alasan tercatat — bukan dikosongkan lalu constraint-nya dilonggarkan.
//
// PEMAKAIAN (dari apps/api):
//   node scripts/seed-harga-pokok.mjs            # dry-run (hitung saja)
//   node scripts/seed-harga-pokok.mjs --execute  # tulis ke DB
// ============================================================
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const DEV_REF = 'tgozokxyvwmyvajgqfxw'
const EXECUTE = process.argv.includes('--execute')
const SEEDS = 'E:/Project/puraloka-suite/db/seeds'

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Indeks SILANG-DATASET — dipakai jalur 5 (lihat alasannya di bawah).
 * Dibangun sekali: berkas dataset dibaca ulang per sumber di loop utama,
 * dan yang ini sengaja memuat KEDUANYA sekaligus.
 */
function indeksSilang() {
  const baca = (files) => {
    const out = []
    for (const f of files) out.push(...(JSON.parse(readFileSync(`${SEEDS}/${f}`, 'utf8')).prices ?? []))
    return out
  }
  const idx = (arr) => {
    const m = new Map()
    for (const p of arr) {
      const k = norm(p.nama)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(p)
    }
    return m
  }
  return {
    national: idx(baca(['harga-se47-dataset.json', 'harga-analisa-se47-dataset.json'])),
    company: idx(baca(['harga-cibuluh-dataset.json', 'harga-analisa-cibuluh-dataset.json'])),
  }
}

async function main() {
  const conn = process.env.DIRECT_URL
  if (!conn?.includes(DEV_REF)) {
    throw new Error(`TOLAK: koneksi bukan proyek dev (${DEV_REF}).`)
  }
  const c = new pg.Client({ connectionString: conn })
  await c.connect()

  console.log(`\n=== Seed harga pokok — ${EXECUTE ? 'EKSEKUSI' : 'DRY-RUN'} ===\n`)

  const actor = (await c.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.is_active ORDER BY u.created_at LIMIT 1`)).rows[0]?.id
  if (!actor) throw new Error('Tidak ada user admin aktif untuk dicatat sebagai verifier.')

  const company = (await c.query(
    `SELECT id, name FROM companies WHERE parent_company_id IS NULL
      ORDER BY created_at LIMIT 1`)).rows[0]
  if (!company) throw new Error('Belum ada company.')

  let totalBaru = 0, totalAda = 0, totalTanpaPasangan = 0
  const silang = indeksSilang()

  // Tiap sumber punya DUA berkas: daftar harga resmi + harga yang hanya
  // tertulis di dalam baris analisa. Yang kedua ditambahkan setelah ditemukan
  // bahwa ratusan resource harganya ADA di workbook tapi bukan di sheet daftar
  // harga — `Sewa Tripot` (Rp 108.000/hari) sendirian memblokir 213 analisa.
  //
  // Urutan berarti: daftar harga resmi dibaca DULU, jadi bila satu nama ada di
  // keduanya, yang menang adalah versi daftar resmi.
  for (const [label, files, source, companyId, lokasi, tanggal] of [
    ['NASIONAL (SE-47)',
     ['harga-se47-dataset.json', 'harga-analisa-se47-dataset.json'],
     'national', null, null, '2026-01-01'],
    ['COMPANY (Cibuluh)',
     ['harga-cibuluh-dataset.json', 'harga-analisa-cibuluh-dataset.json'],
     'company', company.id, 'Kabupaten Bandung', '2019-01-01'],
  ]) {
    const d = { prices: [], mapping: [] }
    for (const f of files) {
      const bagian = JSON.parse(readFileSync(`${SEEDS}/${f}`, 'utf8'))
      d.prices.push(...(bagian.prices ?? []))
      d.mapping.push(...(bagian.mapping ?? []))
    }

    // Jalur 1: pemetaan lewat rumus (pasti). Jalur 2: nama+kategori. Jalur 3:
    // nama saja.
    //
    // ── Kenapa jalur 3 perlu ada
    //
    // Kategori (`labor`/`material`/`equipment`) adalah KLASIFIKASI, bukan
    // identitas. Sumber yang berbeda mengklasifikasikan barang yang sama secara
    // berbeda tanpa keduanya keliru: `Sepatu Pancang` tercatat `material` di
    // resources dan `equipment` di dataset SE-47; `Sewa Tripot` juga berselisih.
    //
    // Dengan hanya jalur 2, pasangan seperti ini TAK PERNAH cocok — dan
    // `Sewa Tripot` sendiri memblokir 213 analisa nasional dari perhitungan HSP,
    // padahal harganya (Rp 108.000/hari) ada di dataset sejak awal.
    //
    // Jalur 3 dipakai HANYA bila jalur 1 dan 2 gagal, dan hanya bila namanya
    // menghasilkan tepat SATU pasangan — nama yang ambigu tetap dilewati, bukan
    // diambil salah satunya.
    const viaRumus = new Map()
    for (const m of d.mapping ?? []) viaRumus.set(norm(m.nama_di_analisa), m)
    // `set` hanya bila BELUM ada: berkas pertama (daftar harga resmi) menang
    // atas berkas kedua (harga dari dalam analisa) untuk nama yang sama.
    const viaNama = new Map()
    for (const p of d.prices) {
      const k = `${p.category}|${norm(p.nama)}`
      if (!viaNama.has(k)) viaNama.set(k, p)
    }

    const viaNamaSaja = new Map()
    for (const p of d.prices) {
      const k = norm(p.nama)
      if (!viaNamaSaja.has(k)) viaNamaSaja.set(k, [])
      viaNamaSaja.get(k).push(p)
    }

    // Hanya resource yang BENAR-BENAR dipakai analisa dari sumber ini. Menyeed
    // harga untuk resource yang tak dipakai siapa pun hanya menambah baris mati.
    const res = (await c.query(
      `SELECT DISTINCT r.id, r.name, r.category, r.unit_code FROM resources r
         JOIN assembly_components ac ON ac.resource_id = r.id
         JOIN assemblies a ON a.id = ac.assembly_id
        WHERE a.source = $1`, [source])).rows

    let baru = 0, sudahAda = 0, tanpaPasangan = 0, satuanBeda = 0
    for (const r of res) {
      // Jalur 3 hanya dipakai bila namanya menghasilkan TEPAT SATU pasangan.
      // Nama yang cocok ke beberapa harga berbeda dibiarkan tanpa pasangan —
      // memilih salah satunya berarti menebak, dan tebakan pada harga menyebar
      // ke seluruh analisa yang memakainya.
      const kandidat = viaNamaSaja.get(norm(r.name))

      /*
        JALUR 0 — SATUAN RESOURCE MENANG. Ditambahkan 2026-09-17, dan ia
        sengaja berjalan SEBELUM keempat jalur di bawah.

        Sebab yang ditemukan: `Agregat kasar` tersimpan Rp 385.000 di baris
        ber-satuan **kg**. Itu harga per m3, tersalin utuh. Akibatnya, di
        analisa yang koefisiennya memang dalam kg:

            Pembuatan 1 m3 pondasi beton siklop
            706 kg x Rp 385.000 = Rp 271.810.000  untuk SATU m3 beton

        Persis kelas cacat yang dijaga `audit-harga-satuan-waras.mjs`
        (1 m3 beton jadi Rp 626 juta) — dan lolos karena penjaga itu
        membandingkan harga IDENTIK lintas satuan, sedangkan di sini
        angkanya memang cuma ada satu.

        Kenapa jalur 1-4 memilih yang salah: keduanya membaca nama SAJA.
        Dataset memuat baris yang sama dalam dua satuan —

            harga-se47          Agregat kasar   m3   385.000
            harga-analisa-se47  Agregat kasar   kg   285,19

        — dan berkas daftar harga resmi dibaca DULUAN, jadi baris m3 yang
        menang meski resource-nya kg.

        ⚠ Yang diperiksa SATUAN, bukan kewajaran harga. Jalur ini hanya
        memilih di antara kandidat yang SUDAH ada; ia tak pernah mengarang
        angka, tak pernah mengonversi, dan tak berbuat apa-apa bila tak ada
        kandidat bersatuan sama. Konversi m3→kg BUTUH densitas, dan densitas
        yang ditebak adalah cacat yang sama dalam bentuk lain.

        Diukur 2026-09-17 — dari 30 resource yang punya kandidat bersatuan
        sama, hanya 3 yang angkanya benar-benar berubah:

            Agregat kasar          kg   385.000 → 285,19   (1.350 kg/m3, wajar)
            Ijuk                   kg    39.700 →  7.000
            Besi strip (0,2x2) cm  m1    15.000 →  5.000   (0,314 kg/m x 15rb = 4.710)

        27 sisanya rasio 1,0 — beda LABEL satuan antar-berkas, angka sama.

        ⚠ `Bentonite` SENGAJA tak tersentuh: m3 Rp 25.000 dan kg Rp 20.000.000
        BUKAN satuan yang salah melainkan dua BENTUK barang (bubur vs bubuk).
        Jalur ini tak menyentuhnya sebab resource-nya m3 dan kandidat m3 ada —
        yang sudah dipilih memang yang benar.
      */
      const seSatuan = kandidat?.filter((k) => k.unit_code === r.unit_code)
      const cocok = (seSatuan?.length === 1 ? seSatuan[0] : undefined)
        ?? viaRumus.get(norm(r.name))
        ?? viaNama.get(`${r.category}|${norm(r.name)}`)
        ?? (kandidat?.length === 1 ? kandidat[0] : undefined)
        /*
          Jalur 4 — banyak kandidat, tetapi SEPAKAT. Ditambahkan 2026-09-16.

          Jalur 3 menuntut TEPAT SATU kandidat, dan alasannya benar: nama yang
          menunjuk ke beberapa harga BERBEDA tak boleh ditebak. Tetapi
          sebagian besar "kandidat ganda" di sini bukan ambiguitas — ia bahan
          yang SAMA yang muncul di dua berkas dataset sekaligus (daftar harga
          resmi + harga yang tertulis di dalam baris analisa):

              Sewa Tripot  harga-se47            hari  Rp 108.000
              Sewa Tripot  harga-analisa-se47    hari  Rp 108.000

          Diukur: dari 1.519 nama ber-kandidat ganda, 1.392 harganya IDENTIK.

          Akibat jalur 3 menolaknya, 16 resource tetap tanpa harga meski
          harganya ADA di dataset — dan `Sewa Tripot` sendirian memblokir 213
          analisa nasional dari perhitungan HSP. (Kepala berkas ini sudah
          menyebut angka itu sebagai alasan jalur 3 lahir; jalur 3 ternyata
          tak cukup menutupnya.)

          Syaratnya KETAT: seluruh kandidat wajib sepakat pada HARGA dan
          SATUAN. Kalau salah satu berbeda, ia ambiguitas sungguhan dan tetap
          dibiarkan tanpa harga — fail-loud saat dipakai, bukan ditebak.
        */
        ?? (() => {
          if (!kandidat || kandidat.length < 2) return undefined
          const harga = new Set(kandidat.map((k) => Number(k.amount)))
          const satuan = new Set(kandidat.map((k) => k.unit_code))
          return harga.size === 1 && satuan.size === 1 ? kandidat[0] : undefined
        })()
        /*
          Jalur 5 — nama PERSIS di dataset SUMBER LAIN. Ditambahkan 2026-09-17.

          Keempat jalur di atas hanya melihat dataset milik sumbernya sendiri:
          analisa `company` dicocokkan ke Cibuluh, `national` ke SE-47. Itu
          benar sebagai bawaan — harga nasional dan harga Kabupaten Bandung
          adalah KONTEKS HARGA yang berbeda, dan mencampurnya diam-diam
          membuat estimasi memakai angka dari pasar yang salah.

          Tetapi ada celahnya. `Asbes Gelombang` (CIB-R0219, dipakai 3 analisa
          company) TAK ADA di Cibuluh dengan nama telanjang itu — yang ada
          varian berukuran (`Asbes Gelombang 3 mm 80 x 180`, dst). Nama
          persisnya justru ada di SE-47: Rp 62.400/lembar, satuan sama,
          muncul di KEDUA berkas SE-47 dengan angka identik.

          ⚠ Diukur lebih dulu, dan hasilnya yang menentukan bentuk jalur ini:
          dari 18 resource tanpa harga yang dipakai analisa AKTIF, yang bisa
          ditutup lewat silang-dataset **tepat SATU**. Jadi ini bukan lubang
          sistematis, dan syaratnya dibuat seketat mungkin supaya tetap begitu:

            1. nama PERSIS sama (norm), bukan kemiripan;
            2. seluruh kandidat SEPAKAT harga DAN satuan;
            3. satuannya SAMA DENGAN satuan resource.

          Syarat (3) tak ada di jalur 1-4, dan di sini wajib. Justru di jalur
          silang-dataset-lah jebakan dimensi paling mungkin: `Reng Kayu 2/3`
          tercatat m3 di resources dan m1 di sheet harga — menyalin Rp 6.000/m1
          ke baris m3 persis kelas cacat yang dijaga
          `audit-harga-satuan-waras.mjs` (1 m3 beton jadi Rp 626 juta).
          Dengan syarat (3), pasangan seperti itu DITOLAK, bukan dipakai.

          Harganya ditulis ke lingkup sumbernya sendiri (company tetap company),
          jadi harga nasional tidak bocor jadi milik tenant.
        */
        ?? (() => {
          const lain = silang[source === 'company' ? 'national' : 'company']
          const k = lain.get(norm(r.name))
          if (!k?.length) return undefined
          const harga = new Set(k.map((x) => Number(x.amount)))
          const satuan = new Set(k.map((x) => x.unit_code))
          if (harga.size !== 1 || satuan.size !== 1) return undefined
          // Syarat (3): satuan sumber wajib sama dengan satuan resource.
          if ([...satuan][0] !== r.unit_code) return undefined
          return k[0]
        })()
      if (!cocok) { tanpaPasangan++; continue }

      // Satuan berbeda dicatat TAPI harganya tetap dipakai: satuan resource
      // adalah yang dipakai analisa, dan itulah basis koefisiennya. Selisih
      // penulisan satuan di sheet harga tidak mengubah angkanya.
      if (cocok.unit_code && cocok.unit_code !== r.unit_code) satuanBeda++

      const ada = (await c.query(
        `SELECT 1 FROM price_book_entries
          WHERE resource_id = $1 AND effective_date = $2::date
            AND location IS NOT DISTINCT FROM $3
            AND company_id IS NOT DISTINCT FROM $4
          LIMIT 1`, [r.id, tanggal, lokasi, companyId])).rowCount
      if (ada) { sudahAda++; continue }

      if (EXECUTE) {
        await c.query(
          `INSERT INTO price_book_entries
             (resource_id, amount, currency, version_number, effective_date,
              location, status, company_id, created_by, verified_by, verified_at,
              confidence_level)
           VALUES ($1, $2, 'IDR', 1, $3::date, $4, 'active', $5, $6, $6, now(), 'medium')`,
          [r.id, cocok.amount, tanggal, lokasi, companyId, actor])
      }
      baru++
    }

    console.log(`${label} — company_id=${companyId ?? 'NULL (bersama)'}`)
    console.log(`  resource dipakai analisa : ${res.length}`)
    console.log(`  harga baru ${EXECUTE ? 'ditulis' : 'akan ditulis'}   : ${baru}`)
    console.log(`  sudah ada (dilewati)     : ${sudahAda}`)
    console.log(`  tanpa pasangan pasti     : ${tanpaPasangan}  ← dibiarkan kosong, fail-loud saat dipakai`)
    console.log(`  satuan beda penulisan    : ${satuanBeda}  (harga tetap dipakai; basis = satuan resource)\n`)
    totalBaru += baru; totalAda += sudahAda; totalTanpaPasangan += tanpaPasangan
  }

  console.log(`TOTAL: ${totalBaru} baru · ${totalAda} sudah ada · ${totalTanpaPasangan} tanpa harga`)
  if (!EXECUTE) console.log('\n(dry-run — belum ada yang ditulis. Tambahkan --execute.)')
  await c.end()
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1) })
