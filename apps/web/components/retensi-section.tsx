"use client";

/**
 * RETENSI SUBKONTRAK — jaminan yang ditahan dari pembayaran mandor.
 * INTI #3 · migrasi 183.
 *
 * ── Bentuknya NERACA, bukan tabel
 *
 * Pertanyaan yang dibawa orang ke halaman ini selalu sama, dan cuma satu:
 * *"berapa uang mandor yang masih kami tahan?"* Tabel berkolom banyak menjawab
 * pertanyaan lain — kapan, oleh siapa, berapa persen — dan menyembunyikan yang
 * satu itu di antara sembilan kolom lain.
 *
 * Karena itu tiap baris ditampilkan sebagai batang dua sisi: bagian yang sudah
 * dicairkan dan bagian yang masih tertahan. Panjangnya sebanding nilai, jadi
 * scope dengan retensi besar terlihat besar tanpa perlu membaca angkanya.
 *
 * ── Yang paling dijaga
 *
 * **Retensi yang tak pernah dicairkan adalah kerugian mandor, dan itu tak
 * terlihat dari sisi kontraktor.** Uangnya tetap di kas kita; tak ada yang
 * menagih. Karena itu scope yang sudah SELESAI tapi retensinya masih penuh
 * ditandai terpisah — itu satu-satunya cara keadaan itu terlihat sama sekali.
 *
 * **Nol retensi tidak disembunyikan.** Scope tanpa retensi ditampilkan sebagai
 * "tidak ada kesepakatan retensi", bukan dihilangkan dari daftar. Yang hilang
 * dari layar terbaca sebagai belum diatur, dan orang akan mengaturnya dua kali.
 *
 * ── Warna DAN teks (WCAG 1.4.1)
 */

import { useCallback, useEffect, useState } from "react";
import { PiggyBank, AlertTriangle, HandCoins, CheckCircle2 } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

const C = {
  navy: "var(--navy)", text: "var(--text-primary)", mid: "var(--text-secondary)",
  muted: "var(--text-muted)", border: "var(--border)", surface: "var(--surface)",
  subtle: "var(--surface-subtle)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
};

interface Ringkas { id: string; name: string }

interface BarisRetensi {
  work_scope_id: string;
  scope_name: string | null;
  status: string | null;
  retensi_pct: number | string | null;
  mandor: Ringkas | null;
  project: Ringkas | null;
  ditahan: number;
  dicairkan: number;
  outstanding: number;
}

interface RingkasRetensi {
  total_ditahan: number;
  total_dicairkan: number;
  total_outstanding: number;
}

