"use client";

/**
 * PENAGIHAN PROGRESS — pengajuan mandor atas progres scope, ditinjau admin/PM.
 *
 * Dulu tab `penagihan` di `mandor/page.tsx` (baris 1302–1378). Yang disetujui
 * di sini langsung jadi utang yang harus dibayar, jadi ia layak punya tautan
 * sendiri: "tinjau yang di /mandor/penagihan" bisa dikirim apa adanya.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Kosong } from "@/components/ui-dasar";
import { Banknote, RefreshCw, Ruler, AlertTriangle, Check } from "lucide-react";
import { C } from "@/lib/warna-ui";
import {
  type ProgressPayment, type CashAccount,
  fmt, kartu as card,
} from "../_bersama/tipe";
import { PPConfirmModal } from "../_bersama/komponen";

const PP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Menunggu",   color: C.yellow, bg: C.yellowBg },
  approved: { label: "Disetujui",  color: C.green,  bg: C.greenBg  },
  rejected: { label: "Ditolak",    color: C.red,    bg: C.redBg    },
};

function PPCard({ p, isAction, onTinjau }: {
  p: ProgressPayment; isAction: boolean; onTinjau: (p: ProgressPayment) => void;
}) {
  const meta = PP_STATUS[p.status] ?? PP_STATUS.pending;
  return (
    <div style={{ ...card, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.work_scope?.scope_name ?? "—"}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
              {meta.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.mid }}>
            {p.project?.name ?? "—"} · Progress {p.pct_done}% · {p.requester?.name ?? "—"} · {new Date(p.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
          {p.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontStyle: "italic" }}>{p.notes}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt(p.gross_payment)}</div>
          {isAction && (
            <button
              onClick={() => onTinjau(p)}
              style={{ marginTop: 8, padding: "4px 12px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Tinjau
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Kesiapan opname per lingkup kerja (D2).
 *
 * Gerbang opname (D1) sudah bekerja di server: pembayaran borongan dan
 * progress_pct ditolak 422 tanpa berita acara terverifikasi.
 *
 * Yang belum sampai 2026-08-12: layar ini TAK MENYEBUT OPNAME SAMA SEKALI.
 * Pengguna menekan Ajukan, ditolak, lalu membaca pesan galat — padahal ia
 * bisa tahu sebelum mencoba. Penolakan yang bisa DIRAMALKAN lebih baik
 * daripada penolakan yang menjelaskan diri.
 */
interface Kesiapan {
  work_scope_id: string;
  scope_name: string;
  payment_system: string;
  wajib_opname: boolean;
  opname_terverifikasi: number;
  opname_menunggu: number;
  opname_disengketakan: number;
  /** `null` bila tak wajib opname — bukan 100. */
  pct_opname: number | null;
  pct_sudah_ditagih: number;
  pct_sisa: number | null;
  sebab: string;
}

