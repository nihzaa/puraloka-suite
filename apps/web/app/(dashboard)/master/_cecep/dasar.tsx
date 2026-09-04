"use client";

/**
 * DASAR BERSAMA — layar master CECEP (Katalog AHSP & Price Book).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DISALIN, BUKAN DITULIS ULANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Isi berkas ini dan dua halaman yang memakainya dipindahkan APA ADANYA dari
 * `(dashboard)/estimasi/page.tsx` (berkas 4.070 baris yang sedang dibongkar).
 *
 * Godaan saat memecah berkas besar adalah "sekalian dirapikan". Untuk dua
 * layar ini itu keliru: keduanya sudah matang dan memuat perilaku yang lahir
 * dari cacat nyata — daftar 3.043 analisa yang DIVIRTUALISASI, pencarian
 * in-memory tanpa bolak-balik server, katalog yang sengaja TIDAK menyaring
 * otomatis (dulu 423 analisa perusahaan tak terlihat sejak awal karena edisi
 * terpilih sendiri), dan HSP hidup per analisa.
 *
 * Mengetik ulang semua itu = mengundang regresi pada satu-satunya bagian
 * modul yang TIDAK rusak. Diukur 2026-08-16: tab Harga adalah satu-satunya
 * dari enam tab yang merender tabel berisi (3.212 harga).
 *
 * Yang BERUBAH hanyalah alamatnya:
 *     /estimasi?tab=katalog  →  /master/ahsp
 *     /estimasi?tab=harga    →  /master/harga
 *
 * Keduanya master data lintas proyek (`peta-menu.ts` sudah menggolongkannya
 * `md-*`), jadi rumahnya memang Master Data — bukan di tengah alur "susun
 * RAB" satu proyek.
 */

import { createPortal } from "react-dom";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";
import {
  formatRupiah, formatAngka, formatKuantitas, formatTanggalJam,
} from "@/lib/format";
import {
  X,
} from "lucide-react";

export const fmtRp = formatRupiah;
export { formatAngka, formatKuantitas, formatTanggalJam };

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useTutupEsc(onClose);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "88vh", overflow: "auto", boxShadow: "var(--naik-3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{title}</h3>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: "var(--pad-kartu-lega)" }}>{children}</div>
      </div>
    </div>, document.body);
}
export const label = (t: string) => <label style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, margin: "10px 0 4px" }}>{t}</label>;
export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    draft: [C.mid, C.bg], under_review: [C.yellow, C.yellowBg], approved: [C.green, C.greenBg],
    frozen: [C.navy, C.bg], superseded: [C.muted, C.bg],
    verified: [C.yellow, C.yellowBg], active: [C.green, C.greenBg], expired: [C.muted, C.bg],
    locked: [C.navy, C.bg],
  };
  const [fg, bg] = map[s] ?? [C.mid, C.bg];
  return <span style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: fg, background: bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>{s}</span>;
}
export const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--grad-aksen)", color: C.onNavy, border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
export const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };

// ── Types (bentuk respons API CECEP) ──────────────────────────────────────────
export interface Project { id: string; name: string }
export interface Edition {
  id: string; code: string; name: string; publish_date: string | null;
  source_sha256: string | null; is_active: boolean;
  /** Jumlah analisa AKTIF di edisi ini. 0 = terdaftar tapi isinya belum diimpor. */
  jumlah_analisa?: number;
}
interface VersionSummary { id: string; version_number: number; status: string; total_amount: number }
export interface Scenario { id: string; name: string; purpose: string | null; status: string; versions: VersionSummary[] }
export interface CostCodeRingkas { id: string; code: string; name: string; status: string }
interface CostMapBaris {
  category_id: string; category_name: string; type: string | null;
  cost_code: CostCodeRingkas | null;
}
export interface CostMapResponse { data: CostMapBaris[]; belum_dipetakan: number }

/**
 * Usulan pemetaan dari `GET /projects/:id/cost-map/saran`.
 *
 * `skor` 0..1 dibawa ke layar dengan sengaja: pemetaan ini menentukan ke cost
 * code mana biaya jatuh, dan yang menyetujuinya berhak tahu seberapa yakin
 * mesinnya. Usul berskor 0,46 dan 0,93 tak boleh terlihat sama.
 */
interface SaranBaris {
  category_id: string; category_name: string
  cost_code_id: string; cost_code_code: string; cost_code_name: string
  skor: number
}
/**
 * Belanja aktual yang SESUNGGUHNYA — disatukan dari empat tabel.
 *
 * Diukur 2026-08-08: laporan biaya selama ini membaca `project_expenses`
 * yang NOL BARIS, sementara Rp 243 juta upah dan Rp 50 juta faktur supplier
 * tercatat di tabelnya masing-masing. Kartu "Belanja aktual Rp 0" bukan
 * berarti belum ada belanja — ia melihat ke tabel yang salah.
 */
