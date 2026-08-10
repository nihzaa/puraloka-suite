/**
 * PIPELINE INGEST — memotong dokumen jadi potongan yang bisa dicari.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TJS TAK PUNYA INI SAMA SEKALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria C2 menempatkannya paling atas: "PIPELINE INGEST ditulis lebih dulu
 * — TJS tak punya sama sekali". Tanpa ingest, RAG hanyalah pencarian atas
 * tabel kosong: ia menjawab "tak ada dokumen" untuk setiap pertanyaan, dan
 * itu terbaca sebagai fitur yang rusak, bukan yang belum diisi.
 *
 * ── Pemotongan: batas PARAGRAF, bukan jumlah karakter buta
 *
 * Memotong tiap N karakter memutus kalimat di tengah, dan potongan yang
 * berakhir "...nilai kontrak sebesar Rp 1.2" lebih buruk daripada tak ada:
 * ia terlihat seperti jawaban. Di sini pemotongan mencari batas paragraf lalu
 * kalimat, dan hanya memotong paksa kalau satu kalimat pun melebihi batas.
 *
 * ── Tumpang-tindih, dan kenapa kecil
 *
 * Potongan bertetangga berbagi `TUMPANG_TINDIH` karakter supaya kalimat yang
 * jatuh tepat di perbatasan tetap utuh di salah satunya. Angkanya sengaja
 * kecil: tiap karakter tumpang-tindih dibayar DUA KALI saat embedding, dan
 * kriteria C2 menuntut biaya ingest awal dihitung — onboarding adalah saat
 * pelanggan baru paling tak toleran pada tagihan.
 *
 * ── Idempoten
 *
 * Ingest ulang dokumen yang sama MENGGANTI potongannya, tidak menambah.
 * Tanpa itu, satu tombol yang ditekan dua kali menggandakan seluruh korpus,
 * dan pencarian mengembalikan potongan yang sama berkali-kali sebagai
 * "beberapa sumber" — bentuk kepercayaan palsu yang paling sulit disadari.
 */

import type { TenantDb } from '../utils/tenant-db.js'

/** Batas atas satu potongan. ~1.000 karakter ≈ 250 token, muat di konteks. */
export const MAKS_POTONGAN = 1_000
/** Potongan di bawah ini digabung ke tetangganya — sisa yang tak bermakna. */
export const MIN_POTONGAN = 120
export const TUMPANG_TINDIH = 100

/**
 * Memotong teks jadi potongan pada batas alami.
 *
 * Fungsi MURNI — tanpa basis, tanpa jaringan. Itu yang membuat aturannya bisa
 * dikunci test tanpa perangkat apa pun, dan pemotongan adalah tempat cacat
 * paling halus bersembunyi (potongan kosong, potongan raksasa, tumpang-tindih
 * yang tak pernah terjadi).
 */
export function potongTeks(teks: string): string[] {
  const bersih = teks.replace(/\r\n/g, '\n').trim()
  if (!bersih) return []
  if (bersih.length <= MAKS_POTONGAN) return [bersih]

  // Paragraf lebih dulu: ia batas makna yang ditulis manusia sendiri.
  const paragraf = bersih.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  const keluar: string[] = []
  let kini = ''

  const dorong = () => {
    const t = kini.trim()
    if (t) keluar.push(t)
    kini = ''
  }

  for (const p of paragraf) {
    if (p.length > MAKS_POTONGAN) {
      // Paragraf raksasa: pecah per KALIMAT sebelum memotong paksa.
      dorong()
      let sisa = p
      while (sisa.length > MAKS_POTONGAN) {
        const jendela = sisa.slice(0, MAKS_POTONGAN)
        // Cari akhir kalimat terakhir di dalam jendela.
        const batas = Math.max(
          jendela.lastIndexOf('. '),
          jendela.lastIndexOf('.\n'),
          jendela.lastIndexOf('; '),
        )
        // `MIN_POTONGAN` menjaga agar potongan tak jadi remah saat kalimatnya
        // panjang; kalau tak ada batas yang layak, potong paksa.
        const potong = batas > MIN_POTONGAN ? batas + 1 : MAKS_POTONGAN
        keluar.push(sisa.slice(0, potong).trim())
        sisa = sisa.slice(Math.max(0, potong - TUMPANG_TINDIH))
      }
      if (sisa.trim()) kini = sisa.trim()
      continue
    }

    if (kini.length + p.length + 2 > MAKS_POTONGAN) dorong()
    kini = kini ? `${kini}\n\n${p}` : p
  }
  dorong()

  // Potongan terakhir yang terlalu pendek digabung ke sebelumnya — sisa 30
  // karakter berdiri sendiri hanya menambah baris tanpa menambah makna.
  if (keluar.length > 1) {
    const akhir = keluar[keluar.length - 1]
    if (akhir.length < MIN_POTONGAN) {
      keluar[keluar.length - 2] = `${keluar[keluar.length - 2]}\n\n${akhir}`
      keluar.pop()
    }
  }

  return keluar.filter((p) => p.length > 0)
}

