#!/usr/bin/env node
// ============================================================================
// R-002 — mencatat ke buku migrasi HANYA baris yang artefaknya TERBUKTI FISIK.
// ============================================================================
//
// ── Gerbang Keras G-2
//
// Menulis ke `supabase_migrations.schema_migrations` adalah G-2. Berkas ini
// dijalankan HANYA setelah ratifikasi founder (R-002, disetujui 2026-08-03
// dengan syarat "setelah R-001, hanya baris terbukti-fisik").
//
// ── Kenapa daftarnya ditulis tangan, bukan diturunkan otomatis
//
// Cacat C-3 pada audit sebelumnya: alat lama menurunkan "objek yang dijanjikan"
// lewat regex, dan regex itu buta terhadap DDL di dalam blok `DO $$`/`EXECUTE`.
// Seluruh migrasi 163-176 memakai blok dinamis, sehingga TIDAK ADA parser yang
// bisa menyimpulkan janjinya secara andal.
//
// Maka setiap baris di bawah dibuktikan dengan kueri katalog yang ditulis dan
// diperiksa MANUSIA, satu per satu, terhadap nama objek yang benar-benar ada di
// berkas migrasinya. Proses itu sendiri menangkap dua kesalahan tebakan saya:
// artefak 164 dan 174 sempat dilaporkan "tak ada" hanya karena saya menebak
// nama objeknya salah.
//
// Aturan yang mengikat: **verdict hijau HANYA bila kueri buktinya mengembalikan
// baris.** Migrasi yang tak membuat objek apa pun (mis. 175, penegas bentuk)
// TIDAK dicatat — mencatatnya berarti mengklaim bukti yang tak ada.
//
// ── Kenapa berbahaya kalau salah
//
// `ci-project-setup.mjs` memutuskan apa yang perlu dijalankan MURNI dari buku
// ini. Satu entri palsu = migrasi itu **dilewati senyap selamanya** di setiap
// lingkungan baru, termasuk produksi, tanpa gejala apa pun.
//
// ── Pemakaian
//
//   node scripts/db/catat-migrasi-terbukti.mjs            (laporan saja)
//   node scripts/db/catat-migrasi-terbukti.mjs --tulis    (mencatat, G-2)
// ============================================================================

import { buatClient, pastikanCwdRootRepo } from './_koneksi.mjs'

pastikanCwdRootRepo('scripts/db/catat-migrasi-terbukti.mjs')

const tulis = process.argv.includes('--tulis')

// Tiap entri: kueri bukti + nama berkas. Kueri ditulis terhadap objek yang
// BENAR-BENAR ada di berkas migrasinya — diverifikasi manual 2026-08-03.
const BUKTI = [
  {
    versi: '163', nama: '163_amount_due_tak_boleh_negatif.sql',
    apa: 'body trigger_calc_invoice_amount_due() memuat GREATEST(0,…)',
    cek: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='trigger_calc_invoice_amount_due'
             AND pg_get_functiondef(p.oid) ~* 'GREATEST\\s*\\(\\s*0'`,
  },
  {
    versi: '164', nama: '164_pasang_trigger_uang_mandor.sql',
    apa: 'trigger trg_kasbon_approved_create_expense + trg_settle_borongan_deduct_cash',
    cek: `SELECT 1 FROM pg_trigger WHERE tgname='trg_kasbon_approved_create_expense'
          INTERSECT
          SELECT 1 FROM pg_trigger WHERE tgname='trg_settle_borongan_deduct_cash'`,
  },
  {
    versi: '165', nama: '165_fungsi_kasbon_expense_sadar_schema.sql',
    apa: 'fungsi kasbon→expense sadar-schema',
    cek: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname ILIKE '%kasbon%expense%'`,
  },
  {
    versi: '166', nama: '166_pulihkan_protect_created_at.sql',
    apa: 'trigger protect_*_created_at terpasang kembali',
    cek: `SELECT 1 FROM pg_trigger WHERE tgname LIKE 'trg_protect_%created_at%'`,
  },
  {
    versi: '167', nama: '167_gl_chart_of_accounts.sql',
    apa: 'accounts.company_id (bentuk tenant-aware)',
    cek: `SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='accounts' AND column_name='company_id'`,
  },
  {
    versi: '168', nama: '168_gl_penegak_invarian.sql',
    apa: 'fn_gl_wajib_seimbang() + trg_gl_wajib_seimbang',
    cek: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='fn_gl_wajib_seimbang'
          INTERSECT
          SELECT 1 FROM pg_trigger WHERE tgname='trg_gl_wajib_seimbang'`,
  },
  {
    versi: '169', nama: '169_gl_void_boleh_punya_posted_at.sql',
    apa: 'constraint posted_at pada journal_entries',
    cek: `SELECT 1 FROM pg_constraint
           WHERE conrelid='public.journal_entries'::regclass AND conname ILIKE '%posted%'`,
  },
  {
    versi: '170', nama: '170_gl_seed_coa_kontraktor.sql',
    apa: 'baris CoA ter-seed di accounts',
    cek: `SELECT 1 FROM accounts LIMIT 1`,
  },
  {
    versi: '171', nama: '171_gl_permissions.sql',
    apa: "permission ber-prefix 'gl:'",
    cek: `SELECT 1 FROM permissions WHERE key LIKE 'gl:%' LIMIT 1`,
  },
  {
    versi: '172', nama: '172_gl_policy_nama_konvensi.sql',
    apa: 'policy pada tabel accounts',
    cek: `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounts' LIMIT 1`,
  },
  {
    versi: '173', nama: '173_gl_policy_restrictive.sql',
    apa: 'policy RESTRICTIVE pada accounts',
    cek: `SELECT 1 FROM pg_policies
           WHERE schemaname='public' AND tablename='accounts' AND permissive='RESTRICTIVE' LIMIT 1`,
  },
  {
    versi: '174', nama: '174_gl_menu_ke_halaman_nyata.sql',
    apa: 'menu Buku Besar terdaftar',
    cek: `SELECT 1 FROM menu_items WHERE href ILIKE '%besar%' OR label ILIKE '%besar%' LIMIT 1`,
  },
]

