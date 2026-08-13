"use client";

/**
 * KLAIM KONTRAKTUAL — biaya tambahan yang LINGKUPNYA TIDAK berubah.
 * INTI #4 · migrasi 184.
 *
 * ── Kenapa di sini, bersama rantai kontrak
 *
 * Klaim adalah pilar KETIGA rantai yang sudah ada: change order (lingkup
 * bertambah) · EOT (waktu bergeser) · klaim (biaya naik, lingkup tetap).
 * Menampilkannya di halaman terpisah membuat ketiganya terbaca sebagai tiga
 * urusan administratif, padahal satu peristiwa sering memicu dua atau tiga
 * sekaligus — lahan terlambat diserahkan menimbulkan klaim biaya DAN EOT.
 *
 * ── Yang paling dijaga di tampilan
 *
 * **Batas waktu pemberitahuan, bukan nilai klaimnya.** Di meja perundingan,
 * klaim jarang gugur karena angkanya salah — ia gugur karena TERLAMBAT
 * DIBERITAHUKAN. Karena itu yang tampil paling atas bukan total rupiah,
 * melainkan berapa klaim yang tenggatnya sedang berjalan.
 *
 * **`gugur` dibedakan dari `ditolak`, dengan warna DAN kata.** Ditolak = owner
 * menilai tak berdasar. Gugur = mungkin sah, tapi kita terlambat. Yang kedua
 * bisa diperbaiki dengan disiplin; menyamakannya menghapus satu-satunya cara
 * melihat berapa uang hilang karena kelalaian sendiri.
 *
 * ── Warna DAN teks (WCAG 1.4.1)
 *
 * Tiap status membawa label tertulis, bukan hanya warna. Halaman ini dibaca
 * juga di layar HP di lapangan, tempat perbedaan warna tipis praktis hilang.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Scale, Plus, AlertTriangle, Clock, CheckCircle2, XCircle, Ban,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

const C = {
  navy: "var(--navy)", text: "var(--text-primary)", mid: "var(--text-secondary)",
  muted: "var(--text-muted)", border: "var(--border)", surface: "var(--surface)",
  subtle: "var(--surface-subtle)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
};

type StatusKlaim =
  | "draft" | "diberitahukan" | "diajukan"
  | "disetujui" | "disetujui_sebagian" | "ditolak" | "gugur";

type KeadaanBatas =
  | "tak_diatur" | "aman" | "berjalan" | "mendesak" | "terlambat" | "tak_terbaca";

interface BatasPemberitahuan {
  keadaan: KeadaanBatas;
  sisaHari: number | null;
  hariTerpakai: number | null;
  pesan: string;
}

interface Klaim {
  id: string;
  claim_number: string;
  claim_type: string;
  title: string;
  description: string | null;
  event_date: string;
  notified_at: string | null;
  notice_days_limit: number | null;
  amount_claimed: number;
  amount_approved: number | null;
  status: StatusKlaim;
  decision_note: string | null;
  batas_pemberitahuan: BatasPemberitahuan;
}

interface Ringkas {
  jumlah: number;
  total_diklaim: number;
  total_disetujui: number;
  berisiko_gugur: number;
  mendesak: number;
}

// ─── Bahasa ──────────────────────────────────────────────────────────────────
// Ditulis sebagai yang diucapkan di rapat proyek, bukan sebagai nama kolom.

const JENIS: Record<string, string> = {
  keterlambatan_lahan: "Lahan terlambat diserahkan",
  keterlambatan_gambar: "Gambar terlambat / berubah",
  kondisi_tak_terduga: "Kondisi lapangan tak terduga",
  penghentian_sementara: "Penghentian sementara",
  percepatan: "Diminta mempercepat",
  force_majeure: "Force majeure",
  lain_lain: "Lain-lain",
};

const STATUS: Record<StatusKlaim, {
  teks: string; warna: string; bg: string; border: string; ikon: React.ReactNode;
}> = {
  draft:              { teks: "Draft",              warna: C.muted,  bg: C.subtle,   border: C.border,       ikon: <Clock size={12} /> },
  diberitahukan:      { teks: "Sudah diberitahukan", warna: C.blue,  bg: C.blueBg,   border: C.blueBorder,   ikon: <CheckCircle2 size={12} /> },
  diajukan:           { teks: "Menunggu keputusan", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder, ikon: <Clock size={12} /> },
  disetujui:          { teks: "Disetujui penuh",    warna: C.green,  bg: C.greenBg,  border: C.greenBorder,  ikon: <CheckCircle2 size={12} /> },
  disetujui_sebagian: { teks: "Disetujui sebagian", warna: C.green,  bg: C.greenBg,  border: C.greenBorder,  ikon: <CheckCircle2 size={12} /> },
  ditolak:            { teks: "Ditolak owner",      warna: C.red,    bg: C.redBg,    border: C.redBorder,    ikon: <XCircle size={12} /> },
  // GUGUR bukan sinonim ditolak — pakai ikon larangan, bukan silang, supaya
  // bedanya terbaca sebelum orang sempat membaca labelnya.
  gugur:              { teks: "Gugur — telat diberitahukan", warna: C.red, bg: C.redBg, border: C.redBorder, ikon: <Ban size={12} /> },
};

const fmtRp = (n: number | null) =>
  n == null ? "—"
  : n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Nada visual batas waktu. Ditentukan KEADAAN, bukan sisa hari mentah. */
