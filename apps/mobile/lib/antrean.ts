/**
 * ANTREAN OFFLINE — kiriman yang selamat melewati hilangnya sinyal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `RILIS-MOBILE.md` menyebut "sinyal buruk di proyek" sebagai risiko utama
 * uji lapangan, dan sampai 2026-08-27 tak ada apa pun yang menanganinya:
 * `handleSubmit` memanggil `api.post` langsung, dan kalau jaringan mati
 * mandor mendapat `Alert('Gagal')` lalu kiriman itu HILANG.
 *
 * Akibatnya bukan sekadar merepotkan. Mandor di proyek tanpa sinyal
 * **tidak bisa mencatat pekerjaan sama sekali** — persis tempat dan saat
 * aplikasi ini seharusnya berguna.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA `Idempotency-Key` WAJIB, DAN KENAPA ANTREAN TANPA ITU BERBAHAYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * HTTP tak menjanjikan apa pun tentang permintaan yang timeout: mungkin
 * sudah sampai ke server, mungkin belum. Antrean yang mengirim ulang tanpa
 * penanda karena itu MENGGANDAKAN — dan `progress_logs` diukur 2026-08-27
 * **tak punya satu pun constraint unik**.
 *
 * Progres ganda bukan cacat tampilan: angkanya masuk ke kurva-S dan EVM.
 * Proyek terlihat lebih maju daripada kenyataannya, dan yang menemukannya
 * biasanya jauh kemudian — persis bentuk kerusakan yang dijelaskan
 * `utils/idempotency.ts` untuk pembayaran.
 *
 * Modul itu sudah ada di API dan komentarnya menyatakan sendiri bahwa
 * menutup celah ini adalah **pekerjaan sisi klien**: mengirim kunci. Di
 * sinilah kunci itu dibuat — sekali, saat kiriman MASUK antrean, lalu
 * dipakai ulang untuk tiap percobaan berikutnya.
 *
 * ⚠ Kunci dibuat SEKALI dan disimpan bersama kiriman. Membuatnya saat
 * mengirim akan menghasilkan kunci baru tiap percobaan — yaitu tak punya
 * idempotensi sama sekali, dengan penampilan seolah punya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * FOTO — kenapa disalin, bukan ditunjuk
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `expo-image-picker` dan `expo-camera` memulangkan URI di direktori CACHE.
 * Android boleh mengosongkan cache kapan saja saat penyimpanan menipis, dan
 * itu justru terjadi pada HP lama — HP yang dipakai mandor.
 *
 * Antrean yang menyimpan URI cache karena itu bisa mendapati fotonya lenyap
 * saat sinyal kembali, berjam-jam kemudian. Maka tiap foto DISALIN ke
 * direktori dokumen aplikasi lebih dulu; salinan itu milik aplikasi dan
 * hanya dihapus saat kirimannya berhasil.
 */
import * as FileSystem from 'expo-file-system'
import { api } from './api'
import { storage } from './storage'

const KUNCI_ANTREAN = 'puraloka_antrean_v1'
const FOLDER_ANTREAN = `${FileSystem.documentDirectory}antrean/`

/** Jumlah percobaan sebelum kiriman ditandai perlu perhatian manusia. */
const MAKS_PERCOBAAN = 5

/**
 * Jenis kiriman yang bisa diantrekan.
 *
 * `absensi` ditambahkan 2026-08-31: tabel `absensi_harian` diukur 1.279 baris
 * — yang paling sering diisi dari lapangan, dan justru satu-satunya dari
 * empat teratas yang belum punya layar mobile. Mengisinya di lokasi tanpa
 * sinyal adalah keadaan normal, bukan pengecualian.
 */
export type JenisKiriman = 'progres-harian' | 'progres-detail' | 'kasbon' | 'absensi' | 'punch' | 'ncr' | 'izin-kerja'

export interface Kiriman {
  id: string
  jenis: JenisKiriman
  /** Kunci idempotensi — dibuat SEKALI, tak pernah berubah. */
  kunci: string
  /** Jalur API tujuan, sudah lengkap. */
  jalur: string
  /** Muatan JSON (untuk kiriman tanpa foto). */
  muatan?: Record<string, unknown>
  /** Berkas foto yang SUDAH disalin ke folder aplikasi. */
  foto?: string[]
  /** Ringkasan untuk ditampilkan ke pengguna — mis. "Progres 45% · Ruko Bapak Andi". */
  ringkas: string
  dibuatPada: string
  percobaan: number
  galatTerakhir?: string
}

