#!/usr/bin/env node
// ============================================================================
// Jenis yang TAK bervolume wajib terdaftar — kalau tidak, ia hilang senyap.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Rute `rekap-volume` membedakan dua keadaan yang terlihat sama:
//
//   jenis TERDAFTAR di `TANPA_VOLUME`  → dilaporkan "sengaja tak bervolume"
//   jenis TIDAK terdaftar tanpa volume → dilaporkan GAGAL ("cacat modul")
//
// Pembedaan itu benar dan berharga. Yang tak ada: apa pun yang memastikan
// daftarnya tetap sepadan dengan modulnya.
//
// Ditemukan 2026-08-19 — enam jenis baru ditambahkan dalam satu sesi, dan dua
// di antaranya (`baja_gusset`, `baja_sambungan_momen`) memang tak bervolume
// tetapi tak masuk daftar. Akibatnya `rekap-volume` melaporkannya sebagai
// CACAT MODUL pada tiap proyek yang memakainya — tuduhan yang salah, dan
// yang membacanya akan mencari cacat di tempat yang tak ada cacatnya.
//
// ── Cacat yang lebih besar, yang ditemukan bersamanya
//
// Dua modul lain (`kuda_kuda_kayu`, `baja_ringan`) memulangkan volume dengan
// BENTUK khusus, dan itu meruntuhkan `rekap-volume` seluruh proyek dengan
// HTTP 500 — bukan satu baris yang hilang, melainkan seluruh halaman.
//
// Bentuknya dijaga `src/lib/__tests__/struktur-bentuk-volume.test.ts` (yang
// benar-benar MEMANGGIL tiap modul). Penjaga ini menjaga sisi DAFTARNYA, yang
// memang pemeriksaan teks.
//
// ── Cara memutuskan
//
// Jenis di konstanta `JENIS` dipetakan ke fungsi analisanya lewat `switch` di
// `hitung()`. Modul yang fungsinya TIDAK memulangkan `volume` — dikenali dari
// tak adanya `volume:` di objek yang dikembalikan — wajib ada di
// `TANPA_VOLUME`, dan sebaliknya.
//
// Ambang NOL. Tiap ketidaksepadanan adalah elemen yang hilang dari rekap
// volume atau tuduhan cacat yang salah alamat.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = process.cwd()
const RUTE = join(AKAR, 'src', 'routes', 'v1', 'struktur.ts')

const isi = readFileSync(RUTE, 'utf8')

/** Jenis yang terdaftar di konstanta JENIS. */
const mJenis = isi.match(/const JENIS = \[([\s\S]*?)\] as const/)
if (!mJenis) {
  console.error('❌ Konstanta JENIS tak ditemukan di', RUTE)
  process.exit(1)
}
const semuaJenis = [...mJenis[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])

/** Isi TANPA_VOLUME. */
const mTanpa = isi.match(/const TANPA_VOLUME: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/)
if (!mTanpa) {
  console.error('❌ Konstanta TANPA_VOLUME tak ditemukan')
  process.exit(1)
}
const tanpaVolume = new Set(
  [...mTanpa[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]),
)

/**
 * Pemetaan jenis → berkas modul, dibaca dari `switch` di `hitung()`.
 *
 * Contoh baris: `case 'sloof': return analisaSloof(dgnJumlah as never)`
 */
const petaFungsi = new Map()
for (const m of isi.matchAll(/case '([a-z_]+)': return (\w+)\(/g)) {
  petaFungsi.set(m[1], m[2])
}

/** Berkas mana yang mengekspor fungsi itu, dan apakah ia memulangkan volume. */
const impor = new Map()
for (const m of isi.matchAll(/import \{([^}]+)\} from '\.\.\/\.\.\/lib\/([\w-]+)\.js'/g)) {
  for (const nama of m[1].split(',').map((x) => x.trim().replace(/^type\s+/, ''))) {
    if (nama) impor.set(nama, m[2])
  }
}

const masalah = []

