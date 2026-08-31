import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ============================================================================
// GERBANG BATAS PAKET HARUS BENAR-BENAR TERPASANG DI RUTENYA.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA BENTUK-KODE, BUKAN TEST PERILAKU
// ══════════════════════════════════════════════════════════════════════════
//
// `batas-paket.test.ts` sudah membuktikan KEPUTUSANNYA benar. Yang tak bisa
// dibuktikannya: apakah ada yang MEMANGGILNYA.
//
// Cacat itu persis yang ditemukan hari ini di lapisan bawahnya — skema
// `plans`/`plan_features`/`tenant_feature_overrides` lengkap dan rapi sejak
// entah kapan, dengan NOL pembaca di seluruh kode. Rancangan yang benar,
// diam, dan tak menjaga apa pun.
//
// Bentuk yang sama bisa terulang satu tingkat di atasnya: `bacaBatasPaket()`
// ada, teruji, dan tak dipanggil rute mana pun. Tak ada galat — kuota cuma
// tak pernah berlaku.
//
// Test perilaku tak menutup ini dengan murah: membuat 4 proyek pada paket
// 3-proyek menuntut tenant sungguhan, langganan, paket, dan nilai fitur —
// dan `plans` sengaja dibiarkan KOSONG (harga milik founder, migrasi 538).
// Jadi yang diperiksa di sini BENTUK kodenya.
//
// ⚠ Ini penjaga bentuk, dan batasnya jujur: ia membuktikan gerbangnya
// DIPANGGIL, bukan bahwa perilakunya benar. Yang kedua dijaga
// `batas-paket.test.ts`. Keduanya perlu.
// ============================================================================

const AKAR = process.cwd()

/** Rute yang WAJIB berpagar kuota, beserta kunci fiturnya.
 *
 *  Menambah baris di sini adalah cara menyatakan "rute ini harus dibatasi".
 *  Kunci fiturnya wajib ada di `538_katalog_fitur_paket.sql` — dijaga di
 *  bawah, karena kunci yang salah eja membuat gerbangnya pulang "boleh"
 *  tanpa memeriksa apa pun. */
const WAJIB_BERPAGAR: { berkas: string; kunci: string; apa: string }[] = [
  {
    berkas: 'src/routes/v1/projects.ts',
    kunci: 'kuota.proyek_aktif',
    apa: 'pembuatan proyek',
  },
  {
    berkas: 'src/routes/v1/auth.ts',
    kunci: 'kuota.pengguna',
    apa: 'pendaftaran pengguna baru',
  },
]

function tanpaKomentar(isi: string): string {
  return isi
    .split('\n')
    .filter((b) => !b.trim().startsWith('//') && !b.trim().startsWith('*'))
    .join('\n')
}

