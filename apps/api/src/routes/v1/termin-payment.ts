import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { terbitkanInvoiceTermin } from '../../lib/invoice-termin.js'
import { computeAndPersistPenalty } from '../../utils/penalty.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'

/**
 * Endpoint pembayaran termin:
 *
 * POST /api/v1/projects/:projectId/termin/:terminId/pay
 *   Body (multipart/form-data):
 *     paid_at       DATE string wajib
 *     amount_paid   number wajib
 *     payment_method  transfer_bank|cash|qris|cek|giro (default transfer_bank)
 *     ref_number    string opsional
 *     bank_name     string opsional
 *     notes         string opsional
 *     proof         file opsional (jpg/png/pdf, max 5MB)
 *
 * Flow:
 *   1. Validasi termin ada & milik project ini, status harus 'pending' atau 'billed'
 *   2. Upload bukti ke Supabase Storage jika ada
 *   3. Cek apakah sudah ada invoice untuk termin ini — jika belum, buat otomatis
 *   4. Insert ke payments
 *   5. Update invoice amount_paid, amount_due, status
 *   6. Update termin_schedules.status = 'paid'
 *
 * GET /api/v1/projects/:projectId/termin/:terminId/payment
 *   Ambil detail payment + proof URL untuk satu termin
 */
