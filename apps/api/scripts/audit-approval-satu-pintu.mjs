#!/usr/bin/env node
/**
 * PENJAGA: KEPUTUSAN PERSETUJUAN HANYA LEWAT SATU PINTU.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini punya mesin approval berjenjang (`utils/approval.ts`): permission
 * per level, jejak di `approval_progress`, syarat nominal dari
 * `approval_steps.min_amount`, dan `workflow_id` yang mengikat seluruh langkah
 * lintas request.
 *
 * Lima modul memakainya. Empat TIDAK — mereka memeriksa satu permission lalu
 * menulis `approved_by` langsung. Konsekuensinya nyata: entitas yang menurut
 * konfigurasi butuh persetujuan dua level bisa lolos dengan satu ketukan.
 *
 * Yang terburuk `mandor.ts:1607-1608`:
 *
 *     requested_by: user.id,
 *     approved_by:  user.id,     ← satu baris di bawahnya
 *
 * Pemohon menyetujui dirinya sendiri, di jalur yang MENGURANGI SALDO KAS. Itu
 * bukan approval yang lewat mesin lain — itu approval yang tak pernah ada, dan
 * pelanggaran Segregation of Duties yang sudah tertulis di kode.
 *
 * ── Kelas cacatnya sama dengan yang dikritik pada TJS
 *
 * Spec lapisan AI §5.1 (C-2/C-3) mencatat pola *"gerbang yang benar di satu
 * jalur, bolong di jalur lain"* sebagai cacat TJS. Puraloka punya bentuknya
 * sendiri, dan sudah ada sejak sebelum AI: `kasbons.ts` memakai mesin
 * berjenjang, sementara `notifications.ts` menyetujui kasbon yang SAMA lewat
 * jalur pintas.
 *
 * ── Yang diperiksa
 *
 * Berkas rute yang MENULIS kolom keputusan (`approved_by`, `disetujui_oleh`,
 * `diverifikasi_oleh`, `diputuskan_oleh`) WAJIB juga memanggil
 * `recordApproval` — bukti ia lewat mesin.
 *
 * Ini pemeriksaan kasar dan sengaja: ia tak membuktikan tiap penulisan lewat
 * mesin, hanya bahwa modulnya TAHU mesin itu ada. Untuk kebenaran per-jalur,
 * ada test integrasi. Yang dijamin: modul baru tak bisa diam-diam membangun
 * pintu approval kelima.
 *
 * ── Ratchet PER BERKAS
 *
 * Pelajaran dari `audit-klaim-status-atomik`: ratchet berbasis JUMLAH lolos
 * saat satu berkas diperbaiki dan satu dirusak dalam perubahan yang sama.
 * Yang dijaga adalah himpunannya.
 *
 * Pakai:  node apps/api/scripts/audit-approval-satu-pintu.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTE = resolve(__dirname, '..', 'src', 'routes', 'v1')

/**
 * LANTAI PER BERKAS — turunkan seiring modul dipindahkan ke mesin approval.
 *
 * Diukur 2026-08-09, bukan diperkirakan. Tiap entri adalah utang yang sudah
 * ada; yang BARU langsung merah.
 */
const LANTAI_BERKAS = {
  // `mandor.ts` — DUA tersisa, dan keduanya sudah ditelusuri:
  //   :1749 approval progress payment. Kini ber-SoD (pemohon tak boleh
  //         menyetujui sendiri) + klaim status atomik. Belum lewat mesin
  //         berjenjang — pekerjaan tersendiri, lihat catatan di bawah.
  //   :1916 borongan settlement. BUKAN gerbang persetujuan: tindakan
  //         sekali-jadi admin/PM tanpa pemohon terpisah, jadi tak ada dua
  //         peran yang bisa dipisahkan. Kolomnya saja yang bernama seperti itu.
  'mandor.ts': 2,

  // Sertifikat IPC — SATU-SATUNYA sisa yang benar-benar butuh mesin
  // berjenjang: permission-nya `finance:invoice:create` dan sertifikat ini
  // jadi DASAR TAGIHAN. Memindahkannya menuntut entity type baru +
  // migrasi rantai approval, dan itu mengubah perilaku jalur yang
  // menerbitkan tagihan — pekerjaan tersendiri, bukan sisipan.
  'sertifikat-ipc.ts': 1,

  // K3 — keselamatan, bukan uang. :210 verifikasi dokumen kepatuhan,
  // :422 izin kerja. Keduanya menolak keputusan yang tak beralasan
  // (pengendalian risiko wajib diisi, penolakan wajib beralasan) — itu
  // pengendaliannya, dan rantai approval berjenjang tak menambah apa pun.
  'kepatuhan-k3.ts': 2,

  // Nota kredit — SUDAH punya SoD sendiri: "Anda yang mengajukan nota kredit
  // ini — pemutus harus orang lain." Pengendalian utamanya ada; yang belum
  // hanya jejak di `approval_progress`.
  'pengadaan-lanjutan.ts': 1,
}

