"use client";

/**
 * KASBON TUKANG — uang muka yang diteruskan mandor ke tukangnya, per mandor.
 *
 * Dulu tab `kasbon` di `mandor/page.tsx` (baris 883–1036). Dipecah jadi rute
 * sendiri: entitasnya BUKAN laporan upah melainkan piutang ke tukang, dan
 * tautan `/mandor/kasbon` sekarang membuka daftar yang sama bagi siapa pun
 * yang menerimanya.
 *
 * Perilakunya dipertahankan: pengelompokan per mandor dengan bilah outstanding,
 * saringan mandor/status, catat cicilan, dan lightbox foto nota.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Kosong } from "@/components/ui-dasar";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { Plus, RefreshCw, Banknote, User, Search, X, Camera } from "lucide-react";
import { C } from "@/lib/warna-ui";
import {
  type Assignment, type WorkerKasbon,
  fmt, fmtDate, kartu as card,
} from "../_bersama/tipe";
import { AddKasbonModal } from "../_bersama/komponen";

const LABEL_TUJUAN: Record<string, string> = {
  gaji_tukang: "Gaji", uang_makan: "Makan", pembelian_alat: "Alat",
  operasional: "Operasional", lain_lain: "Lain-lain",
};

export default function KasbonTukangPage() {
  const [kasbons, setKasbons] = useState<WorkerKasbon[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMandorId, setFilterMandorId] = useState("");
  const [filterStatus, setFilterStatus] = useState("aktif");

  const [showAddKasbon, setShowAddKasbon] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  // Lightbox: Esc adalah konvensi yang orang harapkan dari lightbox mana pun.
  useTutupEsc(lightboxPhoto ? () => setLightboxPhoto(null) : null);

  const [cicilanModal, setCicilanModal] = useState<{ kasbonId: string; remaining: number } | null>(null);
  const [cicilanNominal, setCicilanNominal] = useState("");
  const [cicilanCatatan, setCicilanCatatan] = useState("");
  const [cicilanLoading, setCicilanLoading] = useState(false);
  const [cicilanError, setCicilanError] = useState("");
  useTutupEsc(cicilanModal ? () => setCicilanModal(null) : null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRes, asgRes] = await Promise.all([
        api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons"),
        api.get<{ assignments: Assignment[] }>("/api/v1/mandor/assignments"),
      ]);
      setKasbons(kbRes.data.kasbons);
      setAssignments(asgRes.data.assignments);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: memanggil `setLoading(true)`
  // di badan efek memicu render berantai (`react-hooks/set-state-in-effect`).
  // Pola yang sama dipakai `mandor/retensi` dan sudah lolos ratchet lint.
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const filteredKasbons = kasbons.filter(k => {
    if (search && !k.worker?.name?.toLowerCase().includes(search.toLowerCase()) && !k.project?.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterMandorId && k.mandor?.id !== filterMandorId) return false;
    if (filterStatus === "aktif" && k.is_settled) return false;
    if (filterStatus === "lunas" && !k.is_settled) return false;
    return true;
  });

  // Kelompokkan per mandor
  const mandorMap = new Map<string, { id: string; name: string; kasbons: WorkerKasbon[] }>();
  filteredKasbons.forEach(k => {
    const mid = k.mandor?.id ?? "unknown";
    const mname = k.mandor?.name ?? "Tidak Diketahui";
    if (!mandorMap.has(mid)) mandorMap.set(mid, { id: mid, name: mname, kasbons: [] });
    mandorMap.get(mid)!.kasbons.push(k);
  });
  const groups = Array.from(mandorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const uniqueMandors = Array.from(new Map(kasbons.filter(k => k.mandor).map(k => [k.mandor!.id, k.mandor!])).values());

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)" }}>
          <Search size={13} color={C.muted} />
          <input aria-label="Cari kasbon tukang" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari tukang / proyek..." style={{ border: "none", outline: "none", fontSize: 13, width: 180, color: C.text, background: "transparent" }} />
        </div>
        <select aria-label="Mandor" value={filterMandorId} onChange={e => setFilterMandorId(e.target.value)}
          style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text, minWidth: 150 }}>
          <option value="">Semua Mandor</option>
          {uniqueMandors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select aria-label="Saring status kasbon" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text }}>
          <option value="">Semua Status</option>
          <option value="aktif">Aktif</option>
          <option value="lunas">Lunas</option>
        </select>
        {(filterMandorId || filterStatus !== "aktif") && (
          <button onClick={() => { setFilterMandorId(""); setFilterStatus("aktif"); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <X size={12} /> Reset
          </button>
        )}
        <span style={{ fontSize: 12, color: C.muted }}>{filteredKasbons.length} kasbon</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button onClick={() => setShowAddKasbon(true)} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <Plus size={14} /> Tambah Kasbon
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : groups.length === 0 ? (
        <Kosong
          ikon={<Banknote size={32} aria-hidden="true" />}
          judul="Belum ada kasbon tukang"
          sebab="Uang muka yang diteruskan mandor ke tukangnya sendiri. Dipotong dari upah saat pembayaran, jadi ia mengurangi yang diterima tukang — bukan menambah biaya proyek."
        />
      ) : groups.map(group => {
        const totalKasbon = group.kasbons.reduce((s, k) => s + Number(k.amount), 0);
        const totalLunas = group.kasbons.reduce((s, k) => s + Number(k.amount_settled), 0);
        const outstanding = totalKasbon - totalLunas;
        const outstandingPct = totalKasbon > 0 ? (outstanding / totalKasbon) * 100 : 0;
        const groupBarColor = outstandingPct > 80 ? C.red : outstandingPct > 50 ? C.yellow : C.green;

        return (
          <div key={group.id} style={{ ...card, overflow: "hidden" }}>
            {/* Kepala kelompok */}
            <div style={{ padding: "12px 16px", background: "var(--bg)", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.navy }}>
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{group.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: C.navyLight, color: C.navy }}>{group.kasbons.length} kasbon</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { label: "Total Kasbon", value: fmt(totalKasbon), color: C.text },
                  { label: "Lunas", value: fmt(totalLunas), color: C.green },
                  { label: "Outstanding", value: fmt(outstanding), color: outstanding > 0 ? C.red : C.mid },
                ].map((s, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 1 }}>{s.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {totalKasbon > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: C.muted }}>Outstanding</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: groupBarColor }}>{outstandingPct.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 0, background: groupBarColor, width: `${outstandingPct}%`, transition: "width 0.3s" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Baris kasbon */}
            {group.kasbons.map((k, idx) => {
              const remaining = k.amount - k.amount_settled;
              const pct = k.amount > 0 ? (k.amount_settled / k.amount) * 100 : 0;
              const isLast = idx === group.kasbons.length - 1;
              return (
                <div key={k.id} style={{ padding: "12px 16px", borderBottom: isLast ? "none" : `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: k.is_settled ? C.greenBg : C.yellowBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={14} color={k.is_settled ? C.green : C.yellow} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{k.worker?.name ?? "—"}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "0px 6px", borderRadius: 6, background: k.is_settled ? C.greenBg : C.yellowBg, color: k.is_settled ? C.green : C.yellow }}>{k.is_settled ? "Lunas" : "Aktif"}</span>
                      <span style={{ fontSize: 10, padding: "0px 6px", borderRadius: 6, background: "var(--surface-hover)", color: C.mid }}>{LABEL_TUJUAN[k.purpose] ?? k.purpose}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                      {k.project?.name ?? "—"} · {fmtDate(k.kasbon_date)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 0, background: k.is_settled ? C.green : C.yellow, width: `${pct}%` }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{Math.round(pct)}%</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: k.is_settled ? C.green : C.red }}>{fmt(remaining)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>dari {fmt(k.amount)}</div>
                    {!k.is_settled && (
                      <button type="button"
                        onClick={() => { setCicilanModal({ kasbonId: k.id, remaining }); setCicilanNominal(""); setCicilanCatatan(""); setCicilanError(""); }}
                        style={{ padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                        Catat Cicilan
                      </button>
                    )}
                    {k.photo_url && (
                      <button aria-label="Lihat foto nota" type="button" onClick={() => setLightboxPhoto(k.photo_url!)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.blue, display: "flex", alignItems: "center", gap: 2, fontSize: 11 }} title="Lihat foto nota">
                        <Camera size={12} /> Foto
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {showAddKasbon && (
        <AddKasbonModal
          assignments={assignments}
          onClose={() => setShowAddKasbon(false)}
          onSuccess={() => { setShowAddKasbon(false); load(); }}
        />
      )}

      {/* Lightbox foto nota */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <img src={lightboxPhoto} alt="Foto nota" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 6, boxShadow: "var(--naik-3)" }} />
          <button aria-label="Tutup foto" onClick={() => setLightboxPhoto(null)}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", color: "var(--surface)", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>
      )}

      {/* Modal cicilan */}
      {cicilanModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(0,0,0,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) setCicilanModal(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "var(--naik-3)", width: "100%", maxWidth: 400, padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 4 }}>Catat Cicilan Kasbon</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Sisa outstanding: <strong style={{ color: C.red }}>{fmt(cicilanModal.remaining)}</strong>
            </div>
            {cicilanError && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 12 }}>{cicilanError}</div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="cicilan-nominal" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Nominal Cicilan</label>
              <input id="cicilan-nominal"
                type="number" min={1} max={cicilanModal.remaining}
                value={cicilanNominal} onChange={e => setCicilanNominal(e.target.value)}
                placeholder="Rp 0"
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="cicilan-catatan" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Catatan (opsional)</label>
              <textarea id="cicilan-catatan"
                value={cicilanCatatan} onChange={e => setCicilanCatatan(e.target.value)}
                rows={2} placeholder="Mis: bayar dari upah minggu ini"
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setCicilanModal(null)} disabled={cicilanLoading}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer", color: C.text }}>
                Batal
              </button>
              <button
                disabled={cicilanLoading || !cicilanNominal || Number(cicilanNominal) <= 0}
                onClick={async () => {
                  if (!cicilanModal) return;
                  setCicilanLoading(true); setCicilanError("");
                  try {
                    const r = await api.patch(`/api/v1/mandor/worker-kasbons/${cicilanModal.kasbonId}/cicilan`, { nominal: Number(cicilanNominal), catatan: cicilanCatatan || undefined });
                    if (r.data) { setCicilanModal(null); load(); }
                  } catch (err: any) {
                    setCicilanError(err?.response?.data?.error ?? "Gagal catat cicilan");
                  } finally { setCicilanLoading(false); }
                }}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: cicilanLoading ? C.border : C.navy, color: cicilanLoading ? C.muted : "var(--surface)", fontSize: 13, fontWeight: 600, cursor: cicilanLoading ? "not-allowed" : "pointer" }}>
                {cicilanLoading ? "Menyimpan..." : "Simpan Cicilan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