describe('gerbang batas paket terpasang di rutenya', () => {
  for (const { berkas, kunci, apa } of WAJIB_BERPAGAR) {
    it(`${apa} memeriksa ${kunci}`, () => {
      const isi = tanpaKomentar(readFileSync(join(AKAR, berkas), 'utf-8'))

      expect(
        isi.includes('bacaBatasPaket('),
        `${berkas} tak memanggil bacaBatasPaket() — kuota tak pernah dibaca, ` +
          'dan tiap permintaan lolos tanpa diperiksa.'
      ).toBe(true)

      expect(
        isi.includes(`'${kunci}'`),
        `${berkas} tak menyebut kunci '${kunci}'. Kunci yang salah eja membuat ` +
          'gerbangnya pulang "boleh" tanpa memeriksa apa pun — diam, bukan galat.'
      ).toBe(true)

      // 402 = "bayar untuk melanjutkan". 403 akan membuat penggunanya mencari
      // admin untuk minta izin, bukan menaikkan paketnya — dan admin pun tak
      // bisa menolongnya.
      expect(
        isi.includes('status(402)'),
        `${berkas} menolak dengan kode selain 402.`
      ).toBe(true)
    })
  }

  it('tiap kunci yang dipakai rute BENAR-BENAR ada di katalog fitur', () => {
    // Kunci hantu adalah cacat paling diam di seluruh rantai ini: gerbangnya
    // memanggil, katalog tak punya barisnya, `fitur.get()` memulangkan
    // undefined, dan `masihMuat()` pulang "boleh". Semua lapisan menjawab
    // benar untuk dirinya sendiri.
    const migrasi = readFileSync(
      join(AKAR, '..', '..', 'db', 'migrations', '538_katalog_fitur_paket.sql'),
      'utf-8'
    )
    const isiTanpaKomentar = migrasi
      .split('\n')
      .filter((b) => !b.trim().startsWith('--'))
      .join('\n')

    for (const { kunci, apa } of WAJIB_BERPAGAR) {
      expect(
        isiTanpaKomentar.includes(`('${kunci}'`),
        `Kunci '${kunci}' dipakai ${apa} tetapi TIDAK ada di katalog 538. ` +
          'Gerbangnya akan memanggil, tak menemukan, lalu meluluskan semuanya.'
      ).toBe(true)
    }
  })

  it('kuota yang BELUM punya penegak tercatat jujur', () => {
    // Katalog 538 mendaftarkan tiga kuota; yang ditegakkan baru dua.
    // `kuota.penyimpanan_gb` sengaja belum — unggahan tersebar di TUJUH
    // tempat, dan gerbang per-tempat berarti tujuh kesempatan lupa.
    //
    // Test ini menjaga agar catatan itu tetap JUJUR ke dua arah:
    //
    //   · kalau penegaknya dipasang tapi catatannya lupa dihapus, orang
    //     mengira kuota yang bekerja itu tak bekerja — dan tak menawarkannya
    //   · kalau catatannya dihapus tanpa memasang penegaknya, kuota yang
    //     tak menahan apa pun terlihat sudah bekerja, lalu dijanjikan ke
    //     pelanggan
    //
    // Yang kedua lebih mahal, dan itulah yang sedang dijaga hari ini.
    const modul = readFileSync(join(AKAR, 'src', 'utils', 'batas-paket.ts'), 'utf-8')
    const adaCatatan = modul.includes('KUOTA YANG BELUM PUNYA PENEGAK')

    const berpagar = new Set(WAJIB_BERPAGAR.map((r) => r.kunci))
    const penyimpananDitegakkan = berpagar.has('kuota.penyimpanan_gb')

    if (penyimpananDitegakkan) {
      expect(
        adaCatatan,
        'kuota.penyimpanan_gb SUDAH ditegakkan — hapus catatan "KUOTA YANG ' +
          'BELUM PUNYA PENEGAK" di batas-paket.ts, ia kini menyesatkan.'
      ).toBe(false)
    } else {
      expect(
        adaCatatan,
        'kuota.penyimpanan_gb BELUM ditegakkan dan catatannya hilang. Kuota ' +
          'yang tak menahan apa pun akan terlihat sudah bekerja, lalu ' +
          'dijanjikan ke pelanggan.'
      ).toBe(true)
    }
  })

  it('trial yang habis TIDAK dilepas dari batas paketnya', () => {
    // ⚠ Penjaga ini lahir dari kesalahan saya sendiri, dan dari penjaga LAIN
    // yang gagal menangkapnya.
    //
    // Percobaan pertama menulis `return TAK_DIBATASI` untuk trial yang habis —
    // artinya trial KEDALUWARSA memberi akses LEBIH BANYAK daripada yang masih
    // jalan. Membiarkan trial lewat jadi menguntungkan.
    //
    // `batas-paket.test.ts` TIDAK menangkapnya, dan itu bukan kelalaian: test
    // di sana menyusun `BatasPaket` dengan tangan supaya bisa murni tanpa
    // basis, jadi ia tak pernah melewati cabang yang memutuskan. Mutasinya
    // dicoba dan 14 test tetap hijau.
    //
    // Yang bisa diperiksa tanpa basis adalah BENTUKNYA: cabang trial tak boleh
    // memulangkan TAK_DIBATASI.
    const modul = readFileSync(join(AKAR, 'src', 'utils', 'batas-paket.ts'), 'utf-8')
    const baris = modul.split(String.fromCharCode(10))

    const i = baris.findIndex((b) => b.includes("baris.status === 'trialing'"))
    expect(i, 'cabang trial tak ditemukan — bentuknya berubah?').toBeGreaterThan(-1)

    // Lima baris sesudah cabang trial dimulai: cukup untuk menangkap
    // `return TAK_DIBATASI` yang ditulis di dalamnya, dan cukup sempit untuk
    // tak menyenggol cabang lain yang memang berhak memulangkannya.
    const sekitar = baris.slice(i, i + 5).join(' ')
    expect(
      sekitar.includes('TAK_DIBATASI'),
      'Cabang trial memulangkan TAK_DIBATASI. Trial yang HABIS akan mendapat ' +
        'akses lebih banyak daripada yang masih jalan — batasnya justru hilang, ' +
        'dan membiarkan trial lewat jadi menguntungkan. Trial habis TETAP ' +
        'tunduk pada batas paketnya.'
    ).toBe(false)
  })

  it('daftar rute berpagar tidak kosong', () => {
    // Penjaga yang daftarnya kosong selalu hijau, dan diamnya tak bisa
    // dibedakan dari lulus.
    expect(WAJIB_BERPAGAR.length).toBeGreaterThan(1)
  })
})
