import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'


// ============================================================
// T4f — PENEGAK (ratchet + P3). Tanpa ini, T4 membusuk pelan-pelan.
//
// Dua hal yang dijaga, keduanya BERARAH SATU (ratchet — boleh turun, tak boleh
// naik). Alasannya: migrasi 240 call-site tak selesai dalam satu PR, jadi yang
// bisa ditegakkan hari ini bukan "nol pelanggaran" melainkan "tidak bertambah".
// Ambang diturunkan setiap gelombang selesai; ia tak pernah dinaikkan.
//
//   1. Jumlah akses `supabase` mentah di routes/ TIDAK BOLEH NAIK.
//      Route baru yang menulis `supabase.from(...)` alih-alih `request.db`
//      membuat build MERAH — ketahuan di PR, bukan enam bulan kemudian saat
//      ada tenant kedua.
//
//   2. Peta tenancy SINKRON dengan skema (P3, ADR-011 §9.5).
//      Tabel ke-98 yang lahir tanpa kategori = build merah.
//
// Kenapa test, bukan lint rule: `no-restricted-imports` hanya bisa bilang
// "boleh/tidak boleh" per-file — ia tak bisa menyatakan "boleh, tapi jumlahnya
// harus menyusut". Allowlist per-file yang menyusut juga bekerja, tapi ia
// berisik di diff (36 file) dan mudah di-`// eslint-disable`.
// ============================================================

const DIR_ROUTES = join(import.meta.dirname, '..', '..')

/**
 * AMBANG — jumlah baris ber-`supabase` mentah di `src/routes/`.
 *
 * ⚠️ ANGKA INI HANYA BOLEH TURUN. Kalau test ini gagal karena angkanya NAIK,
 * jangan menaikkan ambangnya — pakai `request.db` di kode baru Anda. Wrapper
 * menyediakan `.from()` (scope otomatis), `.viaProject()` (kategori C),
 * `.shared()` (katalog bersama), dan `.unsafe(tabel, alasan)` untuk kasus yang
 * benar-benar tak tercakup.
 *
 * Kalau gagal karena angkanya TURUN: bagus — turunkan ambangnya ke angka baru.
 *
 * ── ⚠️ ANGKA INI TIDAK AKAN SAMPAI NOL, dan itu bukan kegagalan
 *
 * Diukur dengan MEMBACA kode 2026-08-01 (tiga alat pengukur yang dibangun
 * sebelumnya semuanya menuduh palsu — lihat catatan di commit). Sisa akses
 * mentah terbagi tiga jenis, dan dua di antaranya **tak bisa dialihkan**:
 *
 *   1. `.storage` (15 akses) — bucket tak punya konsep tenant sama sekali.
 *      `tenantDb` menyediakan `.raw` justru untuk ini.
 *
 *   2. Operasi BY-ID lintas-proyek — `.eq('id', id).in('project_id', await
 *      db.projectIds())`. `viaProject()` butuh satu `projectId` yang di sini
 *      justru BELUM diketahui: yang dicari adalah "apakah id ini milik salah
 *      satu proyek saya". Ini pola yang BENAR untuk bentuknya, bukan kelupaan.
 *      Dipakai konsisten di `finance.ts` (38 akses) dan `procurement.ts`.
 *
 *   3. Gerbang tunggal di atas banyak query — `reports.ts` memeriksa
 *      `projectIds().includes(project_id)` SEKALI lalu menjalankan 14 query.
 *      Komentarnya menyebut alasannya: "satu kelupaan = seluruh gerbang tak
 *      berguna". Sebagian sudah dialihkan ke `viaProject()` (2026-08-01) karena
 *      di sana `projectId` memang diketahui.
 *
 * Yang MASIH hutang: akses mentah pada tabel kategori C di rute yang
 * `projectId`-nya sudah diketahui. Itu yang harus terus turun.
 */
