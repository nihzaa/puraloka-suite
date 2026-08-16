/**
 * BEBAN MANDOR LINTAS PROYEK (3.20) — "siapa yang kelebihan muatan?"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG MUNCUL SAAT MEMBERI PENUGASAN BARU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Proyek baru ini pegang siapa?" dijawab dari ingatan — dan ingatan
 * cenderung menyebut nama yang paling sering terdengar, yaitu justru yang
 * sudah paling penuh.
 *
 * Diukur 2026-08-16:
 *
 *   Pak Budi Santoso    5 penugasan · 5 proyek
 *   Pak Agus Supriadi   3
 *   Pak Slamet          3
 *   tiga lainnya        2 masing-masing
 *
 * Satu orang memegang dua setengah kali beban rekannya, dan itu tak terlihat
 * di halaman mana pun karena tiap halaman menampilkan satu proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MENGHITUNG YANG AKTIF SAJA — DAN ITU BUKAN DETAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `mandor_assignments.status` bernilai `active` atau `completed` (diukur ke
 * basis, bukan ditebak). Menghitung keduanya membuat mandor lama yang sudah
 * menyelesaikan banyak proyek terlihat paling sibuk — padahal ia justru yang
 * paling longgar sekarang.
 *
 * Beban yang salah baca berarti penugasan baru jatuh ke orang yang salah, dan
 * akibatnya baru terlihat berbulan kemudian sebagai proyek yang tertinggal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MENYAJIKAN, TIDAK MEMUTUSKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang tak terbaca dari angka: keahlian, kedekatan lokasi, dan hubungan
 * dengan klien tertentu. Mandor dengan 2 penugasan bisa saja sedang menangani
 * pekerjaan tersulit di portofolio.
 *
 * Karena itu keluarannya urutan beban + jumlah, bukan "berikan ke Pak X".
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong } from './ai-tool-dasar.js'

interface BarisTugas {
  mandor_id: string
  project_id: string
  status: string | null
  users?: { name?: string } | null
}

export const toolBebanMandorLintas: DefinisiToolAi = {
  nama: 'beban_mandor_lintas',
  label: 'Beban mandor lintas proyek',
  keterangan:
    'Membandingkan beban tiap mandor: berapa penugasan AKTIF dan berapa proyek yang ' +
    'dipegangnya. Pakai untuk "proyek baru ini pegang siapa", "siapa yang paling sibuk", ' +
    '"mandor mana yang masih longgar". Tool ini MENYAJIKAN beban, tidak memilih orang — ' +
    'keahlian dan lokasi tak terbaca dari angka.',
  izin: 'mandor:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    // Proyek milik tenant dulu — `mandor_assignments` kategori C.
    const { data: pr, error: errPr } = await db
      .from('projects')
      .select('id, name, status')
      .eq('is_deleted', false)
      .limit(500)

    if (errPr) {
      return { isi: `Gagal membaca proyek: ${errPr.message}`, isError: true, entitas: [] }
    }

    const proyek = (pr ?? []) as unknown as Array<{ id: string; name: string; status: string | null }>
    if (proyek.length === 0) {
      return {
        isi: bungkusData('beban_mandor', 'Belum ada proyek.'),
        isError: false,
        entitas: [],
      }
    }

    const namaProyek = new Map(proyek.map((p) => [p.id, p.name]))

    const { data, error } = await db
      .unsafe(
        'mandor_assignments',
        'tool AI: beban mandor lintas proyek milik tenant, disaring project_id',
      )
      /*
       * Relasi DINAMAI lewat constraint-nya.
       *
       * `mandor_assignments` punya dua FK ke `users` — `mandor_id` dan
       * `assigned_by`. `users!inner(...)` karenanya ambigu dan PostgREST
       * menolaknya; pelajaran yang sama dengan `ai-tool-titip-pesan.ts`.
       */
      .select('mandor_id, project_id, status, users!mandor_assignments_mandor_id_fkey(name)')
      .in('project_id', proyek.map((p) => p.id))
      .limit(1000)

    if (error) {
      return { isi: `Gagal membaca penugasan: ${error.message}`, isError: true, entitas: [] }
    }

    const semua = (data ?? []) as unknown as BarisTugas[]

    /*
     * Hanya yang AKTIF.
     *
     * Menghitung `completed` membuat mandor lama yang sudah menyelesaikan
     * banyak proyek terlihat paling sibuk — padahal ia justru yang paling
     * longgar sekarang, dan penugasan baru jatuh ke orang yang salah.
     */
    const aktif = semua.filter((t) => t.status === 'active')

    if (aktif.length === 0) {
      return {
        isi: bungkusData(
          'beban_mandor',
          `Tak ada penugasan aktif. (${semua.length} penugasan tercatat, semuanya selesai.)`,
        ),
        isError: false,
        entitas: [],
      }
    }

    interface Beban {
      nama: string
      tugas: number
      proyek: Set<string>
    }

    const per = new Map<string, Beban>()
    for (const t of aktif) {
      const kunci = t.mandor_id
      if (!kunci) continue
      const b = per.get(kunci) ?? { nama: t.users?.name ?? '(tanpa nama)', tugas: 0, proyek: new Set() }
      b.tugas += 1
      if (t.project_id) b.proyek.add(t.project_id)
      per.set(kunci, b)
    }

    const daftar = [...per.values()].sort((a, b) => b.tugas - a.tugas)
    const totalTugas = daftar.reduce((s, b) => s + b.tugas, 0)
    const rata = totalTugas / daftar.length

    const { data: tampil, dipotong } = potong(daftar)

    /*
     * Ambang sorot dari RATA-RATA, bukan angka tetap.
     *
     * Perusahaan dengan 3 mandor dan 30 mandor punya "sibuk" yang berbeda.
     * Angka tetap akan menyorot semua orang di satu perusahaan dan tak
     * seorang pun di perusahaan lain.
     */
    const ambang = rata * 1.5

    const bagian: string[] = [
      `${daftar.length} mandor dengan penugasan aktif (total ${totalTugas}, rata-rata ` +
        `${rata.toFixed(1)} per orang):`,
      ...tampil.map((b) => {
        const proyekContoh = [...b.proyek]
          .slice(0, 3)
          .map((id) => namaProyek.get(id) ?? '?')
          .join(', ')
        return (
          `· ${b.nama}: ${b.tugas} penugasan di ${b.proyek.size} proyek` +
          (b.tugas >= ambang ? '  ⚠ jauh di atas rata-rata' : '') +
          (proyekContoh ? `\n    ${proyekContoh}${b.proyek.size > 3 ? ', …' : ''}` : '')
        )
      }),
      ...(dipotong > 0 ? [`… dan ${dipotong} mandor lagi.`] : []),
      '',
      'Hanya penugasan AKTIF yang dihitung — yang selesai tak lagi jadi beban.',
      'Ini beban menurut JUMLAH. Keahlian, jarak lokasi, dan hubungan dengan',
      'klien tak terbaca dari angka: mandor dengan 2 penugasan bisa saja sedang',
      'menangani pekerjaan tersulit. Keputusannya tetap di tangan pengguna.',
    ]

    return {
      isi: bungkusData('beban_mandor', bagian.join('\n')),
      isError: false,
      entitas: tampil.map((b) => b.nama),
    }
  },
}