const fmtRp = (n: number) =>
  n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export function RetensiSection() {
  const [baris, setBaris] = useState<BarisRetensi[]>([]);
  const [ringkas, setRingkas] = useState<RingkasRetensi | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cairkanUntuk, setCairkanUntuk] = useState<BarisRetensi | null>(null);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<{ scopes: BarisRetensi[] } & RingkasRetensi>(
        "/api/v1/mandor/retensi-register", { signal })
      .then((r) => {
        setBaris(r.data.scopes ?? []);
        setRingkas({
          total_ditahan: r.data.total_ditahan ?? 0,
          total_dicairkan: r.data.total_dicairkan ?? 0,
          total_outstanding: r.data.total_outstanding ?? 0,
        });
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat retensi"); })
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  if (memuat) {
    return <p style={{ color: C.muted, fontSize: 13, padding: "16px 0" }}>Memuat retensi…</p>;
  }

  // Scope yang pekerjaannya SUDAH selesai tapi retensinya masih utuh —
  // keadaan yang merugikan mandor dan tak terlihat dari sisi kita.
  const selesaiTapiTertahan = baris.filter(
    (b) => b.status === "selesai" && b.outstanding > 0);

  return (
    <section>
      <header style={{ marginBottom: 14 }}>
        <h2 style={{
          margin: 0, fontSize: 16, fontWeight: 700, color: C.text,
          fontFamily: "var(--font-display, inherit)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <PiggyBank size={16} aria-hidden="true" />
          Retensi mandor
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid, maxWidth: 520 }}>
          Jaminan pemeliharaan yang ditahan dari tiap pembayaran progres, dan
          dicairkan setelah masa pemeliharaan lewat.
        </p>
      </header>

      {galat && (
        <p role="alert" style={{
          margin: "0 0 12px", padding: "10px 12px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 13,
        }}>{galat}</p>
      )}

      {ringkas && (
        <div style={{
          display: "grid", gap: 10, marginBottom: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}>
          <Kotak label="Pernah ditahan" nilai={fmtRp(ringkas.total_ditahan)} />
          <Kotak label="Sudah dicairkan" nilai={fmtRp(ringkas.total_dicairkan)} warna={C.green} />
          <Kotak
            label="Masih kami tahan"
            nilai={fmtRp(ringkas.total_outstanding)}
            warna={ringkas.total_outstanding > 0 ? C.yellow : undefined}
            tebal
          />
        </div>
      )}

      {selesaiTapiTertahan.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px", borderRadius: 10, marginBottom: 14,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
        }}>
          <AlertTriangle size={16} color={C.yellow} aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            <strong>{selesaiTapiTertahan.length} pekerjaan sudah selesai</strong> tapi
            retensinya belum dicairkan. Mandor tak bisa melihat ini dari sisinya —
            tak akan ada yang menagih.
          </div>
        </div>
      )}

      {baris.length === 0 ? (
        <div style={{
          padding: "28px 16px", textAlign: "center",
          border: `1px dashed ${C.border}`, borderRadius: 10, background: C.subtle,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 600 }}>
            Belum ada retensi tertahan
          </p>
          <p style={{ margin: "6px auto 0", fontSize: 12, color: C.mid, maxWidth: 400, lineHeight: 1.55 }}>
            Retensi mulai tercatat setelah ada pembayaran progres yang disetujui
            pada scope yang persen retensinya sudah diisi.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {baris.map((b) => {
            const total = b.ditahan || 1;
            const pctCair = Math.min(100, (b.dicairkan / total) * 100);
            const lunas = b.outstanding <= 0 && b.ditahan > 0;
            return (
              <li key={b.work_scope_id} style={{
                border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 14, background: C.surface,
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  gap: 12, flexWrap: "wrap", alignItems: "flex-start",
                }}>
                  <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>
                      {b.scope_name ?? "Scope tanpa nama"}
                    </p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: C.mid }}>
                      {b.mandor?.name ?? "Mandor tak diketahui"}
                      {b.project?.name && ` · ${b.project.name}`}
                      {b.retensi_pct != null && ` · retensi ${b.retensi_pct}%`}
                    </p>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 700,
                      color: lunas ? C.green : C.yellow,
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-display, inherit)",
                    }}>{lunas ? "Lunas" : fmtRp(b.outstanding)}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {lunas ? "seluruh retensi dicairkan" : "masih tertahan"}
                    </div>
                  </div>
                </div>

                {/* Batang dua sisi — proporsi dibaca sebelum angkanya. */}
                <div
                  role="img"
                  aria-label={
                    `Dari ${fmtRp(b.ditahan)} yang pernah ditahan, ` +
                    `${fmtRp(b.dicairkan)} sudah dicairkan dan ` +
                    `${fmtRp(b.outstanding)} masih tertahan.`
                  }
                  style={{
                    display: "flex", height: 8, borderRadius: 999,
                    overflow: "hidden", background: C.yellowBg, marginTop: 12,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div style={{
                    width: `${pctCair}%`, background: C.green,
                    transition: "width .4s ease",
                  }} />
                </div>

                <div style={{
                  display: "flex", justifyContent: "space-between",
                  gap: 10, marginTop: 7, fontSize: 11.5, color: C.mid,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={11} color={C.green} aria-hidden="true" />
                    Dicairkan {fmtRp(b.dicairkan)}
                  </span>
                  <span>dari {fmtRp(b.ditahan)}</span>
                </div>

                {!lunas && b.outstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => setCairkanUntuk(b)}
                    style={{
                      marginTop: 11, minHeight: 40, padding: "0 14px",
                      borderRadius: 8, border: `1px solid ${C.border}`,
                      background: C.surface, color: C.text,
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <HandCoins size={14} aria-hidden="true" /> Cairkan retensi
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cairkanUntuk && (
        <FormPencairan
          baris={cairkanUntuk}
          onBatal={() => setCairkanUntuk(null)}
          onSelesai={() => { setCairkanUntuk(null); muatUlang(); }}
        />
      )}
    </section>
  );
}

function Kotak({
  label, nilai, warna, tebal,
}: { label: string; nilai: string; warna?: string; tebal?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${tebal ? (warna ?? C.border) + "55" : C.border}`,
      borderRadius: 10, padding: "10px 12px",
      background: tebal && warna ? `${warna}0F` : C.subtle,
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
 * Form pencairan.
 *
 * Nilai diisi otomatis dengan SISA PENUH, bukan kosong. Pencairan sebagian
 * memang ada, tapi yang lazim adalah mencairkan seluruhnya sekaligus — dan
 * medan kosong membuat orang mengetik ulang angka yang sudah tertera di
 * layar, lalu salah ketik.
 */
function FormPencairan({
  baris, onBatal, onSelesai,
}: { baris: BarisRetensi; onBatal: () => void; onSelesai: () => void }) {
  const [nilai, setNilai] = useState(String(baris.outstanding));
  const [catatan, setCatatan] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setGalat(null);
    try {
      await api.post("/api/v1/mandor/retensi-releases", {
        work_scope_id: baris.work_scope_id,
        amount: Number(nilai),
        notes: catatan.trim() || undefined,
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal mencairkan retensi");
    } finally {
      setSimpan(false);
    }
  }

  return (
    <form onSubmit={kirim} style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      border: `1px solid ${C.border}`, background: C.subtle, display: "grid", gap: 10,
    }}>
      <p style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 600 }}>
        Cairkan retensi — {baris.scope_name ?? "scope"}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: C.mid }}>
        Masih tertahan {fmtRp(baris.outstanding)} untuk {baris.mandor?.name ?? "mandor"}.
      </p>

      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.mid, marginBottom: 4 }}>
          Jumlah dicairkan (Rp)
        </span>
        <input
          type="number" min={1} max={baris.outstanding} value={nilai}
          onChange={(e) => setNilai(e.target.value)} required
          style={{
            width: "100%", minHeight: 40, padding: "0 10px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, fontSize: 13, fontVariantNumeric: "tabular-nums",
          }}
        />
      </label>

      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.mid, marginBottom: 4 }}>
          Catatan <span style={{ fontWeight: 400, color: C.muted }}>· opsional</span>
        </span>
        <input
          value={catatan} onChange={(e) => setCatatan(e.target.value)}
          placeholder="Masa pemeliharaan selesai 30 Sep"
          style={{
            width: "100%", minHeight: 40, padding: "0 10px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, fontSize: 13,
          }}
        />
      </label>

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
          background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 600,
          cursor: simpan ? "progress" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>{simpan ? "Mencairkan…" : "Cairkan"}</button>
      </div>
    </form>
  );
}