// 468 → 459 → 458 → 426 → 403 → 386 → 380 → 378 → 373 (2026-08-02).
//
// Gelombang ini: 23 query di empat berkas yang polanya paling seragam —
// `rab-schedule` (7), `progress` (10), `documents` (5), `rab` (1). Semuanya
// tabel kategori C di rute yang `projectId`-nya SUDAH diverifikasi
// `proyekMilikTenant()` beberapa baris di atas, jadi `viaProject()` menyatakan
// hal yang sama dengan cara yang tak bisa lupa.
//
// Satu perlu penyesuaian: `documents` access-log memakai `documentId`, bukan
// `projectId` — sumbernya `docTenant.project_id` yang sudah divalidasi. tsc
// yang menangkapnya, bukan review.
//
// Gelombang kedua (403 → 386): `termin-payment` (10) dan `cash` (7). Keduanya
// menyentuh UANG, jadi tiap lokasi diperiksa gerbangnya satu per satu alih-alih
// disapu — beberapa query di `cash` MENDAHULUI gerbangnya (resolusi id dulu,
// validasi kemudian), dan itu pola sah yang `viaProject` tak cocok.
//
// Gelombang ketiga (378 → 373): 5 query yang penyaringnya sudah
// `.eq('project_id', <var>)` — `viaProject` menyatakan hal yang sama tanpa bisa
// lupa. `finance` (3: billable-expenses, expenseSum, prevFeeInvoices),
// `documents` (1), `rab` (1, bulk komponen biaya).
//
// ── ⚠️ Kekhawatiran yang TIDAK terbukti, dicatat supaya tak diulang
//
// Penelusuran gelombang ini sempat menyimpulkan 22 query "menyaring project_id
// tapi tak memverifikasi tenant". Itu SALAH — keduapuluh-duanya sudah
// bergerbang, lewat EMPAT bentuk berbeda yang alat deteksi saya lewatkan satu
// per satu:
//
//   1. `proyekMilikTenant(request, id)` eksplisit
//   2. `request.db!.from('projects')` — ANCHOR menyaring `company_id` sendiri,
//      lalu 404 kalau tak ketemu (projects/:id, contracts)
//   3. `await request.db!.projectIds()` + `.in('project_id', idProyek)`
//      (cash summary, procurement stocks)
//   4. `idProyek === null → 404` sebelum query (reports financial/expenses,
//      finance cashflow-transactions)
//
// Empat kali berturut-turut angkanya turun (22 → 16 → 10 → 7 → 0) karena
// deteksinya yang membaik, bukan kodenya yang berubah. Pelajarannya sama
// dengan yang berulang di repo ini: **alat ukur yang baru ditulis harus
// diverifikasi terhadap kasus yang diketahui benar sebelum angkanya dipercaya**
// — dan "nol temuan" maupun "banyak temuan" sama-sama bisa palsu.
const AMBANG_SUPABASE_MENTAH = 373

function hitungSupabaseMentah(): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {}
  let total = 0
  const telusuri = (dir: string) => {
    for (const entri of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entri.name)
      if (entri.isDirectory()) {
        if (entri.name === '__tests__') continue // test boleh akses langsung
        telusuri(path)
        continue
      }
      if (!entri.name.endsWith('.ts')) continue
      const isi = readFileSync(path, 'utf8')
      // Hitung BARIS, bukan kemunculan: pola multi-baris `supabase\n  .from(`
      // adalah satu akses, bukan dua.
      const n = isi.split('\n').filter((baris) => {
        const t = baris.trim()
        if (t.startsWith('//') || t.startsWith('*')) return false // komentar tak dihitung
        return /\bsupabase\s*$/.test(t) || /\bsupabase\.from\(/.test(t)
      }).length
      if (n > 0) {
        perFile[entri.name] = n
        total += n
      }
    }
  }
  telusuri(DIR_ROUTES)
  return { total, perFile }
}

describe('T4f — ratchet: akses supabase mentah di routes tidak boleh naik', () => {
  it(`jumlah akses supabase mentah <= ${AMBANG_SUPABASE_MENTAH}`, () => {
    const { total, perFile } = hitungSupabaseMentah()

    if (total > AMBANG_SUPABASE_MENTAH) {
      const terbesar = Object.entries(perFile)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([f, n]) => `${f}=${n}`)
        .join(', ')
      throw new Error(
        `Akses supabase mentah NAIK: ${total} (ambang ${AMBANG_SUPABASE_MENTAH}).\n` +
          `Kode baru harus memakai request.db, bukan supabase langsung — kalau tidak, ` +
          `query-nya berjalan tanpa saringan tenant dan membaca data perusahaan lain.\n` +
          `Wrapper: .from() otomatis · .viaProject(t, id) kategori C · .shared() katalog ` +
          `bersama · .unsafe(t, alasan) untuk kasus tak tercakup.\n` +
          `File terbesar: ${terbesar}`
      )
    }
    expect(total).toBeLessThanOrEqual(AMBANG_SUPABASE_MENTAH)
  })

  it('ambang tidak jauh tertinggal dari kenyataan (agar ratchet tetap ketat)', () => {
    // Kalau migrasi maju banyak tapi ambang tak diturunkan, ratchet berhenti
    // menggigit: 100 pelanggaran baru bisa masuk diam-diam di bawah ambang lama.
    const { total } = hitungSupabaseMentah()
    const kelonggaran = AMBANG_SUPABASE_MENTAH - total
    expect(
      kelonggaran,
      `Ambang ${AMBANG_SUPABASE_MENTAH} tertinggal ${kelonggaran} dari kenyataan ${total}. ` +
        'Turunkan AMBANG_SUPABASE_MENTAH ke angka sekarang supaya ratchet tetap ketat.'
    ).toBeLessThanOrEqual(25)
  })
})

