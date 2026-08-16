/**
 * 10.1 — utilisasi alat.
 *
 * Yang diuji di sini terutama `jamPakai()`, karena di situlah satu-satunya
 * tafsiran yang bisa salah TANPA GEJALA: kolomnya bernama `jam_mulai` /
 * `jam_selesai` tetapi bertipe `numeric` dan berisi pembacaan HOUR METER
 * kumulatif (1.172 → 1.180 → 1.188 …), bukan jam dinding.
 *
 * Tafsiran `HH:MM` — yang saya pakai lebih dulu, lalu ditolak data — mengurai
 * "1172" jadi pukul 11:72 dan menghasilkan durasi karangan tanpa satu galat
 * pun. Test pertama di bawah menahan tafsiran itu kembali.
 */

import { describe, expect, it } from 'vitest'
import { jamPakai } from '../ai-tool-utilisasi-alat.js'

describe('jamPakai — hour meter, bukan jam dinding', () => {
  it('memakai SELISIH pembacaan, bukan menguraikannya sebagai HH:MM', () => {
    /*
     * Nilai nyata dari basis (2026-07-27). Selisihnya 8 jam.
     *
     * Kalau kelak ada yang "membetulkan" fungsi ini jadi penguraian jam:menit,
     * 1172 → 11 jam 72 menit dan 1180 → 11 jam 80 menit, selisihnya jadi 8
     * MENIT (0,133 jam) — hampir 60× lebih kecil, dan tetap berupa angka yang
     * terlihat wajar di laporan.
     */
    expect(jamPakai('1172.00', '1180.00')).toBe(8)
  })

  it('menerima numeric yang datang sebagai STRING dari PostgREST', () => {
    // `numeric` tak pernah datang sebagai number lewat PostgREST. Menganggapnya
    // number membuat Number(undefined) → NaN, dan NaN yang dijumlahkan
    // meracuni SELURUH total, bukan satu baris.
    expect(jamPakai('1244.00', '1252.00')).toBe(8)
    expect(jamPakai(1244, 1252)).toBe(8)
  })

  it('menolak selisih negatif — hour meter yang di-reset setelah servis', () => {
    // Kalau ini memulangkan angka negatif dan ikut dijumlah, total alat lain
    // ikut berkurang: "dipakai 3 jam" padahal 11 jam.
    expect(jamPakai('1200.00', '900.00')).toBeNull()
  })

  it('menolak selisih nol — bukan memulangkan 0', () => {
    // 0 berarti "menyala nol jam"; null berarti "datanya tak bisa dipakai".
    // Menyamakan keduanya menyembunyikan cacat data di balik angka yang sah.
    expect(jamPakai('1200.00', '1200.00')).toBeNull()
  })

  it('menolak nilai kosong dan yang bukan angka', () => {
    expect(jamPakai(null, '1200')).toBeNull()
    expect(jamPakai('1200', null)).toBeNull()
    expect(jamPakai('entah', '1200')).toBeNull()
    expect(jamPakai('', '1200')).toBeNull()
  })

  it('pecahan jam dipertahankan, tidak dibulatkan diam-diam', () => {
    expect(jamPakai('1000.00', '1006.50')).toBe(6.5)
  })
})