function nadaBatas(b: BatasPemberitahuan): { warna: string; bg: string; teks: string } | null {
  switch (b.keadaan) {
    case "terlambat":
      return { warna: C.red, bg: C.redBg, teks: "Batas pemberitahuan LEWAT" };
    case "mendesak":
      return { warna: C.yellow, bg: C.yellowBg,
        teks: `Sisa ${b.sisaHari} hari untuk memberi tahu owner` };
    case "berjalan":
      return { warna: C.blue, bg: C.blueBg, teks: `Sisa ${b.sisaHari} hari` };
    case "aman":
      return { warna: C.green, bg: C.greenBg,
        teks: `Diberitahukan hari ke-${b.hariTerpakai}` };
    case "tak_diatur":
      // Sengaja TIDAK hijau: batas yang belum diisi bukan kepatuhan, melainkan
      // hal yang belum diketahui. Menghijaukannya adalah kepatuhan palsu.
      return { warna: C.muted, bg: C.subtle, teks: "Batas belum ditetapkan" };
    default:
      return null;
  }
}

export function KlaimSection({ projectId }: { projectId: string }) {
  const [klaim, setKlaim] = useState<Klaim[]>([]);
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formBuka, setFormBuka] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<{ data: Klaim[]; ringkas: Ringkas }>(
        `/api/v1/projects/${projectId}/claims`, { signal })
      .then((r) => {
        setKlaim(r.data.data ?? []);
        setRingkas(r.data.ringkas);
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat klaim"); })
      .finally(() => setMemuat(false));
  }, [projectId]);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  if (memuat) {
    return <p style={{ color: C.muted, fontSize: 13, padding: "16px 0" }}>Memuat klaim…</p>;
  }

  const adaRisiko = (ringkas?.berisiko_gugur ?? 0) > 0 || (ringkas?.mendesak ?? 0) > 0;

  return (
    <section style={{
      borderRadius: 12, border: `1px solid ${C.border}`,
      background: C.surface, padding: 18, marginTop: 20,
    }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", marginBottom: 14,
      }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 16, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display, inherit)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Scale size={16} aria-hidden="true" />
            Klaim biaya tambahan
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid, maxWidth: 460 }}>
            Biaya naik tanpa lingkup berubah — lahan terlambat, gambar berubah,
            kondisi lapangan di luar dugaan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormBuka((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            minHeight: 40, padding: "0 14px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={14} aria-hidden="true" /> Catat klaim
        </button>
      </header>

      {galat && (
        <p role="alert" style={{
          margin: "0 0 12px", padding: "10px 12px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 13,
        }}>{galat}</p>
      )}

      {/* ── Yang mendesak, DULUAN ──────────────────────────────────────────
          Bukan total rupiah. Klaim gugur karena telat diberitahukan, bukan
          karena angkanya salah — jadi itu yang harus terlihat lebih dulu. */}
      {adaRisiko && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px", borderRadius: 10, marginBottom: 14,
          background: (ringkas?.berisiko_gugur ?? 0) > 0 ? C.redBg : C.yellowBg,
          border: `1px solid ${(ringkas?.berisiko_gugur ?? 0) > 0 ? C.redBorder : C.yellowBorder}`,
        }}>
          <AlertTriangle
            size={16}
            color={(ringkas?.berisiko_gugur ?? 0) > 0 ? C.red : C.yellow}
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            {(ringkas?.berisiko_gugur ?? 0) > 0 && (
              <div style={{ fontWeight: 600, color: C.red }}>
                {ringkas!.berisiko_gugur} klaim lewat batas pemberitahuan dan belum diputus.
              </div>
            )}
            {(ringkas?.mendesak ?? 0) > 0 && (
              <div style={{ color: C.text }}>
                {ringkas!.mendesak} klaim harus diberitahukan ke owner dalam 3 hari ke depan.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ringkasan nilai ───────────────────────────────────────────────── */}
      {ringkas && ringkas.jumlah > 0 && (
        <div style={{
          display: "grid", gap: 10, marginBottom: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}>
          <Kotak label="Klaim tercatat" nilai={String(ringkas.jumlah)} />
          <Kotak label="Total diklaim" nilai={fmtRp(ringkas.total_diklaim)} />
          <Kotak
            label="Disetujui owner"
            nilai={fmtRp(ringkas.total_disetujui)}
            warna={ringkas.total_disetujui > 0 ? C.green : undefined}
          />
        </div>
      )}

      {klaim.length === 0 ? (
        <div style={{
          padding: "28px 16px", textAlign: "center",
          border: `1px dashed ${C.border}`, borderRadius: 10, background: C.subtle,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 600 }}>
            Belum ada klaim tercatat
          </p>
          <p style={{ margin: "6px auto 0", fontSize: 12, color: C.mid, maxWidth: 380, lineHeight: 1.55 }}>
            Catat begitu peristiwanya terjadi — bukan saat menagih. Kontrak
            biasanya memberi 14–28 hari untuk memberi tahu owner, dan klaim yang
            telat diberitahukan bisa gugur betapa pun sahnya.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {klaim.map((k) => {
            const s = STATUS[k.status] ?? STATUS.draft;
            const nada = nadaBatas(k.batas_pemberitahuan);
            const belumDiputus = ["draft", "diberitahukan", "diajukan"].includes(k.status);
            return (
              <li key={k.id} style={{
                border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 14, background: C.surface,
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  gap: 12, flexWrap: "wrap", alignItems: "flex-start",
                }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: C.navy,
                        fontVariantNumeric: "tabular-nums",
                      }}>{k.claim_number}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        {JENIS[k.claim_type] ?? k.claim_type}
                      </span>
                    </div>
                    <p style={{
                      margin: "5px 0 0", fontSize: 14, fontWeight: 600,
                      color: C.text, lineHeight: 1.4,
                    }}>{k.title}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>
                      Peristiwa {fmtTgl(k.event_date)}
                      {k.notified_at && ` · diberitahukan ${fmtTgl(k.notified_at)}`}
                    </p>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 700, color: C.text,
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-display, inherit)",
                    }}>{fmtRp(k.amount_claimed)}</div>
                    {k.amount_approved != null && (
                      <div style={{
                        fontSize: 12, color: C.green, marginTop: 2,
                        fontVariantNumeric: "tabular-nums",
                      }}>disetujui {fmtRp(k.amount_approved)}</div>
                    )}
                  </div>
                </div>

                <div style={{
                  display: "flex", gap: 8, flexWrap: "wrap",
                  marginTop: 10, alignItems: "center",
                }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
                  }}>
                    {s.ikon}{s.teks}
                  </span>

                  {/* Batas waktu hanya ditampilkan selama masih bisa
                      ditindaklanjuti. Pada klaim yang sudah diputus, ia cuma
                      kebisingan yang menutupi keputusannya. */}
                  {nada && belumDiputus && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      color: nada.warna, background: nada.bg,
                      border: `1px solid ${nada.warna}33`,
                    }}>
                      <Clock size={11} aria-hidden="true" />{nada.teks}
                    </span>
                  )}
                </div>

                {k.decision_note && (
                  <p style={{
                    margin: "10px 0 0", padding: "8px 10px", borderRadius: 8,
                    background: C.subtle, fontSize: 12, color: C.mid, lineHeight: 1.5,
                  }}>{k.decision_note}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {formBuka && (
        <FormKlaim
          projectId={projectId}
          onBatal={() => setFormBuka(false)}
          onSelesai={() => { setFormBuka(false); muatUlang(); }}
        />
      )}
    </section>
  );
}

function Kotak({ label, nilai, warna }: { label: string; nilai: string; warna?: string }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "10px 12px", background: C.subtle,
    }}>
      <div style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>{label}</div>
      <div style={{
        fontSize: 17, fontWeight: 700, marginTop: 3,
        color: warna ?? C.text, fontVariantNumeric: "tabular-nums",
        fontFamily: "var(--font-display, inherit)",
      }}>{nilai}</div>
    </div>
  );
}