export interface BelanjaAktual {
  total: number;
  komitmen: number;
  exposure: number;
  /** Sudah pasti jadi biaya, belum disetujui. Tak masuk total. */
  menunggu: number;
  per_sumber: { upah: number; faktur: number; belanja: number; po: number };
  jumlah_baris: { upah: number; faktur: number; belanja: number; po: number };
  tak_dikenal: number;
  nilai_cacat: number;
}

export interface SaranResponse {
  saran: SaranBaris[]
  jumlah_kategori: number
  sudah_dipetakan: number
  tanpa_saran: number
}
export interface VariansBaris {
  cost_code_id: string | null; code: string; name: string; status: string;
  pagu: number; commitment: number; actual: number; exposure: number;
  variance: number | null; serapan_pct: number | null; jumlah_kategori: number;
}
export interface VariansResponse {
  data: VariansBaris[];
  meta: {
    total_actual: number; commitment_total: number; exposure_total: number;
    jumlah_po_mengikat: number; kategori_total: number; kategori_dipetakan: number;
    actual_belum_dipetakan: number;
  };
}
export interface CashflowPeriod { period: number; disbursement: number; cumulative: number }
export interface CashflowResponse {
  estimate_version_id: string; status: string;
  baseline_total: number; periods: number; forecast: CashflowPeriod[];
}
export interface AsmComponent { coefficient: number; sort_order: number; resource: { code: string; name: string; category: string; unit_code: string } | null }
export interface Assembly {
  id: string; code: string; name: string; source: string; version_number: number; status: string;
  output_unit_code: string; is_import_baseline: boolean;
  edition: { code: string; name: string } | null; components: AsmComponent[];
}
export interface EstItem {
  id: string; quantity: number; amount: number; notes: string | null;
  cost_code: { code: string; name: string } | null;
  assembly: { id: string; code: string; name: string; output_unit_code: string } | null;
}
export interface VersionDetail {
  id: string; version_number: number; status: string; total_amount: number;
  edition: { code: string; name: string } | null; items: EstItem[];
}
export interface Rollup {
  estimate_version_id: string; at_date: string; ppn_rate: number;
  groups: { name: string; subtotal: number }[];
  totalBiaya: number; ppn: number; grandTotal: number;
}
export interface PriceEntry {
  id: string; amount: number; version_number: number; effective_date: string;
  expired_date: string | null; location: string | null; supplier: string | null;
  confidence_level: string | null; status: string;
  resource: { code: string; name: string; category: string; unit_code: string } | null;
}
export interface RapSummary {
  id: string; name: string; status: string; notes: string | null;
  estimate_version_id: string; locked_at: string | null; created_at: string;
}
export interface RapMaterialLine {
  id: string; qty_ahsp: number; qty_adjusted: number; unit_code: string;
  supplier_price: number; supplier_id: string | null; pagu: number; notes: string | null;
  resource: { code: string; name: string } | null;
}
export interface RapLaborLine {
  id: string; description: string; borongan_value: number; notes: string | null;
  work_scope_id: string | null;
}
export interface RapDetail {
  data: RapSummary;
  material: RapMaterialLine[];
  labor: RapLaborLine[];
  total: { material: number; labor: number; pagu: number };
}
export interface RapChangeLogEntry {
  id: string; line_table: string; line_id: string; field_name: string | null;
  old_value: string | null; new_value: string | null; reason: string; changed_at: string;
}

// ── Gaya tabel & isian bersama ───────────────────────────────────────────────
//
// Dipindahkan ke sini dari berkas lama. SATU perubahan yang disengaja: padding
// yang dulu dipaku ("8px 8px", "6px 8px") diganti token `--pad-baris`.
// Penjaga `uji-tabel-seragam.mjs` memakai ratchet atas jumlah sel ber-padding
// dipaku; menyalin angka lama ke berkas baru akan MENAIKKAN angka itu, dan
// ratchet-nya menolak kenaikan. Nilai tokennya (9px 12px) sengaja sedikit
// lebih lega — itu memang arah `ARAH-VISUAL` §4.

export const th: React.CSSProperties = {
  textAlign: "left", padding: "var(--pad-baris)", fontSize: "var(--t-kecil)", fontWeight: 700,
  color: C.muted, textTransform: "uppercase", letterSpacing: .4,
  borderBottom: `1px solid ${C.border}`,
};
export const td: React.CSSProperties = {
  padding: "var(--pad-baris)", fontSize: 13, color: C.text,
  borderBottom: `1px solid ${C.border}`, verticalAlign: "top",
};
export const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 5,
};
export const tfLabel: React.CSSProperties = {
  padding: "var(--pad-baris)", fontSize: 12, color: C.mid, textAlign: "right",
};
export const tfAngka: React.CSSProperties = {
  padding: "var(--pad-baris)", fontSize: 12, color: C.text, textAlign: "right",
  fontFamily: "monospace",
};

// ── Kerangka kecil bersama ────────────────────────────────────────────────────
