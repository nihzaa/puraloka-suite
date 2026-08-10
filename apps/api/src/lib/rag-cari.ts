/**
 * PENCARIAN RAG — dua jalur, FUSI SKOR sungguhan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG TJS SEBENARNYA LAKUKAN, DAN KENAPA ITU BUKAN HIBRIDA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Audit pertama menyebut retrieval TJS "hibrida". Kodenya menunjukkan TIGA
 * pencarian independen yang hasilnya DISAMBUNG jadi satu string — tanpa bobot,
 * tanpa fusi, dan keyword-nya `contains` biasa tanpa indeks full-text.
 *
 * Akibatnya bukan sekadar lambat. Menyambung berarti potongan yang muncul di
 * KEDUA jalur (tanda paling kuat bahwa ia relevan) diperlakukan sama dengan
 * yang muncul di satu jalur saja — dan karena hasilnya dipotong di N teratas,
 * yang benar-benar relevan bisa terdorong keluar oleh dua hasil lemah.
 *
 * ── Fusi yang dipakai: Reciprocal Rank Fusion
 *
 *   skor(potongan) = Σ  bobot_jalur / (K + peringkat_di_jalur)
 *
 * RRF memakai PERINGKAT, bukan skor mentah, dan itu yang membuatnya bekerja
 * di sini: skor tsvector (`ts_rank`, biasanya 0–1 tapi tak terbatas) dan
 * jarak kosinus (0–2) tak punya skala yang sebanding. Menormalkannya menuntut
 * mengetahui distribusinya lebih dulu; peringkat tak menuntut apa pun.
 *
 * `K = 60` — nilai dari makalah aslinya (Cormack dkk. 2009), dan gunanya
 * meredam dominasi peringkat 1. Tanpa K, peringkat 1 bernilai 1,0 sementara
 * peringkat 2 bernilai 0,5; dengan K=60 jaraknya jadi tipis, sehingga muncul
 * di DUA jalur mengalahkan juara satu di SATU jalur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * T-2: company_id DI WHERE, BUKAN IKUT SKOR KEMIRIPAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ini kebocoran lintas-tenant paling mungkin di seluruh rencana AI. Pencarian
 * vector mengembalikan "yang paling MIRIP", dan spesifikasi beton K-300 di dua
 * perusahaan konstruksi hampir identik — dokumen tenant lain BISA menang.
 *
 * Yang membuatnya berbahaya: hasilnya tetap MASUK AKAL. Tak ada yang
 * melaporkan jawaban yang benar-benar terdengar benar. Karena itu
 * `company_id` ada di WHERE tiap query DI SINI, di samping policy RESTRICTIVE
 * di basis dan penjaga CI yang memeriksanya — tiga lapis untuk satu kesalahan
 * yang tak akan pernah terlihat sendiri.
 */

import type { TenantDb } from '../utils/tenant-db.js'
import type { SaringanRag } from './rag-acl.js'

/** Peredam RRF. 60 dari makalah aslinya — lihat kepala berkas. */
export const K_RRF = 60

/**
 * Bobot per jalur.
 *
 * Teks sedikit lebih berat, dan itu keputusan yang bisa dibantah. Alasannya:
 * kriteria C2 menyebut pencocokan PERSIS secara eksplisit — "nomor kontrak,
 * SNI 2847, beton K-300". Untuk istilah seperti itu jalur teks hampir selalu
 * benar dan jalur vector hampir selalu mendekati-tapi-salah, karena embedding
 * memetakan "K-300" dan "K-350" ke titik yang berdekatan.
 *
 * Untuk parafrase kebalikannya berlaku, dan di situlah 0,9 (bukan 0,5) menahan
 * agar jalur vector tetap menentukan.
 */
export const BOBOT_TEKS = 1.0
export const BOBOT_VEKTOR = 0.9

export interface PotonganTemu {
  id: string
  documentId: string
  judul: string
  docType: string
  urutan: number
  isi: string
  /** Skor RRF gabungan. */
  skor: number
  /** Jalur mana yang menemukannya — untuk explainability, bukan hiasan. */
  jalur: Array<'teks' | 'vektor'>
}

