/**
 * "INGATKAN SAYA JUMAT" — janji yang dititipkan ke asisten.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENITIP JANJI BUKAN SEKADAR MENCATAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Asisten manusia yang berguna bukan yang mencatat di buku, melainkan yang
 * MENAGIH kembali pada waktunya. Catatan yang tak pernah dibacakan ulang sama
 * saja dengan tak dicatat.
 *
 * Karena itu tool ini berpasangan dengan tugas berkala `kirim-pengingat`:
 * yang di sini menyimpan janjinya, yang di sana membangunkannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WAKTU DIURAI DI SINI, BUKAN OLEH MODEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Model boleh menyebut "besok" atau "Jumat", dan ia AKAN salah menghitung
 * tanggalnya — terutama di sekitar akhir bulan dan pergantian tahun. Yang
 * dipakai: model mengirim `kapan` sebagai kata, dan penguraiannya terjadi di
 * sini terhadap jam server.
 *
 * Bentuk `YYYY-MM-DD` juga diterima, dan itulah yang dipakai kalau penggunanya
 * menyebut tanggal pasti.
 *
 * ── Jam bawaan 08:00, dan itu keputusan
 *
 * "Ingatkan saya Jumat" tanpa jam berarti pagi hari — bukan tengah malam saat
 * tanggalnya berganti. Pengingat pukul 00:00 datang saat orang tidur, lalu
 * tenggelam di antara notifikasi semalam.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong } from './ai-tool-dasar.js'

/** Jam bawaan kalau penggunanya cuma menyebut hari. */
const JAM_BAWAAN = 8

/** Sejauh apa pengingat boleh dijadwalkan. Setahun sudah di luar akal. */
const MAKS_HARI = 365

const HARI: Record<string, number> = {
  minggu: 0, ahad: 0,
  senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6,
}

/**
 * Mengurai kata waktu jadi tanggal — terhadap jam server, bukan tebakan model.
 *
 * Mengembalikan `null` kalau tak dikenali. Itu lebih baik daripada menebak:
 * pengingat yang datang di hari yang salah lebih buruk daripada permintaan
 * untuk mengulang kalimatnya.
 */
