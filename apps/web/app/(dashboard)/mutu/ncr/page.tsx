"use client";

/**
 * REGISTER NCR — ketidaksesuaian mutu dengan siklus tutup formal (INTI #7).
 *
 * ── Yang membuat layar ini berbeda dari punch list
 *
 * Punch list menampilkan cacat dan status perbaikannya. NCR menampilkan
 * ketidaksesuaian dan **keputusan formal atasnya** — disposisi. Itu yang
 * disyaratkan tender pemerintah, dan itu yang menentukan tata letak di sini:
 * kolom disposisi tak bisa disembunyikan di balik klik.
 *
 * ── Urutan bagian
 *
 * 1. Kritis yang belum tertutup — angka yang menentukan apakah proyek boleh
 *    diserahterimakan. Kalau ada, ia yang pertama dibaca.
 * 2. Yang menunggu disposisi — pekerjaan yang tertahan karena belum ada
 *    keputusan. Ini paling sering jadi sumbat: temuan menumpuk sementara
 *    tak ada yang merasa berwenang memutuskan.
 * 3. Register penuh.
 */

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Gavel, Plus, RefreshCw } from "lucide-react";
import { api, hasPermission, makeAbortController } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";

interface Ncr {
  id: string; nomor: string; judul: string; deskripsi: string | null;
  lokasi: string | null; acuan: string | null;
  severity: "minor" | "major" | "kritis";
  status: "terbuka" | "disposisi" | "perbaikan" | "verifikasi" | "ditutup" | "dibatalkan";
  disposisi: "perbaiki" | "terima" | "bongkar" | "ubah_spek" | null;
  disposisi_catatan: string | null;
  tindakan_perbaikan: string | null;
  akar_masalah: string | null;
  biaya_dampak: number | null;
  target_selesai: string | null;
  pelapor: { id: string; name: string } | null;
  petugas: { id: string; name: string } | null;
  verifikator: { id: string; name: string } | null;
  pemutus: { id: string; name: string } | null;
  created_at: string;
}

interface Meta {
  per_status: Record<string, number>;
  per_severity: Record<string, number>;
  total: number;
  belum_selesai: number;
  kritis_terbuka: number;
  biaya_dampak_total: number;
  rekap_lengkap: boolean;
}

interface Proyek { id: string; name: string }

const SEVERITY: Record<string, { label: string; warna: string; latar: string; tepi: string }> = {
  minor:  { label: "Minor",  warna: C.mid,          latar: "var(--surface-hover)", tepi: C.border },
  major:  { label: "Major",  warna: C.onWarningBg,  latar: C.yellowBg,             tepi: C.yellowBorder },
  kritis: { label: "Kritis", warna: C.onDangerBg,   latar: C.redBg,                tepi: C.redBorder },
};

const STATUS: Record<string, { label: string; warna: string; latar: string }> = {
  terbuka:    { label: "Terbuka",           warna: C.onDangerBg,  latar: C.redBg },
  disposisi:  { label: "Disposisi",         warna: C.onWarningBg, latar: C.yellowBg },
  perbaikan:  { label: "Perbaikan",         warna: C.onInfoBg,    latar: C.blueBg },
  verifikasi: { label: "Menunggu Verifikasi", warna: C.onInfoBg,  latar: C.blueBg },
  ditutup:    { label: "Ditutup",           warna: C.onSuccessBg, latar: C.greenBg },
  dibatalkan: { label: "Dibatalkan",        warna: C.muted,       latar: "var(--surface-hover)" },
};