/** Kolom yang menandai "seseorang memutuskan sesuatu". */
const KOLOM_KEPUTUSAN = [
  'approved_by',
  'disetujui_oleh',
  'diverifikasi_oleh',
  'diputuskan_oleh',
]

/**
 * Berkas yang memakai kolom itu untuk VERIFIKASI LAPANGAN, bukan gerbang
 * persetujuan — dan karenanya memang TIDAK boleh dipaksa lewat mesin approval.
 *
 *   `ncr.ts`        NCR ditutup sesudah akar masalahnya diisi
 *   `punch-list.ts` temuan diverifikasi saat pekerjaannya selesai
 *
 * Bedanya bukan selera: keduanya tak punya nominal, tak punya jenjang, dan tak
 * menyentuh uang. Yang dicatat adalah "saya sudah memeriksa di lapangan",
 * bukan "saya menyetujui pengeluaran ini".
 *
 * Memaksanya lewat `evaluateEntityApproval` menuntut rantai approval untuk tiap
 * penutupan punch list — birokrasi yang tak membeli apa pun, dan yang pertama
 * dilakukan orang adalah mencari jalan memutarnya.
 *
 * Pengecualian ini SEMPIT dan harus tetap begitu. Menambah nama ke sini adalah
 * keputusan yang terlihat di diff; kalau kelak modulnya menyentuh uang, ia
 * harus keluar dari daftar.
 *
 * ── `timesheet-staf.ts` (ditambahkan 2026-08-11, G2b) — DENGAN SYARAT
 *
 * Atasan menyetujui jam kerja anak buahnya. Diukur saat ditambahkan:
 * nol nominal, nol jenjang, dan jam timesheet tak dipakai menghitung uang di
 * mana pun (`grep jam_kerja|jam_lembur` di `lib/` — hanya `rekap-absensi.ts`
 * yang cocok, dan itu absensi LAPANGAN, tabel yang berbeda).
 *
 * Staf digaji bulanan tetap; jamnya tak menentukan gajinya. Yang dicatat
 * adalah "saya sudah memeriksa" — verifikasi, bukan gerbang pengeluaran.
 *
 * ⚠ SYARAT PENCABUTAN, dan ini BISA DIUKUR:
 *
 *     grep -rn "timesheet_staf" apps/api/src/lib apps/api/src/routes  *       | grep -viE "timesheet-staf|tenant-map"
 *
 * Begitu jam timesheet dipakai membebankan BIAYA overhead ke proyek — yang
 * direncanakan di G2c — angkanya mulai menentukan uang, dan berkas ini
 * HARUS keluar dari daftar ini. Persetujuan yang menentukan pembebanan biaya
 * adalah keputusan, bukan catatan.
 *
 * Menuliskan syaratnya di sini, bukan mengandalkan ingatan, karena
 * pengecualian yang syarat pencabutannya tak tertulis akan bertahan selamanya
 * — pelajaran yang sudah dicatat CLAUDE.md §5.5 tentang peringatan basi.
 */
const VERIFIKASI_LAPANGAN = ['ncr.ts', 'punch-list.ts', 'timesheet-staf.ts']

