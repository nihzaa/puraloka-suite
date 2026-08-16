/**
 * Dokumen proyek & opname bersama — supaya dua otomasi bisa DIUJI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `documents` dan `opname_bersama` sama-sama NOL BARIS. Keduanya menahan
 * otomasi yang mustahil dinilai dari tabel kosong:
 *
 *   `documents`       kesiapan audit — proyek mana yang kelengkapan
 *                     berkasnya kurang
 *   `opname_bersama`  pengukuran volume bersama mandor — yang menggantung
 *                     tak diverifikasi, dan yang disengketakan
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BENTUKNYA SENGAJA TIDAK RATA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menyemai semua proyek dengan berkas lengkap membuat otomasinya melaporkan
 * nol — dan nol tak membuktikan apa pun: ia sama saja dengan otomasi yang
 * rusak. Menyemai semuanya kosong sama buruknya: semua tertuduh, dan tak ada
 * yang bisa dibandingkan.
 *
 * Maka DIBUAT BERTINGKAT:
 *
 *   proyek 1   lengkap        kontrak · SPK · gambar kerja · berita acara
 *   proyek 2   kurang satu    tanpa berita acara
 *   proyek 3   kurang dua     hanya kontrak
 *   sisanya    kosong         apa adanya, tak disentuh
 *
 * Otomasi yang benar harus bisa membedakan keempatnya. Yang cuma menghitung
 * "punya dokumen atau tidak" akan menyamakan proyek 2 dan proyek 3.
 *
 * ── Opname
 *
 *   satu `diverifikasi`   sudah beres, TIDAK boleh ditegur
 *   satu `diajukan` lama  menggantung — mandor menunggu pembayaran
 *   satu `diajukan` baru  belum waktunya ditegur
 *   satu `disengketakan`  volume terukur jauh di bawah rencana
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TAK MENYENTUH APA PUN SELAIN BARISNYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penanda: `documents.title` dan `opname_bersama.nomor` berawalan `SEED-`.
 * Pembersihannya:
 *
 *     DELETE FROM documents WHERE title LIKE 'SEED-%';
 *     DELETE FROM opname_bersama WHERE nomor LIKE 'SEED-%';
 *
 * Tak ada trigger kas pada kedua tabel ini (diperiksa: `pg_trigger` kosong
 * untuk keduanya selain trigger waktu), jadi tak ada saldo yang bisa
 * bergeser. Tetap diverifikasi di akhir.
 *
 * ── Menjalankan
 *
 *     node scripts/db/_seed-dokumen-opname.mjs
 *
 * Idempoten: barisnya sendiri dihapus lebih dulu, lalu ditulis ulang.
 */
import { buatClient } from './_koneksi.mjs'

const PENANDA = 'SEED-'

const db = buatClient()
await db.connect()

const { rows: c } = await db.query(`
  SELECT c.id FROM companies c
  WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
  LIMIT 1
`)
if (!c[0]) throw new Error('tak ada tenant beranggota')
const companyId = c[0].id

const { rows: proyek } = await db.query(`
  SELECT id, name FROM projects
   WHERE company_id = $1 AND status IN ('active', 'on_hold', 'completed')
   ORDER BY created_at LIMIT 3
`, [companyId])
if (proyek.length < 3) throw new Error('butuh tiga proyek untuk menyemai bertingkat')

/*
  DUA pengguna, dan itu bukan kelebihan.

  `opname_bersama_check2` menuntut `diverifikasi_oleh <> diukur_oleh` —
  pemisahan tugas yang benar: orang yang mengukur tak boleh memverifikasi
  ukurannya sendiri. Opname bersama menentukan berapa mandor dibayar; kalau
  pengukur dan pemverifikasinya sama, "bersama"-nya tinggal nama.
*/
const { rows: pengguna } = await db.query(`
  SELECT u.id FROM users u
   WHERE u.is_active
     AND EXISTS (SELECT 1 FROM company_members m
                  WHERE m.user_id = u.id AND m.company_id = $1)
   LIMIT 2
`, [companyId])
if (pengguna.length < 2) throw new Error('butuh dua pengguna — pengukur dan pemverifikasi tak boleh sama')
const olehId = pengguna[0].id
const verifikatorId = pengguna[1].id

