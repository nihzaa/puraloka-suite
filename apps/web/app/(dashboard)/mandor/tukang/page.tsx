"use client";

/**
 * DAFTAR TUKANG — pekerja yang bisa muncul di laporan upah.
 *
 * Dulu tab `tukang` di `mandor/page.tsx` (baris 1381–1539). Entitasnya jelas
 * berbeda dari laporan maupun kasbon — ini master data orang — jadi menurut
 * ARAH-VISUAL §6a ia halaman.
 *
 * ── Satu perubahan yang disengaja
 *
 * Versi lama merender daftarnya sebagai `<div>` ber-`gridTemplateColumns`
 * dengan kepala kolom sendiri: bagi pembaca layar itu bukan tabel sama
 * sekali — tak ada `<caption>`, tak ada hubungan sel↔kolom, tak ada
 * `scope="row"`. Di sini ia memakai `<Tabel>` dari `@/components/dasar`,
 * yang menjaga keempatnya (UI-0-4). Kolom, urutan, dan aksinya sama.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Tabel, Kosong } from "@/components/dasar";
import { Plus, RefreshCw, Users, Search } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import {
  type Worker,
  TIPE_LABELS, TIPE_COLORS, SKILL_LABELS,
  kartu as card,
} from "../_bersama/tipe";
import { WorkerFormModal } from "../_bersama/komponen";

function tautanWa(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
  return `https://wa.me/${normalized}`;
}

export default function DaftarTukangPage() {
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerFilterTipe, setWorkerFilterTipe] = useState("");
  const [workerFilterStatus, setWorkerFilterStatus] = useState("aktif");

  const [showWorkerForm, setShowWorkerForm] = useState<{ mandorId?: string; mandorName?: string; worker?: Worker } | null>(null);
  const [deleteWorkerConfirm, setDeleteWorkerConfirm] = useState<Worker | null>(null);
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);

  // Dialog konfirmasi hapus TIDAK punya jalan keluar Esc saat halaman ini
  // dipecah dari tab — ditangkap modal-esc-ratchet 2026-08-07. Tanpa ini
  // pemakai keyboard terjebak: Tab berputar di dalam dialog dan satu-satunya
  // jalan keluar adalah mengambil tetikus (WCAG 2.1.2 Level A).
  //
  // `null` saat penghapusan berjalan: Esc di tengah proses akan menutup
  // dialog sementara permintaan masih terbang, sehingga pemakai kehilangan
  // satu-satunya tempat hasilnya dilaporkan — pada tindakan yang TIDAK BISA
  // dibatalkan.
  useTutupEsc(deleteWorkerConfirm && !deletingWorkerId ? () => setDeleteWorkerConfirm(null) : null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask. `loadWorkers`
    dipertahankan sebagai nama supaya pemanggilnya di bawah (create/edit/hapus
    modal) tak perlu diganti — sekarang tinggal pembungkus tipis atas
    `muatUlang()`.
  */
  const { data, memuat: loading, muatUlang } = useData<{ workers: Worker[] }>("/api/v1/mandor/workers");
  const loadWorkers = () => { void muatUlang(); };
  const workers = data?.workers ?? [];

  async function handleDeleteWorker(worker: Worker) {
    setDeletingWorkerId(worker.id);
    try {
      await api.delete(`/api/v1/mandor/workers/${worker.id}`);
      setDeleteWorkerConfirm(null);
      loadWorkers();
    } catch (err: unknown) {
      alert((err as any)?.response?.data?.error ?? "Gagal menghapus tukang");
    } finally { setDeletingWorkerId(null); }
  }

  const filteredWorkers = workers.filter(w => {
    if (workerSearch && !w.name.toLowerCase().includes(workerSearch.toLowerCase())) return false;
    if (workerFilterTipe && w.tipe !== workerFilterTipe) return false;
    if (workerFilterStatus === "aktif" && !w.is_active) return false;
    if (workerFilterStatus === "nonaktif" && w.is_active) return false;
    return true;
  });

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Bilah saringan */}
      <div style={{ ...card, padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", background: "var(--surface)" }}>
          <Search size={13} color={C.muted} />
          <input aria-label="Cari nama pekerja" value={workerSearch} onChange={e => setWorkerSearch(e.target.value)} placeholder="Cari nama pekerja..." style={{ border: "none", outline: "none", fontSize: 13, width: "100%", color: C.text, background: "transparent" }} />
        </div>
        <select aria-label="Saring tipe tukang" value={workerFilterTipe} onChange={e => setWorkerFilterTipe(e.target.value)}
          style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: "var(--surface)", cursor: "pointer" }}>
          <option value="">Semua Tipe</option>
          <option value="tukang">Tukang</option>
          <option value="laden">Laden</option>
          <option value="kenek">Kenek</option>
        </select>
        <select aria-label="Saring status tukang" value={workerFilterStatus} onChange={e => setWorkerFilterStatus(e.target.value)}
          style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: "var(--surface)", cursor: "pointer" }}>
          <option value="">Semua Status</option>
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
        </select>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>{filteredWorkers.length} pekerja</span>
        <button onClick={loadWorkers} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid, display: "flex", alignItems: "center", gap: 4 }}>
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={() => setShowWorkerForm({})}
          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={13} /> Tambah Pekerja
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <Tabel<Worker>
            caption="Daftar pekerja: nama, keahlian, tipe, mandor terakhir, nomor HP, dan status keaktifan."
            data={filteredWorkers}
            kunciBaris={(w) => w.id}
            // Baris nonaktif diberi latar redup — penandanya BUKAN cuma warna:
            // kolom Status menuliskannya dengan kata (WCAG 1.4.1).
            tandaiBaris={(w) => (w.is_active ? undefined : "var(--surface-subtle)")}
            kosong={
              <div style={{ padding: "var(--pad-kartu-lega)" }}>
                <Kosong
                  ikon={<Users size={28} />}
                  judul="Belum ada pekerja terdaftar"
                  sebab={
                    <>
                      Laporan upah mingguan disusun per pekerja: tarif harian
                      dan jumlah hari kerja diambil dari daftar ini. Selama
                      kosong, mandor tak bisa mengajukan upah lewat sistem.
                    </>
                  }
                  aksi={
                    <button onClick={() => setShowWorkerForm({})}
                      style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Plus size={14} /> Tambah Pekerja
                    </button>
                  }
                />
              </div>
            }
            kolom={[
              {
                kunci: "nama", judul: "Nama", kepalaBaris: true,
                render: (w) => (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: w.is_active ? C.navyLight : "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: w.is_active ? C.navy : C.muted, flexShrink: 0 }}>
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: w.is_active ? C.text : C.muted }}>{w.name}</div>
                      {(w.skills ?? []).length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                          {(w.skills ?? []).map(s => (
                            <span key={s} style={{ fontSize: 10, padding: "0px 4px", borderRadius: 6, background: C.blueBg, color: C.blue, border: `1px solid ${C.blueBorder}` }}>
                              {SKILL_LABELS[s] ?? s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                kunci: "tipe", judul: "Tipe", lebar: 96,
                render: (w) => {
                  const tipeColor = w.tipe ? TIPE_COLORS[w.tipe] : null;
                  return tipeColor ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: tipeColor.bg, color: tipeColor.color }}>
                      {TIPE_LABELS[w.tipe!]}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: C.muted }}>—</span>
                  );
                },
              },
              {
                kunci: "mandor", judul: "Mandor Terakhir", lebar: 150,
                render: (w) => {
                  const mandorTerakhir = (w as any).mandor_terakhir ?? w.mandor?.name ?? null;
                  return mandorTerakhir
                    ? <span style={{ fontSize: 12, color: C.mid }}>{mandorTerakhir}</span>
                    : <span style={{ fontSize: 12, color: C.muted }}>—</span>;
                },
              },
              {
                kunci: "hp", judul: "No. HP", lebar: 140,
                render: (w) => w.phone ? (
                  <a href={tautanWa(w.phone)} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: C.green, textDecoration: "none", fontWeight: 500 }}>
                    {w.phone}
                  </a>
                ) : <span style={{ fontSize: 12, color: C.muted }}>—</span>,
              },
              {
                kunci: "status", judul: "Status", lebar: 90,
                render: (w) => (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: w.is_active ? "var(--success-bg)" : "var(--surface-hover)", color: w.is_active ? "var(--on-success-bg)" : C.muted }}>
                    {w.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                ),
              },
              {
                kunci: "aksi", judul: "Aksi", rata: "tengah", lebar: 80,
                render: (w) => (
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", opacity: deletingWorkerId === w.id ? 0.5 : 1 }}>
                    <button aria-label={`Edit ${w.name}`} onClick={() => setShowWorkerForm({ worker: w })}
                      style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", color: C.mid, display: "flex", alignItems: "center" }}
                      title="Edit">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button aria-label={`Hapus ${w.name}`} onClick={() => setDeleteWorkerConfirm(w)}
                      style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, cursor: "pointer", color: C.red, display: "flex", alignItems: "center" }}
                      title="Hapus">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {showWorkerForm && (
        <WorkerFormModal
          mandorId={showWorkerForm.mandorId}
          mandorName={showWorkerForm.mandorName}
          worker={showWorkerForm.worker}
          onClose={() => setShowWorkerForm(null)}
          onSuccess={() => { setShowWorkerForm(null); loadWorkers(); }}
        />
      )}

      {/* Konfirmasi hapus */}
      {deleteWorkerConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, width: 380, padding: 24, boxShadow: "var(--naik-3)" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: C.text }}>Hapus Tukang?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
              Hapus <strong>{deleteWorkerConfirm.name}</strong>? Data ini tidak bisa dikembalikan.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteWorkerConfirm(null)}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>
                Batal
              </button>
              <button onClick={() => handleDeleteWorker(deleteWorkerConfirm)} disabled={deletingWorkerId === deleteWorkerConfirm.id}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.red, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {deletingWorkerId === deleteWorkerConfirm.id ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
