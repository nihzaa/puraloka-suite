"use client";

/**
 * KASBON SAYA — kasbon yang DIAJUKAN mandor sendiri ke admin/PM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ KODE MATI — halaman ini tidak bisa dicapai siapa pun
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dulu tab `mandor-kasbon` di `mandor/page.tsx` (baris 1039–1123), dan tab
 * itu HANYA tampil saat `isMandor` bernilai true. Diukur 2026-08-07:
 *
 *     middleware.ts:37  mandor → ["/mandor-portal", "/pm-portal", "/proyek",
 *                                 "/verify", "/mutu", "/lapangan"]
 *     middleware.ts:53  admin  → [..., "/mandor", ...]
 *
 * `/mandor` hanya ada di daftar `admin`, dan `cocokRute` (middleware.ts:68)
 * mencocokkan di batas segmen — jadi `/mandor/kasbon-saya` mewarisi izin
 * `/mandor` yang sama. Seorang mandor yang membuka rute ini dialihkan ke
 * `/mandor-portal` SEBELUM halaman ini termuat.
 *
 * Sementara itu `isMandor` = `!hasPermission("mandor:assign")` bernilai
 * false bagi admin/PM/direktur — satu-satunya yang bisa membuka halaman ini.
 * Jadi isinya hanya bisa tampil bagi orang yang tak pernah sampai ke sini.
 *
 * **Kodenya sengaja DIPERTAHANKAN apa adanya.** Menghapus kode mati adalah
 * keputusan tersendiri yang butuh persetujuan founder: kalau nanti `/mandor`
 * dibuka untuk role `mandor` (satu baris di middleware), halaman ini langsung
 * berfungsi. Yang dilakukan pemecahan ini cuma memindahkannya, dengan
 * penandanya dinyatakan alih-alih tersembunyi di dalam berkas 3.848 baris.
 *
 * Halaman ini juga TIDAK didaftarkan di navigasi modul (`layout.tsx`) —
 * mencantumkannya berarti menawarkan pintu yang selalu terkunci.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, hasPermission } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { useKasbonPurposes } from "@/lib/use-kasbon-purposes";
import { Plus, RefreshCw, Banknote, Camera } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { type MandorKasbon, fmt, kartu as card } from "../_bersama/tipe";
import { SubmitMandorKasbonModal } from "../_bersama/komponen";

const STATUS_KASBON: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:  { label: "Menunggu Persetujuan", color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved: { label: "Disetujui", color: C.green, bg: C.greenBg, border: C.greenBorder },
  rejected: { label: "Ditolak", color: C.red, bg: C.redBg, border: C.redBorder },
  settled:  { label: "Settled", color: C.mid, bg: "var(--surface-subtle)", border: C.border },
};

export default function KasbonSayaPage() {
  // ⚠️ KODE MATI: /mandor hanya untuk admin (middleware.ts:53) — cabang
  // isMandor tak pernah jalan. Lihat laporan 2026-08-07.
  const isMandor = useSyncExternalStore(
    () => () => {},
    () => !hasPermission("mandor:assign"),
    () => true,
  );

  const { labelOf: kasbonPurposeLabel } = useKasbonPurposes(); // tujuan kasbon dari master (A4)
  const [mandorKasbons, setMandorKasbons] = useState<MandorKasbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitMandorKasbon, setShowSubmitMandorKasbon] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  useTutupEsc(lightboxPhoto ? () => setLightboxPhoto(null) : null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ kasbons: MandorKasbon[] }>("/api/v1/kasbons");
      setMandorKasbons(r.data.kasbons ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: memanggil `setLoading(true)`
  // di badan efek memicu render berantai (`react-hooks/set-state-in-effect`).
  // Pola yang sama dipakai `mandor/retensi` dan sudah lolos ratchet lint.
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const totalOut = mandorKasbons.reduce((s, k) => s + (["pending", "approved", "settled"].includes(k.status) ? Number(k.amount) : 0), 0);
  const totalSettled = mandorKasbons.filter(k => k.status === "settled").reduce((s, k) => s + Number(k.amount), 0);
  const outstanding = mandorKasbons.filter(k => k.status === "approved").reduce((s, k) => s + Number(k.amount), 0);

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: C.muted }}>{mandorKasbons.length} kasbon</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid }}>
          <RefreshCw size={14} /> Refresh
        </button>
        {/* ⚠️ KODE MATI: /mandor hanya untuk admin (middleware.ts:53) —
            cabang isMandor tak pernah jalan. Lihat laporan 2026-08-07. */}
        {isMandor && (
          <button onClick={() => setShowSubmitMandorKasbon(true)} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: C.yellow, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Ajukan Kasbon
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : (
        <>
          {/* Jalur berjalan total */}
          {mandorKasbons.length > 0 && (
            <div style={{ ...card, padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, background: C.navyLight, border: `1px solid ${C.blueBorder}` }}>
              {[
                { label: "Total Kasbon", value: fmt(totalOut), color: C.text },
                { label: "Sudah Settled", value: fmt(totalSettled), color: C.green },
                { label: "Belum Lunas", value: fmt(outstanding), color: outstanding > 0 ? C.red : C.mid },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: i === 1 ? "center" : i === 2 ? "right" : "left" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {mandorKasbons.length === 0 ? (
            <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
              <Banknote size={32} color={C.border} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada kasbon</div>
              <div style={{ fontSize: 12 }}>Klik &quot;Ajukan Kasbon&quot; untuk mengajukan kasbon baru</div>
            </div>
          ) : mandorKasbons.map(k => {
            const project = k.project ?? k.work_scopes?.mandor_assignments?.[0]?.projects;
            const st = STATUS_KASBON[k.status] ?? STATUS_KASBON.pending;
            return (
              <div key={k.id} style={{ ...card, padding: "12px 16px", border: `1px solid ${st.border}`, background: k.status === "pending" ? C.yellowBg : "var(--surface)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                      <span style={{ fontSize: 11, background: "var(--surface-hover)", color: C.mid, padding: "2px 8px", borderRadius: 6 }}>{kasbonPurposeLabel(k.purpose)}</span>
                      <span style={{ fontSize: 11, background: "var(--surface-hover)", color: C.mid, padding: "2px 8px", borderRadius: 6 }}>{k.fund_source === "owner_advance" ? "Dana Owner" : "Dana Klien"}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                      {k.work_scopes?.scope_name
                        ? <>{k.work_scopes.scope_name}{project && <span style={{ fontSize: 12, color: C.mid, fontWeight: 400 }}> · {project.name}</span>}</>
                        : <span style={{ fontWeight: 400, color: C.mid }}>{project?.name ?? "Kasbon Umum"}</span>
                      }
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {new Date(k.kasbon_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                      {k.approver && k.status === "approved" && (
                        <span style={{ marginLeft: 10 }}>· Disetujui oleh {k.approver.name}</span>
                      )}
                    </div>
                    {k.cash_account && k.status === "approved" && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                        <Banknote size={10} /> {k.cash_account.name}
                      </div>
                    )}
                    {k.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>&quot;{k.notes}&quot;</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: k.status === "pending" ? C.yellow : k.status === "approved" ? C.green : C.mid, fontFamily: "monospace" }}>
                      {fmt(Number(k.amount))}
                    </div>
                    {k.status === "pending" && (
                      <div style={{ fontSize: 11, color: C.muted }}>menunggu approval</div>
                    )}
                    {k.photo_url && (
                      <button aria-label="Lihat foto nota" type="button" onClick={() => setLightboxPhoto(k.photo_url!)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.blue, display: "flex", alignItems: "center", gap: 2, fontSize: 11 }} title="Lihat foto nota">
                        <Camera size={12} /> Foto Nota
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {showSubmitMandorKasbon && (
        <SubmitMandorKasbonModal
          onClose={() => setShowSubmitMandorKasbon(false)}
          onSuccess={() => { setShowSubmitMandorKasbon(false); load(); }}
        />
      )}

      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          {/* `<img>`, bukan `next/image`: sumbernya URL bertanda tangan dari
              Supabase Storage yang berumur pendek dan tak bisa dioptimasi di
              muka. Pola pengecualian yang sama dipakai `photo-gallery.tsx`. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxPhoto} alt="Foto nota" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 6, boxShadow: "var(--naik-3)" }} />
          <button aria-label="Tutup foto" onClick={() => setLightboxPhoto(null)}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", color: "var(--surface)", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