// ── Bersihkan HANYA baris bertanda ────────────────────────────────────────
const { rowCount: hDok } = await db.query(
  `DELETE FROM documents WHERE title LIKE $1`, [`${PENANDA}%`])
const { rowCount: hOpn } = await db.query(
  `DELETE FROM opname_bersama WHERE nomor LIKE $1`, [`${PENANDA}%`])

function tgl(mundur) {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

// ── 1. Dokumen, BERTINGKAT ────────────────────────────────────────────────
//
// Jenis wajib menurut praktik konstruksi: kontrak (dasar hukum), SPK
// (perintah kerja), gambar kerja (acuan pelaksanaan), berita acara
// (bukti serah terima pekerjaan).
const TINGKAT = [
  ['kontrak', 'spk', 'gambar_kerja', 'berita_acara'],   // lengkap
  ['kontrak', 'spk', 'gambar_kerja'],                    // kurang berita acara
  ['kontrak'],                                            // kurang tiga
]

let dokDitulis = 0
for (let i = 0; i < 3; i++) {
  for (const jenis of TINGKAT[i]) {
    await db.query(`
      INSERT INTO documents
        (project_id, title, doc_type, file_url, file_extension, file_size_kb,
         version, is_visible_to_client, uploaded_by, uploaded_at)
      VALUES ($1,$2,$3::document_type,$4,'pdf',420,1,$5,$6,now())
    `, [proyek[i].id,
        `${PENANDA}${jenis} — ${proyek[i].name}`.slice(0, 200),
        jenis,
        `https://contoh.invalid/${PENANDA}${jenis}.pdf`,
        jenis === 'kontrak' || jenis === 'berita_acara',
        olehId])
    dokDitulis++
  }
}

// ── 2. Opname bersama ─────────────────────────────────────────────────────
const { rows: lingkup } = await db.query(`
  SELECT ws.id, ws.scope_name, ma.project_id
    FROM work_scopes ws
    JOIN mandor_assignments ma ON ma.id = ws.assignment_id
   WHERE ws.status = 'active' AND ma.project_id = ANY($1::uuid[])
   LIMIT 4
`, [proyek.map((p) => p.id)])

if (lingkup.length === 0) throw new Error('tak ada lingkup kerja aktif untuk diopname')

/*
  Empat keadaan yang HARUS bisa dibedakan otomasinya. Kalau lingkupnya kurang
  dari empat, yang tersedia dipakai berputar — tetapi jumlah keadaannya tetap,
  karena justru keragamannya yang diuji.
*/
const KEADAAN = [
  { suffix: 'VERIF',  status: 'diverifikasi',  mundur: 40, rencana: 100, terukur: 98 },
  { suffix: 'LAMA',   status: 'diajukan',      mundur: 25, rencana: 100, terukur: 95 },
  { suffix: 'BARU',   status: 'diajukan',      mundur: 2,  rencana: 100, terukur: 60 },
  { suffix: 'SENGKETA', status: 'disengketakan', mundur: 15, rencana: 100, terukur: 55 },
]

let opnDitulis = 0
for (let i = 0; i < KEADAAN.length; i++) {
  const k = KEADAAN[i]
  const ls = lingkup[i % lingkup.length]
  const verif = k.status === 'diverifikasi'
  const sengketa = k.status === 'disengketakan'

  /*
    URUTANNYA MENIRU DUNIA NYATA, DAN ITU DIPAKSA OLEH BASISNYA.

    Trigger `fn_opname_item_terkunci` menolak penyisipan item bila header-nya
    sudah `diverifikasi`: berita acara yang sudah disahkan tak boleh bertambah
    barisnya. Invarian yang benar — kalau item masih bisa disisipkan sesudah
    verifikasi, tanda tangan pengawas melekat pada dokumen yang isinya masih
    bisa berubah.

    Maka header ditulis `diajukan` dulu, itemnya masuk, BARU statusnya
    dinaikkan. Persis urutan yang terjadi di lapangan.
  */
  const { rows: o } = await db.query(`
    INSERT INTO opname_bersama
      (company_id, project_id, work_scope_id, nomor, tanggal_opname,
       diukur_oleh, status, alasan_sengketa, catatan)
    VALUES ($1,$2,$3,$4,$5,$6,
            (CASE WHEN $7::text = 'diverifikasi' THEN 'diajukan'
                  ELSE $7::text END)::opname_status,
            $8,$9)
    RETURNING id
  `, [companyId, ls.project_id, ls.id,
      `${PENANDA}OPN-${k.suffix}`, tgl(k.mundur), olehId, k.status,
      // `opname_bersama_check`: yang disengketakan WAJIB menyebut alasannya.
      // Sengketa tanpa alasan adalah sengketa yang tak bisa diselesaikan.
      sengketa ? 'Mandor menghitung pasangan bata sampai as, pengawas sampai muka.' : null,
      'disemai untuk menguji otomasi'])

  await db.query(`
    INSERT INTO opname_bersama_item
      (opname_id, uraian, satuan, volume_rencana, volume_terukur, pct_selesai, urutan)
    VALUES ($1,$2,'m²',$3,$4,$5,1)
  `, [o[0].id, `${ls.scope_name} — pengukuran bersama`,
      k.rencana, k.terukur, Math.round((k.terukur / k.rencana) * 100)])

  if (verif) {
    await db.query(`
      UPDATE opname_bersama
         SET status = 'diverifikasi', diverifikasi_oleh = $2, diverifikasi_pada = now()
       WHERE id = $1
    `, [o[0].id, verifikatorId])
  }
  opnDitulis++
}

// ── Verifikasi: yang ditanam HARUS bisa ditemukan lagi ────────────────────
const { rows: cekTingkat } = await db.query(`
  SELECT p.id, count(DISTINCT d.doc_type)::int jenis
    FROM projects p
    JOIN documents d ON d.project_id = p.id AND d.title LIKE $1
   WHERE p.id = ANY($2::uuid[])
   GROUP BY p.id ORDER BY 2 DESC
`, [`${PENANDA}%`, proyek.map((p) => p.id)])

const { rows: cekOpn } = await db.query(
  `SELECT status, count(*)::int n FROM opname_bersama
    WHERE nomor LIKE $1 GROUP BY 1 ORDER BY 1`, [`${PENANDA}%`])

const { rows: kas } = await db.query(
  `SELECT coalesce(sum(balance), 0)::numeric t FROM cash_accounts WHERE company_id = $1`,
  [companyId])

console.log(`\n  dihapus (bertanda lama)  : ${hDok} dokumen · ${hOpn} opname`)
console.log(`  ditulis                  : ${dokDitulis} dokumen · ${opnDitulis} opname`)
console.log(`  tingkat kelengkapan      : ${cekTingkat.map((x) => x.jenis).join(' / ')} jenis`)
console.log(`  keadaan opname           : ${cekOpn.map((x) => `${x.status}=${x.n}`).join(' · ')}`)
console.log(`  saldo kas sesudah semai  : Rp ${Number(kas[0].t).toLocaleString('id')}`)

const tingkat = cekTingkat.map((x) => x.jenis)
if (tingkat.length < 3 || new Set(tingkat).size < 3) {
  throw new Error('kelengkapan dokumen tidak bertingkat — otomasinya tak akan teruji')
}
if (cekOpn.length < 3) {
  throw new Error('keadaan opname kurang beragam — otomasinya tak akan teruji')
}

console.log('\n  ✅ bentuk yang ditanam terbukti bertingkat dan beragam')
console.log(`  bersihkan: DELETE FROM documents WHERE title LIKE '${PENANDA}%';`)
console.log(`             DELETE FROM opname_bersama WHERE nomor LIKE '${PENANDA}%';\n`)

await db.end()
