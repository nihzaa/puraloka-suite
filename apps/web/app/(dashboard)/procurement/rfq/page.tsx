"use client";

/**
 * RFQ KE VENDOR + PERBANDINGAN PENAWARAN (F5 PEMBEDA)
 *
 * ── Yang dijawab halaman ini
 *
 * "Kenapa besi ini dibeli Rp120.000 dari vendor C, padahal vendor A menawar
 * Rp100.000?"
 *
 * Diukur pada data nyata: material yang sama dibeli dari 3 supplier dengan
 * rentang harga 20%, dan tak ada satu pun jejak alasannya. Saat auditor
 * bertanya, yang tersedia hanya ingatan orang.
 *
 * ── Kenapa tabulasinya satu layar dengan RFQ-nya
 *
 * Perbandingan tanpa RFQ-nya adalah tabel angka tanpa konteks: tak terlihat
 * kapan diminta, sampai kapan batasnya, dan vendor mana yang diundang tapi
 * diam. Keduanya satu keputusan, jadi satu layar.
 */

import { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, Plus, Award } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";

type Proyek = { id: string; name: string };

type Rfq = {
  id: string;
  nomor: string;
  tanggal: string;
  batas_masuk: string | null;
  status: "draft" | "terkirim" | "selesai" | "batal";
  catatan: string | null;
  alasan_pilih: string | null;
  proyek: Proyek | null;
};

type Sel = {
  supplier_id: string;
  supplier_name: string;
  harga_satuan: number | null;
  total: number | null;
  termurah: boolean;
  selisih_pct: number | null;
  waktu_kirim_hari: number | null;
};

type BarisTabulasi = {
  material_id: string;
  material_name: string;
  unit: string | null;
  qty: number;
  sel: Sel[];
  harga_termurah: number | null;
  rentang_pct: number | null;
};

type Vendor = {
  supplier_id: string;
  supplier_name: string;
  jumlah_ditawar: number;
  jumlah_termurah: number;
  total_penawaran: number;
  lengkap: boolean;
};

type Tabulasi = {
  baris: BarisTabulasi[];
  vendor: Vendor[];
  total_termurah_gabungan: number;
  jumlah_tanpa_penawaran: number;
};