export default function PenagihanPage() {
  const [progressPayments, setProgressPayments] = useState<ProgressPayment[]>([]);
  const [kesiapan, setKesiapan] = useState<Kesiapan[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [ppConfirmModal, setPpConfirmModal] = useState<{ payment: ProgressPayment } | null>(null);
  const [ppActionLoading, setPpActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ppRes, cashRes, siapRes] = await Promise.all([
        api.get<{ payments: ProgressPayment[] }>("/api/v1/mandor/progress-payments").catch(() => ({ data: { payments: [] } })),
        api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").catch(() => ({ data: { accounts: [] } })),
        api.get<{ kesiapan: Kesiapan[] }>("/api/v1/opname/kesiapan").catch(() => ({ data: { kesiapan: [] } })),
      ]);
      setProgressPayments(ppRes.data.payments ?? []);
      setKesiapan(siapRes.data.kesiapan ?? []);
      setCashAccounts((cashRes.data.accounts ?? []).filter((a: CashAccount) => a.is_active));
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: memanggil `setLoading(true)`
  // di badan efek memicu render berantai (`react-hooks/set-state-in-effect`).
  // Pola yang sama dipakai `mandor/retensi` dan sudah lolos ratchet lint.
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const pendingPP = progressPayments.filter(p => p.status === "pending");
  const otherPP = progressPayments.filter(p => p.status !== "pending");

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      {/* Kesiapan opname DI ATAS daftar pengajuan.
          Yang dicari pembacanya sebelum menyetujui apa pun adalah "boleh
          berapa" — dan itu ditentukan berita acara, bukan oleh angka yang
          diketik mandor. */}
      {!loading && kesiapan.some((k) => k.wajib_opname) && (
        <PanelKesiapan kesiapan={kesiapan.filter((k) => k.wajib_opname)} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: C.muted }}>{progressPayments.length} pengajuan</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : progressPayments.length === 0 ? (
        <Kosong
          ikon={<Banknote size={32} aria-hidden="true" />}
          judul="Belum ada pengajuan penagihan"
          sebab="Mandor mengajukan penagihan dari portal lapangan setelah progres scope-nya naik. Yang disetujui di sini langsung jadi utang yang harus dibayar."
        />
      ) : (
        <>
          {pendingPP.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Menunggu Konfirmasi ({pendingPP.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingPP.map(p => (
                  <PPCard key={p.id} p={p} isAction
                    onTinjau={(pp) => setPpConfirmModal({ payment: pp })} />
                ))}
              </div>
            </div>
          )}
          {otherPP.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Riwayat ({otherPP.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {otherPP.map(p => (
                  <PPCard key={p.id} p={p} isAction={false} onTinjau={() => {}} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {ppConfirmModal && (
        <PPConfirmModal
          payment={ppConfirmModal.payment}
          cashAccounts={cashAccounts}
          loading={ppActionLoading}
          onClose={() => setPpConfirmModal(null)}
          onAction={async (action, cashAccountId, notes) => {
            setPpActionLoading(true);
            try {
              await api.patch(`/api/v1/mandor/progress-payments/${ppConfirmModal.payment.id}/confirm`, {
                status: action,
                cash_account_id: cashAccountId || undefined,
                notes: notes || undefined,
              });
              setPpConfirmModal(null);
              load();
            } catch (err: any) {
              alert(err.response?.data?.error ?? "Gagal memproses");
            } finally {
              setPpActionLoading(false);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Berapa persen yang boleh ditagih per lingkup kerja, dan kenapa segitu.
 *
 * ── Kenapa yang TERHALANG di atas
 *
 * Daftar yang mengurut menurut nama membuat lingkup kerja bermasalah
 * tersembunyi di tengah. Yang dicari pembacanya adalah "mana yang tak bisa
 * ditagih dan kenapa" — itu pertanyaan yang membuatnya membuka layar ini.
 */
function PanelKesiapan({ kesiapan }: { kesiapan: Kesiapan[] }) {
  // Terhalang dulu: sisa nol, atau belum ada opname terverifikasi.
  const urut = [...kesiapan].sort((a, b) => {
    const skor = (k: Kesiapan) =>
      k.opname_disengketakan > 0 ? 0
        : k.opname_terverifikasi === 0 ? 1
          : (k.pct_sisa ?? 0) <= 0 ? 2 : 3;
    return skor(a) - skor(b) || a.scope_name.localeCompare(b.scope_name);
  });

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Ruler size={15} aria-hidden="true" />
          Batas Tagih menurut Opname
        </h3>
        <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5, maxWidth: "72ch" }}>
          Pembayaran borongan dan progres tak bisa melampaui volume yang sudah
          diukur bersama. Angka di bawah dihitung dari berita acara yang
          <strong> sudah diverifikasi</strong> — yang masih menunggu tak menaikkannya.
        </p>
      </div>

      {urut.map((k, i, arr) => {
        const terhalang = k.opname_terverifikasi === 0 || (k.pct_sisa ?? 0) <= 0;
        const sengketa = k.opname_disengketakan > 0;
        const warna = sengketa ? "var(--danger)" : terhalang ? "var(--warning-teks)" : "var(--success)";
        return (
          <div
            key={k.work_scope_id}
            style={{
              display: "grid", gridTemplateColumns: "1fr 110px 110px 100px", gap: 12,
              padding: "11px 16px", alignItems: "center", fontSize: 13,
              borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                {sengketa
                  ? <AlertTriangle size={13} aria-hidden="true" style={{ color: warna, flexShrink: 0 }} />
                  : terhalang
                    ? <AlertTriangle size={13} aria-hidden="true" style={{ color: warna, flexShrink: 0 }} />
                    : <Check size={13} aria-hidden="true" style={{ color: warna, flexShrink: 0 }} />}
                {k.scope_name}
              </div>
              {/* Kalimatnya, bukan angkanya, yang bisa ditindaklanjuti. */}
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>
                {k.sebab}
              </div>
            </div>
            <div style={{ textAlign: "right", color: C.mid, fontVariantNumeric: "tabular-nums" }}>
              {k.pct_opname === null ? "—" : `${k.pct_opname}%`}
              <div style={{ fontSize: 10.5, color: C.muted }}>terukur</div>
            </div>
            <div style={{ textAlign: "right", color: C.mid, fontVariantNumeric: "tabular-nums" }}>
              {k.pct_sudah_ditagih}%
              <div style={{ fontSize: 10.5, color: C.muted }}>ditagih</div>
            </div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: warna, fontWeight: 700 }}>
              {k.pct_sisa === null ? "—" : `${k.pct_sisa}%`}
              <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 400 }}>sisa</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
