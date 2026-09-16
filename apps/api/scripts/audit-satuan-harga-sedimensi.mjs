#!/usr/bin/env node
/**
 * PENJAGA: HARGA WAJIB SEDIMENSI DENGAN SATUAN RESOURCE-nya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKAN PENJAGA INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `seed-harga-pokok.mjs` mencocokkan harga ke resource lewat NAMA, lalu
 * mencatat selisih satuan sebagai angka informasi belaka:
 *
 *     // Satuan berbeda dicatat TAPI harganya tetap dipakai: satuan resource
 *     // adalah yang dipakai analisa, dan itulah basis koefisiennya. Selisih
 *     // penulisan satuan di sheet harga tidak mengubah angkanya.
 *     if (cocok.unit_code && cocok.unit_code !== r.unit_code) satuanBeda++
 *
 * Alasan itu BENAR untuk selisih PENULISAN — `m1` vs `m'`, `bh` vs `buah`,
 * `zak` vs `sak`. Satuan yang sama, ejaan berbeda; angkanya tak bergeser.
 *
 * Tetapi ia tak membedakan itu dari selisih DIMENSI FISIK. Diukur
 * 2026-09-16 atas resource yang dipakai analisa AKTIF dan sudah berharga:
 *
 *     selisih satuan dilaporkan seeder : 352
 *     di antaranya BEDA DIMENSI        : 100
 *
 * Contoh yang tak bisa dibela sebagai ejaan:
 *
 *     Rockwool tebal 50 mm   resource `kg`   harga `m2`   Rp 290.000
 *     Urukan Tanah           resource `m3`   harga `m2`   Rp  65.000
 *     Kawat Nyamuk           resource `m2`   harga `m3`   Rp   8.500
 *     Marmer                 resource `buah` harga `m2`   Rp 492.600
 *
 * ── Kenapa ini uang, bukan kerapian
 *
 * Koefisien AHSP memakai satuan RESOURCE. Harga yang satuannya lain
 * dikalikan apa adanya, jadi hasilnya bukan rupiah yang dimaksud siapa pun.
 *
 * Terukur pada `3.6.6.1` (1 m2 dinding partisi gypsum): Rockwool menyumbang
 * Rp 319.000 dari HSP Rp 428.669 — **74%**. Harga Rp 290.000 itu per METER
 * PERSEGI di daftar harga, dipakai sebagai per KILOGRAM. Satu m2 rockwool
 * 50 mm beratnya sekitar 2-4 kg, jadi angkanya meleset beberapa kali lipat,
 * dan ia mendominasi HSP dinding partisi.
 *
 * Tak ada galat di mana pun: resource ada, harga ada, koefisien ada, dan
 * hasil kalinya sebuah angka yang terlihat wajar.
 *
 * ── Kenapa ambangnya RATCHET, bukan NOL
 *
 * Seratus baris tak bisa diperbaiki dengan rumus. Sebagiannya butuh
 * keputusan manusia soal satuan mana yang benar (`Marmer` dijual per m2 ATAU
 * per buah, keduanya lazim), sebagian butuh faktor konversi yang tak ada di
 * dataset (berapa kg satu m2 rockwool 50 mm). Penjaga berambang NOL di sini
 * akan merah selamanya atas hal yang belum bisa diputuskan — lalu diabaikan
 * seluruh keluarannya (§6).
 *
 * Yang dijaga: jumlahnya TIDAK BERTAMBAH. Lantainya menyimpan DAFTAR KODE,
 * bukan cuma angka — merah yang cuma menyebut "101 > 100" memaksa orang
 * berikutnya membandingkan dua daftar seratus baris sendiri (§8a.2).
 *
 * ⚠ BATAS: yang diperiksa DIMENSI, bukan kebenaran harganya. `kg` vs `kg`
 * dengan angka yang salah tetap lolos — itu wilayah
 * `audit-harga-satuan-waras.mjs`. Dan peta dimensinya ditulis tangan: satuan
 * yang belum terdaftar DILEWATI, bukan dituduh. Itu disengaja — menuduh
 * satuan yang tak dikenali akan memerahkan hal yang benar.
 *
 * Butuh basis, jadi TIDAK bisa jalan di CI tanpa kredensial dan TAK BOLEH
 * ditabelkan di CLAUDE.md §6 (`audit-penjaga-tercatat-jalan.mjs` mewajibkan
 * yang tertabel benar-benar dijalankan `ci.yml`).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SEEDS = join(AKAR, 'db', 'seeds')
const LANTAI = join(AKAR, 'apps', 'api', 'scripts', 'satuan-harga-lantai.json')

/*
  Peta satuan → DIMENSI FISIK. Sengaja ditulis tangan dan sengaja TIDAK
  lengkap: satuan yang tak terdaftar dilewati (lihat BATAS di kepala).
  Ejaan yang berbeda untuk dimensi yang sama sengaja dipetakan ke dimensi
  yang sama — itu justru yang membuat penjaga ini tak menuduh `m1` vs `m'`.
*/
const DIMENSI = {
  kg: 'massa', ton: 'massa',
  m3: 'volume', liter: 'volume', ltr: 'volume',
  m2: 'luas',
  m1: 'panjang', m: 'panjang', "m'": 'panjang',
  batang: 'cacah', buah: 'cacah', bh: 'cacah', lembar: 'cacah', set: 'cacah',
  unit: 'cacah', sak: 'cacah', zak: 'cacah', dus: 'cacah', roll: 'cacah',
  kaleng: 'cacah', pasang: 'cacah', titik: 'cacah',
  OH: 'orang-hari', OJ: 'orang-jam',
  hari: 'waktu', jam: 'waktu', bulan: 'waktu',
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const BERKAS_HARGA = [
  'harga-se47-dataset.json', 'harga-analisa-se47-dataset.json',
  'harga-cibuluh-dataset.json', 'harga-analisa-cibuluh-dataset.json',
]

const byNama = new Map()
for (const f of BERKAS_HARGA) {
  const p = join(SEEDS, f)
  if (!existsSync(p)) continue
  const j = JSON.parse(readFileSync(p, 'utf8'))
  for (const h of j.prices ?? []) {
    const n = norm(h.nama)
    if (!byNama.has(n)) byNama.set(n, h)
  }
}

if (byNama.size === 0) {
  console.error('❌ Nol harga terbaca dari dataset — pengukurannya tak bermakna.')
  console.error('   Periksa db/seeds/harga-*.json.')
  process.exit(1)
}

const c = buatClient()
await c.connect()

try {
  /* Hanya resource yang BERHARGA dan benar-benar dipakai analisa AKTIF —
     yang tak dipakai siapa pun tak bisa merusak angka siapa pun. */
  const { rows } = await c.query(`
    SELECT DISTINCT rs.code, rs.name, rs.unit_code, pb.amount
      FROM public.resources rs
      JOIN public.price_book_entries pb
        ON pb.resource_id = rs.id AND pb.status = 'active'
      JOIN public.assembly_components ac ON ac.resource_id = rs.id
      JOIN public.assemblies a
        ON a.id = ac.assembly_id AND a.status = 'active'
     ORDER BY rs.code`)

  const temuan = []
  let takDikenal = 0
  for (const r of rows) {
    const h = byNama.get(norm(r.name))
    if (!h?.unit_code) continue
    if (h.unit_code === r.unit_code) continue
    const dRes = DIMENSI[r.unit_code]
    const dHrg = DIMENSI[h.unit_code]
    if (!dRes || !dHrg) { takDikenal++; continue }
    if (dRes === dHrg) continue          // selisih EJAAN, bukan dimensi
    temuan.push({ code: r.code, name: r.name, res: r.unit_code, hrg: h.unit_code,
                  dim: `${dRes}≠${dHrg}`, amount: r.amount })
  }

  const kode = temuan.map((t) => t.code).sort()
  const simpan = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, 'utf8')) : null
  const lantai = simpan?.kode ?? kode

  console.log('══ Satuan harga sedimensi dengan resource ═══════════════════')
  console.log(`  resource berharga & dipakai : ${rows.length}`)
  console.log(`  satuan BEDA DIMENSI         : ${temuan.length}  (lantai ${lantai.length})`)
  console.log(`  satuan tak dikenal (dilewati): ${takDikenal}`)

  const baru = kode.filter((k) => !lantai.includes(k))
  if (baru.length > 0) {
    console.error(`\n❌ ${baru.length} resource BARU berharga beda dimensi:`)
    for (const k of baru) {
      const t = temuan.find((x) => x.code === k)
      console.error(`     ${k}  ${t.name}`)
      console.error(`        resource \`${t.res}\` vs harga \`${t.hrg}\`  (${t.dim})  Rp ${t.amount}`)
    }
    console.error('\n   Koefisien AHSP memakai satuan RESOURCE. Harga bersatuan lain')
    console.error('   dikalikan apa adanya — hasilnya bukan rupiah yang dimaksud')
    console.error('   siapa pun, dan tak ada galat di mana pun.')
    console.error('\n   Perbaikan: samakan satuannya, ATAU beri faktor konversi yang')
    console.error('   tercatat. Jangan menaikkan lantai tanpa alasan tertulis.')
    process.exit(1)
  }

  if (kode.length < lantai.length) {
    writeFileSync(LANTAI, JSON.stringify(
      { kode, diukur: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
    console.log(`  lantai TURUN → ${kode.length}`)
  } else if (!simpan) {
    writeFileSync(LANTAI, JSON.stringify(
      { kode, diukur: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
    console.log(`  lantai dibuat → ${kode.length}`)
  }

  console.log(`\n✅ Nol resource baru berharga beda dimensi (${kode.length} lama, terdaftar).`)
} finally {
  await c.end()
}
