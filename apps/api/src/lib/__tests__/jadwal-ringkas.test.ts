/**
 * RINGKASAN PEMICU JADWAL — penjumlahannya wajib utuh.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA — celah nyata, diukur 2026-08-30
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jalan pertama penjadwal sesudah `SCHEDULER_URL` dipasang membalas:
 *
 *     diperiksa 117 · sukses 0 · gagal 0 · dilewati 114
 *
 * 117 ≠ 0 + 0 + 114. **Tiga baris hilang dari ringkasan.**
 *
 * Ketiganya berstatus `tak-dikenal` — tugas `bersih-notifikasi` yang sudah
 * dipasang migrasi 524 tetapi rutenya belum ada di API produksi.
 *
 * Yang membuatnya berbahaya: workflow `jadwal-tugas.yml` hanya memperingatkan
 * bila `gagal != 0`. Status yang tak terhitung di mana pun tak pernah memicu
 * apa pun — jadi tugas yang namanya salah ketik, atau yang migrasinya sudah
 * jalan sementara kodenya belum ter-deploy, akan DIAM SELAMANYA dengan
 * ringkasan yang terlihat sehat dan CI hijau.
 *
 * Kelas cacat yang sama dengan `::notice::` pada cabang dilewati: bukan salah,
 * cuma tak terlihat.
 *
 * ── YANG DIUJI DI SINI
 *
 * Bukan rutenya (itu butuh basis + akun layanan), melainkan INVARIANNYA:
 * tiap status yang mungkin muncul wajib punya tempat di ringkasan.
 *
 * Test ini akan merah kalau seseorang menambah status baru tanpa menambahkan
 * pencacahnya — persis cara `tak-dikenal` lolos selama ini.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RUTE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'routes', 'v1', 'jadwal.ts',
)

/**
 * Buang komentar sebelum memindai.
 *
 * Berkas itu MENYEBUT nama-nama status di komentarnya untuk menjelaskan
 * sejarah cacat ini. Tanpa pemisahan, test ini akan menghitung contoh di
 * komentar sebagai kode — kelas cacat yang sudah memakan waktu berkali-kali
 * di repo ini.
 */
function tanpaKomentar(teks: string): string {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('ringkasan pemicu jadwal', () => {
  const kode = tanpaKomentar(readFileSync(RUTE, 'utf8'))

  /**
   * Isi objek `ringkas` — inilah yang benar-benar dikirim ke pemanggil.
   *
   * ⚠ Versi pertama test ini memeriksa `h.status === '...'` di SELURUH berkas,
   * dan mutasi membuktikannya salah sasaran: membuang `gagal_klaim:` dari
   * `ringkas` tetap LOLOS, karena penyaringnya (`const gagalKlaim = …`) masih
   * ada beberapa baris di atasnya.
   *
   * Yang menentukan bukan apakah statusnya DISARING, melainkan apakah hasil
   * saringan itu MASUK ke objek yang dikirim.
   */
  const blokRingkas = (() => {
    const i = kode.indexOf('const ringkas = {')
    expect(i, 'blok `const ringkas = {` tak ketemu — polanya berubah?')
      .toBeGreaterThan(-1)
    return kode.slice(i, kode.indexOf('}', i))
  })()

  it('tiap status yang di-push punya pencacah DI DALAM objek ringkas', () => {
    /*
      Status dikumpulkan dari `status: '...'` yang benar-benar ditulis ke
      `hasil`, lalu dicocokkan dengan yang tercacah DI DALAM blok `ringkas`.

      Selisihnya adalah status yang hilang dari jawaban rute — dan yang hilang
      tak pernah memicu peringatan apa pun.
    */
    const dipush = new Set(
      [...kode.matchAll(/status:\s*'([a-z-]+)'/g)].map((m) => m[1]),
    )
    expect(dipush.size, 'tak ada status yang terbaca — polanya berubah?')
      .toBeGreaterThan(0)

    /*
      Dua bentuk pencacahan diterima, dan keduanya harus DI DALAM `ringkas`:

        inline    `gagal: hasil.filter((h) => h.status === 'gagal').length`
        variabel  `tak_dikenal: takDikenal.length`

      Yang kedua tak menyebut nama statusnya, jadi dicocokkan lewat nama
      kuncinya: `tak-dikenal` → `tak_dikenal`, `gagal-klaim` → `gagal_klaim`.
    */
    const inline = new Set(
      [...blokRingkas.matchAll(/h\.status\s*===\s*'([a-z-]+)'/g)].map((m) => m[1]),
    )
    const kunci = new Set(
      [...blokRingkas.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]),
    )

    const hilang = [...dipush].filter(
      (s) => !inline.has(s) && !kunci.has(s.replace(/-/g, '_')),
    )
    expect(
      hilang,
      `status ini di-push tetapi TIDAK masuk objek \`ringkas\`: ${hilang.join(', ')}. `
      + 'Status yang tak terhitung tak pernah memicu peringatan — persis cara '
      + '`tak-dikenal` (117 ≠ 0+0+114) dan `gagal-klaim` diam selama ini.',
    ).toEqual([])
  })

  it('`tak_dikenal` ada di ringkasan — cacat 2026-08-30 tak boleh kembali', () => {
    // Disebut eksplisit, bukan cuma lewat aturan umum di atas: kalau aturan
    // umumnya nanti dilonggarkan, yang satu ini tetap terjaga.
    expect(kode).toMatch(/tak_dikenal:\s*/)
  })

  it('tugas tak dikenal & gagal klaim DICATAT ke log, bukan diam', () => {
    /*
      Menghitungnya di ringkasan membuatnya terlihat di jawaban rute. Tetapi
      penjadwal dipanggil cron tanpa penonton — yang membaca jawabannya cuma
      workflow.

      Log `error` memberi jejak kedua yang bertahan di server, dan bisa dicari
      saat ada yang bertanya "kenapa tugas ini tak pernah jalan?".

      ⚠ Versi pertama test ini memakai regex ber-`|` tanpa kurung:
      `/log\.error\([\s\S]{0,200}tak_dikenal|takDikenal/`. Alternasinya
      mengikat SELURUH pola, jadi cukup kata `takDikenal` muncul di mana pun
      — termasuk di baris `const takDikenal = …` — dan test-nya lolos meski
      log-nya dibuang. Mutasi M3 membuktikannya.

      Sekarang dicocokkan pada blok `if (…) { … log.error … }` masing-masing.
    */
    for (const nama of ['takDikenal', 'gagalKlaim']) {
      const i = kode.indexOf(`if (${nama}.length > 0)`)
      expect(i, `blok penjaga \`${nama}\` tak ketemu`).toBeGreaterThan(-1)
      const blok = kode.slice(i, kode.indexOf('\n      }', i))
      expect(blok, `${nama} wajib dicatat ke log.error`).toMatch(/log\.error\(/)
    }
  })
})
