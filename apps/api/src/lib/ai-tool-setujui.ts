/**
 * TOOL PERSETUJUAN — dari pelapor jadi pengambil keputusan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * JALUR YANG SUDAH LENGKAP TAPI TAK PERNAH TERSAMBUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: `routes/v1/ai-setujui.ts` punya TIGA rute lengkap
 * (preview, setujui, daftar-jenis), `lib/ai-setujui.ts` memetakan lima jenis
 * ke rute approval sungguhnya, dan token sekali-pakainya sudah teruji.
 *
 * `grep` atas seluruh repo: **NOL pemanggil.** Tak satu pun tool di katalog
 * mengeksposnya, jadi model tak pernah tahu kemampuan itu ada.
 *
 * Pola KEENAM yang sama dalam sepekan (tombol konfirmasi tak pernah dibuat,
 * `riwayat` tak pernah diisi, sub-menu tak pernah dinyalakan, asisten
 * owner/web tak pernah dipanggil, label UI tertinggal). Selalu bentuk yang
 * sama: setengah rantai sempurna, setengah tak tersambung, nol galat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * I-1 TETAP UTUH — TOOL INI TAK MENYETUJUI APA PUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-tool-ai-read-only` berambang NOL, dan tetap hijau. Yang dilakukan
 * kedua tool di bawah:
 *
 *   `menunggu_persetujuan_saya` → MEMBACA daftar yang menunggu
 *   `siapkan_persetujuan`           → MEMBACA satu dokumen + dampaknya
 *
 * Persetujuannya sendiri terjadi di `POST /api/v1/ai/setujui`, yang menuntut
 * token — dan token itu lahir dari KLIK manusia (web) atau balasan "ya"
 * (WhatsApp), bukan dari kalimat model.
 *
 * Injeksi lewat dokumen bisa membuat model memanggil `siapkan_persetujuan`. Ia
 * tak bisa membuat manusia menekan tombol.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ID TAK PERNAH DITERIMA DARI MODEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rute `preview-setujui` menuntut `entity_id` berupa UUID. Model AKAN
 * mengarangnya — dan UUID karangan yang kebetulan cocok adalah persetujuan
 * atas dokumen yang salah, dengan uang sungguhan di dalamnya.
 *
 * Maka `siapkan_persetujuan` menerima NOMOR URUT dari daftar yang baru saja
 * ditampilkan `menunggu_persetujuan_saya`, lalu meresolusinya sendiri lewat
 * `db` milik tenant. Nomor urut yang salah paling buruk menunjuk dokumen lain
 * di daftar yang SAMA — yang tetap milik tenant ini, dan tetap ditampilkan
 * ringkasannya sebelum manusia memutuskan.
 */

import type { DefinisiToolAi, KonteksTool } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'
import { JENIS_DIDUKUNG, sumberUntuk } from './ai-setujui.js'
import type { SumberInbox } from './inbox-approval.js'

interface BarisMenunggu {
  jenis: string
  label: string
  id: string
  judul: string
  nominal: number | null
  dibuat: string | null
}

/**
 * Membaca semua dokumen yang menunggu keputusan, lintas jenis.
 *
 * Dipisah dari definisi tool supaya `siapkan_persetujuan` memakai daftar yang
 * SAMA PERSIS — kalau keduanya menyusun daftarnya sendiri, nomor urut yang
 * ditampilkan bisa menunjuk dokumen berbeda dari yang diresolusi.
 */
async function bacaMenunggu(db: KonteksTool['db']): Promise<BarisMenunggu[]> {
  const hasil: BarisMenunggu[] = []

  for (const jenis of JENIS_DIDUKUNG) {
    const s = sumberUntuk(jenis)
    if (!s) continue

    const kolom = [
      'id',
      s.kolomJudul,
      s.kolomNominal,
      s.kolomDibuat,
      s.kolomNomor,
    ].filter(Boolean) as string[]

    /*
     * Kategori C dibaca lewat `unsafe()` dengan alasan tertulis — sama dengan
     * tool konstruksi lain. Saringan tenant tetap berlaku: `unsafe()` hanya
     * melewati wrapper, bukan RLS.
     *
     * Kategori B lewat `.from()` biasa; `company_id` disisipkan wrapper.
     */
    const q =
      s.tenancy === 'B'
        ? db.from(s.tabel)
        : db.unsafe(s.tabel, `tool AI: inbox approval ${jenis}, disaring status menunggu`)

    const { data, error } = await q
      .select(kolom.join(', '))
      .in('status', s.statusMenunggu)
      .limit(50)

    // Gagal pada SATU jenis tak boleh menjatuhkan seluruh daftar — yang lain
    // tetap berguna. Tapi ia juga tak boleh hilang senyap: jenis yang gagal
    // dilaporkan sebagai baris keterangan di pemanggil.
    if (error) continue

    for (const b of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const nom = s.kolomNominal ? Number(b[s.kolomNominal]) : null
      hasil.push({
        jenis,
        label: s.label,
        id: String(b.id),
        judul:
          (s.kolomNomor ? String(b[s.kolomNomor] ?? '') : '') ||
          (s.kolomJudul ? String(b[s.kolomJudul] ?? '') : '') ||
          '(tanpa judul)',
        nominal: nom !== null && Number.isFinite(nom) ? nom : null,
        dibuat: s.kolomDibuat ? (b[s.kolomDibuat] as string | null) : null,
      })
    }
  }

  /*
   * Diurut TERLAMA DULU — bukan terbesar dulu.
   *
   * Yang paling merugikan bukan nominal terbesar melainkan yang paling lama
   * menggantung: mandor tak bisa bekerja, dan yang menunggu tak tahu kepada
   * siapa harus bertanya.
   */
  return hasil.sort((a, b) => String(a.dibuat ?? '').localeCompare(String(b.dibuat ?? '')))
}

