"use client";

/**
 * PROCUREMENT — PERMINTAAN MATERIAL (MR).
 *
 * Dipindahkan dari tab `requests`. Alur yang dijaga utuh: saring status,
 * submit draft, setujui/tolak (dengan alasan), detail, dan pembuatan MR baru
 * beserta itemnya dalam SATU request — pola yang catatannya ada di
 * `_bersama/modal-mr.tsx` dan tak boleh dikembalikan ke pola lama.
 *
 * Tabel HTML mentah di modal detail diganti `<Tabel>`.
 */

import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { api, hasPermission } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { Badge, Btn, Card, Memuat, Modal, STATUS_BADGE, fmt, fmtDate, tundaSatuTick } from "../_bersama/ui";
import { CreateMrModal } from "../_bersama/modal-mr";

interface ItemMr {
  id: string;
  qty_requested: number;
  unit: string;
  unit_price_est?: number | null;
  notes?: string | null;
  material?: { id?: string; name?: string } | null;
}

interface MaterialRequest {
  id: string;
  mr_number: string;
  status: string;
  request_date: string;
  needed_date?: string | null;
  notes?: string | null;
  rejection_notes?: string | null;
  approved_at?: string | null;
  project?: { id?: string; name?: string } | null;
  requested_by?: { name?: string } | null;
  approved_by_user?: { name?: string } | null;
  items?: ItemMr[];
}

const STATUS_MR = ["draft", "submitted", "approved", "rejected", "partially_ordered", "fully_ordered"];