export type StatusJalur = 'ok' | 'kosong' | 'gagal' | 'dilewati'

export interface HasilCari {
  potongan: PotonganTemu[]
  /**
   * Keadaan tiap jalur — WAJIB dilaporkan, tak boleh ditelan.
   *
   * Kriteria C2: "kegagalan salah satu jalur TERLIHAT, bukan ditelan catch
   * kosong". Jalur vector yang mati membuat parafrase berhenti bekerja
   * sementara pencocokan persis tetap jalan — gejalanya "asisten jadi agak
   * bodoh", yang tak pernah dilaporkan siapa pun sebagai kerusakan.
   */
  jalurTeks: StatusJalur
  jalurVektor: StatusJalur
  pesanGagal?: string
}

interface BarisPotongan {
  id: string
  document_id: string
  doc_type: string
  urutan: number
  isi: string
  documents?: { title?: string } | Array<{ title?: string }> | null
}

const KOLOM = 'id, document_id, doc_type, urutan, isi, documents(title)'

function judulDari(b: BarisPotongan): string {
  const d = Array.isArray(b.documents) ? b.documents[0] : b.documents
  return d?.title ?? '(tanpa judul)'
}

/**
 * Menerapkan saringan ACL ke sebuah query.
 *
 * Satu tempat, dipakai KEDUA jalur. Menuliskannya dua kali berarti dua
 * saringan yang bisa berbeda — dan yang berbeda diam-diam adalah salinan.
 */
function terapkanAcl<T>(q: T, companyId: string, saringan: SaringanRag): T {
  // `company_id` DI WHERE (T-2), meski `TenantDb` sudah menyaring dan policy
  // RESTRICTIVE juga menegakkannya. Redundan dengan sengaja: penjaga CI
  // memeriksa keberadaannya di kode, dan lapisan yang bisa dibaca manusia
  // adalah lapisan yang bisa ditinjau saat review.
  let x = (q as { eq: (k: string, v: unknown) => T }).eq('company_id', companyId)
  if (saringan.jenis) {
    x = (x as unknown as { in: (k: string, v: readonly string[]) => T }).in(
      'doc_type',
      saringan.jenis,
    )
  }
  if (saringan.hanyaVisibelKlien) {
    x = (x as unknown as { eq: (k: string, v: unknown) => T }).eq('visible_klien', true)
  }
  return x
}

export interface OpsiCari {
  db: TenantDb
  companyId: string
  /**
   * Pengguna yang bertanya. Dipakai membuktikan keanggotaan di RPC vektor.
   *
   * Bukan hiasan: RPC melewati `TenantDb`, jadi ia butuh bukti tenancy
   * sendiri — dan bukti itu adalah pasangan (user, company) di
   * `company_members`, sumber yang sama dengan login web dan sesi WhatsApp.
   */
  userId?: string
  saringan: SaringanRag
  kueri: string
  /** Embedding kueri. `null` = jalur vektor DILEWATI, bukan gagal. */
  embedKueri?: number[] | null
  /** Berapa banyak diambil per jalur sebelum difusikan. */
  perJalur?: number
  /** Berapa banyak dikembalikan sesudah fusi. */
  batas?: number
}

/**
 * Mencari potongan relevan lewat dua jalur, lalu memfusikan peringkatnya.
 *
 * Tak pernah melempar: kegagalan satu jalur dilaporkan lewat `jalurTeks` /
 * `jalurVektor`, dan jalur yang tersisa tetap menghasilkan jawaban.
 */
