import type { FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'
import { evaluateApproval, type ApprovalDecision, type ApprovalStep } from '../lib/approval-engine.js'

// Lapisan DB Approval Engine (ADR-007). Keputusan "berapa langkah & siapa boleh"
// didelegasikan ke lib/approval-engine.ts (murni, ber-test). Di sini hanya:
// baca konfigurasi rantai + jejak persetujuan, lalu catat persetujuan.
//
// Kolom `status` tabel sumber TETAP sumber kebenaran — util ini tidak menyimpannya.

export type ApprovalEntityType =
  | 'kasbon' | 'change_order' | 'material_request' | 'project_expense'
  | 'estimate_version'  // CECEP Milestone 3 — approval via engine yang sama (ADR-007, 47 §3)
  | 'lessons_learned'   // CECEP Milestone 4 — titik approval ke-3 (47 §3); approve = memicu write-back
  | 'submittal'         // ROADMAP #24c — keputusan konsultan atas material/gambar yang diajukan.
                        // Ikut engine ini, BUKAN status sendiri: membuat mekanisme
                        // approval keempat berarti mengulang persis masalah yang
                        // Program B selesaikan (Blueprint melarangnya eksplisit).
  | 'rencana_mutu'      // G1e (2026-08-11) — persetujuan Rencana Mutu Proyek.
                        // Masuk engine ini, BUKAN `disetujui_oleh` langsung:
                        // persetujuan RMP MENGIKAT (sesudahnya ITP tak boleh
                        // diubah tanpa revisi), dan dokumen yang mengikat pada
                        // sebagian tenant butuh dua tanda tangan — QA lalu
                        // direktur. Menulis kolomnya langsung membuat rantai
                        // dua langkah lolos dengan satu ketukan, sementara
                        // halaman pengaturannya tetap menampilkan dua.
                        //
                        // Nominalnya `null`: RMP tak menyentuh uang, jadi
                        // ambang nilai tak berlaku. Yang berjenjang di sini
                        // adalah KEWENANGAN, bukan besaran.

/**
 * Ambil langkah rantai aktif untuk sebuah entitas — MILIK COMPANY INI.
 *
 * T4h: tanpa `company_id`, rantai approval efektif DIPAKAI BERSAMA semua tenant.
 * Tenant A mengubah/menonaktifkan langkah approval akan mengubah alur approval
 * tenant B — termasuk melumpuhkannya total, karena `steps.length === 0`
 * bersifat fail-closed (nol orang bisa approve).
 */
async function loadSteps(
  entityType: ApprovalEntityType,
  companyId: string,
): Promise<{ steps: ApprovalStep[]; error?: string }> {
  const { data, error } = await supabase
    .from('approval_chains')
    .select('id, is_active, approval_steps ( level, required_permission, min_amount, label )')
    .eq('entity_type', entityType)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) return { steps: [], error: error.message }
  if (!data || data.is_active === false) return { steps: [] }
  const raw = (data.approval_steps ?? []) as unknown as ApprovalStep[]
  return { steps: raw.map(s => ({ ...s, min_amount: s.min_amount === null ? null : Number(s.min_amount) })) }
}

/** Level yang SUDAH disetujui untuk entitas ini. */
async function loadApprovedLevels(
  entityType: ApprovalEntityType,
  entityId: string,
  companyId: string,
): Promise<number[]> {
  const { data } = await supabase
    .from('approval_progress')
    .select('level')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
  return (data ?? []).map(r => Number(r.level))
}

/** Set permission milik role user (sumber sama dgn requirePermission runtime). */
async function loadUserPermissions(request: FastifyRequest): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc('get_role_permissions', {
    role_name: request.currentUser!.role,
  })
  if (error) return null
  return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key))
}

export interface EntityApprovalResult extends ApprovalDecision {
  /** true bila konfigurasi/permission tak terbaca — pemanggil WAJIB balas 500, bukan 403. */
  configError?: string
}

/**
 * Evaluasi apakah user boleh menyetujui entitas SEKARANG.
 * FAIL-CLOSED (ADR-007): konfigurasi/permission tak terbaca → TIDAK diloloskan, dan
 * dibedakan dari "tidak berhak" lewat `configError` supaya kegagalan tak menyamar
 * sebagai penolakan otorisasi (pelajaran Phase 1 §4E).
 */
