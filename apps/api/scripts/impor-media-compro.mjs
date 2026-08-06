#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Impor foto compro → Supabase Storage + tabel `situs_media`. Idempoten.
//
// ── Sumber
//
// Peta foto→kategori dibuat dengan mencocokkan PERCEPTUAL HASH gambar galeri
// compro PDF (hal. 13-19) terhadap berkas di `Foto Proyek/`. Byte-hash gagal
// total — PDF mengompres ulang saat menyisipkan — sementara pHash cocok dengan
// jarak Hamming 0 untuk mayoritas: identik, bukan mirip.
// Petanya: docs/superpowers/specs/2026-08-06-landing-publik-peta-foto.json
//
// ── Tiga hal yang WAJIB dan mudah terlupa
//
//   1. `.rotate()` TANPA argumen — menerapkan orientasi EXIF. Foto HP di folder
//      ini ada yang tersimpan terbalik (20220722_130316.jpg terbukti). Resize
//      saja tidak memperbaikinya; hasilnya terbit dalam keadaan terbalik.
//
//   2. EXIF DIBUANG seluruhnya. Foto lapangan mengandung GPS — lokasi rumah
//      klien tidak boleh ikut terbit. sharp membuang metadata secara default
//      selama `withMetadata()` TIDAK dipanggil; itu disengaja di sini.
//
//   3. Dimensi diambil SETELAH rotasi. Foto potret yang dirotasi menukar lebar
//      dan tinggi — memakai angka sebelum rotasi membuat `width`/`height` di
//      HTML salah, dan halaman melompat saat gambar dimuat (CLS).
//
// ── Pemakaian
//
//   SUMBER_FOTO="E:/PURALOKA PERSADA/Foto Proyek" \
//   PETA_FOTO="../../docs/superpowers/specs/2026-08-06-landing-publik-peta-foto.json" \
//   node scripts/impor-media-compro.mjs [--dry]
// ════════════════════════════════════════════════════════════════════════════

import { readFile, readdir } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import dotenv from 'dotenv'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUMBER = process.env.SUMBER_FOTO
const PETA = process.env.PETA_FOTO
const BUCKET = 'situs'
const LEBAR = [640, 1280, 1920]
const KERING = process.argv.includes('--dry')

if (!SUMBER || !PETA) {
  console.error('Set SUMBER_FOTO dan PETA_FOTO lebih dulu.')
  process.exit(1)
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY tidak ada di .env.')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
)

/** Alt text yang menyebut ISI foto, bukan nama berkas. */
const ALT = {
  pabrik: 'Pembangunan pabrik — struktur baja dan lantai kerja',
  'konstruksi-baja': 'Konstruksi baja — fabrikasi dan ereksi profil WF',
  'beton-pracetak': 'Beton pracetak — u-ditch dan panel pagar',
  'pematangan-lahan': 'Pematangan lahan — cut and fill sebelum pondasi',
  perumahan: 'Pembangunan perumahan',
  'rumah-mewah': 'Pembangunan rumah mewah',
  'renovasi-rumah': 'Renovasi rumah',
}

async function companyId() {
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('code', 'puraloka-persada')
    .single()
  if (error) throw new Error(`gagal membaca company: ${error.message}`)
  return data.id
}

async function petaKategori(cid) {
  const { data, error } = await supabase
    .from('situs_kategori')
    .select('id, kunci')
    .eq('company_id', cid)
  if (error) throw new Error(`gagal membaca kategori: ${error.message}`)
  return Object.fromEntries(data.map((k) => [k.kunci, k.id]))
}

async function main() {
  const cid = await companyId()
  const kategori = await petaKategori(cid)
  const peta = JSON.parse(await readFile(PETA, 'utf8'))

  // Windows tak peka huruf besar-kecil; peta bisa menyebut .JPG sementara
  // berkasnya .jpg. Diindeks lowercase supaya keduanya ketemu.
  const berkas = new Map()
  for (const f of await readdir(SUMBER)) berkas.set(f.toLowerCase(), f)

  let masuk = 0
  let lewat = 0
  const kategoriKosong = []

  for (const [kunciMentah, daftar] of Object.entries(peta)) {
    const kunci = kunciMentah.toLowerCase()
    const katId = kategori[kunci]

    if (!katId) {
      console.warn(`  ! kategori "${kunci}" tak ada di DB — dilewati`)
      continue
    }
    if (!Array.isArray(daftar) || daftar.length === 0) {
      kategoriKosong.push(kunci)
      continue
    }

    console.log(`\n${kunci} (${daftar.length} foto)`)
    let urutan = 0

    for (const entri of daftar) {
      const nama = Array.isArray(entri) ? entri[0] : entri
      const asli = berkas.get(String(nama).toLowerCase())

      if (!asli) {
        console.warn(`  ! ${nama} tak ada di sumber`)
        lewat++
        continue
      }

      const buf = await readFile(join(SUMBER, asli))
      const dasar = basename(asli, extname(asli))
      const path = `${kunci}/${dasar}`

      let lebarAkhir = 0
      let tinggiAkhir = 0

      for (const w of LEBAR) {
        const hasil = await sharp(buf)
          .rotate() // terapkan EXIF orientation — WAJIB, lihat header
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true })

        // Dimensi dari varian TERBESAR, diambil setelah rotasi.
        if (w === LEBAR[LEBAR.length - 1]) {
          lebarAkhir = hasil.info.width
          tinggiAkhir = hasil.info.height
        }

        if (KERING) continue

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(`${path}-${w}.webp`, hasil.data, {
            contentType: 'image/webp',
            upsert: true,
          })
        if (error) throw new Error(`unggah ${path}-${w}: ${error.message}`)
      }

      if (!KERING) {
        const { error } = await supabase.from('situs_media').upsert(
          {
            company_id: cid,
            kategori_id: katId,
            path_storage: path,
            alt: ALT[kunci] ?? `Dokumentasi ${kunci.replace(/-/g, ' ')}`,
            lebar: lebarAkhir,
            tinggi: tinggiAkhir,
            urutan: urutan++,
          },
          { onConflict: 'company_id,path_storage' },
        )
        if (error) throw new Error(`simpan ${path}: ${error.message}`)
      }

      masuk++
      console.log(`  ${asli} → ${path} (${lebarAkhir}×${tinggiAkhir})`)
    }
  }

  console.log(`\n${KERING ? '[KERING] ' : ''}selesai: ${masuk} media, ${lewat} dilewati`)

  // Dilaporkan eksplisit, bukan didiamkan: kategori tanpa foto akan tampil
  // sebagai judul kosong di halaman, dan itu terlihat seperti fitur rusak.
  if (kategoriKosong.length > 0) {
    console.log(
      `\ntanpa foto tercocok: ${kategoriKosong.join(', ')}\n` +
        '  → file aslinya tidak ada di folder sumber. Gambar galeri PDF-nya\n' +
        '    nyata (hal. 17 & 19), jadi kategorinya BUKAN salah — sumbernya\n' +
        '    yang belum ditemukan. Seksi ini disembunyikan sampai fotonya ada.',
    )
  }
}

main().catch((e) => {
  console.error('\nGAGAL:', e.message)
  process.exit(1)
})
