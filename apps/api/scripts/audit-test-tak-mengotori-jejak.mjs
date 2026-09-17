#!/usr/bin/env node
/**
 * PENJAGA: TEST TAK BOLEH MENUMPUK BARIS PERMANEN DI JEJAK AUDIT TENANT NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKAN PENJAGA INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-16, saat menelusuri kenapa dropdown `action` di layar Audit
 * menawarkan 699 pilihan:
 *
 *     action unik di audit_logs        : 704
 *     berprefiks `[TEST-F61-…]`        : 573   ← residu test
 *     action SUNGGUHAN                 : 131
 *
 * Empat dari lima pilihan di layar itu sampah. Dan ke-573 baris itu TIDAK
 * tersebar di tenant uji — SELURUHNYA mendarat di `Puraloka Persada`, badan
 * usaha sungguhan milik founder.
 *
 * ── Kenapa testnya tidak salah, dan tetap harus berhenti
 *
 * `audit-jejak-terbaca.test.ts` sengaja TIDAK membersihkan dirinya, dan
 * alasannya ditulis panjang di kepalanya: `audit_logs` append-only (Ember
 * [C]), DELETE ditolak trigger. Percobaan pertamanya memanggil DELETE lalu
 * gagal — penjaganya bekerja persis seperti seharusnya.
 *
 * Jadi yang salah bukan "tak dibersihkan", melainkan PILIHAN TENANT-nya:
 *
 *     SELECT id FROM companies WHERE is_active ORDER BY created_at LIMIT 1
 *
 * `ORDER BY created_at LIMIT 1` atas company AKTIF selalu memulangkan company
 * PERTAMA — yaitu milik founder. Tenant uji di basis ini semuanya
 * `is_active = false`, jadi mereka tak pernah terpilih.
 *
 * Baris yang tak bisa dihapus + tenant yang salah = jejak audit sungguhan
 * yang tumbuh kotor selamanya, satu run test satu tumpukan.
 *
 * ── Tiga jalan keluar DITIMBANG, dan dua yang jelas ditolak BASIS
 *
 *   1. Hapus barisnya          → `audit_logs_block_mutation` menolak DELETE
 *      tanpa satu pun pengecualian. Melonggarkannya = Ember [C] / G-5.
 *   2. Pindah ke tenant uji    → MUSTAHIL tanpa merusak testnya: admin yang
 *      dipakai ber-`is_default` di company founder, dan `resolveCompanyId()`
 *      memakai kolom itu. Tenant uji di basis ini semuanya
 *      `is_active = false`, jadi RLS-nya tak akan mengembalikan apa pun.
 *   3. Tanda TETAP (bukan acak per-run) → kepalanya sendiri sudah menjawab:
 *      run kedua akan menemukan baris run pertama, dan asersi "tepat 2 baris"
 *      gagal karena DATANYA menumpuk, bukan karena kodenya salah.
 *
 * Jadi pertumbuhannya MELEKAT pada rancangan, dan penjaga yang menuntutnya
 * nol akan merah selamanya atas hal yang tak bisa diperbaiki — lalu
 * diabaikan seluruh keluarannya (§6).
 *
 * ── Yang dijaga karena itu: LAJUnya, bukan nolnya
 *
 *   (a) ratchet baris kotor — 3 baris per run adalah harga yang diketahui;
 *       LONJAKAN berarti test BARU ikut mengotori, dan itu yang harus
 *       ketahuan saat lahir, bukan setahun kemudian;
 *   (b) DAFTAR berkas test yang menulis ke tabel append-only — bertambahnya
 *       anggota daftar ini adalah keputusan sadar, bukan kecelakaan.
 *
 * ⚠ BATAS: yang dibaca BENTUK kode + hitungan baris, bukan tenant yang
 * benar-benar terpilih saat test berjalan.
 *
 * Butuh basis untuk bagian (b), jadi TIDAK bisa jalan di CI tanpa kredensial
 * dan TAK BOLEH ditabelkan di CLAUDE.md §6 (`audit-penjaga-tercatat-jalan.mjs`
 * mewajibkan yang tertabel benar-benar dijalankan `ci.yml`).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TEST_DIR = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1', '__tests__')
const LANTAI = join(AKAR, 'apps', 'api', 'scripts', 'jejak-kotor-lantai.json')

/** Tabel yang append-only: barisnya TAK BISA dihapus, jadi kotorannya abadi. */
const APPEND_ONLY = ['audit_logs']