export function uraiWaktu(kata: string, sekarang = new Date()): Date | null {
  const t = kata.trim().toLowerCase()
  if (!t) return null

  // Bentuk pasti: YYYY-MM-DD, boleh diikuti jam HH:MM.
  const pasti = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(t)
  if (pasti) {
    const d = new Date(`${pasti[1]}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null
    d.setHours(pasti[2] ? Number(pasti[2]) : JAM_BAWAAN, pasti[3] ? Number(pasti[3]) : 0, 0, 0)
    return d
  }

  const hasil = new Date(sekarang)
  hasil.setSeconds(0, 0)

  // "2 jam lagi" / "30 menit lagi"
  const relatif = /^(\d{1,3})\s*(menit|jam|hari|minggu)( lagi)?$/.exec(t)
  if (relatif) {
    const n = Number(relatif[1])
    const satuan = relatif[2]
    if (satuan === 'menit') hasil.setMinutes(hasil.getMinutes() + n)
    else if (satuan === 'jam') hasil.setHours(hasil.getHours() + n)
    else if (satuan === 'hari') { hasil.setDate(hasil.getDate() + n); hasil.setHours(JAM_BAWAAN, 0, 0, 0) }
    else { hasil.setDate(hasil.getDate() + n * 7); hasil.setHours(JAM_BAWAAN, 0, 0, 0) }
    return hasil
  }

  if (t === 'besok' || t === 'besuk') {
    hasil.setDate(hasil.getDate() + 1)
    hasil.setHours(JAM_BAWAAN, 0, 0, 0)
    return hasil
  }
  if (t === 'lusa') {
    hasil.setDate(hasil.getDate() + 2)
    hasil.setHours(JAM_BAWAAN, 0, 0, 0)
    return hasil
  }
  if (t === 'nanti' || t === 'nanti sore') {
    hasil.setHours(16, 0, 0, 0)
    // Kalau sudah lewat sore, "nanti" berarti besok — bukan waktu yang lampau.
    if (hasil.getTime() <= sekarang.getTime()) {
      hasil.setDate(hasil.getDate() + 1)
      hasil.setHours(JAM_BAWAAN, 0, 0, 0)
    }
    return hasil
  }

  /*
   * Nama hari → kemunculan BERIKUTNYA.
   *
   * "Jumat" yang diucapkan hari Jumat berarti Jumat DEPAN, bukan beberapa
   * detik lagi. Pengingat yang berbunyi seketika bukan pengingat.
   */
  const namaHari = t.replace(/^hari\s+/, '')
  if (namaHari in HARI) {
    const target = HARI[namaHari]
    let maju = (target - hasil.getDay() + 7) % 7
    if (maju === 0) maju = 7
    hasil.setDate(hasil.getDate() + maju)
    hasil.setHours(JAM_BAWAAN, 0, 0, 0)
    return hasil
  }

  return null
}

export const toolTitipPengingat: DefinisiToolAi = {
  nama: 'titip_pengingat',
  label: 'Menitip pengingat',
  keterangan:
    'Menitipkan pengingat untuk pengguna sendiri — "ingatkan saya tagih Pak Andi hari Jumat", ' +
    '"jangan lupa cek stok besok". Sebutkan `kapan` apa adanya dari kalimat pengguna ' +
    '("besok", "jumat", "2 jam lagi", atau tanggal YYYY-MM-DD); sistem yang menghitung ' +
    'tanggalnya. JANGAN menghitung tanggal sendiri.',
  izin: 'ai:chat',
  skema: {
    type: 'object',
    properties: {
      isi: { type: 'string', description: 'Yang perlu diingatkan, apa adanya dari pengguna.' },
      kapan: {
        type: 'string',
        description:
          'Kata waktu dari pengguna: "besok", "lusa", "jumat", "2 jam lagi", "3 hari", '
          + 'atau tanggal "YYYY-MM-DD". Jangan dihitung sendiri.',
      },
    },
    required: ['isi', 'kapan'],
  },
  async jalan({ db, companyId, userId }, argumen) {
    const isi = typeof argumen.isi === 'string' ? argumen.isi.trim() : ''
    const kapan = typeof argumen.kapan === 'string' ? argumen.kapan.trim() : ''

    if (isi.length < 3) {
      return { isi: 'Apa yang perlu diingatkan? Sebutkan sedikit lebih jelas.', isError: true, entitas: [] }
    }

    const jatuh = uraiWaktu(kapan)
    if (!jatuh) {
      return {
        isi: `Waktu '${kapan}' belum saya kenali. Minta pengguna menyebut "besok", `
          + '"jumat", "2 jam lagi", atau tanggal seperti 2026-08-20.',
        isError: true,
        entitas: [],
      }
    }

    if (jatuh.getTime() <= Date.now()) {
      return {
        isi: 'Waktunya sudah lewat. Minta pengguna menyebut waktu yang akan datang.',
        isError: true,
        entitas: [],
      }
    }

    const selisihHari = (jatuh.getTime() - Date.now()) / 86_400_000
    if (selisihHari > MAKS_HARI) {
      return {
        isi: 'Lebih dari setahun ke depan — pastikan dulu tanggalnya benar.',
        isError: true,
        entitas: [],
      }
    }

    /*
     * DITULIS LANGSUNG, tanpa token konfirmasi — dan itu disengaja.
     *
     * `audit-tool-ai-read-only` menjaga tool agar tak menulis ke modul ERP.
     * Pengingat BUKAN modul ERP: ia tak menyentuh uang, tak masuk pembukuan,
     * tak mengubah satu pun angka yang dilihat orang lain. Yang terburuk dari
     * pengingat yang salah adalah satu pesan yang tak perlu — dan menuntut
     * konfirmasi untuk itu membuat fiturnya lebih merepotkan daripada mencatat
     * di kertas.
     *
     * Batasnya tegas: hanya untuk DIRI SENDIRI (`user_id` dari sesi, tak
     * pernah dari argumen model), dan hanya di tabel ini.
     */
    const { data, error } = await db
      .from('pengingat_asisten')
      .insert({
        company_id: companyId,
        user_id: userId,
        isi,
        jatuh_pada: jatuh.toISOString(),
      })
      .select('id')

    if (error) {
      return { isi: `Gagal menyimpan pengingat: ${error.message}`, isError: true, entitas: [] }
    }
    if (!Array.isArray(data) || data.length === 0) {
      // Nol baris tanpa galat = tersaring diam-diam. Tak boleh dilaporkan sukses.
      return { isi: 'Pengingat tidak tersimpan. Coba lagi sebentar lagi.', isError: true, entitas: [] }
    }

    return {
      isi: bungkusData(
        'pengingat',
        `Pengingat tersimpan: "${isi}" pada ` +
          `${jatuh.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}.`,
      ),
      isError: false,
      entitas: [],
    }
  },
}

export const toolDaftarPengingat: DefinisiToolAi = {
  nama: 'pengingat_saya',
  label: 'Pengingat saya',
  keterangan:
    'Daftar pengingat yang belum jatuh tempo milik pengguna. Pakai untuk "ada pengingat apa", ' +
    '"saya titip apa saja", atau saat pengguna menanyakan janji yang pernah ia titipkan.',
  izin: 'ai:chat',
  skema: { type: 'object', properties: {} },
  async jalan({ db, userId }) {
    const { data, error } = await db
      .from('pengingat_asisten')
      .select('isi, jatuh_pada, dikirim_pada')
      .eq('user_id', userId)
      .is('dibatalkan_pada', null)
      .order('jatuh_pada', { ascending: true })
      .limit(50)

    if (error) {
      return { isi: `Gagal membaca pengingat: ${error.message}`, isError: true, entitas: [] }
    }

    const semua = (data ?? []) as unknown as Array<{
      isi: string; jatuh_pada: string; dikirim_pada: string | null
    }>
    const belum = semua.filter((p) => !p.dikirim_pada)

    if (belum.length === 0) {
      return {
        isi: bungkusData('pengingat', 'Tak ada pengingat yang menunggu.'),
        isError: false,
        entitas: [],
      }
    }

    const { data: tampil, dipotong } = potong(belum)
    return {
      isi: bungkusData(
        'pengingat',
        `${belum.length} pengingat menunggu:\n` +
          tampil
            .map(
              (p) =>
                `· ${new Date(p.jatuh_pada).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` +
                ` — ${p.isi}`,
            )
            .join('\n'),
        dipotong,
      ),
      isError: false,
      entitas: [],
    }
  },
}

export const TOOL_PENGINGAT: DefinisiToolAi[] = [toolTitipPengingat, toolDaftarPengingat]
