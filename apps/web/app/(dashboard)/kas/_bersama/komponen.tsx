"use client";

/**
 * KAS — komponen tampilan bersama.
 *
 * Dipindah UTUH dari `kas/page.tsx` saat modul dipecah. Baris akun, transfer,
 * dan pengeluaran dipakai lebih dari satu halaman (dashboard menampilkan
 * cuplikannya, halaman bagian menampilkan daftar penuhnya), jadi menyalinnya
 * berarti dua tampilan yang perlahan berbeda untuk data yang sama.
 */

import { ArrowRightLeft, FileText } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { keadaanSaldo, labelSaldo } from "@/lib/keadaan-saldo";
import {
  type CashAccount, type CashTransfer, type Expense,
  ACCOUNT_TYPE_LABEL, TRANSFER_STATUS, EXPENSE_STATUS,
  CATEGORY_TYPE_ICON, SOURCE_LABEL,
  fmt, fmtCompact, fmtDate,
} from "./tipe";

export function StatusBadge({ label, color, bg, border }: {
  label: string; color: string; bg: string; border?: string;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: "var(--t-kecil)", fontWeight: 600,
      color, background: bg, border: `1px solid ${border ?? bg}`, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: string | number }) {
  return <div style={{
    height: h, width: w, borderRadius: 6,
    background: "linear-gradient(90deg,var(--surface-hover) 0%,var(--border) 50%,var(--surface-hover) 100%)",
    backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite",
  }} />;
}

