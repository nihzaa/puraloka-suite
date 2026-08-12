"use client";

/**
 * REKONSILIASI BANK — mencocokkan buku kas dengan rekening koran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DICARI BUKAN YANG COCOK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman ini gagal kalau ia menonjolkan yang berpasangan. Yang membuat orang
 * membukanya tiap akhir bulan adalah yang TIDAK berpasangan:
 *
 *   • setoran yang sudah dicatat tapi belum masuk rekening
 *   • cek/transfer yang belum dicairkan penerimanya
 *   • biaya admin & pajak bunga yang tak pernah dicatat siapa pun
 *   • yang paling mahal: uang KELUAR dari rekening tanpa satu pun catatan
 *
 * Jadi urutan tampilnya dibalik dari kebiasaan tabel: yang belum cocok naik ke
 * atas, yang sudah cocok memudar. Selisih ditampilkan sebagai angka besar,
 * bukan disembunyikan di kaki tabel.
 *
 * ── Tiga lapis (ARAH-VISUAL §5b)
 *
 *   LAPIS 1  empat KPI: selisih · belum cocok koran · belum cocok buku · status
 *   LAPIS 2  laporan 4-baris — bentuk baku yang dipakai akuntan
 *   LAPIS 3  dua kolom bersanding: koran vs buku
 *
 * ── Kenapa dua kolom, bukan satu tabel gabungan
 *
 * Rekonsiliasi adalah tindakan MEMBANDINGKAN dua daftar yang tak sama. Tabel
 * gabungan memaksa keduanya masuk satu bentuk kolom, dan yang hilang persis
 * informasi yang dicari: baris mana yang tak punya lawan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Landmark, TriangleAlert, Link2, Unlink, Lock, CircleCheck,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { formatRupiah } from "@/lib/format";

interface KoranRingkas {
  id: string;
  nama_akun: string;
  periode_dari: string;
  periode_sampai: string;
  saldo_akhir: string;
  status: string;
  jumlah_baris: number;
  jumlah_cocok: number;
  belum_cocok: number;
}

interface BarisKoran {
  id: string;
  tanggal: string;
  keterangan: string;
  debit: string;
  kredit: string;
  ref_bank: string | null;
  sudah_cocok: boolean;
}

interface TransaksiBuku {
  id: string;
  sumber: string;
  tanggal: string;
  nominal: number;
  keterangan: string;
  sudah_cocok: boolean;
}

interface Usul {
  baris_id: string;
  sumber: string;
  sumber_id: string;
  keyakinan: "persis" | "dekat";
  selisih_hari: number;
}

interface Laporan {
  saldo_bank: number;
  setoran_dalam_perjalanan: number;
  cek_beredar: number;
  penyesuaian: number;
  saldo_buku_seharusnya: number;
  saldo_buku: number;
  selisih: number;
  tuntas: boolean;
  baris_belum_cocok: number;
  transaksi_belum_cocok: number;
}

interface Detail {
  koran: KoranRingkas & { catatan?: string | null };
  baris: BarisKoran[];
  buku: TransaksiBuku[];
  pencocokan: Array<{ id: string; baris_id: string; sumber_tabel: string; sumber_id: string }>;
  penyesuaian: Array<{ id: string; jenis: string; keterangan: string; nominal: string }>;
  usul: Usul[];
  laporan: Laporan;
}

const rupiah = formatRupiah;

const tanggal = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const NAMA_SUMBER: Record<string, string> = {
  payments: "Penerimaan",
  supplier_payments: "Bayar pemasok",
  cash_transfers: "Pemindahan kas",
};

export default function RekonsiliasiBankPage() {
  const [daftar, setDaftar] = useState<KoranRingkas[]>([]);
  const [pilih, setPilih] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [muatUlangKe, setMuatUlangKe] = useState(0);

  useEffect(() => {
    const ac = makeAbortController();
    setMemuat(true);
    api.get<{ koran: KoranRingkas[] }>("/api/v1/rekonsiliasi", { signal: ac.signal })
      .then(({ data }) => {
        const k = data.koran ?? [];
        setDaftar(k);
        setPilih((p) => p ?? k[0]?.id ?? null);
        setGalat("");
      })
      .catch((e) => {
        if (!ac.signal.aborted) setGalat(e?.message ?? "Gagal memuat daftar rekonsiliasi");
      })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, [muatUlangKe]);

  useEffect(() => {
    if (!pilih) { setDetail(null); return; }
    const ac = makeAbortController();
    api.get<Detail>(`/api/v1/rekonsiliasi/${pilih}`, { signal: ac.signal })
      .then(({ data }) => setDetail(data))
      .catch((e) => {
        if (!ac.signal.aborted) setGalat(e?.message ?? "Gagal memuat detail rekonsiliasi");
      });
    return () => ac.abort();
  }, [pilih, muatUlangKe]);

  const cocokkan = useCallback(async (barisId: string, sumber: string, sumberId: string) => {
    if (!pilih || sibuk) return;
    setSibuk(true);
    try {
      await api.post(`/api/v1/rekonsiliasi/${pilih}/cocokkan`,
        { baris_id: barisId, sumber_tabel: sumber, sumber_id: sumberId });
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      // Galat DITAMPILKAN, bukan ditelan. Pencocokan yang gagal diam-diam
      // membuat orang mengklik berulang kali dan menyimpulkan aplikasinya rusak.
      setGalat((e as { message?: string })?.message ?? "Pencocokan ditolak");
    } finally {
      setSibuk(false);
    }
  }, [pilih, sibuk]);

  const lepas = useCallback(async (cocokId: string) => {
    if (!pilih || sibuk) return;
    setSibuk(true);
    try {
      await api.delete(`/api/v1/rekonsiliasi/${pilih}/cocokkan/${cocokId}`);
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      setGalat((e as { message?: string })?.message ?? "Gagal melepas pencocokan");
    } finally {
      setSibuk(false);
    }
  }, [pilih, sibuk]);

  const kunci = useCallback(async () => {
    if (!pilih || sibuk) return;
    setSibuk(true);
    try {
      await api.post(`/api/v1/rekonsiliasi/${pilih}/kunci`, {});
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      setGalat((e as { message?: string })?.message ?? "Gagal mengunci");
    } finally {
      setSibuk(false);
    }
  }, [pilih, sibuk]);

  // Belum cocok NAIK KE ATAS. Ini kebalikan urutan tabel biasa, dan disengaja:
  // yang sudah berpasangan tak menuntut tindakan apa pun.
  const barisUrut = useMemo(() => {
    if (!detail) return [];
    return [...detail.baris].sort((a, b) => {
      if (a.sudah_cocok !== b.sudah_cocok) return a.sudah_cocok ? 1 : -1;
      return a.tanggal.localeCompare(b.tanggal);
    });
  }, [detail]);

  const bukuUrut = useMemo(() => {
    if (!detail) return [];
    return [...detail.buku].sort((a, b) => {
      if (a.sudah_cocok !== b.sudah_cocok) return a.sudah_cocok ? 1 : -1;
      return a.tanggal.localeCompare(b.tanggal);
    });
  }, [detail]);

  const usulPerBaris = useMemo(() => {
    const m = new Map<string, Usul>();
    for (const u of detail?.usul ?? []) m.set(u.baris_id, u);
    return m;
  }, [detail]);

  const cocokPerBaris = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of detail?.pencocokan ?? []) m.set(c.baris_id, c.id);
    return m;
  }, [detail]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12,
  };

  const terkunci = detail?.koran.status === "dikunci";

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/* Judul & tombol muat-ulang disediakan `kas/layout.tsx` lewat
          `JudulBagian`, yang mengambil namanya dari MENU. Menulisnya lagi di
          sini menghasilkan DUA <h1> di satu halaman — terukur, dan itu cacat
          a11y sekaligus kebingungan visual. */}

      {galat && (
        <div role="alert" style={{
          ...kartu, borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <TriangleAlert size={16} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{galat}</div>
        </div>
      )}

      {memuat && !detail ? (
        <p style={{ fontSize: 13, color: C.muted, padding: "24px 0" }}>Memuat…</p>
      ) : daftar.length === 0 ? (
        <Kosong
          judul="Belum ada rekening koran"
          sebab="Impor rekening koran dari internet banking (CSV/Excel) untuk mulai mencocokkan. Tanpa koran, rekonsiliasi tak punya pembanding."
        />
      ) : (
        <>
          {/* ── Pilih periode ── */}
          <div style={{ marginBottom: "var(--gap-bagian)" }}>
            <label htmlFor="pilih-koran" style={{
              display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6,
            }}>
              Rekening &amp; periode
            </label>
            <select
              id="pilih-koran"
              value={pilih ?? ""}
              onChange={(e) => setPilih(e.target.value)}
              style={{
                padding: "8px 12px", fontSize: 13, fontFamily: "inherit",
                border: `1px solid ${C.border}`, borderRadius: 10,
                background: "var(--surface)", color: C.text, minWidth: 340,
              }}
            >
              {daftar.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_akun} · {tanggal(k.periode_dari)} – {tanggal(k.periode_sampai)}
                  {k.belum_cocok > 0 ? ` · ${k.belum_cocok} belum cocok` : " · tuntas"}
                </option>
              ))}
            </select>
          </div>

          {detail && (
            <>
              {/* ── LAPIS 1 — KEADAAN ── */}
              <div className="rise rise-2" style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "var(--gap-grid)", marginBottom: "var(--gap-bagian)",
              }}>
                <Kpi
                  label="Selisih"
                  nilai={rupiah(detail.laporan.selisih)}
                  keterangan={detail.laporan.tuntas ? "sudah ketemu" : "belum terjelaskan"}
                  warna={detail.laporan.selisih === 0 ? "var(--success)" : "var(--danger)"}
                />
                <Kpi
                  label="Belum cocok — koran"
                  nilai={String(detail.laporan.baris_belum_cocok)}
                  keterangan={`dari ${detail.baris.length} baris mutasi`}
                  warna={detail.laporan.baris_belum_cocok > 0 ? "var(--warning)" : undefined}
                />
                <Kpi
                  label="Belum cocok — buku"
                  nilai={String(detail.laporan.transaksi_belum_cocok)}
                  keterangan={`dari ${detail.buku.length} transaksi`}
                  warna={detail.laporan.transaksi_belum_cocok > 0 ? "var(--warning)" : undefined}
                />
                <Kpi
                  label="Status"
                  nilai={terkunci ? "Dikunci" : "Terbuka"}
                  keterangan={terkunci ? "angkanya berhenti berubah" : "masih bisa dicocokkan"}
                  warna={terkunci ? "var(--info)" : undefined}
                />
              </div>

              {/* ── LAPIS 2 — LAPORAN 4 BARIS ── */}
              <div className="rise rise-3" style={{ ...kartu, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
                  Laporan rekonsiliasi
                </h2>
                <p style={{ fontSize: 12, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 }}>
                  Bentuk baku yang dipakai akuntan. Baris terakhir yang menentukan:
                  selisih nol berarti buku dan bank bercerita hal yang sama.
                </p>
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px", fontSize: 13 }}>
                  <BarisLaporan label="Saldo menurut bank" nilai={detail.laporan.saldo_bank} />
                  <BarisLaporan label="+ Setoran dalam perjalanan" nilai={detail.laporan.setoran_dalam_perjalanan} />
                  <BarisLaporan label="− Cek / transfer beredar" nilai={-detail.laporan.cek_beredar} />
                  <BarisLaporan label="± Penyesuaian bank" nilai={detail.laporan.penyesuaian} />
                  <BarisLaporan label="= Saldo buku seharusnya" nilai={detail.laporan.saldo_buku_seharusnya} tebal />
                  <BarisLaporan label="Saldo buku tercatat" nilai={detail.laporan.saldo_buku} />
                  <BarisLaporan
                    label="Selisih"
                    nilai={detail.laporan.selisih}
                    tebal
                    warna={detail.laporan.selisih === 0 ? "var(--success)" : "var(--danger)"}
                  />
                </dl>

                {!terkunci && detail.laporan.tuntas && (
                  <button
                    type="button"
                    onClick={kunci}
                    disabled={sibuk}
                    style={{
                      marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", fontSize: 13, fontFamily: "inherit", fontWeight: 600,
                      border: "none", borderRadius: 10,
                      background: "var(--navy)", color: "var(--on-navy, #fff)",
                      cursor: sibuk ? "default" : "pointer", opacity: sibuk ? 0.6 : 1,
                    }}
                  >
                    <Lock size={14} aria-hidden="true" /> Kunci periode ini
                  </button>
                )}
              </div>

              {/* ── LAPIS 3 — DUA KOLOM BERSANDING ── */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
                gap: "var(--gap-grid)",
              }}>
                {/* Kolom koran */}
                <section style={{ ...kartu, overflow: "hidden" }}>
                  <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <Landmark size={15} aria-hidden="true" style={{ color: C.navy }} />
                      Rekening koran
                    </h2>
                    <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0" }}>
                      Yang belum berpasangan ditaruh di atas.
                    </p>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {barisUrut.map((b) => {
                      const u = usulPerBaris.get(b.id);
                      const cocokId = cocokPerBaris.get(b.id);
                      const nilai = Number(b.kredit) - Number(b.debit);
                      return (
                        <li key={b.id} style={{
                          padding: "10px var(--pad-kartu-lega)",
                          borderBottom: `1px solid ${C.border}`,
                          // Yang sudah cocok MEMUDAR, bukan hilang: ia tetap
                          // bisa diperiksa, tapi tak menarik perhatian.
                          background: b.sudah_cocok ? "var(--surface-subtle)" : undefined,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: b.sudah_cocok ? 400 : 600 }}>
                                {b.keterangan}
                              </div>
                              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                {tanggal(b.tanggal)}{b.ref_bank ? ` · ${b.ref_bank}` : ""}
                              </div>
                            </div>
                            <div style={{
                              fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                              fontVariantNumeric: "tabular-nums",
                              color: nilai < 0 ? "var(--danger)" : C.text,
                            }}>
                              {rupiah(nilai)}
                            </div>
                          </div>

                          {b.sudah_cocok ? (
                            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                              <CircleCheck size={13} aria-hidden="true" style={{ color: "var(--success)" }} />
                              <span style={{ fontSize: 11, color: C.mid }}>Sudah berpasangan</span>
                              {cocokId && !terkunci && (
                                <button
                                  type="button"
                                  onClick={() => lepas(cocokId)}
                                  disabled={sibuk}
                                  style={{
                                    marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "3px 8px", fontSize: 11, fontFamily: "inherit",
                                    border: `1px solid ${C.border}`, borderRadius: 8,
                                    background: "var(--surface)", color: C.mid, cursor: "pointer",
                                  }}
                                >
                                  <Unlink size={11} aria-hidden="true" /> Lepas
                                </button>
                              )}
                            </div>
                          ) : u && !terkunci ? (
                            <button
                              type="button"
                              onClick={() => cocokkan(b.id, u.sumber, u.sumber_id)}
                              disabled={sibuk}
                              style={{
                                marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "4px 10px", fontSize: 11, fontFamily: "inherit", fontWeight: 600,
                                border: `1px solid var(--info-border)`, borderRadius: 8,
                                background: "var(--info-bg)", color: "var(--info)",
                                cursor: sibuk ? "default" : "pointer",
                              }}
                            >
                              <Link2 size={11} aria-hidden="true" />
                              {/* Keyakinan DISEBUTKAN, bukan disembunyikan: yang
                                  bergeser tanggalnya perlu dilihat manusia. */}
                              {u.keyakinan === "persis"
                                ? "Cocokkan (tanggal & nominal sama)"
                                : `Cocokkan (nominal sama, beda ${u.selisih_hari} hari)`}
                            </button>
                          ) : (
                            <div style={{ marginTop: 6, fontSize: 11, color: "var(--warning)" }}>
                              Tak ada pasangan di buku — perlu diperiksa
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {/* Kolom buku */}
                <section style={{ ...kartu, overflow: "hidden" }}>
                  <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                      Buku kas
                    </h2>
                    <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0" }}>
                      Transaksi tercatat pada rekening &amp; periode yang sama.
                    </p>
                  </div>
                  {bukuUrut.length === 0 ? (
                    <p style={{ padding: "var(--pad-kartu-lega)", fontSize: 13, color: C.muted, margin: 0 }}>
                      Tak ada transaksi tercatat pada periode ini. Setiap baris koran
                      berarti uang bergerak tanpa catatan.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {bukuUrut.map((t) => (
                        <li key={`${t.sumber}:${t.id}`} style={{
                          padding: "10px var(--pad-kartu-lega)",
                          borderBottom: `1px solid ${C.border}`,
                          background: t.sudah_cocok ? "var(--surface-subtle)" : undefined,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: t.sudah_cocok ? 400 : 600 }}>
                                {t.keterangan}
                              </div>
                              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                {tanggal(t.tanggal)} · {NAMA_SUMBER[t.sumber] ?? t.sumber}
                              </div>
                            </div>
                            <div style={{
                              fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                              fontVariantNumeric: "tabular-nums",
                              color: Number(t.nominal) < 0 ? "var(--danger)" : C.text,
                            }}>
                              {rupiah(Number(t.nominal))}
                            </div>
                          </div>
                          {t.sudah_cocok ? (
                            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                              <CircleCheck size={13} aria-hidden="true" style={{ color: "var(--success)" }} />
                              <span style={{ fontSize: 11, color: C.mid }}>Sudah berpasangan</span>
                            </div>
                          ) : (
                            <div style={{ marginTop: 6, fontSize: 11, color: "var(--warning)" }}>
                              Belum muncul di koran — setoran dalam perjalanan atau belum dicairkan
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* ── Penyesuaian ── */}
              {detail.penyesuaian.length > 0 && (
                <section style={{ ...kartu, overflow: "hidden", marginTop: "var(--gap-bagian)" }}>
                  <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                      Penyesuaian bank
                    </h2>
                    <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0" }}>
                      Selisih yang SAH dan memang tak punya pasangan di buku —
                      biaya admin, jasa giro, koreksi bank.
                    </p>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {detail.penyesuaian.map((p) => (
                      <li key={p.id} style={{
                        padding: "10px var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
                        display: "flex", justifyContent: "space-between", gap: 10,
                      }}>
                        <span style={{ fontSize: 13, color: C.text }}>{p.keterangan}</span>
                        <span style={{
                          fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                          color: Number(p.nominal) < 0 ? "var(--danger)" : C.text,
                        }}>
                          {rupiah(Number(p.nominal))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string; keterangan: string; warna?: string;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: `1px solid var(--border)`,
      borderRadius: 12, padding: "var(--pad-kartu)",
      borderLeft: `3px solid ${warna ?? "var(--border)"}`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        color: "var(--text-secondary)", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
        color: warna ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
        {keterangan}
      </div>
    </div>
  );
}

function BarisLaporan({ label, nilai, tebal, warna }: {
  label: string; nilai: number; tebal?: boolean; warna?: string;
}) {
  return (
    <>
      <dt style={{
        color: warna ?? "var(--text-primary)",
        fontWeight: tebal ? 700 : 400,
        borderTop: tebal ? `1px solid var(--border)` : undefined,
        paddingTop: tebal ? 6 : 0,
      }}>
        {label}
      </dt>
      <dd style={{
        margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums",
        color: warna ?? "var(--text-primary)",
        fontWeight: tebal ? 700 : 400,
        borderTop: tebal ? `1px solid var(--border)` : undefined,
        paddingTop: tebal ? 6 : 0,
      }}>
        {rupiah(nilai)}
      </dd>
    </>
  );
}
