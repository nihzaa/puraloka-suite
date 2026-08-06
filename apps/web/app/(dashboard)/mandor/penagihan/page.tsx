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
import { Banknote, RefreshCw } from "lucide-react";
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

export default function PenagihanPage() {
  const [progressPayments, setProgressPayments] = useState<ProgressPayment[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [ppConfirmModal, setPpConfirmModal] = useState<{ payment: ProgressPayment } | null>(null);
  const [ppActionLoading, setPpActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ppRes, cashRes] = await Promise.all([
        api.get<{ payments: ProgressPayment[] }>("/api/v1/mandor/progress-payments").catch(() => ({ data: { payments: [] } })),
        api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").catch(() => ({ data: { accounts: [] } })),
      ]);
      setProgressPayments(ppRes.data.payments ?? []);
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