describe('T4f — P3: peta tenancy sinkron dengan skema (ADR-011 §9.5)', () => {
  it('setiap tabel di peta punya kategori yang sah', () => {
    const isi = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'utils', 'tenant-map.generated.ts'),
      'utf8'
    )
    const kategori = [...isi.matchAll(/kategori: '([A-Z]+)'/g)].map((m) => m[1])
    expect(kategori.length).toBeGreaterThan(90)
    const sah = new Set(['ANCHOR', 'A', 'AB', 'B', 'C', 'D'])
    const asing = [...new Set(kategori)].filter((k) => !sah.has(k))
    expect(asing).toEqual([])
  })

  it('SETIAP tabel yang dipakai lewat wrapper ada di peta (gerbang P3 sebenarnya)', () => {
    // KOREKSI DESAIN. Versi pertama test ini menjalankan `gen-tenant-map check`,
    // yaitu membandingkan peta (di-generate dari DB **dev**) dengan skema DB
    // yang sedang terhubung. Di CI itu SELALU gagal — bukan karena ada tabel tak
    // terklasifikasi, melainkan karena CI memakai project Supabase BERBEDA yang
    // skemanya wajar berbeda. Repo ini sudah mengakui itu: langkah "Schema-diff
    // vs dev baseline" di ci.yml sengaja `continue-on-error: true` alias
    // INFORMATIONAL. Saya membuat perbandingan yang sama jadi gerbang keras —
    // itu keliru, dan hasilnya 3 CI merah beruntun.
    //
    // Yang benar-benar dijaga P3: JANGAN ADA tabel yang dipakai kode tapi tak
    // punya kategori. Itu bisa diperiksa TANPA database — silang-periksa nama
    // tabel di `.from()/.viaProject()/.shared()` terhadap peta. Deterministik,
    // jalan di mesin mana pun, dan menangkap persis kasus yang dimaksud.
    const isiPeta = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'utils', 'tenant-map.generated.ts'),
      'utf8'
    )
    const terdaftar = new Set(
      [...isiPeta.matchAll(/^\s*'([a-z_]+)':\s*\{ kategori:/gm)].map((m) => m[1])
    )
    expect(terdaftar.size).toBeGreaterThan(90)

    const dipakai = new Map<string, string>()
    const telusuri = (dir: string) => {
      for (const entri of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entri.name)
        if (entri.isDirectory()) {
          if (entri.name === '__tests__') continue
          telusuri(path)
          continue
        }
        if (!entri.name.endsWith('.ts')) continue
        const isi = readFileSync(path, 'utf8')
        // Hanya jalur BER-WRAPPER. `.unsafe()` sengaja tak dihitung — ia memang
        // pintu keluar untuk kasus yang tak tercakup peta.
        for (const m of isi.matchAll(/\.(?:from|viaProject|shared)\(\s*'([a-z_]+)'/g)) {
          if (!dipakai.has(m[1])) dipakai.set(m[1], entri.name)
        }
      }
    }
    telusuri(DIR_ROUTES)

    const asing = [...dipakai.entries()].filter(([t]) => !terdaftar.has(t))
    if (asing.length > 0) {
      throw new Error(
        'Tabel dipakai lewat wrapper TAPI tak ada di peta tenancy:\n' +
          asing.map(([t, f]) => `  '${t}' (${f})`).join('\n') +
          '\n\nJalankan: node scripts/gen-tenant-map.mjs emit — lalu commit hasilnya.\n' +
          'Kalau ini tabel BARU: pastikan kategorinya benar dulu (ADR-011 §5). ' +
          'Tabel tanpa kategori = lubang tenancy yang tak terlihat.'
      )
    }
    expect(asing).toEqual([])
  })
})