// SENGAJA TIDAK DICATAT — dan alasannya ditulis supaya tak dipertanyakan ulang.
const DIKECUALIKAN = {
  '175': 'penegas bentuk — hanya MEMERIKSA & melempar, tidak membuat objek apa pun. Tak ada artefak fisik yang bisa jadi bukti, jadi tak boleh diklaim terbukti.',
  '176': 'belum pernah dijalankan ke dev (trigger trg_isi_pemilik_grup_yatim tidak ada di katalog). Mencatatnya = migrasi ini dilewati selamanya.',
}

const c = buatClient()
await c.connect()

try {
  const { rows: sudah } = await c.query(
    `SELECT version FROM supabase_migrations.schema_migrations`)
  const tercatat = new Set(sudah.map((r) => String(r.version)))

  const layak = []
  const gagal = []

  console.log('══ BUKTI FISIK PER MIGRASI ' + '═'.repeat(42))
  for (const b of BUKTI) {
    if (tercatat.has(b.versi)) { console.log(`  ${b.versi}  ⏭  sudah tercatat`); continue }
    const { rows } = await c.query(b.cek)
    if (rows.length > 0) {
      layak.push(b)
      console.log(`  ${b.versi}  ✅ TERBUKTI — ${b.apa}`)
    } else {
      gagal.push(b)
      console.log(`  ${b.versi}  ❌ TAK TERBUKTI — ${b.apa}`)
    }
  }

  console.log('\n── Sengaja TIDAK dicatat ' + '─'.repeat(44))
  for (const [v, alasan] of Object.entries(DIKECUALIKAN)) {
    console.log(`  ${v}  ${alasan}`)
  }

  console.log(`\n  layak dicatat: ${layak.length} · tak terbukti: ${gagal.length}`)

  if (!tulis) {
    console.log('\n  MODE LAPORAN — nol perubahan. Jalankan dengan --tulis untuk mencatat.')
    process.exit(gagal.length > 0 ? 1 : 0)
  }

  if (gagal.length > 0) {
    console.error('\n  ❌ MENOLAK MENULIS: ada migrasi yang tak terbukti.')
    console.error('     Buku migrasi hanya boleh memuat baris yang artefaknya nyata.')
    process.exit(1)
  }

  for (const b of layak) {
    await c.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [b.versi, b.nama])
    console.log(`  ✍  dicatat: ${b.versi} ${b.nama}`)
  }
  console.log(`\n  ✅ ${layak.length} baris dicatat.`)
} finally {
  await c.end()
}