export async function evaluateEntityApproval(
  request: FastifyRequest,
  params: { entityType: ApprovalEntityType; entityId: string; amount: number | null },
): Promise<EntityApprovalResult> {
  const { steps, error } = await loadSteps(params.entityType, request.companyId!)
  if (error) {
    return { allowed: false, reason: 'no_steps', step: null, isFinalStep: false, applicable: [], configError: error }
  }
  const perms = await loadUserPermissions(request)
  if (!perms) {
    return { allowed: false, reason: 'no_steps', step: null, isFinalStep: false, applicable: [], configError: 'get_role_permissions gagal' }
  }
  const approvedLevels = await loadApprovedLevels(params.entityType, params.entityId, request.companyId!)
  return evaluateApproval({ steps, amount: params.amount, approvedLevels, userPermissions: perms })
}

/**
 * Gerbang KASAR: apakah user memegang permission SALAH SATU langkah rantai?
 *
 * Dipakai SEBELUM entitas di-fetch, supaya urutan lama terjaga: user tak berwenang
 * dapat 403 tanpa pernah tahu entitasnya ada atau tidak (mencegah kebocoran
 * keberadaan id lewat beda 403 vs 404). Dengan seed 1 langkah, ini identik dengan
 * `requirePermission('<permission langkah 1>')` yang lama.
 */
export async function canParticipateInChain(
  request: FastifyRequest,
  entityType: ApprovalEntityType,
): Promise<{ ok: boolean; configError?: string }> {
  const { steps, error } = await loadSteps(entityType, request.companyId!)
  if (error) return { ok: false, configError: error }
  if (steps.length === 0) return { ok: false } // fail-closed
  const perms = await loadUserPermissions(request)
  if (!perms) return { ok: false, configError: 'get_role_permissions gagal' }
  return { ok: steps.some(s => perms.has(s.required_permission)) }
}

/**
 * `workflow_id` untuk seluruh event dalam satu rantai persetujuan.
 *
 * ── Kenapa id entitas, bukan uuid baru
 *
 * `correlation_id` mengikat event dalam SATU request. Persetujuan berjenjang
 * bukan satu request: level 1 disetujui hari ini, level 2 besok, oleh orang
 * berbeda — dan `correlation_id` keduanya berbeda, sebagaimana mestinya.
 *
 * Yang hilang adalah ikatan ANTAR-request itu. Diukur 2026-08-07: tiga
 * estimasi punya dua langkah persetujuan masing-masing, dan tiga event
 * mereka (`submitted` → `approval.level` → `approved`) tak punya satu pun
 * penanda bersama. Merunutnya berarti menebak dari `record_id` dan waktu.
 *
 * Id entitas dipakai apa adanya karena ia SUDAH memenuhi syaratnya:
 * deterministik (tak perlu disimpan di mana pun), unik per-alur, dan
 * bertipe uuid seperti kolomnya. Membuat uuid baru berarti menambah tabel
 * pemetaan yang tak menjawab pertanyaan tambahan apa pun.
 *
 * Konsekuensi yang disengaja: entitas yang DITOLAK lalu diajukan ulang
 * memakai `workflow_id` yang sama. Itu benar — pengajuan ulang adalah
 * kelanjutan alur yang sama, bukan alur baru, dan justru itu yang ingin
 * dilihat saat menanyakan "kenapa ini bolak-balik".
 */
export function idAlurPersetujuan(entityId: string): string {
  return entityId
}

