"use client";

/**
 * RANTAI KONTRAK — EOT, denda keterlambatan (LD), dan register jaminan.
 * ROADMAP #16 · migrasi 152.
 *
 * ── Kenapa ketiganya satu section, bukan tiga
 *
 * Bukan penghematan tempat: ketiganya satu rantai sebab-akibat. EOT yang
 * disetujui MENGGESER tanggal selesai, yang MENGUBAH denda, dan denda yang
 * menyentuh batas adalah alasan jaminan pelaksanaan bisa dicairkan. Menampilkan
 * dendanya tanpa EOT di sebelahnya membuat angka itu terlihat final padahal
 * satu persetujuan bisa menghapusnya.
 *
 * ── Yang paling dijaga di tampilan
 *
 * **Estimasi tak boleh terlihat seperti angka final.** Selama proyek belum
 * selesai, LD bertambah tiap hari. Angka yang tampak final padahal masih
 * bergerak mengundang penagihan yang keliru — jadi labelnya ditempel di dekat
 * angkanya, bukan sebagai catatan kaki.
 *
 * **Pengajuan EOT yang menggantung ditampilkan bersama dendanya.** Denda
 * Rp 50 juta dengan 2 pengajuan belum diputus adalah keadaan yang sangat
 * berbeda dari Rp 50 juta yang sudah pasti.
 *
 * ── Warna DAN teks
 *
 * WCAG 1.4.1. Pemakai membaca ini di layar HP di lapangan; perbedaan warna
 * tipis praktis hilang di bawah sinar matahari.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock, ShieldCheck, AlertTriangle, Plus, Check, X, Clock,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

const C = {
  navy: "var(--navy)", text: "var(--text-primary)", mid: "var(--text-secondary)",
  muted: "var(--text-muted)", border: "var(--border)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
};

type StatusEOT = "diajukan" | "disetujui" | "ditolak";

interface EOT {
  id: string; eot_number: string | null;
  days_requested: number; days_approved: number | null;
  reason: string; status: StatusEOT;
  submitted_at: string; decided_at: string | null; decision_note: string | null;
}

interface MetaEOT {
  tanggalAsli: string; tanggalEfektif: string;
  totalHariEOT: number; eotMenggantung: number;
}

interface HasilLD {
  adaDenda: boolean; hariTelat: number;
  dasarPerhitungan: number; dendaSebelumBatas: number;
  batasNominal: number; denda: number; kenaBatas: boolean;
  otoritatif: boolean; alasan: string | null;
  tanggal: MetaEOT;
}

interface Bond {
  id: string; bond_type: string; bond_number: string | null;
  issuer: string | null; amount: number;
  issued_date: string; expiry_date: string; status: string;
}

interface MetaBond {
  totalAktif: number; jumlahAktif: number;
  segeraKadaluarsa: Array<Bond & { sisaHari: number }>;
  telatDiperbarui: Bond[];
}

const JENIS_BOND: Record<string, string> = {
  penawaran: "Jaminan penawaran", pelaksanaan: "Jaminan pelaksanaan",
  uang_muka: "Jaminan uang muka", pemeliharaan: "Jaminan pemeliharaan",
};

const STATUS_EOT: Record<StatusEOT, { teks: string; warna: string; bg: string; border: string }> = {
  diajukan:  { teks: "Menunggu keputusan", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  disetujui: { teks: "Disetujui",          warna: C.green,  bg: C.greenBg,  border: C.greenBorder },
  ditolak:   { teks: "Ditolak",            warna: C.red,    bg: C.redBg,    border: C.redBorder },
};

const fmtRp = (n: number | null) =>
  n == null ? "—"
  : n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function RantaiKontrakSection({ projectId }: { projectId: string }) {
  const [eot, setEot] = useState<EOT[]>([]);
  const [metaEot, setMetaEot] = useState<MetaEOT | null>(null);
  const [ld, setLd] = useState<HasilLD | null>(null);
  const [labelLd, setLabelLd] = useState<string>("");
  const [peringatanLd, setPeringatanLd] = useState<string | null>(null);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [metaBond, setMetaBond] = useState<MetaBond | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formEot, setFormEot] = useState(false);
  const [formBond, setFormBond] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      api.get<{ data: EOT[]; meta: MetaEOT }>(`/api/v1/projects/${projectId}/eot`, { signal }),
      api.get<{ data: HasilLD; meta: { label: string; peringatan: string | null } }>(
        `/api/v1/projects/${projectId}/liquidated-damages`, { signal }),
      api.get<{ data: Bond[]; meta: MetaBond }>(
        `/api/v1/bonds?project_id=${projectId}`, { signal }),
    ])
      .then(([e, l, b]) => {
        setEot(e.data.data ?? []); setMetaEot(e.data.meta);
        setLd(l.data.data); setLabelLd(l.data.meta.label);
        setPeringatanLd(l.data.meta.peringatan);
        setBonds(b.data.data ?? []); setMetaBond(b.data.meta);
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat data kontrak"); })
      .finally(() => setMemuat(false));
  }, [projectId]);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  /** Muat ulang dari handler — di sini spinner boleh dinyalakan. */
  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  async function putuskan(id: string, status: "disetujui" | "ditolak") {
    const hari = status === "disetujui"
      ? window.prompt("Berapa hari yang disetujui? (kosongkan = sesuai pengajuan)")
      : null;
    try {
      await api.patch(`/api/v1/eot/${id}/decide`, {
        status,
        days_approved: hari ? Number(hari) : undefined,
      });
      muatUlang();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setGalat(e?.response?.data?.error ?? "Gagal menyimpan keputusan");
    }
  }

  async function ubahStatusBond(b: Bond, status: "dikembalikan" | "dicairkan") {
    // Pencairan = uang keluar dan tak bisa dibatalkan dari sini. Konfirmasi
    // menyebut nilainya, bukan sekadar "yakin?" — angka yang terlihat saat
    // memutuskan jauh lebih berguna daripada pertanyaan umum.
    const pesan = status === "dicairkan"
      ? `Tandai ${JENIS_BOND[b.bond_type] ?? b.bond_type} senilai ${fmtRp(b.amount)} sebagai DICAIRKAN?\n\nIni berarti pemberi kerja menarik jaminan — uang perusahaan keluar.`
      : `Tandai ${JENIS_BOND[b.bond_type] ?? b.bond_type} senilai ${fmtRp(b.amount)} sebagai dikembalikan?`;
    if (!window.confirm(pesan)) return;

    try {
      await api.patch(`/api/v1/bonds/${b.id}`, {
        status,
        released_at: new Date().toISOString().slice(0, 10),
      });
      muatUlang();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setGalat(e?.response?.data?.error ?? "Gagal memperbarui status jaminan");
    }
  }

  if (memuat) {
    return <p style={{ color: C.muted, fontSize: 13, padding: "16px 0" }}>Memuat data kontrak…</p>;
  }

  return (
    <section style={{
      borderRadius: 12, border: `1px solid ${C.border}`,
      background: C.surface, padding: 18, marginTop: 20,
    }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
            Rantai Kontrak
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.mid }}>
            Perpanjangan waktu, denda keterlambatan, dan jaminan — ketiganya saling terkait.
          </p>
        </div>
        <button
          onClick={() => setFormEot((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px",
            borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface,
            color: C.navy, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={14} aria-hidden="true" /> Ajukan EOT
        </button>
      </header>

      {galat && (
        <div role="alert" style={{
          display: "flex", gap: 8, padding: "10px 13px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 12.5, marginBottom: 12,
        }}>
          <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          {galat}
        </div>
      )}

      {formEot && (
        <FormEOT projectId={projectId} onSelesai={() => { setFormEot(false); muatUlang(); }}
          onBatal={() => setFormEot(false)} />
      )}

      {/* ── Tanggal & denda ─────────────────────────────────────────────── */}
      {ld && metaEot && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-subtle)", border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <CalendarClock size={13} color={C.mid} aria-hidden="true" />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Tanggal selesai
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              {fmtTgl(metaEot.tanggalEfektif)}
            </div>
            {metaEot.totalHariEOT > 0 ? (
              <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>
                kontrak {fmtTgl(metaEot.tanggalAsli)} + <strong>{metaEot.totalHariEOT} hari</strong> EOT disetujui
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>sesuai kontrak, belum ada EOT disetujui</div>
            )}
          </div>

          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: ld.adaDenda ? C.redBg : "var(--surface-subtle)",
            border: `1px solid ${ld.adaDenda ? C.redBorder : C.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <AlertTriangle size={13} color={ld.adaDenda ? C.red : C.mid} aria-hidden="true" />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: ld.adaDenda ? C.red : C.mid, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Denda keterlambatan
              </span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
              {ld.adaDenda ? fmtRp(ld.denda) : "Tidak ada"}
            </div>
            {ld.adaDenda ? (
              <>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>
                  {ld.hariTelat} hari telat
                  {ld.kenaBatas && <> · <strong>sudah menyentuh batas {fmtRp(ld.batasNominal)}</strong></>}
                </div>
                {/* Label estimasi ditempel DI DEKAT angkanya, bukan catatan kaki —
                    catatan kaki tak pernah dibaca sebelum keputusan diambil. */}
                {!ld.otoritatif && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6,
                    padding: "2px 7px", borderRadius: 20, fontSize: 10,
                    fontWeight: 700, color: C.yellow, background: C.yellowBg,
                    border: `1px solid ${C.yellowBorder}`,
                  }}>
                    <Clock size={9} aria-hidden="true" /> ESTIMASI — masih bertambah
                  </div>
                )}
              </>
            ) : (
              // "Rp 0" ambigu: tak telat? tak aktif? diputihkan? Alasannya wajib.
              <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>{ld.alasan}</div>
            )}
          </div>

          {metaBond && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-subtle)", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <ShieldCheck size={13} color={C.mid} aria-hidden="true" />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Jaminan aktif
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtRp(metaBond.totalAktif)}</div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>
                {metaBond.jumlahAktif} jaminan berlaku
              </div>
            </div>
          )}
        </div>
      )}

      {/* Peringatan EOT menggantung — ditampilkan bersama denda, karena satu
          persetujuan bisa mengubah angkanya. */}
      {peringatanLd && (
        <div style={{
          display: "flex", gap: 8, padding: "9px 13px", borderRadius: 8,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
          color: C.text, fontSize: 12, marginBottom: 14,
        }}>
          <Clock size={13} color={C.yellow} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          {peringatanLd}
        </div>
      )}

      {/* Jaminan yang segera kadaluarsa — uang yang bisa hangus. */}
      {metaBond && (metaBond.segeraKadaluarsa.length > 0 || metaBond.telatDiperbarui.length > 0) && (
        <div style={{
          padding: "11px 13px", borderRadius: 8, background: C.redBg,
          border: `1px solid ${C.redBorder}`, marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 5 }}>
            Jaminan perlu tindakan
          </div>
          {metaBond.segeraKadaluarsa.map((b) => (
            <div key={b.id} style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
              {JENIS_BOND[b.bond_type] ?? b.bond_type} {fmtRp(b.amount)} — kadaluarsa{" "}
              <strong>{b.sisaHari} hari lagi</strong> ({fmtTgl(b.expiry_date)})
            </div>
          ))}
          {metaBond.telatDiperbarui.map((b) => (
            <div key={b.id} style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
              {JENIS_BOND[b.bond_type] ?? b.bond_type} {fmtRp(b.amount)} — sudah lewat{" "}
              {fmtTgl(b.expiry_date)} tapi status masih aktif, perlu diperiksa
            </div>
          ))}
        </div>
      )}

      {/* ── Daftar EOT ──────────────────────────────────────────────────── */}
      <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.text }}>
        Perpanjangan waktu (EOT)
      </h3>
      {eot.length === 0 ? (
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px" }}>
          Belum ada pengajuan perpanjangan waktu.
        </p>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)" }}>
                {["Nomor", "Diajukan", "Hari", "Alasan", "Status", ""].map((h, i) => (
                  <th key={i} scope="col" style={{
                    padding: "8px 11px", textAlign: "left", fontSize: 10.5, fontWeight: 700,
                    color: C.mid, textTransform: "uppercase", letterSpacing: 0.4,
                    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eot.map((e) => {
                const s = STATUS_EOT[e.status];
                return (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 11px", color: C.text, whiteSpace: "nowrap" }}>
                      {e.eot_number ?? <span style={{ color: C.muted }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 11px", color: C.mid, whiteSpace: "nowrap" }}>
                      {fmtTgl(e.submitted_at)}
                    </td>
                    <td style={{ padding: "8px 11px", color: C.text, whiteSpace: "nowrap" }}>
                      {e.status === "disetujui" && e.days_approved != null
                        ? <>
                            <strong>{e.days_approved} hari</strong>
                            {e.days_approved !== e.days_requested && (
                              // Perbedaan diajukan vs disetujui adalah informasi
                              // penting: pemberi kerja sering menyetujui lebih sedikit.
                              <span style={{ color: C.muted, fontSize: 11 }}> (diajukan {e.days_requested})</span>
                            )}
                          </>
                        : <span style={{ color: C.mid }}>{e.days_requested} hari diajukan</span>}
                    </td>
                    <td style={{ padding: "8px 11px", color: C.mid, maxWidth: 220 }}>{e.reason}</td>
                    <td style={{ padding: "8px 11px", whiteSpace: "nowrap" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                        color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
                      }}>{s.teks}</span>
                    </td>
                    <td style={{ padding: "8px 11px", whiteSpace: "nowrap" }}>
                      {e.status === "diajukan" && (
                        <span style={{ display: "inline-flex", gap: 5 }}>
                          <button onClick={() => putuskan(e.id, "disetujui")}
                            aria-label={`Setujui EOT ${e.eot_number ?? e.reason.slice(0, 24)}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: `1px solid ${C.greenBorder}`, background: C.greenBg,
                              color: C.green, cursor: "pointer",
                            }}>
                            <Check size={11} aria-hidden="true" /> Setujui
                          </button>
                          <button onClick={() => putuskan(e.id, "ditolak")}
                            aria-label={`Tolak EOT ${e.eot_number ?? e.reason.slice(0, 24)}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: `1px solid ${C.border}`, background: C.surface,
                              color: C.mid, cursor: "pointer",
                            }}>
                            <X size={11} aria-hidden="true" /> Tolak
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Register jaminan ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text }}>
          Register jaminan
        </h3>
        <button
          onClick={() => setFormBond((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px",
            borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface,
            color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={13} aria-hidden="true" /> Catat jaminan
        </button>
      </div>

      {formBond && (
        <FormBond projectId={projectId} onSelesai={() => { setFormBond(false); muatUlang(); }}
          onBatal={() => setFormBond(false)} />
      )}

      {bonds.length === 0 ? (
        <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>
          Belum ada jaminan tercatat untuk proyek ini.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)" }}>
                {["Jenis", "Nomor", "Penerbit", "Nilai", "Berlaku s.d.", "Status", ""].map((h, i) => (
                  <th key={i} scope="col" style={{
                    padding: "8px 11px", textAlign: i === 3 ? "right" : "left",
                    fontSize: 10.5, fontWeight: 700, color: C.mid,
                    textTransform: "uppercase", letterSpacing: 0.4,
                    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bonds.map((b) => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "8px 11px", color: C.text }}>{JENIS_BOND[b.bond_type] ?? b.bond_type}</td>
                  <td style={{ padding: "8px 11px", color: C.mid }}>{b.bond_number ?? "—"}</td>
                  <td style={{ padding: "8px 11px", color: C.mid }}>{b.issuer ?? "—"}</td>
                  <td style={{ padding: "8px 11px", textAlign: "right", fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
                    {fmtRp(b.amount)}
                  </td>
                  <td style={{ padding: "8px 11px", color: C.mid, whiteSpace: "nowrap" }}>{fmtTgl(b.expiry_date)}</td>
                  <td style={{ padding: "8px 11px", whiteSpace: "nowrap" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                      color: b.status === "aktif" ? C.green : C.mid,
                      background: b.status === "aktif" ? C.greenBg : "var(--surface-subtle)",
                      border: `1px solid ${b.status === "aktif" ? C.greenBorder : C.border}`,
                    }}>
                      {b.status === "aktif" ? "Aktif"
                        : b.status === "dikembalikan" ? "Dikembalikan"
                        : b.status === "dicairkan" ? "Dicairkan" : "Kadaluarsa"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 11px", whiteSpace: "nowrap" }}>
                    {b.status === "aktif" && (
                      <span style={{ display: "inline-flex", gap: 5 }}>
                        <button
                          onClick={() => ubahStatusBond(b, "dikembalikan")}
                          aria-label={`Tandai ${JENIS_BOND[b.bond_type] ?? b.bond_type} ${b.bond_number ?? ""} sebagai dikembalikan`}
                          style={{
                            padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                            border: `1px solid ${C.border}`, background: C.surface,
                            color: C.mid, cursor: "pointer",
                          }}>
                          Dikembalikan
                        </button>
                        <button
                          onClick={() => ubahStatusBond(b, "dicairkan")}
                          aria-label={`Tandai ${JENIS_BOND[b.bond_type] ?? b.bond_type} ${b.bond_number ?? ""} sebagai dicairkan`}
                          style={{
                            padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                            border: `1px solid ${C.redBorder}`, background: C.redBg,
                            color: C.red, cursor: "pointer",
                          }}>
                          Dicairkan
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {labelLd && (
        <p style={{ margin: "12px 0 0", fontSize: 11, color: C.muted }}>{labelLd}</p>
      )}
    </section>
  );
}

function FormBond({ projectId, onSelesai, onBatal }: {
  projectId: string; onSelesai: () => void; onBatal: () => void;
}) {
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSimpan(true); setGalat(null);
    try {
      await api.post("/api/v1/bonds", {
        project_id: projectId,
        bond_type: f.get("bond_type"),
        bond_number: f.get("bond_number") || null,
        issuer: f.get("issuer") || null,
        amount: Number(f.get("amount") || 0),
        issued_date: f.get("issued_date"),
        expiry_date: f.get("expiry_date"),
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan jaminan");
    } finally {
      setSimpan(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 7,
    border: `1px solid ${C.border}`, fontSize: 12.5, background: C.surface,
    color: C.text, boxSizing: "border-box",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 3,
  };

  return (
    <form onSubmit={kirim} style={{
      padding: 14, borderRadius: 10, border: `1px solid ${C.border}`,
      background: "var(--surface-subtle)", marginBottom: 12,
    }}>
      {galat && (
        <div role="alert" style={{
          padding: "8px 11px", borderRadius: 7, background: C.redBg,
          border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 12, marginBottom: 10,
        }}>{galat}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div>
          <label htmlFor="bond_type" style={label}>Jenis jaminan *</label>
          <select id="bond_type" name="bond_type" defaultValue="pelaksanaan" style={input}>
            {Object.entries(JENIS_BOND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bond_number" style={label}>Nomor jaminan</label>
          <input id="bond_number" name="bond_number" style={input} />
        </div>
        <div>
          <label htmlFor="issuer" style={label}>Penerbit (bank/asuransi)</label>
          <input id="issuer" name="issuer" style={input} />
        </div>
        <div>
          <label htmlFor="amount" style={label}>Nilai (Rp) *</label>
          <input id="amount" name="amount" type="number" min="0" required style={input} />
        </div>
        <div>
          <label htmlFor="issued_date" style={label}>Tanggal terbit *</label>
          <input id="issued_date" name="issued_date" type="date" required style={input} />
        </div>
        <div>
          <label htmlFor="expiry_date" style={label}>Berlaku sampai *</label>
          <input id="expiry_date" name="expiry_date" type="date" required style={input} />
          <span style={{ fontSize: 10.5, color: C.muted, display: "block", marginTop: 3 }}>
            Akan diperingatkan 30 hari sebelum kadaluarsa.
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
        <button type="submit" disabled={simpan} style={{
          padding: "7px 15px", borderRadius: 7, border: "none", background: C.navy,
          color: "#fff", fontSize: 12.5, fontWeight: 600,
          cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>{simpan ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" onClick={onBatal} style={{
          padding: "7px 15px", borderRadius: 7, border: `1px solid ${C.border}`,
          background: C.surface, color: C.mid, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        }}>Batal</button>
      </div>
    </form>
  );
}

function FormEOT({ projectId, onSelesai, onBatal }: {
  projectId: string; onSelesai: () => void; onBatal: () => void;
}) {
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSimpan(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${projectId}/eot`, {
        eot_number: f.get("eot_number") || null,
        days_requested: Number(f.get("days_requested") || 0),
        reason: f.get("reason"),
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan pengajuan");
    } finally {
      setSimpan(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 7,
    border: `1px solid ${C.border}`, fontSize: 12.5, background: C.surface,
    color: C.text, boxSizing: "border-box",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 3,
  };

  return (
    <form onSubmit={kirim} style={{
      padding: 14, borderRadius: 10, border: `1px solid ${C.border}`,
      background: "var(--surface-subtle)", marginBottom: 14,
    }}>
      {galat && (
        <div role="alert" style={{
          padding: "8px 11px", borderRadius: 7, background: C.redBg,
          border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 12, marginBottom: 10,
        }}>{galat}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div>
          <label htmlFor="eot_number" style={label}>Nomor EOT (dari pemberi kerja)</label>
          <input id="eot_number" name="eot_number" style={input} />
        </div>
        <div>
          <label htmlFor="days_requested" style={label}>Hari diajukan *</label>
          <input id="days_requested" name="days_requested" type="number" min="0" required style={input} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label htmlFor="reason" style={label}>Alasan perpanjangan * (min. 10 karakter)</label>
        <input id="reason" name="reason" required minLength={10}
          placeholder="mis. curah hujan ekstrem 12 hari berturut-turut" style={input} />
        <span style={{ fontSize: 10.5, color: C.muted, display: "block", marginTop: 3 }}>
          Ini yang menjadi dasar saat denda keterlambatan dibatalkan — akan diperiksa pemberi kerja.
        </span>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
        <button type="submit" disabled={simpan} style={{
          padding: "7px 15px", borderRadius: 7, border: "none", background: C.navy,
          color: "#fff", fontSize: 12.5, fontWeight: 600,
          cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>
          {simpan ? "Menyimpan…" : "Ajukan"}
        </button>
        <button type="button" onClick={onBatal} style={{
          padding: "7px 15px", borderRadius: 7, border: `1px solid ${C.border}`,
          background: C.surface, color: C.mid, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        }}>Batal</button>
      </div>
    </form>
  );
}