/** Buang komentar TANPA mengubah jumlah baris. */
function tanpaKomentar(src) {
  let dalamBlok = false
  return src.split('\n').map((b) => {
    const t = b.trim()
    if (dalamBlok) {
      if (t.includes('*/')) dalamBlok = false
      return ''
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) dalamBlok = true
      return ''
    }
    if (t.startsWith('//') || t.startsWith('*')) return ''
    return b
  }).join('\n')
}

const temuan = []

for (const berkas of readdirSync(RUTE).filter((f) => f.endsWith('.ts'))) {
  const src = tanpaKomentar(readFileSync(join(RUTE, berkas), 'utf8'))
  if (VERIFIKASI_LAPANGAN.includes(berkas)) continue
  const pakaiMesin = /\brecordApproval\s*\(/.test(src)

  src.split('\n').forEach((isi, i) => {
    for (const kolom of KOLOM_KEPUTUSAN) {
      // DUA bentuk penulisan, dan yang kedua nyaris terlewat:
      //
      //   { approved_by: user.id }        ← kunci objek
      //   updatePayload.approved_by = …   ← penugasan properti
      //
      // Versi pertama penjaga ini hanya mengenali yang pertama, dan karena itu
      // MELEWATKAN `notifications.ts:199` — pintu kedua ke kasbon, justru jalur
      // yang paling penting dijaga di sini. Ketahuan karena angkanya (7) tak
      // cocok dengan daftar yang sudah saya ukur manual (8).
      const kunciObjek = new RegExp(`\\b${kolom}\\s*:`).test(isi)
      const penugasan = new RegExp(`\\.${kolom}\\s*=`).test(isi)
      if (!kunciObjek && !penugasan) continue
      if (/\.select\(|users!|\bselect\s*:/.test(isi)) continue
      if (pakaiMesin) continue
      temuan.push({ berkas, baris: i + 1, kolom })
    }
  })
}

const sekarang = {}
for (const t of temuan) sekarang[t.berkas] = (sekarang[t.berkas] ?? 0) + 1

const naik = []
for (const [b, n] of Object.entries(sekarang)) {
  const lantai = LANTAI_BERKAS[b] ?? 0
  if (n > lantai) naik.push(`${b}: ${lantai} → ${n}`)
}
const turun = []
for (const [b, lantai] of Object.entries(LANTAI_BERKAS)) {
  const n = sekarang[b] ?? 0
  if (n < lantai) turun.push(`${b}: ${lantai} → ${n}`)
}

console.log('══ Approval satu pintu ═════════════════════════════════════')
console.log(`  penulisan di luar mesin : ${temuan.length}`)
console.log(`  lantai                  : ${Object.values(LANTAI_BERKAS).reduce((a, b) => a + b, 0)}\n`)

if (temuan.length > 0) {
  for (const t of temuan) {
    console.log(`   ${t.berkas}:${t.baris}  → ${t.kolom} ditulis tanpa recordApproval`)
  }
  console.log('')
}

if (naik.length > 0) {
  console.error('❌ PINTU APPROVAL BARU DI BERKAS:\n')
  for (const n of naik) console.error(`   ${n}`)
  console.error(`
   Keputusan persetujuan WAJIB lewat \`utils/approval.ts\`:

     const decision = await evaluateEntityApproval(request, { entityType, entityId, amount })
     if (!decision.allowed) return reply.status(403).send({ error: 'Akses ditolak' })
     const rec = await recordApproval({ entityType, entityId, level, approvedBy, companyId })

   Menulis \`approved_by\` langsung berarti entitas yang menurut konfigurasi
   butuh dua level bisa lolos dengan satu ketukan — dan konfigurasinya tetap
   terlihat benar di halaman pengaturan.

   Kalau modul ini memang TIDAK butuh persetujuan berjenjang, kolomnya jangan
   dinamai seperti keputusan.
`)
  process.exit(1)
}

if (turun.length > 0) {
  console.log('✓ Berkurang — perbarui LANTAI_BERKAS di kepala berkas ini:\n')
  for (const t of turun) console.log(`   ${t}`)
  process.exit(0)
}

console.log('✓ Tidak bertambah di berkas mana pun.')