/** Deret rangka pemuatan — tinggi sama dengan baris sungguhan. */
export function RangkaBaris({ jumlah = 3, tinggi = 18 }: { jumlah?: number; tinggi?: number }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: jumlah }, (_, i) => (
        <div key={i} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}` }}>
          <Skeleton h={tinggi} />
        </div>
      ))}
    </div>
  );
}

// ─── Kartu akun kas ───────────────────────────────────────────────────────────

export function AccountCard({ acc, onClick }: { acc: CashAccount; onClick: () => void }) {
  const meta = ACCOUNT_TYPE_LABEL[acc.type];
  // Aturannya di `lib/keadaan-saldo.ts` — bukan di sini. Versi sebaris
  // sebelumnya punya cabang mati yang membuat saldo −Rp 213.695.000 tampil
  // kuning "Saldo rendah"; detail lengkapnya di berkas itu, beserta test yang
  // mengunci perilakunya.
  const keadaan = keadaanSaldo(acc.balance, acc.type);
  const minus = keadaan === "minus";
  const low = keadaan === "tipis";
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", background: "var(--surface)",
      border: `1px solid ${minus ? C.redBorder : low ? C.yellowBorder : C.border}`,
      borderRadius: 10, padding: "16px 16px", cursor: "pointer",
      transition: "all 0.15s", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "var(--naik-1)",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--naik-2)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--naik-1)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: meta.bg,
        border: `1px solid ${meta.border}`, display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, color: meta.color,
      }}>
        {meta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{acc.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "var(--t-mikro)", fontWeight: 600, color: meta.color, background: meta.bg, padding: "0px 6px", borderRadius: 6 }}>{meta.label}</span>
          {acc.owner && <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>{acc.owner.name}</span>}
          {acc.projects && <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>· {acc.projects.name}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 17, fontWeight: 800, color: minus ? C.red : low ? C.yellow : C.text,
          fontFamily: "var(--font-display)",
        }}>
          {fmtCompact(acc.balance)}
        </div>
        {/* Teks DAN warna — WCAG 1.4.1. Kas kecil sering dibaca di HP di bawah
            matahari, tempat beda kuning/merah praktis hilang. */}
        {labelSaldo(keadaan) && (
          <div style={{
            fontSize: "var(--t-mikro)", color: minus ? C.red : C.yellow,
            fontWeight: minus ? 700 : 600,
          }}>{labelSaldo(keadaan)}</div>
        )}
      </div>
    </button>
  );
}

// ─── Baris transfer ───────────────────────────────────────────────────────────

export function TransferRow({ t, canConfirm, onConfirm, onCancel }: {
  t: CashTransfer; canConfirm: boolean;
  onConfirm: (id: string) => void; onCancel: (id: string) => void;
}) {
  const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.pending;
  return (
    <div style={{
      padding: "12px 16px", borderRadius: 10,
      border: `1px solid ${t.status === "pending" ? C.yellowBorder : C.border}`,
      background: t.status === "pending" ? C.yellowBg : "var(--surface-subtle)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: "var(--surface-hover)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <ArrowRightLeft size={16} color={C.mid} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.from_account?.name ?? "—"}</span>
          <ArrowRightLeft size={11} color={C.muted} />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{t.to_account?.name ?? "—"}</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: "var(--t-kecil)", color: C.muted, flexWrap: "wrap" }}>
          <span>{fmtDate(t.transfer_date)}</span>
          {t.ref_number && <span>Ref: {t.ref_number}</span>}
          {t.creator && <span>oleh {t.creator.name}</span>}
          {t.confirmer && <span>· dikonfirmasi {t.confirmer.name}</span>}
        </div>
        {t.notes && <div style={{ fontSize: "var(--t-kecil)", color: C.mid, marginTop: 2, fontStyle: "italic" }}>{t.notes}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)", marginBottom: 6 }}>
          {fmt(t.amount)}
        </div>
        <StatusBadge label={st.label} color={st.color} bg={st.bg} />
        {canConfirm && t.status === "pending" && (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => onCancel(t.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: "var(--t-kecil)", cursor: "pointer" }}>Batal</button>
            <button onClick={() => onConfirm(t.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: "var(--t-kecil)", fontWeight: 600, cursor: "pointer" }}>Konfirmasi</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Baris pengeluaran ────────────────────────────────────────────────────────

export function ExpenseRow({ e, canReview, onApprove, onReject }: {
  e: Expense; canReview: boolean;
  onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  const st = EXPENSE_STATUS[e.status] ?? EXPENSE_STATUS.submitted;
  return (
    <div style={{
      padding: "12px 16px", borderRadius: 10,
      border: `1px solid ${e.status === "submitted" ? C.yellowBorder : C.border}`,
      background: e.status === "submitted" ? C.yellowBg : "var(--surface-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: "var(--surface-hover)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {CATEGORY_TYPE_ICON[e.category?.type ?? "other"]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.description}</span>
            <StatusBadge label={st.label} color={st.color} bg={st.bg} border={EXPENSE_STATUS[e.status]?.border} />
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: "var(--t-kecil)", color: C.muted, flexWrap: "wrap", marginBottom: 2 }}>
            <span>{e.projects?.name ?? "—"}</span>
            <span>·</span>
            <span>{e.category?.name ?? "—"}</span>
            {e.vendor_name && <><span>·</span><span>{e.vendor_name}</span></>}
            <span>·</span>
            <span>{fmtDate(e.expense_date)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: "var(--t-kecil)", color: C.muted, flexWrap: "wrap" }}>
            <span style={{ background: "var(--surface-hover)", padding: "0px 6px", borderRadius: 6 }}>{SOURCE_LABEL[e.expense_source]}</span>
            {e.petty_cash && <span style={{ background: C.navyLight, color: C.navy, padding: "0px 6px", borderRadius: 6 }}>dari: {e.petty_cash.name}</span>}
            {e.main_cash && <span style={{ background: C.navyLight, color: C.navy, padding: "0px 6px", borderRadius: 6 }}>dari: {e.main_cash.name}</span>}
            {e.qty !== 1 && <span>{e.qty} {e.unit} × {fmt(e.unit_price)}</span>}
            {e.submitter && <span>· {e.submitter.name}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)", marginBottom: 4 }}>
            {fmt(e.total_amount)}
          </div>
          {e.receipt_url && (
            <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: "var(--t-mikro)", color: C.navy, display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end", marginBottom: 4 }}>
              <FileText size={10} /> Lihat nota
            </a>
          )}
          {canReview && e.status === "submitted" && (
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button onClick={() => onReject(e.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, fontSize: "var(--t-kecil)", fontWeight: 600, cursor: "pointer" }}>Tolak</button>
              <button onClick={() => onApprove(e.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: "var(--t-kecil)", fontWeight: 600, cursor: "pointer" }}>Setujui</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