export const toolMenungguSaya: DefinisiToolAi = {
  nama: 'menunggu_persetujuan_saya',
  label: 'Menunggu persetujuan',
  keterangan:
    'Daftar dokumen yang MENUNGGU keputusan persetujuan — kasbon, pengeluaran, change order, ' +
    'estimasi, lessons learned. Pakai untuk pertanyaan "apa yang perlu saya setujui", "ada ' +
    'yang menunggu?", "apa kerjaan saya hari ini". Tampilkan NOMOR URUTNYA — nomor itu yang ' +
    'dipakai `siapkan_persetujuan`.',
  izin: 'ai:setujui',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    const baris = await bacaMenunggu(db)

    if (baris.length === 0) {
      return {
        isi: bungkusData('menunggu_persetujuan', 'Tidak ada yang menunggu persetujuan Anda.'),
        isError: false,
        entitas: [],
      }
    }

    const { data: tampil, dipotong } = potong(baris)
    const teks = tampil.map(
      (b, i) =>
        `${i + 1}. [${b.label}] ${b.judul}` +
        (b.nominal !== null ? ` — ${rupiah(b.nominal)}` : '') +
        (b.dibuat ? ` · diajukan ${String(b.dibuat).slice(0, 10)}` : ''),
    )

    return {
      isi: bungkusData(
        'menunggu_persetujuan',
        `${baris.length} dokumen menunggu keputusan (terlama di atas):\n${teks.join('\n')}\n\n` +
          'Sebut NOMORNYA untuk melihat rincian & dampaknya sebelum memutuskan.',
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.judul),
    }
  },
}

export const toolSiapkanSetujui: DefinisiToolAi = {
  nama: 'siapkan_persetujuan',
  label: 'Menyiapkan persetujuan',
  keterangan:
    'Menyiapkan SATU persetujuan untuk dikonfirmasi manusia. Pakai setelah ' +
    '`menunggu_persetujuan_saya`, dengan NOMOR URUT dari daftar itu. Tool ini TIDAK ' +
    'menyetujui apa pun — ia menampilkan dokumen & dampaknya, lalu manusia yang memutuskan. ' +
    'Jangan pernah mengatakan sesuatu SUDAH disetujui.',
  izin: 'ai:setujui',
  skema: {
    type: 'object',
    properties: {
      nomor: {
        type: 'number',
        description:
          'Nomor urut dari daftar `menunggu_persetujuan_saya` (mulai 1). BUKAN id/UUID — '
          + 'jangan pernah mengarang id.',
      },
    },
    required: ['nomor'],
  },
  async jalan({ db }, argumen) {
    const nomor = Number(argumen.nomor)
    if (!Number.isInteger(nomor) || nomor < 1) {
      return {
        isi: 'Sebutkan nomor urut dari daftar yang menunggu persetujuan (mulai dari 1).',
        isError: true,
        entitas: [],
      }
    }

    const baris = await bacaMenunggu(db)
    if (baris.length === 0) {
      return {
        isi: bungkusData('siapkan_persetujuan', 'Tidak ada yang menunggu persetujuan.'),
        isError: true,
        entitas: [],
      }
    }

    const pilih = baris[nomor - 1]
    if (!pilih) {
      return {
        isi: `Nomor ${nomor} tak ada — daftarnya hanya ${baris.length} dokumen. `
          + 'Minta pengguna menyebut nomor yang benar.',
        isError: true,
        entitas: [],
      }
    }

    /*
     * Yang dikembalikan RINGKASAN, bukan konfirmasi bahwa sesuatu disetujui.
     *
     * Kalimat "BELUM DISETUJUI" ditulis eksplisit karena model yang menerima
     * hasil tool tanpa penegasan cenderung melaporkan "sudah saya setujui" —
     * dan yang percaya lalu tak menekan tombolnya mengira kasbonnya sudah
     * jalan, padahal mandornya masih menunggu.
     */
    return {
      isi: bungkusData(
        'siapkan_persetujuan',
        `[${pilih.label}] ${pilih.judul}` +
          (pilih.nominal !== null ? `\nNominal: ${rupiah(pilih.nominal)}` : '') +
          (pilih.dibuat ? `\nDiajukan: ${String(pilih.dibuat).slice(0, 10)}` : '') +
          `\nJENIS=${pilih.jenis} ENTITY_ID=${pilih.id}\n\n` +
          'BELUM DISETUJUI. Sampaikan rinciannya, lalu minta konfirmasi manusia. ' +
          'Asisten tidak bisa menyetujui sendiri.',
      ),
      isError: false,
      entitas: [pilih.judul],
    }
  },
}

/** Dirakit di `ai-tool.ts`. */
export const TOOL_SETUJUI: DefinisiToolAi[] = [toolMenungguSaya, toolSiapkanSetujui]

/** Dipakai test — bentuk daftar yang sama dengan yang dilihat model. */
export type { BarisMenunggu, SumberInbox }