const c = buatClient()
await c.connect()

try {
  /* ── (b) DAFTAR test yang menulis ke tabel append-only ───────────────── */
  const penulis = []
  if (existsSync(TEST_DIR)) {
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith('.test.ts'))) {
      const isi = readFileSync(join(TEST_DIR, f), 'utf8')
      const menulis = APPEND_ONLY.some((t) =>
        new RegExp(`INSERT\\s+INTO\\s+${t}\\b`, 'i').test(isi))
      if (menulis) penulis.push(f)
    }
  }
  penulis.sort()

  /* ── (b) baris kotor di basis ────────────────────────────────────────── */
  const { rows } = await c.query(`
    SELECT count(*)::int AS baris,
           count(DISTINCT action)::int AS action_unik
      FROM public.audit_logs
     WHERE action LIKE '[TEST-%'`)
  const { rows: bersih } = await c.query(`
    SELECT count(DISTINCT action)::int AS n
      FROM public.audit_logs WHERE action NOT LIKE '[TEST-%'`)

  const kotor = rows[0].baris
  const simpan = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, 'utf8')) : null
  const lantai = simpan?.baris ?? kotor
  const penulisLama = simpan?.penulis ?? penulis

  /*
    Toleransi pertumbuhan: 3 baris per run × beberapa run di antara dua
    pengukuran. Yang dijaga LONJAKAN, bukan tiap kenaikan — memerahkan
    kenaikan wajar akan membuat penjaga ini diabaikan, dan penjaga yang
    diabaikan berhenti menjaga.
  */
  const TOLERANSI = 60

  console.log('── Test tak mengotori jejak audit ──')
  console.log(`  baris test di audit_logs    : ${kotor}  (lantai ${lantai}, toleransi +${TOLERANSI})`)
  console.log(`  action unik dari test        : ${rows[0].action_unik}`)
  console.log(`  action unik SUNGGUHAN        : ${bersih[0].n}`)
  console.log(`  test menulis ke append-only  : ${penulis.length}`)
  for (const f of penulis) console.log(`     ${f}`)

  let merah = false

  const baru = penulis.filter((f) => !penulisLama.includes(f))
  if (baru.length > 0) {
    merah = true
    console.error('\n❌ Test BARU menulis ke tabel append-only:')
    for (const f of baru) console.error(`     ${f}`)
    console.error('\n   Barisnya TAK BISA dihapus siapa pun (Ember [C]), jadi tiap run')
    console.error('   menambah tumpukan permanen di jejak audit badan usaha sungguhan.')
    console.error('   Diukur 2026-09-16: 573 baris test mengubur 131 action sungguhan,')
    console.error('   dan layar Audit menawarkan 4 dari 5 pilihan berupa sampah.')
    console.error('\n   Kalau memang tak terhindarkan, daftarkan di jejak-kotor-lantai.json')
    console.error('   BESERTA alasannya — supaya ia keputusan, bukan kecelakaan.')
  }

  if (kotor > lantai + TOLERANSI) {
    merah = true
    console.error(`\n❌ Baris test MELONJAK: ${lantai} → ${kotor} (+${kotor - lantai}).`)
    console.error(`   Lajunya ~3 baris/run; +${TOLERANSI} sudah ditoleransi. Lonjakan`)
    console.error('   sebesar ini berarti ada yang menulis JAUH lebih banyak.')
  }

  if (merah) process.exit(1)

  if (!simpan || kotor < lantai || penulis.join() !== penulisLama.join()) {
    writeFileSync(LANTAI, JSON.stringify(
      { baris: kotor, penulis, diukur: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
    console.log(`  lantai diperbarui → ${kotor} baris · ${penulis.length} penulis`)
  }
  console.log('\n✅ Nol penulis baru · baris kotor tak melonjak.')
} finally {
  await c.end()
}