/**
 * Form pencatatan klaim.
 *
 * Urutan medannya SENGAJA: peristiwa → batas → nilai. Itu urutan yang
 * menentukan sah-tidaknya klaim, dan menaruh nominal di atas membuat orang
 * mengisi angka lebih dulu lalu menebak tanggalnya — persis kebalikan dari
 * yang dibutuhkan saat klaim diperiksa.
 */
function FormKlaim({
  projectId, onBatal, onSelesai,
}: { projectId: string; onBatal: () => void; onSelesai: () => void }) {
  const [nomor, setNomor] = useState("");
  const [jenis, setJenis] = useState("keterlambatan_lahan");
  const [judul, setJudul] = useState("");
  const [tglPeristiwa, setTglPeristiwa] = useState(new Date().toISOString().slice(0, 10));
  const [batasHari, setBatasHari] = useState("14");
  const [tglBeritahu, setTglBeritahu] = useState("");
  const [nilai, setNilai] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${projectId}/claims`, {
        claim_number: nomor.trim(),
        claim_type: jenis,
        title: judul.trim(),
        event_date: tglPeristiwa,
        notice_days_limit: batasHari ? Number(batasHari) : null,
        notified_at: tglBeritahu || null,
        amount_claimed: Number(nilai || 0),
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan klaim");
    } finally {
      setSimpan(false);
    }
  }

  return (
    <form onSubmit={kirim} style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      border: `1px solid ${C.border}`, background: C.subtle,
      display: "grid", gap: 10,
    }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Medan label="Nomor klaim">
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            required placeholder="CL-001/PP/VIII" style={gayaInput} />
        </Medan>
        <Medan label="Jenis">
          {/* `aria-label` eksplisit meski sudah dibungkus <label>: penjaga
              a11y memeriksa secara statis dan tak bisa menelusuri pembungkus,
              dan nama yang tertulis di elemennya sendiri lebih tahan terhadap
              perubahan struktur di kemudian hari. */}
          <select
            value={jenis}
            onChange={(e) => setJenis(e.target.value)}
            aria-label="Jenis klaim"
            style={gayaInput}
          >
            {Object.entries(JENIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Medan>
      </div>

      <Medan label="Apa yang terjadi">
        <input value={judul} onChange={(e) => setJudul(e.target.value)}
          required minLength={10}
          placeholder="Lahan blok B terlambat diserahkan 30 hari"
          style={gayaInput} />
      </Medan>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Medan label="Tanggal peristiwa">
          <input type="date" value={tglPeristiwa}
            onChange={(e) => setTglPeristiwa(e.target.value)} required style={gayaInput} />
        </Medan>
        <Medan label="Batas beri tahu (hari)" petunjuk="Menurut kontrak">
          <input type="number" min={0} value={batasHari}
            onChange={(e) => setBatasHari(e.target.value)} style={gayaInput} />
        </Medan>
        <Medan label="Sudah diberitahukan" petunjuk="Kosongkan bila belum">
          <input type="date" value={tglBeritahu}
            onChange={(e) => setTglBeritahu(e.target.value)} style={gayaInput} />
        </Medan>
      </div>

      <Medan label="Nilai klaim (Rp)">
        <input type="number" min={0} value={nilai}
          onChange={(e) => setNilai(e.target.value)} required
          placeholder="250000000" style={gayaInput} />
      </Medan>

      {galat && (
        <p role="alert" style={{
          margin: 0, padding: "9px 11px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 12.5,
        }}>{galat}</p>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onBatal} style={{
          minHeight: 40, padding: "0 14px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: C.surface,
          color: C.mid, fontSize: 13, cursor: "pointer",
        }}>Batal</button>
        <button type="submit" disabled={simpan} style={{
          minHeight: 40, padding: "0 16px", borderRadius: 8, border: "none",
          background: "var(--grad-aksen)", color: "var(--on-navy)",
          fontSize: 13, fontWeight: 600,
          cursor: simpan ? "progress" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>{simpan ? "Menyimpan…" : "Simpan klaim"}</button>
      </div>
    </form>
  );
}

const gayaInput: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "0 10px",
  borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 13,
};

function Medan({
  label, petunjuk, children,
}: { label: string; petunjuk?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{
        display: "block", fontSize: 11.5, fontWeight: 600,
        color: C.mid, marginBottom: 4,
      }}>
        {label}
        {petunjuk && (
          <span style={{ fontWeight: 400, color: C.muted }}> · {petunjuk}</span>
        )}
      </span>
      {children}
    </label>
  );
}