export async function cariPotongan(opsi: OpsiCari): Promise<HasilCari> {
  const { db, companyId, saringan, kueri } = opsi
  const perJalur = opsi.perJalur ?? 20
  const batas = opsi.batas ?? 6

  const peringkat = new Map<string, { baris: BarisPotongan; jalur: Set<'teks' | 'vektor'>; skor: number }>()
  let jalurTeks: StatusJalur = 'ok'
  let jalurVektor: StatusJalur = 'dilewati'
  let pesanGagal: string | undefined

  // ── JALUR 1: teks penuh (tsvector Indonesia) ─────────────────────────────
  //
  // `websearch_to_tsquery`, bukan `plainto_tsquery`: yang pertama memahami
  // tanda kutip untuk frasa persis dan `-` untuk pengecualian — dan
  // pencocokan PERSIS adalah kriteria C2 yang eksplisit.
  try {
    const q = terapkanAcl(
      db.from('rag_potongan').select(KOLOM),
      companyId,
      saringan,
    ) as unknown as {
      textSearch: (k: string, v: string, o: object) => { limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }> }
    }

    const { data, error } = await q
      .textSearch('isi_ts', kueri, { type: 'websearch', config: 'indonesian' })
      .limit(perJalur)

    if (error) {
      jalurTeks = 'gagal'
      pesanGagal = `teks: ${error.message}`
    } else {
      const baris = (data ?? []) as BarisPotongan[]
      if (baris.length === 0) jalurTeks = 'kosong'
      baris.forEach((b, i) => {
        const skor = BOBOT_TEKS / (K_RRF + i + 1)
        peringkat.set(b.id, { baris: b, jalur: new Set(['teks']), skor })
      })
    }
  } catch (e) {
    // Ditangkap, TAPI TIDAK DITELAN — statusnya keluar di hasil.
    jalurTeks = 'gagal'
    pesanGagal = `teks: ${(e as Error).message}`
  }

  // ── JALUR 2: kemiripan vektor ────────────────────────────────────────────
  if (opsi.embedKueri && opsi.embedKueri.length > 0) {
    try {
      /*
       * RPC, bukan query builder: operator jarak `<=>` milik pgvector tak bisa
       * diungkapkan lewat PostgREST. Fungsinya (`rag_cari_vektor`, migrasi
       * 264) MENERIMA company_id dan menaruhnya di WHERE-nya sendiri — bukan
       * mengandalkan pemanggil, karena RPC melewati `TenantDb`.
       */
      const { data, error } = await db.raw.rpc('rag_cari_vektor', {
        p_company: companyId,
        // `p_user` WAJIB: fungsi membuktikan keanggotaan lewat
        // `company_members`, bukan lewat `auth_company_id()`. Yang kedua
        // KOSONG pada klien service-role yang dipakai `db.raw` — versi
        // pertama fungsinya memakai itu dan mengembalikan nol baris untuk
        // SETIAP pemanggilan sah (migrasi 265 memperbaikinya).
        p_user: opsi.userId,
        p_embed: JSON.stringify(opsi.embedKueri),
        p_jenis: saringan.jenis ? [...saringan.jenis] : null,
        p_hanya_visibel: saringan.hanyaVisibelKlien,
        p_batas: perJalur,
      })

      if (error) {
        jalurVektor = 'gagal'
        pesanGagal = [pesanGagal, `vektor: ${error.message}`].filter(Boolean).join(' · ')
      } else {
        const baris = (data ?? []) as BarisPotongan[]
        jalurVektor = baris.length === 0 ? 'kosong' : 'ok'
        baris.forEach((b, i) => {
          const tambah = BOBOT_VEKTOR / (K_RRF + i + 1)
          const ada = peringkat.get(b.id)
          if (ada) {
            // Muncul di KEDUA jalur — inilah yang RRF hargai, dan yang hilang
            // sama sekali kalau hasilnya sekadar disambung.
            ada.skor += tambah
            ada.jalur.add('vektor')
          } else {
            peringkat.set(b.id, { baris: b, jalur: new Set(['vektor']), skor: tambah })
          }
        })
      }
    } catch (e) {
      jalurVektor = 'gagal'
      pesanGagal = [pesanGagal, `vektor: ${(e as Error).message}`].filter(Boolean).join(' · ')
    }
  }

  const potongan = [...peringkat.values()]
    .sort((a, b) => b.skor - a.skor)
    .slice(0, batas)
    .map((p) => ({
      id: p.baris.id,
      documentId: p.baris.document_id,
      judul: judulDari(p.baris),
      docType: p.baris.doc_type,
      urutan: p.baris.urutan,
      isi: p.baris.isi,
      skor: p.skor,
      jalur: [...p.jalur],
    }))

  return { potongan, jalurTeks, jalurVektor, pesanGagal }
}