/**
 * Kunci idempotensi.
 *
 * `crypto.randomUUID` tak selalu ada di Hermes, jadi disusun dari waktu +
 * dua nilai acak. Yang dibutuhkan bukan keacakan kriptografis melainkan
 * keunikan antar-kiriman pada satu perangkat.
 */
function buatKunci(): string {
  const acak = () => Math.random().toString(36).slice(2, 10)
  return `mob-${Date.now().toString(36)}-${acak()}${acak()}`
}

async function baca(): Promise<Kiriman[]> {
  const raw = await storage.get(KUNCI_ANTREAN)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as Kiriman[]) : []
  } catch {
    // Antrean rusak lebih baik dianggap kosong daripada melempar tiap layar
    // dibuka. Kiriman hilang memang buruk — tetapi aplikasi yang tak bisa
    // dibuka sama sekali lebih buruk, dan penggunanya tak punya jalan keluar.
    return []
  }
}

async function tulis(daftar: Kiriman[]): Promise<void> {
  await storage.set(KUNCI_ANTREAN, JSON.stringify(daftar))
}

/**
 * Salin foto dari cache ke folder aplikasi.
 *
 * Memulangkan jalur salinan. Foto yang gagal disalin DILEWATI, bukan
 * menggagalkan seluruh kiriman: progres tanpa satu foto jauh lebih berguna
 * daripada progres yang tak terkirim sama sekali.
 */
async function salinFoto(uriAsli: string[], idKiriman: string): Promise<string[]> {
  if (uriAsli.length === 0) return []
  try {
    await FileSystem.makeDirectoryAsync(FOLDER_ANTREAN, { intermediates: true })
  } catch (e) {
    // Sudah ada — `intermediates: true` tak melempar untuk itu, tetapi
    // penyimpanan penuh bisa. Dibiarkan jatuh ke percobaan salin di bawah,
    // yang akan gagal per-foto dengan pesannya sendiri.
    //
    // DICATAT, tidak ditelan: penyimpanan penuh adalah sebab yang akan
    // terulang di HP yang sama, dan tanpa jejak ini gejalanya muncul sebagai
    // "foto hilang" tanpa ada yang menghubungkannya ke ruang penyimpanan.
    console.warn('[antrean] folder antrean gagal disiapkan:', (e as Error)?.message)
  }

  const hasil: string[] = []
  for (let i = 0; i < uriAsli.length; i++) {
    const ext = uriAsli[i].split('.').pop()?.split('?')[0] ?? 'jpg'
    const tujuan = `${FOLDER_ANTREAN}${idKiriman}-${i}.${ext}`
    try {
      await FileSystem.copyAsync({ from: uriAsli[i], to: tujuan })
      hasil.push(tujuan)
    } catch (e) {
      console.warn('[antrean] foto gagal disalin, dilewati:', (e as Error)?.message)
    }
  }
  return hasil
}

/** Buang berkas foto milik satu kiriman. Dipanggil sesudah berhasil terkirim. */
async function buangFoto(kiriman: Kiriman): Promise<void> {
  for (const f of kiriman.foto ?? []) {
    try {
      await FileSystem.deleteAsync(f, { idempotent: true })
    } catch (e) {
      // Berkas yatim memakan ruang, tetapi menggagalkan pembersihan antrean
      // karenanya akan membuat kiriman terkirim BERULANG. Kalah pentingnya —
      // jadi dicatat lalu dilanjutkan, bukan dilempar.
      console.warn('[antrean] foto antrean gagal dihapus:', (e as Error)?.message)
    }
  }
}

/**
 * Masukkan kiriman ke antrean. Selalu berhasil — inilah janjinya.
 *
 * Foto disalin lebih dulu supaya aman dari pembersihan cache.
 */
export async function antrekan(input: {
  jenis: JenisKiriman
  jalur: string
  muatan?: Record<string, unknown>
  fotoUri?: string[]
  ringkas: string
}): Promise<Kiriman> {
  const id = buatKunci()
  const foto = await salinFoto(input.fotoUri ?? [], id)

  const kiriman: Kiriman = {
    id,
    jenis: input.jenis,
    kunci: id, // kunci idempotensi = id kiriman; keduanya dibuat sekali
    jalur: input.jalur,
    muatan: input.muatan,
    foto: foto.length > 0 ? foto : undefined,
    ringkas: input.ringkas,
    dibuatPada: new Date().toISOString(),
    percobaan: 0,
  }

  const daftar = await baca()
  daftar.push(kiriman)
  await tulis(daftar)
  return kiriman
}

