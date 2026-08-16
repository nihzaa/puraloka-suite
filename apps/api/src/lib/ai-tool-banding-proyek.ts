/**
 * BANDINGKAN PROYEK (8.8) — "mana yang paling tertinggal?"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN PEMILIK YANG TAK BISA DIJAWAB SATU HALAMAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman proyek menjawab "proyek INI bagaimana". Yang tak terjawab: "dari 17
 * proyek, mana yang paling perlu saya datangi minggu ini". Pertanyaan kedua
 * itulah yang menentukan ke mana pemilik pergi — dan hari ini ia dijawab
 * dengan membuka 17 halaman lalu mengingat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBANDINGKAN: PROGRES vs WAKTU YANG SUDAH LEWAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: ke-17 proyek punya `contract_value`, `progress_pct`,
 * `start_date`, dan `end_date`. Hanya 3 yang punya RAB dan 4 yang punya
 * pengeluaran — jadi perbandingan berbasis biaya hanya akan mencakup
 * seperempat portofolio, dan yang tak tercakup akan terbaca "baik-baik saja".
 *
 * Maka yang dipakai: **deviasi jadwal** = progres fisik dikurangi porsi waktu
 * yang sudah lewat. Proyek yang sudah lewat 80% waktunya tetapi baru 30%
 * jadi punya deviasi −50, dan itu bisa dihitung untuk SEMUA proyek.
 *
 * ── Kenapa bukan sekadar `progress_pct` diurutkan
 *
 * Proyek yang baru mulai memang kecil progresnya — itu normal, bukan masalah.
 * Mengurutkan progres mentah menempatkan proyek sehat yang baru jalan di
 * urutan "terburuk", dan pemilik yang mengikutinya mendatangi tempat yang
 * salah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PROYEK TANPA TANGGAL DINYATAKAN, TIDAK DIANGGAP NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tanpa `start_date`/`end_date`, deviasi tak bisa dihitung. Menganggapnya 0
 * (= tepat jadwal) membuat proyek yang datanya belum lengkap tampil sebagai
 * proyek paling sehat — persis kebalikan dari yang seharusnya diperhatikan.
 *
 * Pola yang sama dengan `nominalEntitas()` di `ai-setujui.ts` dan komponen
 * tanpa harga di `ai-tool-hitung.ts`: data yang hilang harus MENAMBAH
 * pengawasan, bukan menguranginya.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'

interface BarisProyek {
  id: string
  name: string
  status: string | null
  contract_value: unknown
  progress_pct: unknown
  start_date: string | null
  end_date: string | null
}

/** Porsi waktu yang sudah lewat, 0–100. `null` kalau tanggalnya tak lengkap. */
export function porsiWaktu(
  mulai: string | null,
  selesai: string | null,
  sekarang = new Date(),
): number | null {
  if (!mulai || !selesai) return null
  const a = new Date(mulai).getTime()
  const b = new Date(selesai).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null

  const lewat = ((sekarang.getTime() - a) / (b - a)) * 100
  // Dijepit 0–100: proyek yang belum mulai bukan "minus", dan yang sudah lewat
  // tenggat bukan "150% waktu" — keduanya membuat deviasinya tak terbaca.
  return Math.max(0, Math.min(100, lewat))
}

