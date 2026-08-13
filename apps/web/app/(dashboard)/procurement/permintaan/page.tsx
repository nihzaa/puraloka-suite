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
import { bacaDenganCache, type HasilBaca } from "@/lib/cache-baca";
import { PenandaCache } from "@/components/PenandaCache";
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

/** Company aktif — kunci cache, sama seperti `antrean-offline.ts`. */
function companyAktif(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("puraloka_company_id") ?? "";
}

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
  /** Pesan penolakan dari server — SoD, saldo, konfigurasi rantai. */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  /** MR yang sedang dimintakan alasan override SoD-nya. */
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [alasanOverride, setAlasanOverride] = useState("");
  // Keadaan cache dipisah dari datanya: layar perlu tahu data ini SEGAR atau
  // TERSIMPAN, dan sejak kapan. Tanpa itu, daftar dari simpanan terlihat
  // persis seperti daftar hari ini — dan yang membacanya mengambil keputusan.
  const [asal, setAsal] = useState<Omit<HasilBaca<unknown>, "data">>({
    dariCache: false, diambil: null, usiaMenit: null, basi: false,
  });

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

    // Jaringan DULU, cache hanya saat gagal.
    //
    // Versi sebelumnya menelan galat dengan `.catch(() => null)` lalu
    // menampilkan daftar KOSONG — di lokasi tanpa sinyal itu terbaca "tak ada
    // permintaan material", padahal ada belasan yang menunggu persetujuan.
    // Sekarang jawaban terakhir tersimpan di perangkat dan dipakai, DENGAN
    // penanda kapan ia diambil.
    const url = `/api/v1/procurement/material-requests${status ? `?status=${status}` : ""}`;
    try {
      const h = await bacaDenganCache<MaterialRequest[]>(
        companyAktif(), url,
        async () => {
          const res = await api.get<{ material_requests: MaterialRequest[] }>(
            "/api/v1/procurement/material-requests",
            { params: status ? { status } : {} },
          );
          return res.data?.material_requests ?? [];
        },
      );
      setMrs(h.data);
      setAsal({ dariCache: h.dariCache, diambil: h.diambil, usiaMenit: h.usiaMenit, basi: h.basi });
    } catch {
      // Jaringan gagal DAN tak ada simpanan: daftar kosong, tapi penandanya
      // tetap "segar" — supaya tak ada pita yang menjanjikan data tersimpan
      // yang sebenarnya tak ada.
      setMrs([]);
      setAsal({ dariCache: false, diambil: null, usiaMenit: null, basi: false });
    }

    setLoading(false);
  }

  const submit = async (id: string) => {
    setSubmitting(id);
    await api.patch(`/api/v1/procurement/material-requests/${id}/submit`).catch(() => null);
    setSubmitting(null); void load(statusFilter);
  };

  /**
   * Setujui MR.
   *
   * ── Kenapa galatnya ditampilkan, padahal sebelumnya ditelan
   *
   * Versi sebelumnya: `.catch(() => null)` lalu muat ulang daftar. Permintaan
   * yang ditolak server terlihat persis sama dengan yang berhasil — tombol
   * berhenti berputar, daftar tak berubah, tak ada pesan apa pun.
   *
   * Itu tak terlalu terasa selama satu-satunya penolakan adalah "tak
   * berwenang" (yang tombolnya memang sudah disembunyikan). Sejak gerbang SoD
   * (TJS-P4) ada, penolakan jadi hal yang WAJAR dialami orang berwenang —
   * "Anda tidak bisa menyetujui pengajuan Anda sendiri" — dan pesan itu
   * satu-satunya petunjuk mengapa tak terjadi apa-apa.
   *
   * ── `alasan` = override SoD
   *
   * Dikirim hanya kalau diisi. Server menolak override tanpa alasan, jadi
   * mengirim string kosong sama dengan tak mengirim apa pun.
   */
  const approve = async (id: string, alasanOverride?: string) => {
    setApprovingId(id);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/procurement/material-requests/${id}/approve`, {
        action: "approve",
        ...(alasanOverride?.trim() ? { alasan_override: alasanOverride.trim() } : {}),
      });
      setOverrideId(null);
      setAlasanOverride("");
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(pesan ?? "Gagal menyetujui permintaan ini.");
      // Penolakan karena SoD punya jalan keluarnya: minta alasan, lalu ulangi.
      // Dibuka otomatis supaya pengguna tak perlu menebak apa yang harus
      // dilakukan dari pesan galat saja.
      if (pesan && /pengajuan Anda sendiri|alasan tertulis/i.test(pesan)) setOverrideId(id);
    } finally {
      setApprovingId(null);
      void load(statusFilter);
    }
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
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/* Penanda cache DI ATAS saringan, bukan di bawah daftar.
          Yang membacanya harus tahu data ini tersimpan SEBELUM ia mulai
          membaca isinya — peringatan di bawah daftar sampai terlambat. */}
      <PenandaCache
        dariCache={asal.dariCache}
        usiaMenit={asal.usiaMenit}
        basi={asal.basi}
        perihal="Permintaan material"
      />

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

      {/* Penolakan server ditampilkan, bukan ditelan. `role="alert"` supaya
          pembaca layar mengumumkannya — penggunanya menekan tombol lalu
          menunggu, dan tanpa pengumuman ia menunggu selamanya. */}
      {galatAksi && (
        <div
          role="alert"
          style={{
            background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8,
            padding: "10px 12px", marginBottom: 12, fontSize: 13, color: C.danger,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}
        >
          <X size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.5 }}>{galatAksi}</span>
        </div>
      )}

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
              berpermukaan                  kolom={kolomItem}
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

      {/* Override pemisahan wewenang (TJS-P4).
          Muncul hanya kalau server MENOLAK dengan alasan SoD — bukan pilihan
          yang ditawarkan di muka. Menawarkannya sebelum ditolak akan membuat
          jalan pintas terlihat seperti alur biasa, dan yang tersisa dari
          "pemisahan wewenang" cuma satu kotak isian tambahan. */}
      {overrideId && (
        <Modal title="Menyetujui pengajuan Anda sendiri" onClose={() => { setOverrideId(null); setAlasanOverride(""); }} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                // `--warning-teks` (#9A3412), bukan `--warning` — 7,05:1 di
                // atas `--warning-bg` versus 4,84:1. Dan bukan `C.mid`, yang
                // di mode gelap berubah jadi terang sementara latar ini tidak.
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)", borderRadius: 6,
                padding: "10px 12px", fontSize: 13, color: "var(--warning-teks)", lineHeight: 1.55,
              }}
            >
              Anda adalah pengaju permintaan ini. Biasanya orang lain yang
              memutuskannya. Kalau tetap perlu Anda setujui sendiri, tuliskan
              alasannya — <strong>alasan ini tercatat permanen dan tidak bisa
              diubah atau dihapus.</strong>
            </div>
            <div>
              <label htmlFor="alasan-override-mr" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
                Alasan (wajib)
              </label>
              <textarea
                id="alasan-override-mr" value={alasanOverride} onChange={e => setAlasanOverride(e.target.value)} rows={3}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box", background: C.surface, color: C.text }}
                placeholder="cth: Direktur sedang cuti, material dibutuhkan besok pagi"
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => { setOverrideId(null); setAlasanOverride(""); }}>Batal</Btn>
              <Btn
                loading={approvingId === overrideId}
                disabled={alasanOverride.trim() === ""}
                onClick={() => void approve(overrideId, alasanOverride)}
              >
                <Check size={14} aria-hidden="true" /> Setujui &amp; catat alasan
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
