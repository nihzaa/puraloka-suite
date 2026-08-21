"use client";

// ============================================================================
// Detail Jurnal — General Ledger, Task 34 Step 3.
//
// Kepala + baris (debit/kredit per akun) + tombol "Posting Jurnal" (draft
// only, `gl:post`) dan "Batalkan Jurnal" (posted only, `gl:void`, alasan
// WAJIB).
//
// ── Atomisitas transisi status — diverifikasi ke `gl.ts`, bukan diasumsikan
//
// `PATCH .../post` (`gl.ts:254-285`) ATOMIK: `.eq('id', id).eq('status',
// 'draft')` di WHERE yang sama — dua klik "Posting" bersamaan (double-tap,
// atau dua tab) tak bisa keduanya sukses; yang kedua memulangkan `data: null`
// → 404 "statusnya bukan draft", bukan diam-diam berhasil dua kali. Trigger
// `fn_gl_wajib_seimbang` (migrasi 168) menolak lebih dulu kalau debit≠kredit.
//
// `PATCH .../void` (`gl.ts:287-321`) TIDAK menyertakan status lama di WHERE
// (hanya `.eq('id', id)`) — beda dari `post`. Ini DICATAT sebagai concern di
// task-34-report.md, BUKAN ditambal di sini: brief eksplisit melarang
// menyentuh backend GL di luar Task 34, dan trigger `fn_gl_posted_immutable`
// (migrasi 168) tetap mencegah field lain berubah pada baris posted — yang
// bisa terjadi hanya `notes` tertimpa dua kali kalau dua pembatalan
// bersamaan (append pesan alasan yang sama duakali), bukan kerusakan
// finansial (tak ada uang berpindah, tak ada saldo yang berubah dua kali).
// Tombol di halaman ini juga `disabled` selama `mengirim` dan hanya
// dirender untuk status "posted", jadi jalur UI normal tak memicunya.
//
// State galat AKSI (`galatAksi`) TERPISAH dari galat MUAT (`galat` dari
// `useData`) — pelajaran Task 31.
// ============================================================================

import { useState } from "react";
import { useParams } from "next/navigation";
import { BookOpen, Send, Ban } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespJurnalDetail, GalatApi } from "../../../../_bersama/tipe";
import { pesanGalat } from "../../../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
const LABEL_STATUS: Record<string, string> = { draft: "Draf", posted: "Terposting", void: "Dibatalkan" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "pending", posted: "approved", void: "rejected" };

export default function PmDetailJurnalPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [sheetVoid, setSheetVoid] = useState(false);
  const [alasanVoid, setAlasanVoid] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const url = id ? `/api/v1/gl/journal-entries/${id}` : null;
  const { data, memuat, galat } = useData<RespJurnalDetail>(url);

  async function posting() {
    setMengirim(true);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/gl/journal-entries/${id}/post`, {});
      if (url) invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal memposting jurnal"));
    } finally {
      setMengirim(false);
    }
  }

  async function batalkan() {
    if (!alasanVoid.trim()) {
      setGalatAksi("Alasan pembatalan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/gl/journal-entries/${id}/void`, { alasan: alasanVoid.trim() });
      setSheetVoid(false);
      setAlasanVoid("");
      if (url) invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal membatalkan jurnal"));
    } finally {
      setMengirim(false);
    }
  }

  if (memuat) return <SkeletonCard tinggi={220} />;
  if (galat || !data) {
    return (
      <EmptyState icon={BookOpen} judul="Gagal memuat"
        deskripsi={pesanGalat(galat as GalatApi, "Jurnal tidak ditemukan atau Anda tidak punya akses.")} />
    );
  }

  const j = data.data;
  const totalDebit = j.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalKredit = j.lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{j.entry_number}</h1>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {fmtTanggal(j.entry_date)}{j.source ? ` · ${j.source}` : ""}
          </div>
        </div>
        <StatusBadge status={VARIAN_STATUS[j.status] ?? "netral"} label={LABEL_STATUS[j.status] ?? j.status} />
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{j.description}</div>
        {j.notes && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, whiteSpace: "pre-wrap" }}>{j.notes}</div>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 420, fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only">Baris jurnal {j.entry_number}: akun, debit, dan kredit per baris.</caption>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th scope="col" style={{ textAlign: "left", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Akun</th>
              <th scope="col" style={{ textAlign: "right", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Debit</th>
              <th scope="col" style={{ textAlign: "right", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Kredit</th>
            </tr>
          </thead>
          <tbody>
            {j.lines.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                {/* `l.accounts` NULLABLE — `gl.ts:157` tak menormalisasi embed
                    yang gagal resolve (`?? {}`), beda dari endpoint sibling
                    `/gl/ledger`/`/gl/trial-balance`. Akses WAJIB pakai `?.`,
                    bukan langsung — akses tanpa guard TypeError runtime. */}
                <th scope="row" style={{ padding: "var(--pad-baris)", textAlign: "left", fontWeight: 400 }}>
                  {l.accounts?.code ?? "—"} · {l.accounts?.name ?? "Akun tak dikenal"}
                </th>
                <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
                  {Number(l.debit) > 0 ? fmtRupiah(l.debit) : "—"}
                </td>
                <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
                  {Number(l.credit) > 0 ? fmtRupiah(l.credit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ padding: "var(--pad-baris)" }}>Total</td>
              <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(totalDebit)}</td>
              <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(totalKredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}

      {j.status === "draft" && (
        <button type="button" onClick={() => void posting()} disabled={mengirim}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48,
            borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
            background: mengirim ? "var(--surface-subtle)" : "var(--success)",
            color: mengirim ? "var(--text-muted)" : "var(--on-success-bg)",
            cursor: mengirim ? "default" : "pointer",
          }}>
          <Send size={16} aria-hidden="true" /> {mengirim ? "Memposting…" : "Posting Jurnal"}
        </button>
      )}
      {j.status === "posted" && (
        <button type="button" onClick={() => { setGalatAksi(null); setSheetVoid(true); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48,
            borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700,
            border: "1px solid var(--danger-border)", background: "var(--surface)", color: "var(--danger)",
            cursor: "pointer",
          }}>
          <Ban size={16} aria-hidden="true" /> Batalkan Jurnal
        </button>
      )}

      <BottomSheet terbuka={sheetVoid} onTutup={() => setSheetVoid(false)} judul="Batalkan Jurnal">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan Pembatalan *</span>
            <textarea value={alasanVoid} onChange={(e) => setAlasanVoid(e.target.value)} rows={3}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }} />
          </label>
          {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}
          <button type="button" onClick={() => void batalkan()} disabled={mengirim || !alasanVoid.trim()}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
              background: mengirim || !alasanVoid.trim() ? "var(--surface-subtle)" : "var(--danger)",
              color: mengirim || !alasanVoid.trim() ? "var(--text-muted)" : "var(--on-danger-bg)",
              cursor: mengirim || !alasanVoid.trim() ? "default" : "pointer",
            }}>
            {mengirim ? "Membatalkan…" : "Batalkan Jurnal"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
