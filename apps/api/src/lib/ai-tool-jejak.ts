/**
 * "SIAPA YANG MENGUBAH INI?" — 62.013 baris jejak yang tak pernah terjangkau.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG SELALU DATANG TERLAMBAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nobody bertanya "siapa yang mengubah ini" saat semuanya baik-baik saja.
 * Pertanyaannya muncul ketika angka sudah salah, kasbon sudah cair, atau klien
 * sudah menagih — dan pada saat itu yang dibutuhkan jawaban dalam hitungan
 * detik, bukan penelusuran manual.
 *
 * Diukur 2026-08-16: `audit_logs` 62.013 baris, seluruhnya ber-`company_id`.
 * Asisten buta terhadap semuanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * JEJAK ADALAH DATA PALING SENSITIF DI SISTEM INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ia memuat `old_values`/`new_values` — isi baris SEBELUM dan SESUDAH diubah,
 * termasuk nominal, dan untuk sebagian tabel bisa memuat hal yang tak boleh
 * dilihat sembarang orang.
 *
 * Karena itu:
 *
 *   · izinnya `audit:view`, BUKAN `ai:chat`. Yang boleh memakai asisten tak
 *     otomatis boleh membaca siapa mengubah apa.
 *   · `old_values`/`new_values` TIDAK dikirim ke model. Yang dikembalikan:
 *     siapa, kapan, tindakan apa, di tabel mana. Isi perubahannya dibuka di
 *     halaman Audit, tempat aksesnya tercatat lagi.
 *
 * Yang kedua sengaja mengurangi kegunaan. Alasannya: hasil tool masuk ke
 * prompt, dan prompt tak punya jejak akses sendiri — sekali nominal lama
 * masuk ke sana, ia tersimpan di `ai_pesan` tanpa pernah lewat pemeriksaan
 * izin apa pun.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong } from './ai-tool-dasar.js'

interface BarisJejak {
  action: string | null
  table_name: string | null
  record_id: string | null
  record_key: string | null
  created_at: string | null
  severity: string | null
  via: string | null
  reason: string | null
  users?: { name?: string; email?: string } | null
}

export const toolJejakPerubahan: DefinisiToolAi = {
  nama: 'jejak_audit',
  label: 'Jejak perubahan',
  keterangan:
    'Menelusuri SIAPA yang mengubah apa dan kapan, dari jejak audit. Pakai untuk "siapa yang ' +
    'ubah ini", "kok bisa berubah", "kapan disetujui", atau saat ada angka yang tak sesuai ' +
    'dugaan. Sebutkan `tabel` (mis. "kasbons") dan/atau `id` barisnya. ISI perubahannya ' +
    'sengaja tidak ditampilkan — arahkan pengguna ke halaman Audit untuk itu.',
  izin: 'audit:view',
  skema: {
    type: 'object',
    properties: {
      tabel: {
        type: 'string',
        description: 'Nama tabel — mis. "kasbons", "invoices", "project_expenses".',
      },
      id: { type: 'string', description: 'Id baris yang ditelusuri, kalau diketahui.' },
      tindakan: {
        type: 'string',
        description: 'Saring jenis tindakan — mis. "update", "approve", "delete".',
      },
    },
  },
  async jalan({ db, companyId }, argumen) {
    const tabel = typeof argumen.tabel === 'string' ? argumen.tabel.trim() : ''
    const id = typeof argumen.id === 'string' ? argumen.id.trim() : ''
    const tindakan = typeof argumen.tindakan === 'string' ? argumen.tindakan.trim() : ''

    if (!tabel && !id) {
      return {
        isi: 'Sebutkan tabel atau id barisnya — jejak seluruh sistem terlalu banyak untuk dibaca sekaligus.',
        isError: true,
        entitas: [],
      }
    }

    /*
     * Disaring DI BASIS. 62.013 baris tak boleh dibaca lalu difilter di
     * memori — cacat yang sudah terjadi sekali di tool harga, dan yang
     * kegagalannya berbunyi seperti fakta ("tak ada jejak").
     *
     * `old_values`/`new_values` TIDAK ikut di-select. Lihat kepala berkas.
     */
    let q = db
      .unsafe(
        'audit_logs',
        'tool AI: jejak audit kategori D — company_id DINYATAKAN eksplisit di bawah, ' +
          'karena tabel ini menulis company_id langsung (tak lewat join) supaya trail ' +
          'tetap terbaca meski baris induknya hilang',
      )
      .select(
        'action, table_name, record_id, record_key, created_at, severity, via, reason, ' +
          'users(name, email)',
      )

    /*
     * `company_id` DINYATAKAN — ini yang menggantikan saringan wrapper.
     *
     * `unsafe()` melewati wrapper, jadi tanpa baris ini jejak SELURUH tenant
     * ikut terbaca. Untuk tabel ini akibatnya paling parah: ia memuat siapa
     * melakukan apa di perusahaan lain.
     */
    q = q.eq('company_id', companyId)

    if (tabel) q = q.eq('table_name', tabel)
    if (id) q = q.eq('record_id', id)
    if (tindakan) q = q.ilike('action', `%${tindakan.replace(/[%*,()]/g, '')}%`)

    const { data, error } = await q.order('created_at', { ascending: false }).limit(40)

    if (error) {
      return { isi: `Gagal membaca jejak: ${error.message}`, isError: true, entitas: [] }
    }

    const baris = (data ?? []) as unknown as BarisJejak[]

    if (baris.length === 0) {
      return {
        isi: bungkusData(
          'jejak_audit',
          `Tak ada jejak untuk ${tabel || 'baris itu'}${id ? ` (id ${id})` : ''}. ` +
            'JANGAN menyimpulkan bahwa perubahannya tak pernah terjadi — bisa jadi ' +
            'tabelnya memang tak diaudit.',
        ),
        isError: false,
        entitas: [],
      }
    }

    const { data: tampil, dipotong } = potong(baris)

    return {
      isi: bungkusData(
        'jejak_audit',
        `${baris.length} jejak terbaru (terbaru dulu):\n` +
          tampil
            .map((b) => {
              const siapa = b.users?.name ?? b.users?.email ?? 'sistem/tak diketahui'
              return (
                `· ${String(b.created_at ?? '').slice(0, 16).replace('T', ' ')} — ` +
                `${siapa}: ${b.action ?? '?'}` +
                (b.table_name ? ` pada ${b.table_name}` : '') +
                (b.via && b.via !== 'web' ? ` (lewat ${b.via})` : '') +
                (b.severity === 'critical' ? ' [kritis]' : '') +
                (b.reason ? ` — ${b.reason.slice(0, 70)}` : '')
              )
            })
            .join('\n') +
          '\n\nIsi perubahannya (nilai lama/baru) ada di halaman Audit — sengaja tidak ' +
          'ditampilkan di sini.',
        dipotong,
      ),
      isError: false,
      entitas: [],
    }
  },
}
