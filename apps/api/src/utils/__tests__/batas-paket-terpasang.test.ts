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

  it('daftar rute berpagar tidak kosong', () => {
    // Penjaga yang daftarnya kosong selalu hijau, dan diamnya tak bisa
    // dibedakan dari lulus.
    expect(WAJIB_BERPAGAR.length).toBeGreaterThan(1)
  })
})
