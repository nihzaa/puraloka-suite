import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

// Menu Registry (Sub-Fase 1B.2). Struktur menu sidebar dari DB.
// PENTING: TIDAK memfilter berdasarkan permission di server — visibility tetap
// dievaluasi di client (perms.has() match-ANY), konsisten desain sidebar existing.
// Server hanya mengirim STRUKTUR + required_permissions; client memutuskan tampil/tidak.

interface MenuRow {
  id: string
  key: string
  label: string
  href: string | null
  icon: string
  parent_id: string | null
  required_permissions: string[]
  sort_order: number
  section: string
}

interface MenuNode extends MenuRow {
  children: MenuNode[]
}

export default async function menuRoutes(app: FastifyInstance) {
  // ── GET /api/v1/menu ──────────────────────────────────────────────────────
  // Return menu tree (parent + children via parent_id). Read: authenticated.
  app.get('/api/v1/menu', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, key, label, href, icon, parent_id, required_permissions, sort_order, section')
      .eq('is_active', true)
      .order('section', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('key', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })

    // T7 — Menu Registry per company (migrasi 136).
    //
    // `menu_items` tetap katalog GLOBAL; yang per-company hanyalah PENGECUALIAN
    // di `company_menu_settings`. Nol baris = seluruh menu tampil, jadi
    // perusahaan yang tak pernah mengubah apa pun berperilaku persis seperti
    // sebelum fitur ini ada.
    //
    // Disengaja: kalau menu disalin per company, setiap menu baru di rilis
    // berikutnya harus di-backfill ke semua tenant, dan tenant yang terlewat
    // diam-diam kehilangan fitur.
    //
    // BUKAN lapis keamanan: menyembunyikan menu tidak menutup endpoint-nya.
    // Akses tetap dijaga permission (ADR-004) + RLS — kalau menu dianggap
    // penjaga, orang berhenti memasang gerbang yang sebenarnya sementara URL
    // yang diketik langsung tetap tembus.
    // Lewat `request.db!` (bukan klien mentah): kategori B, jadi wrapper
    // menyisipkan `eq('company_id', …)` sendiri. Menulisnya manual berarti
    // filter itu bisa terlupa saat kode ini disunting nanti.
    const { data: pengecualian, error: errKecuali } = await request.db!
      .from('company_menu_settings')
      .select('menu_key, is_hidden, sort_order')

    if (errKecuali) {
      // Gagal memuat pengecualian TIDAK boleh mengosongkan menu — user akan
      // melihat sidebar kosong dan mengira aplikasinya rusak. Jatuh ke katalog
      // penuh (perilaku bawaan) dan catat errornya.
      request.log.error({ err: errKecuali }, 'gagal memuat pengaturan menu perusahaan')
    }

    type Pengecualian = { menu_key: string; is_hidden: boolean; sort_order: number | null }
    const perKey = new Map<string, Pengecualian>(
      ((pengecualian ?? []) as Pengecualian[]).map((p) => [p.menu_key, p])
    )

    const rows = ((data ?? []) as MenuRow[])
      .filter((r) => perKey.get(r.key)?.is_hidden !== true)
      .map((r) => {
        const urutan = perKey.get(r.key)?.sort_order
        return urutan === null || urutan === undefined ? r : { ...r, sort_order: urutan }
      })

    // Id menu yang disembunyikan perusahaan ini — dipakai agar anaknya ikut
    // hilang alih-alih naik ke root (lihat cabang di bawah).
    const indukDisembunyikan = new Set(
      ((data ?? []) as MenuRow[])
        .filter((r) => perKey.get(r.key)?.is_hidden === true)
        .map((r) => r.id)
    )

    const byId = new Map<string, MenuNode>()
    for (const r of rows) byId.set(r.id, { ...r, children: [] })

    const roots: MenuNode[] = []
    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) {
        byId.get(node.parent_id)!.children.push(node)
      } else if (node.parent_id && indukDisembunyikan.has(node.parent_id)) {
        // Induknya disembunyikan PERUSAHAAN INI. Anaknya ikut hilang, bukan
        // naik jadi menu utama — tanpa cabang ini, menyembunyikan "Pengaturan"
        // justru memunculkan "Roles & Permissions" di level teratas sidebar:
        // kebalikan dari yang diminta, dan terlihat seperti bug acak.
        //
        // Sengaja dibatasi pada penyembunyian per-company. Anak yang induknya
        // `is_active=false` tetap naik ke root seperti sebelumnya — itu
        // perilaku lama yang tak ada hubungannya dengan T7, dan mengubahnya
        // di sini berarti menyelundupkan perubahan perilaku yang tak diminta.
        continue
      } else {
        roots.push(node)
      }
    }

    // Sudah terurut dari query; children mengikuti urutan insert (sort_order asc).
    const sortChildren = (n: MenuNode) => {
      n.children.sort((a, b) => a.sort_order - b.sort_order)
      n.children.forEach(sortChildren)
    }
    roots.sort((a, b) => a.sort_order - b.sort_order)
    roots.forEach(sortChildren)

    // ── ETag ────────────────────────────────────────────────────────────────
    //
    // Katalog menu 249 baris = ~57 KB JSON, muatan terbesar di seluruh
    // aplikasi — lebih besar dari data bisnis mana pun — dan sidebar
    // mengambilnya ulang di SETIAP halaman untuk revalidasi cache
    // localStorage-nya. Isinya berubah saat rilis menambah menu, bukan saat
    // orang bekerja, jadi hampir setiap unduhan itu mengirim byte yang
    // identik dengan yang sudah dipegang peramban.
    //
    // Hash diambil dari `roots` — muatan AKHIR, sesudah `company_menu_settings`
    // diterapkan — bukan dari katalog mentah. Ini yang membuatnya benar di
    // multi-tenant: dua perusahaan dengan pengecualian berbeda menghasilkan
    // ETag berbeda dengan sendirinya. Hash katalog mentah akan sama untuk
    // semua tenant, dan perusahaan kedua menerima 304 lalu memakai menu
    // perusahaan pertama dari cache-nya — kebocoran tenant lewat cache, persis
    // jenis kegagalan yang tak menimbulkan satu pun pesan galat.
    //
    // `W/` (weak): yang dijanjikan sama adalah MAKNA muatan, bukan byte-nya
    // — urutan kunci JSON tak dijamin stabil lintas versi runtime.
    const etag = `W/"${createHash('sha1').update(JSON.stringify(roots)).digest('base64url')}"`
    reply.header('ETag', etag)
    // Wajib: tanpa ini proxy bersama boleh menyimpan menu satu tenant dan
    // menyajikannya ke tenant lain. `private` menahan salinan di peramban saja.
    reply.header('Cache-Control', 'private, no-cache')

    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send()
    }

    return reply.send({ menu: roots })
  })
}