const STATUS_META: Record<Rfq["status"], { label: string; warna: string; bg: string; border: string }> = {
  draft: { label: "Draft", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  terkirim: { label: "Menunggu penawaran", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)" },
  selesai: { label: "Sudah diputuskan", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  batal: { label: "Dibatalkan", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const angka = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function RfqPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [daftar, setDaftar] = useState<Rfq[]>([]);
  const [terpilih, setTerpilih] = useState<string>("");
  const [tabulasi, setTabulasi] = useState<Tabulasi | null>(null);
  const [rfqAktif, setRfqAktif] = useState<Rfq | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [muatUlangKe, setMuatUlangKe] = useState(0);

  const [buatProyek, setBuatProyek] = useState("");
  const [buatNomor, setBuatNomor] = useState("");
  const [membuat, setMembuat] = useState(false);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyek(r.data.projects ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek"); })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ rfq: Rfq[] }>("/api/v1/rfq", { signal: ac.signal })
      .then((r) => setDaftar(r.data.rfq ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar RFQ"); });
    return () => ac.abort();
  }, [muatUlangKe]);

  // RFQ pertama dipilih sendiri — DITURUNKAN saat render, bukan lewat
  // efek+setState yang membuat halaman berkedip dari kosong ke isinya.
  const idEfektif = terpilih || daftar[0]?.id || "";

  useEffect(() => {
    if (!idEfektif) return;
    const ac = makeAbortController();
    api.get<{ rfq: Rfq; tabulasi: Tabulasi }>(`/api/v1/rfq/${idEfektif}`, { signal: ac.signal })
      .then((r) => { setRfqAktif(r.data.rfq); setTabulasi(r.data.tabulasi); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setGalat(m ?? "Gagal memuat perbandingan penawaran");
        setTabulasi(null);
      });
    return () => ac.abort();
  }, [idEfektif, muatUlangKe]);

  async function buatRfq() {
    if (!buatProyek || !buatNomor.trim()) return;
    setMembuat(true);
    setGalat(null);
    try {
      const r = await api.post<{ rfq: { id: string } }>("/api/v1/rfq", {
        project_id: buatProyek, nomor: buatNomor.trim(),
      });
      setBuatNomor("");
      setTerpilih(r.data.rfq.id);
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal membuat RFQ");
    } finally {
      setMembuat(false);
    }
  }

  const vendorTerbaik = useMemo(
    () => (tabulasi?.vendor ?? []).filter((v) => v.lengkap),
    [tabulasi],
  );

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };
  const labelGaya: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const isianGaya: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
    background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
  };

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
          RFQ &amp; Perbandingan Penawaran
        </h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Harga datang dari perbandingan, bukan dari satu vendor langganan.
          Tabulasinya adalah bukti pemilihan vendor — jawaban saat seseorang
          bertanya kenapa yang lebih mahal yang dipilih.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : proyek.length === 0 ? (
        <Kosong
          ikon={<FileText size={28} />}
          judul="Belum ada proyek"
          sebab="RFQ diminta per proyek. Daftar ini terisi sendiri begitu ada proyek berjalan."
        />
      ) : (
        <>
          {/* ── Buat RFQ ────────────────────────────────────────────────── */}
          <div className="rise rise-2" style={{
            ...kartu, padding: "12px 16px", marginBottom: 16,
            display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
              <label htmlFor="rq-proyek" style={labelGaya}>Proyek</label>
              <select id="rq-proyek" value={buatProyek} onChange={(e) => setBuatProyek(e.target.value)} style={isianGaya}>
                <option value="">— pilih —</option>
                {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
              <label htmlFor="rq-nomor" style={labelGaya}>Nomor RFQ</label>
              <input
                id="rq-nomor" type="text" value={buatNomor} onChange={(e) => setBuatNomor(e.target.value)}
                placeholder="mis. RFQ/2026/001" style={isianGaya}
              />
            </div>

            <button
              type="button" onClick={buatRfq}
              disabled={!buatProyek || !buatNomor.trim() || membuat}
              style={{
                padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "none",
                background: !buatProyek || !buatNomor.trim() || membuat ? C.border : C.navy,
                color: !buatProyek || !buatNomor.trim() || membuat ? C.mid : "var(--on-navy)",
                cursor: !buatProyek || !buatNomor.trim() || membuat ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 7,
              }}
            >
              <Plus size={14} aria-hidden="true" />
              {membuat ? "Membuat…" : "Buat RFQ"}
            </button>

            {daftar.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240, marginLeft: "auto" }}>
                <label htmlFor="rq-pilih" style={labelGaya}>Lihat RFQ</label>
                <select id="rq-pilih" value={idEfektif} onChange={(e) => setTerpilih(e.target.value)} style={isianGaya}>
                  {daftar.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nomor} — {r.proyek?.name ?? "—"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {daftar.length === 0 ? (
            <Kosong
              ikon={<FileText size={28} />}
              judul="Belum ada RFQ"
              sebab={
                <>
                  Buat RFQ untuk meminta penawaran ke beberapa vendor sekaligus.
                  Tabulasinya jadi bukti pemilihan vendor — yang selama ini hanya
                  ada di ingatan orang.
                </>
              }
            />
          ) : !tabulasi ? null : (
            <>
              {/* ── Kepala RFQ ────────────────────────────────────────── */}
              {rfqAktif && (
                <div className="rise rise-2b" style={{
                  ...kartu, padding: "12px 16px", marginBottom: 16,
                  display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{rfqAktif.nomor}</div>
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>
                      {rfqAktif.proyek?.name ?? "—"} · diminta {tanggalTerbaca(rfqAktif.tanggal)}
                      {rfqAktif.batas_masuk && ` · batas ${tanggalTerbaca(rfqAktif.batas_masuk)}`}
                    </div>
                  </div>

                  {/* Status sebagai KATA, bukan hanya warna — yang tak bisa
                      membedakan warna, dan pembaca layar, sama-sama butuh
                      teksnya (WCAG 1.4.1). */}
                  <span style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: STATUS_META[rfqAktif.status].warna,
                    background: STATUS_META[rfqAktif.status].bg,
                    border: `1px solid ${STATUS_META[rfqAktif.status].border}`,
                  }}>
                    {STATUS_META[rfqAktif.status].label}
                  </span>

                  <button
                    type="button" onClick={() => setMuatUlangKe((n) => n + 1)}
                    style={{
                      marginLeft: "auto", padding: "5px 10px", borderRadius: 6,
                      border: `1px solid ${C.border}`, background: "var(--surface)",
                      color: C.mid, fontSize: 12, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <RefreshCw size={12} aria-hidden="true" /> Muat ulang
                  </button>
                </div>
              )}

              {tabulasi.baris.length === 0 ? (
                <Kosong
                  ikon={<FileText size={28} />}
                  judul="Belum ada penawaran masuk"
                  sebab="Perbandingan muncul begitu ada penawaran vendor yang tercatat untuk RFQ ini."
                />
              ) : (
                <>
                  {/* ── Ringkasan vendor ──────────────────────────────── */}
                  <div className="rise rise-2b" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {tabulasi.vendor.map((v) => (
                      <div key={v.supplier_id} style={{
                        ...kartu, padding: "10px 14px", flex: "1 1 200px", minWidth: 190,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{v.supplier_name}</span>
                          {v.jumlah_termurah > 0 && (
                            <Award size={13} aria-hidden="true" style={{ color: "var(--success)" }} />
                          )}
                        </div>
                        {/* Vendor yang TIDAK menawar apa pun tidak dipajang
                            "Rp 0". Angka nol besar terbaca sebagai PALING
                            MURAH — persis salah-baca yang peringatan di
                            bawahnya berusaha cegah, dan mata membaca angka
                            besar lebih dulu daripada kalimat kecil. */}
                        <div style={{
                          fontSize: v.jumlah_ditawar === 0 ? 13 : 17,
                          fontWeight: v.jumlah_ditawar === 0 ? 600 : 800,
                          color: v.jumlah_ditawar === 0 ? C.muted : C.text,
                          marginTop: 4,
                          fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                        }}>
                          {v.jumlah_ditawar === 0 ? "Belum menawar" : rupiah(v.total_penawaran)}
                        </div>
                        <div style={{ fontSize: 11, color: C.mid, marginTop: 3, lineHeight: 1.5 }}>
                          {v.jumlah_ditawar === 0
                            ? "tak satu pun material ditawar"
                            : `termurah di ${v.jumlah_termurah} dari ${tabulasi.baris.length} material`}
                          {/* "Tidak lengkap" DINYATAKAN sebagai kata. Vendor yang
                              hanya menawar sebagian akan punya total terkecil dan
                              tampak paling murah — padahal ia tak menawarkan sisanya. */}
                          {!v.lengkap && v.jumlah_ditawar > 0 && (
                            <span style={{ display: "block", color: "var(--warning-teks)", fontWeight: 600, marginTop: 2 }}>
                              hanya menawar {v.jumlah_ditawar} item — total tak sebanding
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Tabulasi ──────────────────────────────────────── */}
                  <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{
                        width: "100%", borderCollapse: "collapse", fontSize: 13,
                        fontVariantNumeric: "tabular-nums", minWidth: 720,
                      }}>
                        <caption className="sr-only">
                          Perbandingan penawaran vendor untuk RFQ {rfqAktif?.nomor ?? "—"}:
                          harga satuan tiap vendor per material, penanda vendor termurah,
                          dan selisih terhadapnya.
                        </caption>
                        <thead>
                          <tr style={{ background: "var(--surface-subtle)" }}>
                            <th scope="col" style={{
                              textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700,
                              color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>Material</th>
                            <th scope="col" style={{
                              textAlign: "right", padding: "8px 12px", fontSize: 10, fontWeight: 700,
                              color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                            }}>Qty</th>
                            {tabulasi.vendor.map((v) => (
                              <th key={v.supplier_id} scope="col" style={{
                                textAlign: "right", padding: "8px 12px", fontSize: 10, fontWeight: 700,
                                color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                              }}>{v.supplier_name}</th>
                            ))}
                            <th scope="col" style={{
                              textAlign: "right", padding: "8px 12px", fontSize: 10, fontWeight: 700,
                              color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                            }}>Rentang</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tabulasi.baris.map((b) => (
                            <tr key={b.material_id} style={{ borderTop: `1px solid ${C.border}` }}>
                              <th scope="row" style={{
                                textAlign: "left", padding: "10px 12px", fontWeight: 500, color: C.text,
                              }}>
                                {b.material_name}
                                {b.unit && <span style={{ fontSize: 11, color: C.mid }}> · {b.unit}</span>}
                              </th>
                              <td style={{ textAlign: "right", padding: "10px 12px", color: C.mid }}>
                                {angka(b.qty)}
                              </td>
                              {b.sel.map((s) => (
                                <td key={s.supplier_id} style={{
                                  textAlign: "right", padding: "10px 12px",
                                  color: s.harga_satuan == null ? C.muted : s.termurah ? "var(--success)" : C.text,
                                  fontWeight: s.termurah ? 700 : 400,
                                }}>
                                  {s.harga_satuan == null ? (
                                    // "Tidak menawar" ditulis sebagai KATA, bukan
                                    // sel kosong: sel kosong tak bisa dibedakan dari
                                    // data yang hilang.
                                    <span style={{ fontSize: 11 }}>tak menawar</span>
                                  ) : (
                                    <>
                                      {rupiah(s.harga_satuan)}
                                      {s.termurah ? (
                                        <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--success)" }}>
                                          termurah
                                        </span>
                                      ) : s.selisih_pct != null && s.selisih_pct > 0 ? (
                                        <span style={{ display: "block", fontSize: 10, color: C.muted }}>
                                          +{s.selisih_pct.toFixed(1)}%
                                        </span>
                                      ) : null}
                                    </>
                                  )}
                                </td>
                              ))}
                              <td style={{
                                textAlign: "right", padding: "10px 12px", fontWeight: 700,
                                color: b.rentang_pct == null ? C.muted
                                  : b.rentang_pct >= 10 ? "var(--danger)" : C.mid,
                              }}>
                                {b.rentang_pct == null ? (
                                  <span style={{ fontSize: 11, fontWeight: 400 }}>
                                    {b.harga_termurah == null ? "tak ada penawaran" : "1 penawar"}
                                  </span>
                                ) : `${b.rentang_pct.toFixed(1)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p style={{
                      margin: 0, padding: "10px 14px", borderTop: `1px solid ${C.border}`,
                      background: "var(--surface-subtle)", fontSize: 11, color: C.mid, lineHeight: 1.55,
                    }}>
                      Bila tiap material diambil dari vendor termurahnya masing-masing,
                      totalnya <strong>{rupiah(tabulasi.total_termurah_gabungan)}</strong>.
                      Angka itu pembanding, bukan target: memecah pesanan ke banyak vendor
                      punya ongkosnya sendiri (kirim terpisah, administrasi, risiko
                      keterlambatan). Yang penting keputusannya tercatat — termasuk
                      saat yang lebih mahal sengaja dipilih.
                      {tabulasi.jumlah_tanpa_penawaran > 0 && (
                        <>
                          {" "}
                          <strong>{tabulasi.jumlah_tanpa_penawaran} material belum ada penawarannya
                          sama sekali</strong> — belum bisa dibandingkan.
                        </>
                      )}
                      {vendorTerbaik.length === 0 && tabulasi.vendor.length > 0 && (
                        <>
                          {" "}
                          <strong>Tak satu pun vendor menawar seluruh material</strong>, jadi
                          total antar vendor tidak sebanding satu sama lain.
                        </>
                      )}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
