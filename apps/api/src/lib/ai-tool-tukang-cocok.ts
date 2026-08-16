/**
 * TUKANG YANG COCOK (6.5) — "yang bisa plester siapa saja?"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIJAWAB DARI INGATAN MANDOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keahlian tukang tersimpan di `workers.skills`, dan tak ada halaman yang
 * menanyainya dari arah keahlian — yang ada daftar tukang per mandor. Jadi
 * "siapa yang bisa plester" dijawab dari ingatan, dan ingatan hanya menyebut
 * nama yang paling sering dipakai.
 *
 * Diukur 2026-08-16: 60 tukang, **41 punya skill tercatat**. Bentuknya array
 * teks pendek: `["kayu"]`, `["batu","plester"]`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG 19 TANPA SKILL DISEBUT, TIDAK DIHILANGKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sepertiga tukang belum punya keahlian tercatat. Daftar yang diam-diam
 * mengabaikan mereka membuat pembacanya menyimpulkan "cuma segini yang bisa" —
 * padahal yang benar "cuma segini yang TERCATAT bisa".
 *
 * Bedanya menentukan: yang pertama menutup pilihan, yang kedua mengundang
 * melengkapi data.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HANYA YANG AKTIF
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `workers.is_active` — tukang yang sudah berhenti tetap punya baris dan
 * skill-nya masih tercatat. Menyebutnya sebagai kandidat membuat mandor
 * menelepon orang yang sudah lama tak bekerja di sini.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong } from './ai-tool-dasar.js'

interface BarisTukang {
  id: string
  name: string
  skills: string[] | null
  tipe: string | null
  is_active: boolean | null
  phone: string | null
}

export const toolTukangCocok: DefinisiToolAi = {
  nama: 'tukang_cocok',
  label: 'Tukang menurut keahlian',
  keterangan:
    'Mencari tukang AKTIF menurut keahliannya — mis. "yang bisa plester siapa", "tukang kayu ' +
    'ada berapa". Kosongkan `keahlian` untuk melihat keahlian apa saja yang tercatat. ' +
    'Sebutkan juga berapa tukang yang keahliannya BELUM tercatat — daftar ini bukan ' +
    'seluruh yang bisa, melainkan seluruh yang tercatat bisa.',
  izin: 'mandor:view',
  skema: {
    type: 'object',
    properties: {
      keahlian: {
        type: 'string',
        description: 'Keahlian yang dicari (mis. "plester", "kayu", "batu"). Kosongkan untuk daftar keahlian.',
      },
    },
  },
  async jalan({ db }, argumen) {
    const { data, error } = await db
      .from('workers')
      .select('id, name, skills, tipe, is_active, phone')
      .limit(1000)

    if (error) {
      return { isi: `Gagal membaca data tukang: ${error.message}`, isError: true, entitas: [] }
    }

    const semua = (data ?? []) as unknown as BarisTukang[]

    /*
     * Hanya yang AKTIF.
     *
     * Tukang yang sudah berhenti tetap punya baris dan skill-nya masih
     * tercatat — menyebutnya sebagai kandidat membuat mandor menelepon orang
     * yang sudah lama tak bekerja di sini.
     */
    const aktif = semua.filter((w) => w.is_active !== false)

    if (aktif.length === 0) {
      return {
        isi: bungkusData('tukang_cocok', 'Tak ada tukang aktif terdaftar.'),
        isError: false,
        entitas: [],
      }
    }

    const punyaSkill = aktif.filter((w) => Array.isArray(w.skills) && w.skills.length > 0)
    const tanpaSkill = aktif.length - punyaSkill.length

    const cari = typeof argumen.keahlian === 'string' ? argumen.keahlian.trim().toLowerCase() : ''

    // ── Tanpa kata kunci: keahlian apa saja yang tercatat ──────────────────
    if (!cari) {
      const hitung = new Map<string, number>()
      for (const w of punyaSkill) {
        for (const s of w.skills ?? []) {
          const k = String(s).toLowerCase().trim()
          if (k) hitung.set(k, (hitung.get(k) ?? 0) + 1)
        }
      }

      const daftar = [...hitung.entries()].sort((a, b) => b[1] - a[1])
      if (daftar.length === 0) {
        return {
          isi: bungkusData(
            'tukang_cocok',
            `${aktif.length} tukang aktif, tetapi BELUM ADA yang keahliannya tercatat. ` +
              'Isi dulu di halaman Tukang supaya bisa dicari menurut keahlian.',
          ),
          isError: false,
          entitas: [],
        }
      }

      return {
        isi: bungkusData(
          'tukang_cocok',
          `Keahlian yang tercatat (${aktif.length} tukang aktif):\n` +
            daftar.map(([k, n]) => `· ${k}: ${n} orang`).join('\n') +
            (tanpaSkill > 0
              ? `\n\n⚠ ${tanpaSkill} tukang aktif BELUM punya keahlian tercatat — mereka ` +
                'tak akan muncul di pencarian mana pun.'
              : ''),
        ),
        isError: false,
        entitas: [],
      }
    }

    /*
     * Pencocokan di APLIKASI, bukan lewat operator array PostgREST.
     *
     * Kata yang model karang bisa memuat karakter yang jadi pemisah filter,
     * dan `skills` bertipe array teks — pencocokan sebagian ("plester" cocok
     * dengan "plesteran") tak bisa dilakukan operator `cs`/`ov`.
     */
    const cocok = punyaSkill.filter((w) =>
      (w.skills ?? []).some((s) => String(s).toLowerCase().includes(cari)),
    )

    if (cocok.length === 0) {
      const adaApa = [
        ...new Set(punyaSkill.flatMap((w) => (w.skills ?? []).map((s) => String(s).toLowerCase()))),
      ].slice(0, 12)

      return {
        isi: bungkusData(
          'tukang_cocok',
          `Tak ada tukang aktif berkeahlian '${cari}'.` +
            (adaApa.length > 0 ? ` Yang tercatat: ${adaApa.join(', ')}.` : '') +
            (tanpaSkill > 0
              ? ` Catatan: ${tanpaSkill} tukang aktif belum punya keahlian tercatat — ` +
                'bisa jadi ada yang bisa tetapi belum terdaftar.'
              : ''),
        ),
        isError: false,
        entitas: [],
      }
    }

    const { data: tampil, dipotong } = potong(cocok)

    return {
      isi: bungkusData(
        'tukang_cocok',
        `${cocok.length} tukang aktif berkeahlian '${cari}':\n` +
          tampil
            .map(
              (w) =>
                `· ${w.name}` +
                (w.tipe ? ` (${w.tipe})` : '') +
                ` — ${(w.skills ?? []).join(', ')}` +
                (w.phone ? ` · ${w.phone}` : ''),
            )
            .join('\n') +
          (tanpaSkill > 0
            ? `\n\n⚠ ${tanpaSkill} tukang aktif BELUM punya keahlian tercatat. Daftar ini ` +
              'bukan seluruh yang BISA, melainkan seluruh yang TERCATAT bisa.'
            : ''),
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((w) => w.name),
    }
  },
}