export const toolBandingProyek: DefinisiToolAi = {
  nama: 'banding_proyek',
  label: 'Bandingkan proyek',
  keterangan:
    'Membandingkan SEMUA proyek berjalan: progres fisik terhadap waktu yang sudah lewat, ' +
    'lalu mengurutkan yang paling tertinggal. Pakai untuk "proyek mana yang paling ' +
    'tertinggal", "mana yang perlu saya datangi", "bandingkan proyek saya". Proyek yang ' +
    'tanggalnya belum lengkap DISEBUT terpisah — jangan diperlakukan sebagai sehat.',
  izin: 'projects:view',
  skema: {
    type: 'object',
    properties: {
      semua_status: {
        type: 'boolean',
        description:
          'true untuk memasukkan proyek selesai/draft juga. Kosong = hanya yang berjalan.',
      },
    },
  },
  async jalan({ db }, argumen) {
    const semuaStatus = argumen.semua_status === true

    const { data, error } = await db
      .from('projects')
      .select('id, name, status, contract_value, progress_pct, start_date, end_date')
      .eq('is_deleted', false)
      .limit(500)

    if (error) {
      return { isi: `Gagal membaca proyek: ${error.message}`, isError: true, entitas: [] }
    }

    const semua = (data ?? []) as unknown as BarisProyek[]
    /*
     * Bawaan: hanya `active` dan `on_hold`.
     *
     * Proyek `completed` selalu berdeviasi buruk kalau tanggal selesainya
     * lewat — dan menyorotinya sebagai "paling tertinggal" mengubur proyek
     * berjalan yang benar-benar perlu didatangi.
     */
    const dipakai = semuaStatus
      ? semua
      : semua.filter((p) => p.status === 'active' || p.status === 'on_hold')

    if (dipakai.length === 0) {
      return {
        isi: bungkusData('banding_proyek', 'Tak ada proyek berjalan untuk dibandingkan.'),
        isError: false,
        entitas: [],
      }
    }

    interface Nilai {
      p: BarisProyek
      progres: number
      waktu: number
      deviasi: number
    }

    const terukur: Nilai[] = []
    const takTerukur: BarisProyek[] = []

    for (const p of dipakai) {
      const waktu = porsiWaktu(p.start_date, p.end_date)
      const progres = Number(p.progress_pct)

      // Tanggal tak lengkap ATAU progres bukan angka → tak bisa dibandingkan.
      // DINYATAKAN, bukan dianggap tepat jadwal.
      if (waktu === null || !Number.isFinite(progres)) {
        takTerukur.push(p)
        continue
      }

      terukur.push({ p, progres, waktu, deviasi: progres - waktu })
    }

    // Paling tertinggal (deviasi paling negatif) di ATAS.
    terukur.sort((a, b) => a.deviasi - b.deviasi)

    const bagian: string[] = []

    if (terukur.length > 0) {
      const { data: tampil, dipotong } = potong(terukur)
      bagian.push(
        `${terukur.length} proyek dibandingkan (paling tertinggal di atas):`,
        ...tampil.map((n) => {
          const tanda = n.deviasi <= -20 ? ' ⚠' : ''
          return (
            `${n.deviasi >= 0 ? '+' : ''}${n.deviasi.toFixed(0)} — ${n.p.name}` +
            `: progres ${n.progres.toFixed(0)}%, waktu terpakai ${n.waktu.toFixed(0)}%` +
            (n.p.contract_value ? ` · ${rupiah(Number(n.p.contract_value) || 0)}` : '') +
            (n.p.status === 'on_hold' ? ' · DITAHAN' : '') +
            tanda
          )
        }),
        ...(dipotong > 0 ? [`… dan ${dipotong} lagi.`] : []),
        '',
        'Angka di depan = progres dikurangi porsi waktu yang sudah lewat.',
        'Minus berarti tertinggal dari jadwal; ⚠ menandai selisih 20 poin atau lebih.',
      )
    }

    if (takTerukur.length > 0) {
      /*
       * DISEBUT, tidak disembunyikan dan tidak dianggap sehat.
       *
       * Proyek tanpa tanggal yang diam-diam dihitung "tepat jadwal" akan
       * tampil paling sehat — persis kebalikan dari yang perlu diperhatikan.
       */
      bagian.push(
        '',
        `${takTerukur.length} proyek TIDAK bisa dibandingkan (tanggal mulai/selesai ` +
          'belum lengkap):',
        ...takTerukur.slice(0, 10).map((p) => `· ${p.name}`),
        'Ini BUKAN berarti sehat — datanya yang belum ada.',
      )
    }

    return {
      isi: bungkusData('banding_proyek', bagian.join('\n')),
      isError: false,
      entitas: terukur.slice(0, 10).map((n) => n.p.name),
    }
  },
}
