import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// DUA MODUL RFI — aturan yang menentukan keduanya berguna atau tidak.
//
// Request for INSPECTION (izin cor/tutup):
//   · hasil pemeriksaan wajib punya pemeriksa + waktu
//   · tidak lolos wajib beralasan
//   · pemohon tak boleh memutuskan hasilnya sendiri
//
// Request for INFORMATION (pertanyaan ke konsultan):
//   · lama-menggantung — angka yang dibawa ke klaim EOT, jadi definisinya
//     harus tunggal dan tak boleh melebihkan
//   · jawaban tak boleh mendahului pengiriman (lama menggantung negatif)
//   · dijawab wajib berisi jawaban
//
// Yang paling dijaga di sini adalah aritmetika harinya. Constraint DB menangkap
// data mustahil; test ini menangkap hitungan yang MASUK AKAL TAPI SALAH —
// kelas kesalahan yang tak menimbulkan error apa pun dan baru ketahuan ketika
// pihak lawan menghitung ulang di meja arbitrase.
// ============================================================

let c: Client
let projectId: string
let userId: string

const SUMBER_RFI = join(import.meta.dirname, '..', 'rfi.ts')
const SUMBER_INSPEKSI = join(import.meta.dirname, '..', 'inspeksi.ts')

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')
  userId = (await c.query(`SELECT id FROM users WHERE is_active = true LIMIT 1`)).rows[0].id
  projectId = (await c.query(
    `SELECT id FROM projects WHERE is_deleted = false ORDER BY created_at LIMIT 1`)).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

// ─────────────────────────────────────────────────────────────────────────────
// Request for Inspection
// ─────────────────────────────────────────────────────────────────────────────

const buatInspeksi = (nomor: string) =>
  c.query(
    `INSERT INTO inspection_requests (project_id, nomor, judul, diminta_oleh)
     VALUES ($1, $2, '[UJI] pengecoran kolom', $3) RETURNING id`,
    [projectId, nomor, userId])