export default function PermintaanPage() {
  const [mrs, setMrs] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailMr, setDetailMr] = useState<MaterialRequest | null>(null);

  // Pemuat ditulis sebagai fungsi biasa yang menerima saringannya lewat
  // PARAMETER, bukan `useCallback` yang membacanya dari closure. Dua alasan,
  // keduanya soal lint dan bukan gaya:
  //
  //  1. `useCallback` yang dirujuk dari daftar dependensi `useEffect` membuat
  //     `react-hooks/set-state-in-effect` membaca setState di dalam pemuat
  //     sebagai setState di badan efek.
  //  2. Karena saringan masuk sebagai argumen, badan efek tak lagi menutup
  //     nilai apa pun dari luar — `exhaustive-deps` pun tak punya dependensi
  //     yang hilang untuk dikeluhkan, tanpa perlu `eslint-disable`.
  //
  // Perilakunya sama persis: efek jalan saat dipasang dan setiap kali
  // `statusFilter` berubah, dengan nilai saringan yang sama seperti dulu.
  useEffect(() => { void load(statusFilter); }, [statusFilter]);

  async function load(status: string) {
    await tundaSatuTick(); // lihat catatannya di `_bersama/ui.tsx`
    setLoading(true);
    const res = await api.get<{ material_requests: MaterialRequest[] }>(
      "/api/v1/procurement/material-requests",
      { params: status ? { status } : {} },
    ).catch(() => null);
    setMrs(res?.data?.material_requests ?? []);
    setLoading(false);
  }

  const submit = async (id: string) => {
    setSubmitting(id);
    await api.patch(`/api/v1/procurement/material-requests/${id}/submit`).catch(() => null);
    setSubmitting(null); void load(statusFilter);
  };

  const approve = async (id: string) => {
    setApprovingId(id);
    await api.patch(`/api/v1/procurement/material-requests/${id}/approve`, { action: "approve" }).catch(() => null);
    setApprovingId(null); void load(statusFilter);
  };

  const reject = async () => {
    if (!rejectId) return;
    setApprovingId(rejectId);
    await api.patch(`/api/v1/procurement/material-requests/${rejectId}/approve`, {
      action: "reject", rejection_notes: rejectNotes,
    }).catch(() => null);
    setApprovingId(null); setRejectId(null); setRejectNotes(""); void load(statusFilter);
  };

  const openDetail = async (mr: MaterialRequest) => {
    const res = await api.get<{ material_request: MaterialRequest }>(
      `/api/v1/procurement/material-requests/${mr.id}`,
    ).catch(() => null);
    setDetailMr(res?.data?.material_request ?? mr);
  };

  const kolomItem: Kolom<ItemMr>[] = [
    { kunci: "material", judul: "Material", kepalaBaris: true, render: i => i.material?.name ?? "—" },
    { kunci: "qty", judul: "Qty Diminta", rata: "kanan", render: i => i.qty_requested },
    { kunci: "unit", judul: "Satuan", render: i => <span style={{ color: C.mid }}>{i.unit}</span> },
    { kunci: "harga", judul: "Harga Est.", rata: "kanan", render: i => i.unit_price_est ? fmt(i.unit_price_est) : "—" },
    { kunci: "catatan", judul: "Catatan", render: i => <span style={{ color: C.mid, fontSize: 12 }}>{i.notes ?? "—"}</span> },
  ];

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select
          aria-label="Saring status permintaan material" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
        >
          <option value="">Semua Status</option>
          {STATUS_MR.map(s => <option key={s} value={s}>{STATUS_BADGE[s]?.label ?? s}</option>)}
        </select>
        <Btn onClick={() => setShowCreate(true)}><Plus size={14} aria-hidden="true" /> Buat Material Request</Btn>
      </div>

      {loading ? <Memuat /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mrs.length === 0 && (
            <Kosong
              judul={statusFilter ? "Tak ada permintaan dengan status itu" : "Belum ada permintaan material"}
              sebab={statusFilter
                ? `Saringan status "${STATUS_BADGE[statusFilter]?.label ?? statusFilter}" tak menyisakan satu pun. Pilih "Semua Status" untuk melihat keseluruhannya.`
                : "Material Request adalah langkah PERTAMA pengadaan: lapangan meminta, lalu disetujui, baru boleh jadi Purchase Order. Tanpa MR, pembelian tak punya dasar permintaan."}
            />
          )}
          {mrs.map(mr => (
            // Kartu TIDAK lagi ber-`onClick`. Ia berisi tombol Submit/Setujui/
            // Tolak, dan kontrol di dalam kontrol membuat pembaca layar
            // mengumumkan keduanya bertumpuk (`nested-interactive`, WCAG 4.1.2).
            // Pemicu detail dipindah ke nomor MR di bawah — "buka MR-001" jauh
            // lebih jelas daripada "tombol" untuk seluruh kartu.
            <Card key={mr.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void openDetail(mr)}
                      style={{
                        fontWeight: 700, color: C.navy, background: "none", border: "none",
                        padding: 0, font: "inherit", cursor: "pointer", textAlign: "left",
                        textDecoration: "underline", textUnderlineOffset: 3,
                      }}
                    >
                      {mr.mr_number}
                      <span className="sr-only"> — buka rincian permintaan</span>
                    </button>
                    <Badge status={mr.status} />
                  </div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                    {mr.project?.name} · {mr.requested_by?.name} · {fmtDate(mr.request_date)}
                  </div>
                  {mr.needed_date && <div style={{ fontSize: 12, color: C.warning }}>Dibutuhkan: {fmtDate(mr.needed_date)}</div>}
                  {mr.rejection_notes && <div style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>Alasan ditolak: {mr.rejection_notes}</div>}
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(mr.items ?? []).map(item => (
                      <span key={item.id} style={{ fontSize: 11, padding: "2px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, color: C.mid }}>
                        {item.material?.name} {item.qty_requested} {item.unit}
                      </span>
                    ))}
                  </div>
                </div>
                {/* `stopPropagation` dihapus bersama `onClick` kartu — tak ada
                    lagi handler induk yang perlu ditahan. */}
                <div style={{ display: "flex", gap: 6 }}>
                  {mr.status === "draft" && (
                    <Btn loading={submitting === mr.id} onClick={() => void submit(mr.id)}>Submit</Btn>
                  )}
                  {mr.status === "submitted" && hasPermission("procurement:mr:manage") && (
                    <>
                      <Btn loading={approvingId === mr.id} onClick={() => void approve(mr.id)} style={{ background: C.successBg, color: C.success, border: `1px solid ${C.success}` }}>
                        <Check size={14} aria-hidden="true" /> Setujui
                      </Btn>
                      <Btn loading={approvingId === mr.id} variant="danger" onClick={() => { setRejectId(mr.id); setRejectNotes(""); }}>
                        <X size={14} aria-hidden="true" /> Tolak
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateMrModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); void load(statusFilter); }} />}

      {detailMr && (
        <Modal title={`Detail ${detailMr.mr_number}`} onClose={() => setDetailMr(null)} width={640}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>Proyek: </span>{detailMr.project?.name ?? "—"}</div>
              <div><span style={{ color: C.muted }}>Diminta oleh: </span>{detailMr.requested_by?.name ?? "—"}</div>
              <div><span style={{ color: C.muted }}>Tanggal: </span>{fmtDate(detailMr.request_date)}</div>
              <div><span style={{ color: C.muted }}>Dibutuhkan: </span>{detailMr.needed_date ? fmtDate(detailMr.needed_date) : "—"}</div>
              {detailMr.approved_by_user && <div><span style={{ color: C.muted }}>Disetujui oleh: </span>{detailMr.approved_by_user.name}</div>}
              {detailMr.approved_at && <div><span style={{ color: C.muted }}>Tgl Setuju: </span>{fmtDate(detailMr.approved_at)}</div>}
            </div>
            {detailMr.rejection_notes && (
              <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, color: C.danger }}>
                <strong>Alasan ditolak:</strong> {detailMr.rejection_notes}
              </div>
            )}
            {detailMr.notes && <div style={{ fontSize: 13, color: C.mid }}><strong>Catatan:</strong> {detailMr.notes}</div>}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Daftar Material</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <Tabel
                  kolom={kolomItem}
                  data={detailMr.items ?? []}
                  kunciBaris={i => i.id}
                  caption="Item dalam Material Request ini: material, jumlah yang diminta, satuan, harga estimasi, dan catatan."
                  kosong={<Kosong judul="MR ini tak punya item" sebab="Permintaan tanpa item tak bisa dijadikan Purchase Order. Ini biasanya sisa dari pembuatan yang gagal di tengah jalan — hapus dan buat ulang." />}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {rejectId && (
        <Modal title="Tolak Material Request" onClose={() => setRejectId(null)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: C.mid }}>Berikan alasan penolakan agar requester dapat merevisi MR.</div>
            <div>
              <label htmlFor="alasan-tolak-mr" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
                Alasan Penolakan (opsional)
              </label>
              <textarea
                id="alasan-tolak-mr" value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} rows={3}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box", background: C.surface, color: C.text }}
                placeholder="cth: Kuantitas berlebihan, perlu revisi..."
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setRejectId(null)}>Batal</Btn>
              <Btn variant="danger" loading={approvingId === rejectId} onClick={() => void reject()}>
                <X size={14} aria-hidden="true" /> Konfirmasi Tolak
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