export default async function terminPaymentRoutes(app: FastifyInstance) {

  // ── POST: Tandai termin terbayar ─────────────────────────────────────────────
  app.post<{ Params: { projectId: string; terminId: string } }>(
    '/api/v1/projects/:projectId/termin/:terminId/pay',
    { preHandler: [authenticate, requirePermission('finance:termin:pay')] },
    async (request, reply) => {
      const { projectId, terminId } = request.params
      // T4g: handler ini memverifikasi termin.project_id === projectId, TAPI
      // tak pernah memverifikasi projectId milik tenant. Tanpa gerbang ini,
      // tenant A mencatat pembayaran termin tenant B, membuat invoice di
      // proyek B, dan mengupload bukti transfer ke folder storage B.
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const currentUser = request.currentUser!

      // Parse multipart
      const fields: Record<string, string> = {}
      let proofFile: { data: Buffer; mimetype: string; filename: string } | null = null

      try {
        const parts = request.parts()
        for await (const part of parts) {
          if (part.type === 'file') {
            if (part.fieldname === 'proof') {
              const chunks: Buffer[] = []
              for await (const chunk of part.file) {
                chunks.push(chunk)
              }
              proofFile = {
                data: Buffer.concat(chunks),
                mimetype: part.mimetype,
                filename: part.filename,
              }
            }
          } else {
            fields[part.fieldname] = part.value as string
          }
        }
      } catch {
        return reply.status(400).send({ error: 'Gagal parse request body' })
      }

      const { paid_at, amount_paid, payment_method, ref_number, bank_name, notes, cash_account_id } = fields

      if (!paid_at || !amount_paid) {
        return reply.status(400).send({ error: 'Field wajib: paid_at, amount_paid' })
      }
      const amountNum = parseFloat(amount_paid)
      if (isNaN(amountNum) || amountNum <= 0) {
        return reply.status(400).send({ error: 'amount_paid harus angka positif' })
      }

      // Validasi cash account jika disertakan
      if (cash_account_id) {
        const { data: acct } = await request.db!
          .from('cash_accounts')
          .select('id, is_active')
          .eq('id', cash_account_id)
          .single()
        if (!acct || !acct.is_active) {
          return reply.status(400).send({ error: 'Akun kas tidak valid atau tidak aktif' })
        }
      }

      // ── 1. Validasi termin ──────────────────────────────────────────────────
      const { data: termin, error: terminErr } = await request.db!
        .viaProject('termin_schedules', projectId)
        .select('id, project_id, termin_number, label, pct_of_contract, amount, status')
        .eq('id', terminId)
        .eq('project_id', projectId)
        .single()

      if (terminErr || !termin) {
        return reply.status(404).send({ error: 'Termin tidak ditemukan' })
      }
      if (termin.status === 'paid') {
        return reply.status(409).send({ error: 'Termin ini sudah ditandai terbayar' })
      }

      // Ambil project untuk invoice generation
      const { data: project } = await request.db!
        .from('projects')
        .select('id, name, contract_value, tax_scheme, clients(id)')
        .eq('id', projectId)
        .single()

      if (!project) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // ── 2. Upload bukti transfer jika ada ───────────────────────────────────
      let proofUrl: string | null = null

      if (proofFile && proofFile.data.length > 0) {
        // Max 5MB
        if (proofFile.data.length > 5 * 1024 * 1024) {
          return reply.status(400).send({ error: 'File bukti terlalu besar (max 5MB)' })
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        if (!allowedTypes.includes(proofFile.mimetype)) {
          return reply.status(400).send({ error: 'Format file tidak didukung. Gunakan JPG, PNG, atau PDF.' })
        }

        const ext = proofFile.mimetype === 'application/pdf' ? 'pdf'
          : proofFile.mimetype === 'image/png' ? 'png'
          : proofFile.mimetype === 'image/webp' ? 'webp'
          : 'jpg'
        // ⚠️ Segmen tenant WAJIB di depan (F2-5). Sebelumnya path dimulai dari
        // `projectId`, dan bucket `payment-proofs` justru yang paling sensitif
        // — ia memuat bukti transfer beserta nominal dan nama rekening.
        //
        // Terlewat saat F2-5 pertama dikerjakan; ditemukan oleh test yang
        // memindai SUMBER, bukan oleh daftar rute yang saya tulis tangan.
        // Itu sebabnya pemindaian dipilih: daftar manual tertinggal, kode tidak.
        const path =
          `${request.companyId}/${projectId}/termin-${terminId}-${Date.now()}.${ext}`

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('payment-proofs')
          .upload(path, proofFile.data, {
            contentType: proofFile.mimetype,
            upsert: false,
          })

        if (uploadErr) {
          app.log.error({ uploadErr }, 'Failed to upload payment proof')
          return reply.status(500).send({ error: 'Gagal upload bukti transfer: ' + uploadErr.message })
        }

        // Bucket privat (migration 097): signed URL, bukan public URL (pola documents.ts).
        const { data: signed } = await supabase.storage
          .from('payment-proofs')
          .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365 * 10)
        proofUrl = signed?.signedUrl ?? null
      }

      // ── 3. Cek / buat invoice ───────────────────────────────────────────────
      //
      // Logikanya TIDAK lagi tinggal di sini. Ia diangkat ke
      // `lib/invoice-termin.ts` karena automation 5.1 menerbitkan invoice
      // lewat jalur KEDUA (termin memenuhi syarat tagih, tanpa menunggu
      // pembayaran). Dua tempat yang menomori invoice dengan cara berbeda
      // pasti berselisih — dan selisihnya baru terlihat saat dua nomor
      // bertabrakan, di dokumen yang sudah terkirim ke pelanggan.
      //
      // Yang dipertahankan utuh saat pindah: nomor dari counter
      // transaksional (bukan COUNT(*)+1), prefix dari `companies.
      // invoice_prefix` (bukan "PRL" yang dipaku), dan tarif pajak
      // EFFECTIVE pada tanggal dokumen. Ketiganya cacat yang sudah pernah
      // diperbaiki; memindahkan kode adalah cara termudah menghidupkannya
      // kembali.
      //
      // ANCHOR DATE pajak tetap `paid_at` — sama persis dengan sebelumnya.
      const hasilInvoice = await terbitkanInvoiceTermin(
        request,
        { id: terminId, amount: Number(termin.amount), project_id: projectId },
        { id: projectId, tax_scheme: project.tax_scheme },
        String(paid_at).slice(0, 10),
        currentUser.id,
      )

      if (!hasilInvoice.ok) {
        app.log.error(
          { alasan: hasilInvoice.alasan, pesan: hasilInvoice.pesan, terminId },
          'gagal menerbitkan invoice termin',
        )
        return reply.status(500).send({ error: 'Gagal membuat invoice: ' + hasilInvoice.pesan })
      }

      const invoiceId = hasilInvoice.invoiceId
      // ── 4. Insert payment. Saldo `cash_accounts` ditambah oleh trigger DB
      // `trg_update_cash_balance_on_payment` (migrasi 019, dipasang ulang di 162 —
      // fungsinya ada tapi trigger-nya hilang, sehingga Rp 627 juta pembayaran tak
      // pernah masuk saldo). Dijaga `__tests__/alur-uang-pembayaran.test.ts`.
      // `payments` mewarisi tenancy lewat `invoice_id`, bukan `project_id`
      // (`tenant-map.generated.ts`). Argumen kedua `viaProject` HARUS id
      // invoice — mengoper `projectId` menyusun `.eq('invoice_id', <uuid
      // proyek>)`, perbandingan dua jenis id yang berbeda.
      //
      // Di `.insert()` saringan itu diabaikan, jadi pembayaran tetap tersimpan
      // dan tak ada yang rusak hari ini. Yang diperbaiki adalah POLANYA:
      // siapa pun yang menyalin baris ini ke `.select()` mendapat nol baris
      // tanpa satu pun error. Itu sudah terjadi dua kali (`rap.ts`
      // 2026-07-30; `cost-control.ts` 2026-08-08 — Rp 243 juta upah hilang
      // dari laporan), dan `audit-viaproject-argumen.mjs` kini menjaganya.
      const { data: payment, error: payErr } = await request.db!
        .viaProject('payments', invoiceId)
        .insert({
          invoice_id: invoiceId,
          amount_paid: amountNum,
          payment_method: (payment_method as string) || 'transfer_bank',
          paid_at,
          ref_number: ref_number || null,
          bank_name: bank_name || null,
          notes: notes || null,
          proof_url: proofUrl,
          cash_account_id: cash_account_id || null,
          recorded_by: currentUser.id,
        })
        .select('id')
        .single()

      if (payErr || !payment) {
        app.log.error({ payErr }, 'Failed to insert payment')
        return reply.status(500).send({ error: 'Gagal menyimpan pembayaran: ' + (payErr?.message ?? 'unknown') })
      }

      // ── 5. Update invoice ───────────────────────────────────────────────────
      const { data: inv } = await request.db!
        .viaProject('invoices', projectId)
        .select('id, project_id, total_amount, amount_paid, due_date, penalty_waived')
        .eq('id', invoiceId)
        .single()

      if (inv) {
        const newAmountPaid = parseFloat((Number(inv.amount_paid) + amountNum).toFixed(2))
        const newAmountDue = parseFloat((Number(inv.total_amount) - newAmountPaid).toFixed(2))
        const newStatus = newAmountDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'sent'

        // Hasil diperiksa: pembayaran SUDAH tercatat di baris sebelumnya.
        // Kalau sinkronisasi invoice gagal diam-diam, uangnya masuk tapi
        // invoice tetap tampak belum lunas — klien ditagih dua kali, dan
        // laporan piutang menampilkan angka yang sudah dibayar.
        //
        // ── KLAIM ATOMIK: `amount_paid` LAMA ikut di WHERE (TJS-A0, 2026-08-09)
        //
        // `newAmountPaid` dihitung dari `inv.amount_paid` yang dibaca sepuluh
        // baris di atas. Dua pembayaran termin yang tiba bersamaan sama-sama
        // membaca nilai lama, dan yang kedua MENIMPA yang pertama — satu
        // pembayaran hilang dari invoice meski barisnya tetap ada di
        // `termin_payments`. Compare-and-set menutupnya.
        const { data: invUpd, error: errInv } = await request.db!
          .viaProject('invoices', projectId)
          .update({
            amount_paid: newAmountPaid,
            amount_due: Math.max(0, newAmountDue),
            status: newStatus,
            paid_date: newStatus === 'paid' ? paid_at : null,
          })
          .eq('id', invoiceId)
          .eq('amount_paid', inv.amount_paid)
          .select('id')
          .maybeSingle()
        if (errInv) {
          return reply.status(500).send({
            error: `Pembayaran tercatat, tapi invoice gagal diperbarui: ${errInv.message}. ` +
                   `Periksa manual agar tagihan tidak terkirim ulang.`,
          })
        }
        if (!invUpd) {
          request.log.warn(
            { invoiceId, amountPaidDibaca: inv.amount_paid },
            'pembayaran termin serentak: amount_paid bergeser sejak dibaca',
          )
          return reply.status(409).send({
            error:
              'Pembayaran tercatat, tetapi invoice ini baru saja dibayar dari tempat lain. ' +
              'Muat ulang halaman untuk melihat angka terbaru.',
          })
        }

        // Denda otoritatif saat invoice lunas telat (default OFF → no-op). Fire-and-forget.
        if (newStatus === 'paid') {
          void (async () => {
            try {
              const { data: proj } = await request.db!.from('projects')
                .select('id, contract_value, penalty_enabled, penalty_basis, penalty_rate_per_day, penalty_cap_pct, penalty_grace_days')
                .eq('id', inv.project_id).maybeSingle()
              await computeAndPersistPenalty({
                invoice: { id: inv.id, project_id: inv.project_id, total_amount: inv.total_amount, due_date: inv.due_date, penalty_waived: inv.penalty_waived },
                project: proj, paidDate: paid_at, createdBy: currentUser.id,
              })
            } catch (err) {
              // best-effort: notifikasi tak boleh membatalkan tindakan yang sudah sah.
              // Tapi TIDAK ditelan — rantai notifikasi pernah putus berbulan-bulan
              // tanpa satu pun gejala (Web Push, 2026-08-01), dan `catch {}` adalah
              // persis tempat gejala itu seharusnya muncul.
              request.log.error({ err }, 'notifikasi gagal dikirim')
            }
          })()
        }
      }

      // ── 6. Update termin status → paid ──────────────────────────────────────
      await request.db!
        .viaProject('termin_schedules', projectId)
        .update({ status: 'paid' })
        .eq('id', terminId)

      return reply.send({
        success: true,
        payment_id: payment.id,
        invoice_id: invoiceId,
        proof_url: proofUrl,
        message: `Termin "${termin.label}" berhasil ditandai terbayar`,
      })
    }
  )

  // ── GET: Detail payment termin ───────────────────────────────────────────────
  app.get<{ Params: { projectId: string; terminId: string } }>(
    '/api/v1/projects/:projectId/termin/:terminId/payment',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId, terminId } = request.params
      // T4g: handler ini memverifikasi termin.project_id === projectId, TAPI
      // tak pernah memverifikasi projectId milik tenant. Tanpa gerbang ini,
      // tenant A mencatat pembayaran termin tenant B, membuat invoice di
      // proyek B, dan mengupload bukti transfer ke folder storage B.
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: termin } = await request.db!
        .viaProject('termin_schedules', projectId)
        .select('id, project_id, label, amount, status')
        .eq('id', terminId)
        .eq('project_id', projectId)
        .single()

      if (!termin) return reply.status(404).send({ error: 'Termin tidak ditemukan' })

      const { data: invoice } = await request.db!
        .viaProject('invoices', projectId)
        .select(`
          id, invoice_number, total_amount, amount_paid, amount_due,
          issued_date, due_date, paid_date, status,
          payments ( id, amount_paid, payment_method, paid_at, ref_number, bank_name, notes, proof_url, recorded_by )
        `)
        .eq('termin_schedule_id', terminId)
        .maybeSingle()

      return reply.send({ termin, invoice })
    }
  )
}