export type HasilIngest =
  | { ok: true; potongan: number; dihapus: number }
  | { ok: false; alasan: string }

/**
 * Menulis potongan sebuah dokumen. IDEMPOTEN: yang lama dihapus lebih dulu.
 *
 * `company_id`, `project_id`, `doc_type`, dan `visible_klien` TIDAK dikirim
 * dari sini meski kolomnya ada — trigger `rag_isi_metadata` (migrasi 263)
 * mengisinya dari dokumennya. Mengirimnya berarti nilai keamanan datang dari
 * pemanggil, dan itu pola yang sudah ditolak di `wa-sesi.ts`.
 *
 * Nilai apa pun yang dikirim akan DITIMPA trigger; yang dikirim di bawah hanya
 * placeholder yang memenuhi NOT NULL.
 */
export async function ingestDokumen(opsi: {
  db: TenantDb
  companyId: string
  documentId: string
  teks: string
  /** Embedding per potongan, urut sama. Kosong = jalur teks saja. */
  embedding?: Array<number[] | null>
  modelEmbed?: string
}): Promise<HasilIngest> {
  const { db, companyId, documentId, teks } = opsi

  const potongan = potongTeks(teks)
  if (potongan.length === 0) {
    return { ok: false, alasan: 'Dokumen tidak memuat teks yang bisa diindeks.' }
  }

  // Hapus lebih dulu — inilah yang membuat ingest ulang mengganti, bukan
  // menggandakan. `company_id` ikut di WHERE (T-2) meski wrapper sudah
  // menyaring: penjaga CI memeriksanya, dan lapisan yang terbaca manusia
  // adalah lapisan yang bisa ditinjau.
  const { data: lama, error: errHapus } = await db
    .from('rag_potongan')
    .delete()
    .eq('company_id', companyId)
    .eq('document_id', documentId)
    .select('id')

  if (errHapus) {
    return { ok: false, alasan: `Gagal membersihkan potongan lama: ${errHapus.message}` }
  }

  const baris = potongan.map((isi, i) => ({
    // Placeholder — DITIMPA trigger. Lihat catatan di atas.
    company_id: companyId,
    project_id: companyId,
    doc_type: 'lainnya',
    document_id: documentId,
    urutan: i,
    isi,
    embedding: opsi.embedding?.[i] ? JSON.stringify(opsi.embedding[i]) : null,
    model_embed: opsi.embedding?.[i] ? (opsi.modelEmbed ?? null) : null,
  }))

  const { error } = await db.from('rag_potongan').insert(baris).select('id')

  if (error) {
    return { ok: false, alasan: `Gagal menulis potongan: ${error.message}` }
  }

  return { ok: true, potongan: baris.length, dihapus: (lama as unknown[] | null)?.length ?? 0 }
}

/**
 * Perkiraan biaya ingest — dituntut kriteria C2.
 *
 * "Biaya ingest awal per tenant DIHITUNG dan masuk anggaran — onboarding
 * adalah saat pelanggan baru paling tak toleran pada tagihan."
 *
 * Token diperkirakan 4 karakter per token. Itu kasar untuk bahasa Indonesia
 * (yang cenderung lebih boros karena imbuhan), jadi angkanya condong ke
 * BAWAH — dan perkiraan biaya yang terlalu rendah adalah yang berbahaya.
 * Karena itu ditambah margin 20%.
 */
export function perkiraanTokenIngest(potongan: string[]): number {
  const kar = potongan.reduce((n, p) => n + p.length, 0)
  return Math.ceil((kar / 4) * 1.2)
}
