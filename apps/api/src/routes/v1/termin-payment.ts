import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { calculateTax } from '../../lib/tax-calculation.js'

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
      const currentUser = request.currentUser!

      // Parse multipart
      let fields: Record<string, string> = {}
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
        const { data: acct } = await supabase
          .from('cash_accounts')
          .select('id, is_active')
          .eq('id', cash_account_id)
          .single()
        if (!acct || !acct.is_active) {
          return reply.status(400).send({ error: 'Akun kas tidak valid atau tidak aktif' })
        }
      }

      // ── 1. Validasi termin ──────────────────────────────────────────────────
      const { data: termin, error: terminErr } = await supabase
        .from('termin_schedules')
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
      const { data: project } = await supabase
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
        const path = `${projectId}/termin-${terminId}-${Date.now()}.${ext}`

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

        const { data: { publicUrl } } = supabase.storage
          .from('payment-proofs')
          .getPublicUrl(uploadData.path)
        proofUrl = publicUrl
      }

      // ── 3. Cek / buat invoice ───────────────────────────────────────────────
      let invoiceId: string

      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id, total_amount, amount_paid, amount_due, status')
        .eq('termin_schedule_id', terminId)
        .maybeSingle()

      if (existingInvoice) {
        invoiceId = existingInvoice.id
      } else {
        // Generate invoice number: INV/PRL/YYYY/NNN
        const year = new Date().getFullYear()
        const { count } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })

        const seq = String((count ?? 0) + 1).padStart(3, '0')
        const invoiceNumber = `INV/PRL/${year}/${seq}`

        // Hitung pajak — logic diekstrak ke lib/tax-calculation.ts (Task 1.2.1, testable tanpa HTTP/DB)
        const { baseAmount, taxAmount, totalAmount } = calculateTax(Number(termin.amount), project.tax_scheme)

        const dueDate = new Date(paid_at)
        dueDate.setDate(dueDate.getDate() + 14)

        const { data: newInvoice, error: invoiceErr } = await supabase
          .from('invoices')
          .insert({
            project_id: projectId,
            termin_schedule_id: terminId,
            invoice_number: invoiceNumber,
            invoice_type: 'termin_billing',
            base_amount: baseAmount,
            commission_amount: 0,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            amount_paid: 0,
            amount_due: totalAmount,
            issued_date: paid_at,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'sent',
            created_by: currentUser.id,
          })
          .select('id, total_amount, amount_paid, amount_due')
          .single()

        if (invoiceErr || !newInvoice) {
          app.log.error({ invoiceErr }, 'Failed to create invoice')
          return reply.status(500).send({ error: 'Gagal membuat invoice: ' + (invoiceErr?.message ?? 'unknown') })
        }
        invoiceId = newInvoice.id
      }

      // ── 4. Insert payment (trigger akan update saldo kas otomatis) ──────────
      const { data: payment, error: payErr } = await supabase
        .from('payments')
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
      const { data: inv } = await supabase
        .from('invoices')
        .select('total_amount, amount_paid')
        .eq('id', invoiceId)
        .single()

      if (inv) {
        const newAmountPaid = parseFloat((Number(inv.amount_paid) + amountNum).toFixed(2))
        const newAmountDue = parseFloat((Number(inv.total_amount) - newAmountPaid).toFixed(2))
        const newStatus = newAmountDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'sent'

        await supabase
          .from('invoices')
          .update({
            amount_paid: newAmountPaid,
            amount_due: Math.max(0, newAmountDue),
            status: newStatus,
            paid_date: newStatus === 'paid' ? paid_at : null,
          })
          .eq('id', invoiceId)
      }

      // ── 6. Update termin status → paid ──────────────────────────────────────
      await supabase
        .from('termin_schedules')
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

      const { data: termin } = await supabase
        .from('termin_schedules')
        .select('id, project_id, label, amount, status')
        .eq('id', terminId)
        .eq('project_id', projectId)
        .single()

      if (!termin) return reply.status(404).send({ error: 'Termin tidak ditemukan' })

      const { data: invoice } = await supabase
        .from('invoices')
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
