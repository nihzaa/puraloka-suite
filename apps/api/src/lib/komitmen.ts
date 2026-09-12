/**
 * KOMITMEN BIAYA — uang yang sudah TERIKAT tetapi belum jadi biaya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Triase 2026-08-01 (`ERP-KONTRAKTOR-TAKSONOMI-MENU.md`) menempatkan
 * *commitment tracking* di kelompok **cost control**, dan menyebut kelompok
 * itu **"yang membedakan ERP kontraktor dari aplikasi pencatat biasa"**.
 *
 * ── Pertanyaan yang tak bisa dijawab tanpa ini
 *
 * "Anggaran pos ini Rp 500 juta, terpakai Rp 300 juta — masih aman?"
 *
 * Jawabannya TIDAK BISA dari dua angka itu. Kalau ada PO Rp 250 juta yang
 * sudah disetujui dan barangnya belum datang, posnya sebenarnya sudah
 * lewat Rp 50 juta — dan tak seorang pun tahu sampai barangnya tiba.
 *
 * Itulah sebabnya kontraktor memakai tiga angka, bukan dua:
 *
 *     ANGGARAN  −  (REALISASI + KOMITMEN)  =  SISA YANG BENAR
 *
 * Tanpa kolom tengah, "sisa anggaran" selalu terlihat lebih besar
 * daripada kenyataan, dan pembengkakan baru ketahuan saat sudah terjadi.
 *
 * ── Apa yang DIHITUNG sebagai komitmen, dan apa yang tidak
 *
 * Diukur ke basis 2026-09-12 — status yang benar-benar ada di
 * `purchase_orders`:
 *
 *     draft           BUKAN komitmen — belum disetujui, bisa dibatalkan
 *     sent            KOMITMEN       — sudah dikirim ke pemasok
 *     confirmed       KOMITMEN       — pemasok menyanggupi
 *     fully_received  BUKAN lagi     — sudah jadi barang; biayanya nyata
 *     cancelled       BUKAN          — batal
 *
 * `draft` sengaja DIKELUARKAN. Memasukkannya membuat angka komitmen
 * mengembang oleh dokumen yang belum tentu jadi, dan orang berhenti
 * mempercayainya — sama buruknya dengan tak punya angkanya sama sekali.
 *
 * ⚠ `fully_received` keluar dari komitmen TETAPI belum tentu masuk
 * realisasi pada saat yang sama: barang diterima hari ini, tagihannya
 * dicatat minggu depan. Itu celah nyata, dan modul ini TIDAK menutupinya —
 * lihat "Batas yang jujur" di bawah.
 */

/** Status PO yang dihitung sebagai komitmen. Sumber: kolom `status`. */
export const STATUS_KOMITMEN = ['sent', 'confirmed'] as const

/**
 * Status yang sudah lewat tahap komitmen — barangnya ada.
 * Dipisah supaya pemanggil bisa menampilkan "sudah datang" tanpa
 * menghitungnya dua kali.
 */
export const STATUS_TERPENUHI = ['fully_received'] as const

export interface BarisPO {
  id: string
  project_id: string | null
  status: string | null
  total_amount: number | string | null
}

export interface RingkasKomitmen {
  /** Jumlah PO yang masih mengikat. */
  jumlahPo: number
  /** Nilai yang sudah terikat tetapi barangnya belum datang. */
  nilaiKomitmen: number
  /** Nilai PO yang sudah diterima penuh — sudah jadi biaya nyata. */
  nilaiTerpenuhi: number
  /** PO draf: belum mengikat, tetapi perlu terlihat supaya tak terlupa. */
  nilaiDraf: number
  jumlahDraf: number
}

/**
 * Ubah nilai uang apa pun jadi angka yang aman dijumlah.
 *
 * ⚠ `numeric` PostgreSQL sampai ke JS sebagai STRING (presisi tak boleh
 * hilang lewat float). `Number(null)` bernilai 0 dan `isFinite(0)` benar,
 * jadi nilai hilang tak bisa dibedakan dari nol — kelas cacat yang sudah
 * menggigit di kurva-S (173 baris `pct_overall` NULL menimpa nilai benar).
 * Karena itu null ditolak SEBELUM dikonversi.
 */
function angka(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Ringkas sekumpulan PO jadi tiga angka komitmen. */
export function ringkasKomitmen(po: BarisPO[]): RingkasKomitmen {
  const komit = new Set<string>(STATUS_KOMITMEN)
  const penuh = new Set<string>(STATUS_TERPENUHI)

  let jumlahPo = 0
  let nilaiKomitmen = 0
  let nilaiTerpenuhi = 0
  let nilaiDraf = 0
  let jumlahDraf = 0

  for (const b of po) {
    const s = String(b.status ?? '')
    const n = angka(b.total_amount)
    if (komit.has(s)) {
      jumlahPo += 1
      nilaiKomitmen += n
    } else if (penuh.has(s)) {
      nilaiTerpenuhi += n
    } else if (s === 'draft') {
      jumlahDraf += 1
      nilaiDraf += n
    }
    /* `cancelled` dan status tak dikenal sengaja diabaikan diam-diam:
       PO batal memang bukan komitmen, dan status baru yang belum dikenal
       lebih baik tak dihitung daripada dihitung salah. */
  }

  return { jumlahPo, nilaiKomitmen, nilaiTerpenuhi, nilaiDraf, jumlahDraf }
}

export interface BarisPosisi {
  projectId: string
  nama: string
  anggaran: number
  realisasi: number
  komitmen: number
  /** anggaran − (realisasi + komitmen). NEGATIF berarti sudah lewat. */
  sisa: number
  /** (realisasi + komitmen) / anggaran × 100. `null` bila anggaran nol. */
  terpakaiPct: number | null
  /** true bila realisasi+komitmen melampaui anggaran. */
  lewat: boolean
}

/**
 * Posisi anggaran sebuah proyek dengan komitmen ikut diperhitungkan.
 *
 * ⚠ `terpakaiPct` bernilai `null` — BUKAN 0 — saat anggarannya nol.
 * Nol persen terpakai dan "tak punya anggaran" adalah dua keadaan yang
 * sangat berbeda, dan menampilkan 0% untuk yang kedua membuat proyek tanpa
 * anggaran terlihat paling sehat di seluruh daftar.
 */
export function hitungPosisi(input: {
  projectId: string
  nama: string
  anggaran: number
  realisasi: number
  komitmen: number
}): BarisPosisi {
  const { anggaran, realisasi, komitmen } = input
  const terpakai = realisasi + komitmen
  return {
    ...input,
    sisa: anggaran - terpakai,
    terpakaiPct: anggaran > 0 ? (terpakai / anggaran) * 100 : null,
    lewat: anggaran > 0 && terpakai > anggaran,
  }
}