export async function daftarAntrean(): Promise<Kiriman[]> {
  return baca()
}

/*
  `jumlahAntrean()` pernah ada di sini dan dibuang 2026-08-27: nol pemanggil,
  dan ia hanya `(await baca()).length` — persis yang sudah bisa dilakukan
  pemanggil `daftarAntrean()` tanpa membaca penyimpanan DUA KALI.

  Dibuang, bukan disambungkan. Beda dari `hapusDariAntrean` yang juga nol
  pemanggil pada hari yang sama: yang itu satu-satunya jalan keluar bagi
  kiriman macet, jadi ketiadaannya adalah cacat. Yang ini cuma pembungkus,
  jadi ketiadaan pemanggilnya adalah jawaban.
*/

export async function hapusDariAntrean(id: string): Promise<void> {
  const daftar = await baca()
  const kiriman = daftar.find((k) => k.id === id)
  if (kiriman) await buangFoto(kiriman)
  await tulis(daftar.filter((k) => k.id !== id))
}

/** Satu kiriman → satu permintaan HTTP, membawa kunci idempotensinya. */
async function kirimSatu(k: Kiriman): Promise<void> {
  const header: Record<string, string> = { 'Idempotency-Key': k.kunci }

  if (k.foto && k.foto.length > 0) {
    const form = new FormData()
    for (const [nama, nilai] of Object.entries(k.muatan ?? {})) {
      if (nilai !== undefined && nilai !== null) form.append(nama, String(nilai))
    }
    k.foto.forEach((uri, i) => {
      const ext = uri.split('.').pop() ?? 'jpg'
      form.append('photos', {
        uri,
        name: `photo_${i}.${ext}`,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      } as never)
    })
    await api.post(k.jalur, form, {
      headers: { ...header, 'Content-Type': 'multipart/form-data' },
    })
    return
  }

  await api.post(k.jalur, k.muatan ?? {}, { headers: header })
}

export interface HasilProses {
  terkirim: number
  gagal: number
  tersisa: number
}

/**
 * Coba kirim seluruh antrean, urut dari yang paling lama.
 *
 * ── Kenapa berhenti pada kegagalan jaringan pertama
 *
 * Kalau permintaan pertama gagal karena tak ada sinyal, yang berikutnya
 * pasti gagal juga. Meneruskannya hanya menaikkan `percobaan` seluruh
 * antrean tanpa satu pun kemungkinan berhasil — dan itu membuat kiriman
 * menyentuh batas percobaan padahal tak pernah benar-benar dicoba dalam
 * keadaan yang wajar.
 *
 * Galat ber-STATUS diperlakukan berbeda: server menjawab, jadi kiriman
 * berikutnya layak dicoba.
 */
export async function prosesAntrean(): Promise<HasilProses> {
  const daftar = await baca()
  if (daftar.length === 0) return { terkirim: 0, gagal: 0, tersisa: 0 }

  const tersisa: Kiriman[] = []
  let terkirim = 0
  let gagal = 0
  let jaringanMati = false

  for (const k of daftar) {
    if (jaringanMati) {
      tersisa.push(k)
      continue
    }

    try {
      await kirimSatu(k)
      await buangFoto(k)
      terkirim++
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } }
      const status = e?.response?.status

      if (!status) {
        // Tak ada balasan sama sekali = jaringan. Simpan apa adanya, JANGAN
        // naikkan `percobaan`: tak terkirim karena tak ada sinyal bukan
        // kegagalan kiriman itu.
        jaringanMati = true
        tersisa.push(k)
        continue
      }

      /*
        4xx (selain 408/429) = server menolak isinya. Mencoba ulang kiriman
        yang ditolak karena salah isi akan gagal selamanya, jadi ia ditandai
        dan DIPERTAHANKAN untuk dilihat manusia — bukan dibuang diam-diam.
        Kiriman yang hilang tanpa jejak persis yang membuat orang berhenti
        mempercayai aplikasi.
      */
      const naikkan = { ...k, percobaan: k.percobaan + 1, galatTerakhir: e?.response?.data?.error ?? `HTTP ${status}` }
      gagal++
      tersisa.push(naikkan)
    }
  }

  await tulis(tersisa)
  return { terkirim, gagal, tersisa: tersisa.length }
}

/** Kiriman yang sudah melewati batas percobaan — perlu tindakan pengguna. */
export function perluPerhatian(k: Kiriman): boolean {
  return k.percobaan >= MAKS_PERCOBAAN
}
