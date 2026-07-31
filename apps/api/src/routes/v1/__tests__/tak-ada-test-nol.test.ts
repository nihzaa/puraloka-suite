import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// BERKAS TEST YANG NOL TEST HARUS GAGAL, BUKAN "LULUS".
//
// ── Kenapa ada
//
// 2026-07-31: `look-ahead.test.ts` ditulis dengan helper bernama `it`
// (`const it = (id, mulai, selesai) => ...`). Nama itu MENIMPA `it` milik
// vitest, jadi setiap `it('...', () => {...})` di dalam `describe` memanggil
// helper tersebut — bukan mendaftarkan test.
//
// Hasilnya: **13 test tak pernah terdaftar**, dan vitest melaporkannya
// `✓ look-ahead.test.ts (0 test)` — dihitung sebagai berkas yang LULUS.
// Suite tetap hijau, angka total tetap naik, dan tak ada satu pun sinyal
// bahwa aritmetika look-ahead sama sekali belum diuji.
//
// Ini kelas kegagalan yang sama dengan yang dijaga AUTOPILOT §9a — sesuatu
// yang "selesai" menurut laporan tapi mati pada kenyataannya. Bedanya, di sini
// yang mati adalah TESTNYA sendiri, jadi ia juga membutakan seluruh penjaga
// lain di berkas itu.
//
// ── Kenapa dijaga di sini, bukan lewat konfigurasi vitest
//
// `passWithNoTests` mengatur perilaku saat TIDAK ADA berkas test yang cocok —
// bukan saat berkas ADA tapi isinya nol test terdaftar. Tak ada opsi bawaan
// untuk yang kedua, jadi diperiksa dari sumbernya.
// ============================================================

const DIR_TEST = import.meta.dirname
const DIR_LIB_TEST = join(DIR_TEST, '..', '..', '..', 'lib', '__tests__')

function berkasTest(dir: string): string[] {
  const hasil: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTest(p))
    else if (e.name.endsWith('.test.ts')) hasil.push(p)
  }
  return hasil
}

describe('tak boleh ada berkas test yang nol test terdaftar', () => {
  const semua = [...berkasTest(DIR_TEST), ...berkasTest(DIR_LIB_TEST)]

  it('menemukan berkas test untuk diperiksa', () => {
    // Penjaga untuk penjaga: kalau pemindaiannya sendiri rusak (path salah),
    // ia akan "lulus" karena memeriksa nol berkas.
    expect(semua.length).toBeGreaterThan(20)
  })

  it('setiap berkas .test.ts punya minimal satu `it(` / `test(` yang NYATA', () => {
    const kosong: string[] = []
    for (const f of semua) {
      const isi = readFileSync(f, 'utf8')
      // Hitung pemanggilan `it(`/`test(` yang BUKAN definisi helper. Yang
      // dicari: `it('...` atau `test('...` dengan argumen pertama string.
      const nyata = [...isi.matchAll(/(?:^|[\s;{])(it|test)\s*\(\s*['"`]/g)].length
      if (nyata === 0) kosong.push(f.split(/[\\/]/).pop() as string)
    }
    expect(kosong, `berkas ini tak mendaftarkan test apa pun: ${kosong.join(', ')}`).toEqual([])
  })

  it('`it` dan `test` tidak di-shadow oleh deklarasi lokal', () => {
    // Inilah penyebab sesungguhnya kasus look-ahead: bukan lupa menulis test,
    // melainkan nama helper yang menimpa API vitest. Dicegat langsung supaya
    // pesannya menunjuk sebabnya, bukan gejalanya.
    const bermasalah: string[] = []
    for (const f of semua) {
      const nama = f.split(/[\\/]/).pop() as string
      // Berkas INI memuat pola deteksinya sendiri sebagai literal regex, jadi
      // ia akan menuduh dirinya sendiri. Dikecualikan secara eksplisit —
      // bukan dengan melonggarkan polanya, karena pola yang dilonggarkan
      // supaya "tidak kena diri sendiri" biasanya juga berhenti menangkap
      // kasus nyatanya.
      if (nama === 'tak-ada-test-nol.test.ts') continue
      const isi = readFileSync(f, 'utf8')
      if (/\b(?:const|let|var|function)\s+(it|test)\b\s*[=(]/.test(isi)) {
        bermasalah.push(nama)
      }
    }
    expect(
      bermasalah,
      `\`it\`/\`test\` di-shadow di: ${bermasalah.join(', ')} — ` +
      'seluruh test di berkas itu TIDAK akan terdaftar, dan vitest tetap melaporkannya LULUS. ' +
      'Ganti nama helper-nya (mis. `bikin`).',
    ).toEqual([])
  })
})