/** Catat persetujuan satu level (idempoten via UNIQUE(entity_type, entity_id, level)). */
export async function recordApproval(params: {
  entityType: ApprovalEntityType
  entityId: string
  level: number
  approvedBy: string
  note?: string | null
  /** T4h: wajib — jejak approval milik company mana. */
  companyId: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('approval_progress').insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    level: params.level,
    approved_by: params.approvedBy,
    note: params.note ?? null,
    company_id: params.companyId,
  })
  // 23505 = level ini sudah tercatat (race/dobel) → aman diperlakukan sukses-idempoten.
  if (error && (error as { code?: string }).code !== '23505') return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Siapkan rantai approval untuk company yang BARU dibuat.
 *
 * ── Kenapa ini bagian dari pembuatan company, bukan tugas terpisah
 *
 * Diukur 2026-08-07: `[UJI] Tenant Kedua` punya **0 dari 7** jenis rantai.
 * Company kedua di basis ini lahir tanpa satu pun, dan tak ada yang tahu
 * sampai `submittal-aturan.test.ts` merah — itu pun hanya untuk satu jenis
 * dari tujuh, karena hanya `submittal` yang punya test.
 *
 * Enam sisanya akan gagal SENYAP: pengajuan masuk, lalu tak pernah bisa
 * diputuskan siapa pun karena tak ada rantai yang menentukan siapa berwenang.
 * Tak ada galat — hanya antrean yang tak pernah bergerak.
 *
 * Itu bukan cacat data, melainkan cacat PENYEDIAAN: F7-1 mensyaratkan
 * "tenant baru sekali klik", dan tenant yang alur persetujuannya mati sejak
 * hari pertama tidak memenuhinya.
 *
 * ── Disalin dari company contoh, bukan dari daftar yang ditulis di sini
 *
 * Menuliskan rantai bawaan sebagai konstanta berarti dua sumber kebenaran:
 * satu di kode, satu di basis. Yang pertama membusuk diam-diam begitu ada
 * jenis rantai baru ditambahkan lewat migrasi.
 *
 * Menyalin dari company yang sudah ada membuat tenant baru selalu memulai
 * dengan konfigurasi yang SAMA dengan yang sedang berjalan — termasuk
 * jenis-jenis yang belum ada saat fungsi ini ditulis.
 *
 * ── Kalau tak ada contoh sama sekali
 *
 * Mengembalikan `{ ok: true, disalin: 0 }`, bukan galat. Pada basis kosong
 * (company pertama) memang tak ada yang bisa disalin, dan menggagalkan
 * pendirian company pertama karena itu jelas salah.
 */
export async function siapkanRantaiApproval(companyId: string): Promise<{
  ok: boolean
  disalin: number
  error?: string
}> {
  const { data: contoh, error: eBaca } = await supabase
    .from('approval_chains')
    .select('id, entity_type, label, is_active, company_id')
    .neq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (eBaca) return { ok: false, disalin: 0, error: eBaca.message }
  if (!contoh?.length) return { ok: true, disalin: 0 }

  // Satu contoh per jenis — company yang lebih dulu dibuat jadi acuannya.
  const perJenis = new Map<string, (typeof contoh)[number]>()
  for (const c of contoh) if (!perJenis.has(c.entity_type)) perJenis.set(c.entity_type, c)

  let disalin = 0
  for (const [entityType, asal] of perJenis) {
    const { data: rantai, error: eRantai } = await supabase
      .from('approval_chains')
      .insert({ entity_type: entityType, label: asal.label, is_active: asal.is_active, company_id: companyId })
      .select('id')
      .single()
    // 23505 = sudah ada (dijalankan dua kali) → aman dilewati, bukan galat.
    if (eRantai) {
      if ((eRantai as { code?: string }).code === '23505') continue
      return { ok: false, disalin, error: eRantai.message }
    }

    const { data: langkah, error: eLangkah } = await supabase
      .from('approval_steps')
      .select('level, required_permission, min_amount, label')
      .eq('chain_id', asal.id)
      .order('level', { ascending: true })

    if (eLangkah) return { ok: false, disalin, error: eLangkah.message }

    // Rantai TANPA langkah lebih buruk daripada tak ada rantai: ia membuat
    // pemeriksaan "punya rantai?" lolos, sementara pengajuannya tetap tak
    // punya siapa pun yang berwenang memutuskan.
    if (langkah?.length) {
      const { error: eIsi } = await supabase.from('approval_steps').insert(
        langkah.map((l) => ({ ...l, chain_id: rantai.id, company_id: companyId })),
      )
      if (eIsi) return { ok: false, disalin, error: eIsi.message }
    }
    disalin++
  }

  return { ok: true, disalin }
}

/** Bersihkan jejak persetujuan (dipakai saat entitas ditolak → rantai diulang dari awal). */
export async function clearApprovalProgress(
  entityType: ApprovalEntityType,
  entityId: string,
  companyId: string,
): Promise<void> {
  await supabase.from('approval_progress').delete()
    .eq('entity_type', entityType).eq('entity_id', entityId).eq('company_id', companyId)
}
