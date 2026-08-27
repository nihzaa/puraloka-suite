"use client";

// ============================================================================
// Detail Jurnal — General Ledger. Portal Admin/Direktur (Task 15, Tahap 3).
// Salinan APA ADANYA dari `pm-portal/keuangan/gl/jurnal/[id]/page.tsx` (Task
// 34 PM) — kepala + baris (debit/kredit per akun).
//
// ── GERBANG DITAMBAHKAN di sini — sumber PM tidak punya gerbang
//
// Tombol "Posting Jurnal" (draft only) digerbang `gl:post`, tombol "Batalkan
// Jurnal" (posted only) digerbang `gl:void`. Live query Task 13 (2026-08-22):
// direktur TIDAK punya `gl:post` maupun `gl:void` sama sekali (hanya
// `gl:view`/`gl:periode:*`). TIDAK DIRENDER (bukan `disabled`) saat direktur
// tak punya izin, pola PERSIS `bolehApprove` Task 10 Change Order — JANGAN
// "perbaiki" jadi selalu tampil dengan asumsi "direktur biasanya subset
// admin". Direktur yang membuka jurnal draft/posted TETAP bisa melihat
// SELURUH detail (kepala, baris, total debit/kredit) — hanya dua tombol aksi
// yang hilang total.
//
// ── Atomisitas transisi status — diverifikasi ke `gl.ts`, bukan diasumsikan
//
// `PATCH .../post` (`gl.ts:254-285`) ATOMIK: `.eq('id', id).eq('status',
// 'draft')` di WHERE yang sama — dua klik "Posting" bersamaan (double-tap,
// atau dua tab) tak bisa keduanya sukses; yang kedua memulangkan `data: null`
// → 404 "statusnya bukan draft", bukan diam-diam berhasil dua kali. Trigger
// `fn_gl_wajib_seimbang` (migrasi 168) menolak lebih dulu kalau debit≠kredit.
//
// ⚠️ `PATCH .../void` (`gl.ts:287-321`) TIDAK menyertakan status lama di
// WHERE (hanya `.eq('id', id)`) — beda dari `post`. INI BUG BACKEND YANG
// SUDAH DIKETAHUI (dicatat Task 34 PM, diwarisi Task 15 ini) — JANGAN
// DIPERBAIKI di sini: brief Task 15 eksplisit melarang menyentuh backend GL.
// Trigger `fn_gl_posted_immutable` (migrasi 168) tetap mencegah field lain
// berubah pada baris posted — yang bisa terjadi hanya `notes` tertimpa dua
// kali kalau dua pembatalan bersamaan (append pesan alasan yang sama dua
// kali), bukan kerusakan finansial (tak ada uang berpindah, tak ada saldo
// yang berubah dua kali). Tombol di halaman ini juga `disabled` selama
// `mengirim`, hanya dirender untuk status "posted", DAN sekarang juga
// digerbang `gl:void` — direktur (yang tak punya izin ini) tak pernah
// melihat tombolnya sama sekali, apalagi memicu race-nya.
//
// State galat AKSI (`galatAksi`) TERPISAH dari galat MUAT (`galat` dari
// `useData`) — pelajaran Task 31 PM.
//
// Satu-satunya beda TEKSTUAL dari sumber PM di luar gerbang: `padding: 16`
// (kartu deskripsi jurnal) diganti `padding: "var(--pad-kartu-lega)"` — NILAI
// SAMA (16px), murni literal→token supaya tak menambah pelanggaran
// `kerapatan-ratchet.mjs`. Tak ada perubahan visual maupun logic.
// ============================================================================

import { useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { BookOpen, Send, Ban } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespJurnalDetail, GalatApi } from "../../../../_bersama/tipe";
import { pesanGalat } from "../../../../_bersama/tipe";

// `langganan`: pola PERSIS Task 10 — perubahan permission (login/switch
// company) tercermin tanpa reload.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const LABEL_STATUS: Record<string, string> = { draft: "Draf", posted: "Terposting", void: "Dibatalkan" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "pending", posted: "approved", void: "rejected" };

export default function AdminDetailJurnalPage() {
  // `gl:post`/`gl:void` HANYA admin (live 2026-08-22) — direktur NOL untuk
  // keduanya. TIDAK DIRENDER (bukan disabled) saat tak ada, pola sama
  // `bolehApprove` Task 10 — JANGAN "perbaiki" jadi selalu tampil dengan
  // asumsi "direktur biasanya subset admin".
  const bolehPost = useSyncExternalStore(langganan, () => hasPermission("gl:post"), () => false);
  const bolehVoid = useSyncExternalStore(langganan, () => hasPermission("gl:void"), () => false);

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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>{j.entry_number}</h1>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {formatTanggal(j.entry_date)}{j.source ? ` · ${j.source}` : ""}
          </div>
        </div>
        <StatusBadge status={VARIAN_STATUS[j.status] ?? "netral"} label={LABEL_STATUS[j.status] ?? j.status} />
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
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
                  {Number(l.debit) > 0 ? formatRupiah(l.debit) : "—"}
                </td>
                <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
                  {Number(l.credit) > 0 ? formatRupiah(l.credit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ padding: "var(--pad-baris)" }}>Total</td>
              <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(totalDebit)}</td>
              <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(totalKredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}

      {j.status === "draft" && bolehPost && (
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
      {j.status === "posted" && bolehVoid && (
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

      {bolehVoid && (
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
      )}
    </div>
  );
}