for (const jenis of semuaJenis) {
  const fungsi = petaFungsi.get(jenis)
  if (!fungsi) {
    masalah.push({
      jenis,
      pesan: 'terdaftar di JENIS tetapi tak punya cabang di hitung() — '
        + 'rute menerimanya lalu melempar "jenis tak dikenal" di jalan',
    })
    continue
  }

  const modul = impor.get(fungsi)
  if (!modul) continue      // fungsi lokal; tak bisa diperiksa dari sini

  const berkas = join(AKAR, 'src', 'lib', `${modul}.ts`)
  if (!existsSync(berkas)) continue

  const isiModul = readFileSync(berkas, 'utf8')

  /*
    Apakah fungsi ini memulangkan `volume`?

    Dicari dari tipe hasilnya: modul yang bervolume mendeklarasikan
    `volume:` di antarmuka hasilnya atau meng-extend `HasilElemen` (yang
    memuat `volume`). Longgar ke arah yang aman — modul yang salah dianggap
    bervolume akan menuntut pendaftaran, bukan lolos diam-diam.
  */
  const reFungsi = new RegExp(`export function ${fungsi}\\(([\\s\\S]*?)\\n\\}`, 'm')
  const badanMentah = isiModul.match(reFungsi)?.[1] ?? ''

  /*
    ══════════════════════════════════════════════════════════════════════════
    KOMENTAR DIBUANG sebelum dipindai — penjaga tak boleh membaca prosa
    sebagai kode.

    Ditemukan 2026-08-19: satu kalimat komentar berbunyi "…tanpa dasar," dan
    kata `dasar,` itu cocok dengan pola `\bdasar[,:]` yang dimaksudkan untuk
    menangkap bentuk bersarang `dasar: analisaKolom(...)`.

    Akibatnya `analisaSambunganKayu` DITUDUH memulangkan volume — padahal
    hasilnya cuma `{ periksa, aman, kapasitas, catatan }`. Tuduhan yang salah
    pada modul yang benar, dan penyebabnya sebuah kalimat berbahasa
    Indonesia.

    Penjaga yang menuduh hal yang benar akan dimatikan orang, dan yang
    dimatikan tak lagi menjaga yang sungguhan. Ini kedua kalinya di sesi ini
    — yang pertama `audit-medan-jumlah-tak-bentrok` menuduh
    `InputGambarPolaSambungan`.
    ══════════════════════════════════════════════════════════════════════════
  */
  const buangKomentar = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, ' ')     // blok
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')  // baris (bukan `://` di URL)

  const badan = buangKomentar(badanMentah)
  /*
    Volume bisa muncul dalam TIGA bentuk, dan versi pertama penjaga ini hanya
    mengenali satu — lalu menuduh kolom dan kolom_bulat tak bervolume,
    padahal keduanya membungkusnya di dalam `dasar`.

      1. langsung        volume: {...} di objek yang dikembalikan
      2. bersarang       dasar: analisaKolom(...) — volumenya di dalamnya
      3. lewat antarmuka interface X { volume: VolumeElemen }

    Rute sudah menangani bentuk kedua (volumeDari membaca v.dasar?.volume).
    Penjaga yang tak mengenalinya menghasilkan tuduhan palsu — dan penjaga
    yang menuduh hal yang benar akan dimatikan orang.
  */
  /* Berkas penuh juga dibersihkan — alasannya sama dengan badan fungsi. */
  const isiBersih = buangKomentar(isiModul)

  const bervolume =
    /\bvolume[,:]/.test(badan)
    || /\bdasar[,:]/.test(badan)
    || /volume:\s*VolumeElemen/.test(isiBersih)
    || /extends HasilElemen/.test(isiBersih)

  const terdaftarTanpa = tanpaVolume.has(jenis)

  if (!bervolume && !terdaftarTanpa) {
    masalah.push({
      jenis,
      pesan: `${fungsi}() tak memulangkan volume, tetapi "${jenis}" TIDAK ada `
        + 'di TANPA_VOLUME. rekap-volume akan melaporkannya sebagai CACAT '
        + 'MODUL — tuduhan yang salah, dan yang membacanya mencari cacat di '
        + 'tempat yang tak ada cacatnya.',
    })
  }
  if (bervolume && terdaftarTanpa) {
    masalah.push({
      jenis,
      pesan: `${fungsi}() MEMULANGKAN volume, tetapi "${jenis}" terdaftar di `
        + 'TANPA_VOLUME. Volumenya akan dilewati senyap — elemen itu hilang '
        + 'dari rekap proyek tanpa satu pun galat.',
    })
  }
}

/* Jenis di TANPA_VOLUME yang tak ada lagi di JENIS = daftar basi. */
for (const j of tanpaVolume) {
  if (!semuaJenis.includes(j)) {
    masalah.push({
      jenis: j,
      pesan: 'ada di TANPA_VOLUME tetapi TIDAK di konstanta JENIS — '
        + 'daftar basi, sisa jenis yang sudah dihapus',
    })
  }
}

console.log('══ Jenis tanpa volume: daftar vs modulnya ══════════════════')
console.log(`  jenis di JENIS      : ${semuaJenis.length}`)
console.log(`  di TANPA_VOLUME     : ${tanpaVolume.size}`)
console.log(`  ketidaksepadanan    : ${masalah.length}`)
console.log('  ambang              : 0 (bukan ratchet)')

if (masalah.length) {
  console.log('')
  console.error('❌ Daftar TANPA_VOLUME tak sepadan dengan modulnya:')
  console.error('')
  for (const m of masalah) {
    console.error(`     ${m.jenis}`)
    console.error(`       ${m.pesan}`)
    console.error('')
  }
  console.error('   Perbaikan: tambahkan/hapus jenisnya di TANPA_VOLUME pada')
  console.error(`   ${RUTE}`)
  process.exit(1)
}

console.log('')
console.log(`✅ ${semuaJenis.length} jenis — daftar tanpa-volume sepadan dengan modulnya`)