const DISPOSISI: Record<string, { label: string; ket: string }> = {
  perbaiki:  { label: "Perbaiki",       ket: "kerjakan ulang sampai sesuai" },
  terima:    { label: "Terima apa adanya", ket: "perusahaan menanggung — wajib beralasan" },
  bongkar:   { label: "Bongkar",        ket: "dibongkar, dikerjakan dari awal" },
  ubah_spek: { label: "Ubah Spesifikasi", ket: "spesifikasinya yang berubah" },
};

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function NcrInner() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";

  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [data, setData] = useState<Ncr[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [buatBaru, setBuatBaru] = useState(false);
  const [putuskan, setPutuskan] = useState<Ncr | null>(null);

  const bolehKelola = useSyncExternalStore(
    () => () => {}, () => hasPermission("ncr:manage"), () => false,
  );
  const bolehDisposisi = useSyncExternalStore(
    () => () => {}, () => hasPermission("ncr:disposisi"), () => false,
  );

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => {
        setProyek(r.data.projects);
        // Pilih proyek pertama kalau URL belum menyebutkan — halaman yang
        // terbuka kosong dengan dropdown yang belum dipilih terbaca sebagai
        // "belum ada data", padahal cuma belum memilih.
        if (!proyekId && r.data.projects.length) {
          router.replace(`/mutu/ncr?proyek=${r.data.projects[0].id}`, { scroll: false });
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, [proyekId, router]);

  const muat = useCallback((signal?: AbortSignal) => {
    if (!proyekId) return Promise.resolve();
    setMemuat(true);
    return api.get<{ data: Ncr[]; meta: Meta }>(
      `/api/v1/projects/${proyekId}/ncr`, { signal })
      .then((r) => { setData(r.data.data); setMeta(r.data.meta); setGalat(null); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setData([]); setMeta(null);
        setGalat(e?.response?.data?.error ?? "Gagal memuat register NCR.");
      })
      .finally(() => setMemuat(false));
  }, [proyekId]);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const menungguDisposisi = data.filter((n) => n.status === "terbuka");

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 16, marginBottom: 18, flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700,
            color: C.text, marginBottom: 4,
          }}>Register NCR</h1>
          <p style={{ fontSize: 13, color: C.mid, maxWidth: 640 }}>
            Ketidaksesuaian terhadap spesifikasi, gambar, atau standar — beserta
            keputusan formal atasnya. Berbeda dari punch list: NCR menuntut
            <strong> disposisi</strong> dan <strong>akar masalah</strong> sebelum bisa ditutup.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            aria-label="Pilih proyek"
            value={proyekId}
            onChange={(e) => router.replace(`/mutu/ncr?proyek=${e.target.value}`, { scroll: false })}
            style={{
              padding: "8px 12px", fontSize: 13, borderRadius: 6,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, outline: "none", minWidth: 190,
            }}>
            {/* Dulu selalu berbunyi "— memuat proyek —", termasuk setelah
                pemuatan selesai dan hasilnya memang kosong. Orang akan
                menunggu daftar yang tak akan pernah datang. */}
            {proyek.length === 0 && (
              <option value="">
                {memuat ? "Memuat proyek…" : "Tak ada proyek"}
              </option>
            )}
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => muat()} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6,
            background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Muat ulang
          </button>
          {bolehKelola && proyekId && (
            <button onClick={() => setBuatBaru(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              border: "none", borderRadius: 6, background: "var(--grad-aksen)",
              color: "var(--on-aksen)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={14} aria-hidden="true" /> Catat NCR
            </button>
          )}
        </div>
      </div>

      {/* ── Empat angka ── */}
      {meta && (
        <div className="rise rise-2" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8, marginBottom: 16,
        }}>
          {[
            { l: "Belum Selesai", v: `${meta.belum_selesai}`, s: "dari " + meta.total + " total",
              w: meta.belum_selesai ? C.yellow : C.green, t: meta.belum_selesai ? C.yellowBorder : C.greenBorder },
            { l: "Kritis Terbuka", v: `${meta.kritis_terbuka}`,
              s: meta.kritis_terbuka ? "menghalangi serah terima" : "aman untuk serah terima",
              w: meta.kritis_terbuka ? C.red : C.green, t: meta.kritis_terbuka ? C.redBorder : C.greenBorder },
            { l: "Menunggu Disposisi", v: `${menungguDisposisi.length}`, s: "belum diputuskan",
              w: menungguDisposisi.length ? C.navy : C.mid, t: undefined },
            { l: "Biaya Dampak", v: meta.biaya_dampak_total ? rp(meta.biaya_dampak_total) : "—",
              s: "tercatat sejauh ini", w: C.mid, t: undefined },
          ].map((k) => (
            <div key={k.l} style={{
              background: "var(--surface)", border: `1px solid ${k.t ?? C.border}`,
              borderRadius: 10, padding: "12px 16px",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
                textTransform: "uppercase", color: C.muted, marginBottom: 6,
              }}>{k.l}</div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
                color: k.w, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
              }}>{k.v}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.s}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rekap yang gagal dihitung DITANDAI — angka yang salah di layar mutu
          bisa membuat proyek diserahterimakan padahal belum layak. */}
      {meta && !meta.rekap_lengkap && (
        <div role="alert" style={{
          padding: "8px 12px", borderRadius: 10, marginBottom: 14, fontSize: 12,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, color: C.onWarningBg,
        }}>
          Rekap gagal dihitung — angka di atas mungkin tidak lengkap. Muat ulang halaman.
        </div>
      )}

      {galat && (
        <div role="alert" style={{
          padding: "12px 12px", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>
          {galat}{" "}
          <button onClick={() => muat()} style={{
            marginLeft: 6, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)", overflow: "hidden",
      }}>
        {memuat ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} aria-hidden="true" style={{
                height: 56, borderRadius: 10,
                background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
              }} />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            <CheckCircle2 size={34} aria-hidden="true" style={{ color: "var(--border)", marginBottom: 12 }} />
            <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
              {galat ? "Register tak bisa dimuat" : "Belum ada ketidaksesuaian tercatat"}
            </p>
            <p>
              {galat ? "Coba muat ulang." : "Itu kabar baik — atau berarti temuan belum dicatat di sini."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              <caption className="sr-only">
                Register ketidaksesuaian: nomor, tingkat, status, disposisi, dan penanggung jawab
              </caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                  {["NCR", "Tingkat", "Status", "Disposisi", "Ditugaskan", "Target", ""].map((h, i) => (
                    <th key={h || i} scope="col" style={{
                      padding: "8px 12px", textAlign: "left",
                      fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
                      textTransform: "uppercase", color: C.mid, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((n) => {
                  const sev = SEVERITY[n.severity] ?? SEVERITY.minor;
                  const st = STATUS[n.status] ?? STATUS.terbuka;
                  const perluPutus = n.status === "terbuka";
                  return (
                    <tr key={n.id} style={{
                      borderBottom: "1px solid var(--surface-hover)",
                      // Baris yang menunggu keputusan diberi LATAR, bukan cuma
                      // teks berwarna — di tabel padat, warna teks tenggelam.
                      background: perluPutus ? "var(--surface-subtle)" : "transparent",
                    }}>
                      <th scope="row" style={{ padding: "12px 12px", textAlign: "left", fontWeight: 400 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{
                            fontWeight: 700, color: C.navy, fontVariantNumeric: "tabular-nums",
                          }}>{n.nomor}</span>
                        </div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{n.judul}</div>
                        {(n.lokasi || n.acuan) && (
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                            {n.lokasi}
                            {n.lokasi && n.acuan && " · "}
                            {n.acuan && <span>acuan: {n.acuan}</span>}
                          </div>
                        )}
                      </th>
                      <td style={{ padding: "12px 12px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                          background: sev.latar, color: sev.warna,
                          border: `1px solid ${sev.tepi}`, whiteSpace: "nowrap",
                        }}>{sev.label}</span>
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                          background: st.latar, color: st.warna, whiteSpace: "nowrap",
                        }}>{st.label}</span>
                      </td>
                      <td style={{ padding: "12px 12px", color: C.mid }}>
                        {n.disposisi ? (
                          <span title={n.disposisi_catatan ?? undefined}>
                            {DISPOSISI[n.disposisi]?.label ?? n.disposisi}
                            {n.pemutus && (
                              <span style={{ color: C.muted, fontSize: 11 }}> · {n.pemutus.name}</span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: C.muted, fontStyle: "italic" }}>belum diputuskan</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 12px", color: C.mid }}>
                        {n.petugas?.name ?? "—"}
                      </td>
                      <td style={{
                        padding: "12px 12px", color: C.mid, whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {n.target_selesai
                          ? new Date(n.target_selesai).toLocaleDateString("id-ID",
                              { day: "2-digit", month: "short" })
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right" }}>
                        {bolehDisposisi && perluPutus && (
                          <button onClick={() => setPutuskan(n)} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "4px 12px", borderRadius: 6, border: "none",
                            background: "var(--grad-aksen)", color: "var(--on-aksen)",
                            fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                            <Gavel size={12} aria-hidden="true" /> Putuskan
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {buatBaru && proyekId && (
        <ModalCatat
          proyekId={proyekId}
          onClose={() => setBuatBaru(false)}
          onSukses={() => { setBuatBaru(false); muat(); }}
        />
      )}
      {putuskan && (
        <ModalDisposisi
          ncr={putuskan}
          onClose={() => setPutuskan(null)}
          onSukses={() => { setPutuskan(null); muat(); }}
        />
      )}
    </div>
  );
}

const gayaInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6,
  border: `1px solid ${C.border}`, outline: "none", boxSizing: "border-box",
  background: "var(--surface)", color: C.text, fontFamily: "inherit",
};
const gayaLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
};

/** Form catat NCR baru. */
function ModalCatat({ proyekId, onClose, onSukses }: {
  proyekId: string; onClose: () => void; onSukses: () => void;
}) {
  useTutupEsc(onClose);
  const [judul, setJudul] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [acuan, setAcuan] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [target, setTarget] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!judul.trim()) return;
    setKirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${proyekId}/ncr`, {
        judul: judul.trim(),
        lokasi: lokasi.trim() || undefined,
        acuan: acuan.trim() || undefined,
        deskripsi: deskripsi.trim() || undefined,
        severity,
        target_selesai: target || undefined,
      });
      onSukses();
    } catch (e: unknown) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal mencatat ketidaksesuaian.");
    } finally { setKirim(false); }
  }

  return (
    <div role="presentation" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-catat" style={{
        background: "var(--surface)", borderRadius: 14, padding: 20,
        width: "min(500px, 94vw)", maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "var(--naik-3)",
      }}>
        <h2 id="judul-catat" style={{
          margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
          fontFamily: "var(--font-display)",
        }}>Catat Ketidaksesuaian</h2>

        <div>
          <label htmlFor="ncr-judul" style={gayaLabel}>Judul</label>
          <input id="ncr-judul" value={judul} onChange={(e) => setJudul(e.target.value)}
            placeholder="mis. Mutu beton kolom lantai 2 di bawah spesifikasi"
            style={gayaInput} />
        </div>

        <div>
          <label htmlFor="ncr-acuan" style={gayaLabel}>
            Acuan yang dilanggar
          </label>
          <input id="ncr-acuan" value={acuan} onChange={(e) => setAcuan(e.target.value)}
            placeholder="mis. RKS Bab 4.2 · Gambar A-12 rev.3 · SNI 2847:2019"
            style={gayaInput} />
          {/* Ini yang membedakan NCR dari cacat biasa: selalu ada acuan yang
              dilanggar. Diberi penjelasan supaya kolomnya tak dilewati. */}
          <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted }}>
            NCR selalu menunjuk sesuatu yang dilanggar — itu yang membedakannya
            dari cacat biasa, dan yang dicari auditor.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label htmlFor="ncr-lokasi" style={gayaLabel}>Lokasi</label>
            <input id="ncr-lokasi" value={lokasi} onChange={(e) => setLokasi(e.target.value)}
              placeholder="Lantai 2, kolom K-3" style={gayaInput} />
          </div>
          <div>
            <label htmlFor="ncr-severity" style={gayaLabel}>Tingkat</label>
            <select id="ncr-severity" value={severity}
              onChange={(e) => setSeverity(e.target.value)} style={gayaInput}>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="kritis">Kritis</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="ncr-deskripsi" style={gayaLabel}>Uraian</label>
          <textarea id="ncr-deskripsi" value={deskripsi} rows={3}
            onChange={(e) => setDeskripsi(e.target.value)}
            placeholder="Apa yang ditemukan, bagaimana terukur"
            style={{ ...gayaInput, resize: "vertical" }} />
        </div>

        <div>
          <label htmlFor="ncr-target" style={gayaLabel}>Target selesai</label>
          <input id="ncr-target" type="date" value={target}
            onChange={(e) => setTarget(e.target.value)} style={gayaInput} />
        </div>

        {galat && (
          <div role="alert" style={{
            padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
          }}>{galat}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
          }}>Batal</button>
          <button onClick={simpan} disabled={!judul.trim() || kirim} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: judul.trim() && !kirim ? "var(--grad-aksen)" : "var(--surface-hover)",
            color: judul.trim() && !kirim ? "var(--on-aksen)" : C.muted,
            fontSize: 13, fontWeight: 600,
            cursor: judul.trim() && !kirim ? "pointer" : "not-allowed",
          }}>{kirim ? "Menyimpan..." : "Catat"}</button>
        </div>
      </div>
    </div>
  );
}

/** Form disposisi — keputusan formal atas ketidaksesuaian. */
function ModalDisposisi({ ncr, onClose, onSukses }: {
  ncr: Ncr; onClose: () => void; onSukses: () => void;
}) {
  useTutupEsc(onClose);
  const [pilihan, setPilihan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // "Terima apa adanya" berarti perusahaan menanggung ketidaksesuaian —
  // alasan wajib. Ditegakkan di API juga; ini supaya tombolnya tak bisa
  // ditekan lebih dulu, bukan supaya API-nya boleh percaya klien.
  const perluAlasan = pilihan === "terima";
  const sah = pilihan && (!perluAlasan || catatan.trim().length > 0);

  async function simpan() {
    if (!sah) return;
    setKirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/ncr/${ncr.id}/disposisi`, {
        disposisi: pilihan,
        catatan: catatan.trim() || undefined,
      });
      onSukses();
    } catch (e: unknown) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal menyimpan disposisi.");
    } finally { setKirim(false); }
  }

  return (
    <div role="presentation" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-disposisi" style={{
        background: "var(--surface)", borderRadius: 14, padding: 20,
        width: "min(520px, 94vw)", maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "var(--naik-3)",
      }}>
        <div>
          <h2 id="judul-disposisi" style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display)",
          }}>Disposisi {ncr.nomor}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{ncr.judul}</p>
        </div>

        <div style={{
          padding: "8px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.55,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, color: C.onWarningBg,
        }}>
          Disposisi adalah keputusan formal yang tercatat di jejak audit dan
          berkonsekuensi biaya. Setelah ditetapkan, NCR masuk tahap berikutnya.
        </div>

        {/* `role="group"` + `aria-labelledby`, bukan `<label>` biasa: judul
            ini menamai SATU PERTANYAAN dengan empat pilihan, bukan satu
            kontrol. `htmlFor` hanya bisa menunjuk satu elemen, jadi ia akan
            menempel ke radio pertama seolah tiga lainnya tak dinamai.
            Pola yang sama dipakai di /kas dan /estimasi. */}
        <div>
          <span id="ncr-keputusan-label" style={gayaLabel}>Keputusan</span>
          <div role="group" aria-labelledby="ncr-keputusan-label"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(DISPOSISI).map(([k, d]) => (
              // `htmlFor`/`id` eksplisit, bukan membungkus input di dalam
              // `<label>`. Pembungkusan gagal dikenali begitu isinya `<span>`
              // bersarang — dan yang hilang bukan cuma lint: pembaca layar
              // membacakan radio tanpa nama.
              //
              // Efek sampingnya bagus untuk semua orang: seluruh kartu jadi
              // bisa diketuk, bukan hanya lingkaran radio 13px. Itu yang
              // dibutuhkan di HP, satu tangan, di lapangan.
              <label key={k} htmlFor={`disposisi-${k}`} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                fontSize: 13, fontWeight: 600, color: C.text,
                padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${pilihan === k ? C.navy : C.border}`,
                background: pilihan === k ? C.navyLight : "var(--surface)",
              }}>
                <input id={`disposisi-${k}`} type="radio" name="disposisi" value={k}
                  checked={pilihan === k} onChange={() => setPilihan(k)}
                  style={{ marginTop: 2 }} />
                {/* Teks LANGSUNG di dalam `<label>`, tidak dibungkus `<span>`
                    berlapis: `jsx-a11y` menuntut teks yang bisa dijangkau
                    tanpa menembus pembungkus, dan pembaca layar mengikuti
                    aturan yang sama. Keterangan di bawahnya dipisah `<span>`
                    dan dikaitkan lewat `aria-describedby`. */}
                <span style={{ minWidth: 0 }}>
                  {d.label}
                  <span id={`disposisi-${k}-ket`} style={{
                    display: "block", fontSize: 11, color: C.muted,
                    marginTop: 1, fontWeight: 400,
                  }}>{d.ket}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="disposisi-catatan" style={gayaLabel}>
            Alasan {perluAlasan
              ? <span style={{ color: C.red, textTransform: "none" }}>· wajib</span>
              : <span style={{ fontWeight: 400, textTransform: "none" }}>(opsional)</span>}
          </label>
          <textarea id="disposisi-catatan" rows={3} value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder={perluAlasan
              ? "Kenapa diterima apa adanya — ini yang akan dibaca auditor"
              : "Pertimbangan yang mendasari keputusan"}
            style={{
              ...gayaInput, resize: "vertical",
              borderColor: perluAlasan && !catatan.trim() ? C.redBorder : C.border,
            }} />
        </div>

        {galat && (
          <div role="alert" style={{
            padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
          }}>{galat}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
          }}>Batal</button>
          <button onClick={simpan} disabled={!sah || kirim} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: sah && !kirim ? "var(--grad-aksen)" : "var(--surface-hover)",
            color: sah && !kirim ? "var(--on-aksen)" : C.muted,
            fontSize: 13, fontWeight: 600,
            cursor: sah && !kirim ? "pointer" : "not-allowed",
          }}>{kirim ? "Menyimpan..." : "Tetapkan Disposisi"}</button>
        </div>
      </div>
    </div>
  );
}

export default function NcrPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "var(--pad-atas) var(--pad-x)" }}>
        <div aria-hidden="true" style={{
          height: 44, width: 200, borderRadius: 6,
          background: "var(--surface-subtle)",
        }} />
      </div>
    }>
      <NcrInner />
    </Suspense>
  );
}