describe('Inspeksi — hasil pemeriksaan harus dipertanggungjawabkan', () => {
  it('`lolos` tanpa pemeriksa DITOLAK', async () => {
    await c.query('SAVEPOINT i1')
    const { rows } = await buatInspeksi('RFI-901')
    let ditolak = false
    try {
      await c.query(`UPDATE inspection_requests SET status='lolos' WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT i1')

    expect(
      ditolak,
      'izin cor bisa diberikan tanpa siapa pun memeriksa — "lolos" jadi sekadar '
        + 'nilai dropdown, bukan keputusan yang dipertanggungjawabkan'
    ).toBe(true)
  }, 60_000)

  it('`lolos` DENGAN pemeriksa + waktu diterima', async () => {
    // Sisi positif wajib diuji: constraint yang menolak semuanya juga lulus
    // test di atas, dan modulnya jadi tak bisa dipakai sama sekali.
    await c.query('SAVEPOINT i2')
    const { rows } = await buatInspeksi('RFI-902')
    const ok = await c.query(
      `UPDATE inspection_requests SET status='lolos', diperiksa_oleh=$2, diperiksa_pada=now()
        WHERE id=$1 RETURNING id`, [rows[0].id, userId])
    await c.query('ROLLBACK TO SAVEPOINT i2')
    expect(ok.rowCount, 'pemeriksaan yang sah TETAP ditolak — constraint terlalu ketat').toBe(1)
  }, 60_000)

  it('`tidak_lolos` tanpa catatan DITOLAK', async () => {
    await c.query('SAVEPOINT i3')
    const { rows } = await buatInspeksi('RFI-903')
    let ditolak = false
    try {
      await c.query(
        `UPDATE inspection_requests SET status='tidak_lolos', diperiksa_oleh=$2, diperiksa_pada=now()
          WHERE id=$1`, [rows[0].id, userId])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT i3')

    expect(ditolak, 'pekerjaan ditolak tanpa alasan — pemohon tak tahu apa yang diperbaiki')
      .toBe(true)
  }, 60_000)

  it('nomor unik per proyek, bukan global', async () => {
    await c.query('SAVEPOINT i4')
    await buatInspeksi('RFI-904')
    let bentrok = false
    try { await buatInspeksi('RFI-904') } catch (e) {
      bentrok = (e as { code?: string }).code === '23505'
    }
    await c.query('ROLLBACK TO SAVEPOINT i4')
    expect(bentrok, 'nomor ganda dalam satu proyek diterima').toBe(true)
  }, 60_000)

  it('pemohon tak boleh memutuskan hasilnya sendiri — dijaga di rute', async () => {
    // Aturan ini hidup di API, bukan di constraint: capability menjawab
    // "boleh apa", bukan "boleh atas perkara SIAPA". Diuji dari SUMBER karena
    // test yang menulis ulang logikanya sudah terbukti meloloskan mutasi
    // (pelajaran t10/auth-peran-company).
    const src = readFileSync(SUMBER_INSPEKSI, 'utf8')
    const blok = src.slice(src.indexOf('const memutuskan =')).slice(0, 2000)

    expect(
      blok,
      'rute tak lagi memeriksa inspeksi:periksa — pemohon bisa memberi izin cor sendiri'
    ).toContain("hasPermission(request, 'inspeksi:periksa')")
    expect(
      blok,
      'rute tak lagi menolak pemohon memutuskan perkaranya sendiri'
    ).toContain('lama.diminta_oleh === request.currentUser!.id')
  }, 60_000)

  it('mandor boleh mengajukan tapi TIDAK memutuskan', async () => {
    const q = await c.query(
      `SELECT p.key FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.name = 'mandor' AND p.key LIKE 'inspeksi:%' ORDER BY p.key`)
    const keys = q.rows.map((r) => r.key)
    expect(keys, 'mandor tak bisa mengajukan inspeksi — modul tanpa penggunanya')
      .toContain('inspeksi:manage')
    expect(keys, 'mandor bisa memberi izin cor pada pekerjaannya sendiri')
      .not.toContain('inspeksi:periksa')
  }, 60_000)
})

// ─────────────────────────────────────────────────────────────────────────────
// Request for Information
// ─────────────────────────────────────────────────────────────────────────────

const buatRfi = (nomor: string) =>
  c.query(
    `INSERT INTO information_requests (project_id, nomor, perihal, pertanyaan, diajukan_oleh)
     VALUES ($1, $2, '[UJI] detail sambungan', 'Detail B3 tidak jelas', $3) RETURNING id`,
    [projectId, nomor, userId])

describe('RFI — constraint yang menjaga angka klaim', () => {
  it('jawaban MENDAHULUI pengiriman DITOLAK', async () => {
    // Urutan terbalik membuat lama-menggantung NEGATIF. Angka negatif di
    // berkas klaim adalah cacat yang baru ketahuan di meja arbitrase.
    await c.query('SAVEPOINT r1')
    const { rows } = await buatRfi('RFI-I-901')
    let ditolak = false
    try {
      await c.query(
        `UPDATE information_requests
            SET status='dijawab', dikirim_pada=now(), dijawab_pada=now() - interval '3 days',
                jawaban='jawaban uji'
          WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT r1')

    expect(ditolak, 'jawaban bisa mendahului pengiriman — lama menggantung negatif')
      .toBe(true)
  }, 60_000)

  it('`dijawab` tanpa isi jawaban DITOLAK', async () => {
    await c.query('SAVEPOINT r2')
    const { rows } = await buatRfi('RFI-I-902')
    let ditolak = false
    try {
      await c.query(
        `UPDATE information_requests SET status='dijawab', dikirim_pada=now(), dijawab_pada=now()
          WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT r2')

    expect(ditolak, 'RFI ditandai dijawab tanpa isinya — tak bisa dipakai sebagai bukti')
      .toBe(true)
  }, 60_000)

  it('jawaban berisi spasi saja tetap DITOLAK', async () => {
    await c.query('SAVEPOINT r3')
    const { rows } = await buatRfi('RFI-I-903')
    let ditolak = false
    try {
      await c.query(
        `UPDATE information_requests SET status='dijawab', dikirim_pada=now(),
                dijawab_pada=now(), jawaban='   ' WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT r3')
    expect(ditolak, 'spasi diterima sebagai jawaban').toBe(true)
  }, 60_000)

  it('`terkirim` tanpa tanggal kirim DITOLAK', async () => {
    // Tanpa tanggal kirim, lama-menggantung tak bisa dihitung sama sekali dan
    // seluruh nilai modul ini hilang — ia jadi kotak surat biasa.
    await c.query('SAVEPOINT r4')
    const { rows } = await buatRfi('RFI-I-904')
    let ditolak = false
    try {
      await c.query(`UPDATE information_requests SET status='terkirim' WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT r4')
    expect(ditolak, 'RFI terkirim tanpa tanggal — lama menggantung tak terhitung').toBe(true)
  }, 60_000)

  it('alur normal kirim → jawab DITERIMA', async () => {
    await c.query('SAVEPOINT r5')
    const { rows } = await buatRfi('RFI-I-905')
    const ok = await c.query(
      `UPDATE information_requests
          SET status='dijawab', dikirim_pada=now() - interval '5 days',
              dijawab_pada=now(), jawaban='Pakai detail S-04 rev.3'
        WHERE id=$1 RETURNING id, dikirim_pada, dijawab_pada`, [rows[0].id])
    await c.query('ROLLBACK TO SAVEPOINT r5')
    expect(ok.rowCount, 'alur normal ditolak — constraint terlalu ketat').toBe(1)
  }, 60_000)
})

describe('RFI — aritmetika lama menggantung', () => {
  // Diuji terhadap fungsi di SUMBER, karena inilah angka yang dibawa ke klaim.
  // Menulis ulang rumusnya di test berarti menguji tiruan, bukan yang berjalan.
  const src = readFileSync(SUMBER_RFI, 'utf8')

  it('belum dikirim → null, BUKAN 0', () => {
    // Nol berarti "dijawab seketika" — kebohongan yang menguntungkan diri
    // sendiri di berkas klaim, dan justru yang paling mudah dibantah.
    expect(
      src,
      'fungsi tak lagi mengembalikan null untuk yang belum dikirim'
    ).toMatch(/if \(!dikirim\) return null/)
  })

  it('memakai Math.floor pada selisih milidetik, bukan selisih tanggal', () => {
    // RFI yang dikirim Senin 23.50 dan dijawab Selasa 00.10 menggantung 20
    // menit, bukan "satu hari". Melebihkan hitungan adalah cacat yang baru
    // ketahuan ketika pihak lawan menghitung ulang.
    expect(src).toMatch(/Math\.floor\(\(akhir - new Date\(dikirim\)\.getTime\(\)\) \/ HARI_MS\)/)
  })

  it('belum dijawab dihitung sampai HARI INI, bukan dianggap selesai', () => {
    expect(src).toMatch(/dijawab \? new Date\(dijawab\)\.getTime\(\) : Date\.now\(\)/)
  })

  it('rekap memakai TERLAMA, bukan rata-rata', () => {
    // Rata-rata menyamarkan satu pertanyaan yang tertahan 40 hari di antara
    // sepuluh yang dijawab besoknya — dan yang 40 hari itu yang jadi perkara.
    expect(src).toContain('menggantung_terlama_hari')
    expect(src, 'rekap memakai rata-rata, yang menyamarkan pencilan')
      .not.toMatch(/reduce\([^)]*\)\s*\/\s*\w+\.length/)
  })

  it('EOT yang ditautkan diperiksa milik proyek yang sama', () => {
    // Tanpa cek ini, klaim proyek lain — termasuk perusahaan lain — bisa
    // ditautkan sebagai dasar.
    const blok = src.slice(src.indexOf('body.eot_id !== undefined')).slice(0, 900)
    expect(blok).toContain("viaProject('contract_eot', lama.project_id)")
  })
})

describe('RFI — isolasi tenant kedua tabel', () => {
  it('policy tenant_isolation RESTRICTIVE + ada PERMISSIVE', async () => {
    for (const t of ['inspection_requests', 'information_requests']) {
      const r = await c.query(
        `SELECT permissive FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation'`, [t])
      expect(r.rowCount, `${t}: tenant_isolation hilang`).toBe(1)
      expect(r.rows[0].permissive, `${t}: bukan RESTRICTIVE`).toBe('RESTRICTIVE')

      // RESTRICTIVE tanpa PERMISSIVE = tabel MATI TOTAL (pelajaran 149/150):
      // lulus semua uji isolasi dengan sempurna, karena tak ada yang bisa
      // membacanya.
      const p = await c.query(
        `SELECT count(*) n FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND permissive='PERMISSIVE'`, [t])
      expect(Number(p.rows[0].n), `${t}: nol permissive — tabel mati total`).toBeGreaterThan(0)
    }
  }, 60_000)

  it('memakai `(SELECT auth_company_id())`, bukan panggilan telanjang', async () => {
    for (const t of ['inspection_requests', 'information_requests']) {
      const r = await c.query(
        `SELECT qual FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation'`, [t])
      expect(r.rows[0].qual, `${t}: fungsi dievaluasi per-baris, bukan per-query`)
        .toContain('SELECT auth_company_id()')
    }
  }, 60_000)

  it('RFI kontrak TIDAK terbuka untuk client', async () => {
    // Korespondensi dengan konsultan memuat perselisihan teknis dan calon
    // dasar klaim. Transparansi ke client berhenti di sini — berbeda dari
    // punch list & inspeksi yang memang boleh dilihat.
    const q = await c.query(
      `SELECT p.key FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.name = 'client' AND p.key LIKE 'rfi:%'`)
    expect(q.rows.map((r) => r.key), 'client bisa membaca korespondensi klaim').toEqual([])
  }, 60_000)
})
