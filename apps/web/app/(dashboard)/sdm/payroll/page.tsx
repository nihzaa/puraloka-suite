"use client";

/**
 * PAYROLL STAF — menjalankan penggajian bulanan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MEMBENTUK SELURUH HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Slip menyimpan hasilnya, bukan menghitung ulang saat dibuka.**
 *
 * Slip yang sudah dibayarkan adalah pernyataan tentang uang yang SUDAH
 * berpindah. Kalau ia dihitung ulang dengan tarif hari ini, angka di layar
 * tak lagi cocok dengan angka di rekening — dan penerimanya tak punya cara
 * membuktikan mana yang benar.
 *
 * Karena itu ada dua tindakan yang berbeda sifatnya, dan halaman ini
 * membedakannya tegas:
 *
 *   HITUNG  menulis ulang slip periode ini (hanya selama belum dikunci)
 *   KUNCI   membekukannya — sesudahnya tak ada yang bisa mengubahnya,
 *           termasuk lewat SQL langsung (trigger migrasi 287)
 *
 * ── Kenapa layar MENOLAK, bukan menghitung dengan angka bawaan
 *
 * R-011, dari alasan penolakan founder sendiri: *"aturan pajak berubah tiap
 * tahun; salah hitung = urusan hukum, bukan bug"*.
 *
 * Selama tarif belum ditetapkan di halaman Tarif Payroll, periode ini TIDAK
 * BISA DIKUNCI — dan layar menyebutkan siapa saja yang bermasalah beserta
 * sebabnya, bukan sekadar "ada masalah".
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk keadaan periode. Kartu total dan tabel tenang —
 * angka gaji sudah cukup berat tanpa diberi warna.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Wallet, TriangleAlert, Lock, Calculator, Plus, ChevronDown, ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type StatusPeriode = "draf" | "dihitung" | "dikunci" | "dibatalkan";
type JenisKomponen = "penghasilan" | "potongan" | "informasi";

interface Komponen {
  id: string;
  urutan: number;
  jenis: JenisKomponen;
  kode: string;
  label: string;
  nominal: string | number;
  dasar_hitung: string | null;
}

interface Slip {
  id: string;
  pegawai_id: string;
  gaji_pokok: string | number;
  total_penghasilan: string | number;
  total_potongan: string | number;
  gaji_bersih: string | number;
  pph21: string | number;
  status_ptkp: string | null;
  kategori_ter: string | null;
  tarif_ter_persen: string | number | null;
  tarif_bpjs_id: string | null;
  tarif_ter_id: string | null;
  catatan: string | null;
  komponen: Komponen[];
  pegawai: {
    id: string; nomor_induk: string | null; jabatan: string | null;
    orang: { id: string; name: string } | null;
  } | null;
}

interface Periode {
  id: string;
  bulan: string;
  status: StatusPeriode;
  tanggal_acuan: string;
  catatan: string | null;
  dihitung_pada: string | null;
  dikunci_pada: string | null;
  pengunci: { id: string; name: string } | null;
}

interface Detail {
  periode: Periode;
  slip: Slip[];
  total: { pegawai: number; penghasilan: number; potongan: number; bersih: number; pph21: number };
}

interface Bermasalah {
  pegawai_id: string;
  penghalang: Array<{ kode: string; pesan: string }>;
}

const STATUS: Record<StatusPeriode, { label: string; warna: string; bg: string; border: string }> = {
  draf: { label: "Draf", warna: C.mid, bg: "var(--surface-2)", border: C.border },
  dihitung: { label: "Sudah dihitung", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  dikunci: { label: "Dikunci", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  dibatalkan: { label: "Dibatalkan", warna: C.muted, bg: "var(--surface-2)", border: C.border },
};

const rp = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`;
};

const namaBulan = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  const NAMA = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${NAMA[m - 1]} ${y}`;
};

export default function PayrollPage() {
  const [daftar, setDaftar] = useState<Periode[]>([]);
  const [periodeId, setPeriodeId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [bermasalah, setBermasalah] = useState<Bermasalah[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [bekerja, setBekerja] = useState(false);

  const [buatBaru, setBuatBaru] = useState(false);
  const [fBulan, setFBulan] = useState(() => new Date().toISOString().slice(0, 7));
  const [galatModal, setGalatModal] = useState<string | null>(null);

  const [terbuka, setTerbuka] = useState<Set<string>>(new Set());

  const muatDaftar = useCallback(async () => {
    try {
      const r = await api.get<{ periode: Periode[] }>("/api/v1/payroll/periode");
      const d = r.data.periode ?? [];
      setDaftar(d);
      setPeriodeId((s) => s || d[0]?.id || "");
    } catch {
      setGalat("Gagal memuat daftar periode payroll");
    }
  }, []);

  useEffect(() => { void muatDaftar(); }, [muatDaftar]);

  const muat = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Detail>(`/api/v1/payroll/periode/${id}`);
      setDetail(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat periode payroll");
      setDetail(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(periodeId); setBermasalah([]); }, [periodeId, muat]);

  const buatPeriode = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(fBulan)) { setGalatModal("Bulan wajib diisi"); return; }
    setBekerja(true); setGalatModal(null);
    try {
      const r = await api.post<{ periode: { id: string } }>("/api/v1/payroll/periode", { bulan: fBulan });
      setBuatBaru(false);
      await muatDaftar();
      setPeriodeId(r.data.periode.id);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal membuat periode payroll");
    } finally { setBekerja(false); }
  }, [fBulan, muatDaftar]);

  const hitung = useCallback(async () => {
    if (!periodeId) return;
    setBekerja(true); setGalat(null);
    try {
      const r = await api.post<{ bermasalah: Bermasalah[] }>(
        `/api/v1/payroll/periode/${periodeId}/hitung`, {});
      setBermasalah(r.data.bermasalah ?? []);
      await muat(periodeId);
      await muatDaftar();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menghitung payroll");
    } finally { setBekerja(false); }
  }, [periodeId, muat, muatDaftar]);

  const kunci = useCallback(async () => {
    if (!periodeId) return;
    setBekerja(true); setGalat(null);
    try {
      await api.post(`/api/v1/payroll/periode/${periodeId}/kunci`, {});
      await muat(periodeId);
      await muatDaftar();
    } catch (e) {
      const d = (e as { response?: { data?: { error?: string; penghalang?: Array<{ pesan: string }> } } })?.response?.data;
      setGalat(
        d?.penghalang?.length
          ? `${d.error ?? "Belum bisa dikunci"} — ${d.penghalang.map((p) => p.pesan).join(" ")}`
          : (d?.error ?? "Gagal mengunci periode"),
      );
    } finally { setBekerja(false); }
  }, [periodeId, muat, muatDaftar]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const p = detail?.periode;
  const terkunci = p?.status === "dikunci";
  // Slip tanpa jejak tarif = dihitung saat tarifnya belum ada. Ini yang
  // menghalangi penguncian, dan layar harus menyebutnya SEBELUM dicoba.
  const tanpaTarif = (detail?.slip ?? []).filter((s) => !s.tarif_bpjs_id || !s.tarif_ter_id);
  const tanpaGaji = (detail?.slip ?? []).filter((s) => Number(s.gaji_pokok ?? 0) === 0);
  // Bergaji tapi NOL potongan — periode tarifnya ada, barisnya kosong.
  // Ditemukan dari layar: `tarif_*_id` terisi sehingga pemeriksaan di atas
  // lolos, dan periode nyaris dikunci dengan potongan Rp 0 untuk semua orang.
  const nolPotongan = (detail?.slip ?? []).filter(
    (s) => Number(s.gaji_pokok ?? 0) > 0 && Number(s.total_potongan ?? 0) === 0);

  return (
    // `--w-luas`: tabel slip padat kolom (pegawai, penghasilan, potongan,
    // pajak, bersih), dan angka rupiah kehilangan arti begitu membungkus.
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <p style={{ fontSize: 13, color: C.mid, margin: "0 0 18px", maxWidth: "72ch", lineHeight: 1.55 }}>
        Penggajian bulanan staf kantor. Slip <strong>menyimpan angkanya</strong>,
        tidak dihitung ulang saat dibuka — slip yang sudah dibayarkan adalah
        pernyataan tentang uang yang sudah berpindah, dan menghitungnya ulang
        dengan tarif baru membuat angka di layar tak cocok dengan angka di rekening.
      </p>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galat}</div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
        {daftar.length > 0 && (
          <div className="rise" style={{ ...kartu, padding: "12px 16px", minWidth: 240, flex: "0 1 320px" }}>
            <label htmlFor="pr-periode" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Periode</label>
            <select
              id="pr-periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)}
              style={{
                padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
              }}
            >
              {daftar.map((d) => (
                <option key={d.id} value={d.id}>
                  {namaBulan(d.bulan)} — {STATUS[d.status].label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button" onClick={() => { setBuatBaru(true); setGalatModal(null); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, cursor: "pointer",
          }}
        ><Plus size={14} aria-hidden="true" /> Periode baru</button>
      </div>

      {daftar.length === 0 ? (
        <Kosong
          ikon={<Wallet size={28} />}
          judul="Belum ada periode penggajian"
          sebab="Buka periode untuk satu bulan, hitung slipnya, lalu kunci setelah diperiksa. Yang dikunci tak bisa diubah lagi — termasuk lewat basis."
        />
      ) : memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : detail && p ? (
        <>
          {/* ── SPANDUK KEADAAN — satu-satunya yang menonjol ─────────────── */}
          {terkunci ? (
            <div role="status" className="rise" style={{
              ...kartu, padding: "14px 18px", marginBottom: 14,
              borderColor: "var(--success-border)", background: "var(--success-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--success)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Lock size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
                <strong style={{ fontSize: 15, color: "var(--success)" }}>
                  {namaBulan(p.bulan)} sudah dikunci
                </strong>
                {p.pengunci && (
                  <span style={{ fontSize: 12, color: C.mid }}>oleh {p.pengunci.name}</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: C.mid, margin: "6px 0 0 26px", maxWidth: "68ch", lineHeight: 1.5 }}>
                Slipnya tak bisa diubah lagi — termasuk lewat basis. Kalau ada
                koreksi, buat periode penyesuaian tersendiri supaya jejaknya terlihat.
              </p>
            </div>
          ) : tanpaTarif.length > 0 || tanpaGaji.length > 0 || nolPotongan.length > 0 ? (
            <div role="status" className="rise" style={{
              ...kartu, padding: "16px 18px", marginBottom: 14,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--warning-teks)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <TriangleAlert size={18} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
                <strong style={{ fontSize: 15, color: "var(--warning-teks)" }}>
                  Belum bisa dikunci
                </strong>
              </div>
              <ul style={{ margin: "0 0 0 26px", padding: 0, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                {tanpaTarif.length > 0 && (
                  <li>
                    <strong>{tanpaTarif.length} slip</strong> dihitung saat tarif belum
                    ditetapkan — potongan BPJS dan pajaknya nol bukan karena memang nol.
                    Isi di <strong>Tarif Payroll</strong>, lalu hitung ulang.
                  </li>
                )}
                {tanpaGaji.length > 0 && (
                  <li>
                    <strong>{tanpaGaji.length} pegawai</strong> belum punya gaji pokok
                    di data kepegawaian.
                  </li>
                )}
                {nolPotongan.length > 0 && (
                  <li>
                    <strong>{nolPotongan.length} slip</strong> bergaji tapi nol potongan —
                    tabel tarifnya kemungkinan masih kosong (periodenya sudah dibuat,
                    barisnya belum diisi). Periksa <strong>Tarif Payroll</strong>,
                    lalu hitung ulang.
                  </li>
                )}
              </ul>
              <p style={{ fontSize: 12, color: C.mid, margin: "8px 0 0 26px", maxWidth: "68ch", lineHeight: 1.5 }}>
                Ini disengaja. Menghitung dengan angka bawaan menghasilkan slip gaji
                yang tampak benar tanpa seorang pun pernah memutuskan angkanya —
                dan yang menerimanya tak punya cara tahu.
              </p>
            </div>
          ) : detail.slip.length > 0 ? (
            <div role="status" className="rise" style={{
              ...kartu, padding: "14px 18px", marginBottom: 14,
              borderColor: "var(--success-border)", background: "var(--success-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--success)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
                <strong style={{ fontSize: 15, color: "var(--success)" }}>
                  Semua slip lengkap — siap dikunci
                </strong>
                <button
                  type="button" onClick={() => void kunci()} disabled={bekerja}
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                    border: "1px solid var(--navy)", background: "var(--navy)",
                    color: "var(--on-navy)", cursor: bekerja ? "not-allowed" : "pointer",
                    opacity: bekerja ? 0.7 : 1,
                  }}
                ><Lock size={14} aria-hidden="true" />{bekerja ? "Mengunci…" : "Kunci periode"}</button>
              </div>
              <p style={{ fontSize: 12, color: C.mid, margin: "6px 0 0 26px", maxWidth: "68ch", lineHeight: 1.5 }}>
                Sesudah dikunci, slip tak bisa diubah lagi — termasuk lewat basis.
              </p>
            </div>
          ) : null}

          <div className="rise" style={{ ...kartu, padding: "14px 18px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14, color: C.text }}>{namaBulan(p.bulan)}</strong>
              <span style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                color: STATUS[p.status].warna, background: STATUS[p.status].bg,
                border: `1px solid ${STATUS[p.status].border}`,
              }}>{STATUS[p.status].label}</span>
              <span style={{ fontSize: 11, color: C.muted }}>
                tarif yang dipakai: yang berlaku pada {p.tanggal_acuan}
              </span>
              {!terkunci && (
                <button
                  type="button" onClick={() => void hitung()} disabled={bekerja}
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                    border: `1px solid ${C.border}`, background: "var(--surface)",
                    color: C.text, cursor: bekerja ? "not-allowed" : "pointer",
                  }}
                >
                  <Calculator size={14} aria-hidden="true" />
                  {bekerja ? "Menghitung…" : detail.slip.length > 0 ? "Hitung ulang" : "Hitung"}
                </button>
              )}
            </div>
          </div>

          {detail.slip.length === 0 ? (
            <Kosong
              ikon={<Calculator size={28} />}
              judul="Belum dihitung"
              sebab="Jalankan hitung untuk membuat slip seluruh pegawai aktif. Yang tarifnya belum lengkap akan disebutkan satu per satu, bukan dihitung dengan angka bawaan."
            />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8, marginBottom: 14 }}>
                {[
                  { l: "Pegawai", v: String(detail.total.pegawai), sub: "slip dibuat" },
                  { l: "Penghasilan", v: rp(detail.total.penghasilan), sub: "sebelum potongan" },
                  { l: "Potongan", v: rp(detail.total.potongan), sub: `termasuk PPh 21 ${rp(detail.total.pph21)}` },
                  { l: "Dibayarkan", v: rp(detail.total.bersih), sub: "gaji bersih" },
                ].map((k) => (
                  <div key={k.l} style={{ ...kartu, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                      textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: C.text,
                      fontVariantNumeric: "tabular-nums" }}>{k.v}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {bermasalah.length > 0 && (
                <div className="rise" style={{
                  ...kartu, padding: "12px 16px", marginBottom: 14,
                  borderColor: "var(--warning-border)", background: "var(--warning-bg)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <TriangleAlert size={14} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
                    <strong style={{ fontSize: 12.5, color: "var(--warning-teks)" }}>
                      {bermasalah.length} slip punya penghalang
                    </strong>
                  </div>
                  {/* Dikelompokkan menurut SEBAB, bukan didaftar per pegawai.
                      *
                      * Versi pertama mengulang pesan yang sama persis lima
                      * kali (~250 kata) karena kelima pegawai punya masalah
                      * yang identik. Yang dibaca orang cuma yang pertama, dan
                      * pengulangan itu justru MENYEMBUNYIKAN kalau ada satu
                      * pegawai dengan masalah berbeda. Ketahuan dari layar. */}
                  <ul style={{ margin: "0 0 0 20px", padding: 0, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                    {(() => {
                      const peta = new Map<string, string[]>();
                      for (const b of bermasalah) {
                        const s = detail.slip.find((x) => x.pegawai_id === b.pegawai_id);
                        const nama = s?.pegawai?.orang?.name ?? s?.pegawai?.nomor_induk ?? "Pegawai";
                        for (const h of b.penghalang) {
                          peta.set(h.pesan, [...(peta.get(h.pesan) ?? []), nama]);
                        }
                      }
                      return [...peta.entries()]
                        // Yang menimpa paling banyak orang lebih dulu.
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([pesan, orang]) => (
                          <li key={pesan}>
                            {pesan}{" "}
                            <span style={{ color: C.muted }}>
                              ({orang.length === detail.slip.length
                                ? "semua pegawai"
                                : orang.slice(0, 3).join(", ")
                                  + (orang.length > 3 ? ` +${orang.length - 3} lagi` : "")})
                            </span>
                          </li>
                        ));
                    })()}
                  </ul>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.slip.map((s) => {
                  const buka = terbuka.has(s.id);
                  const nama = s.pegawai?.orang?.name ?? "(tanpa nama)";
                  return (
                    <div key={s.id} style={kartu}>
                      <button
                        type="button"
                        onClick={() => setTerbuka((t) => {
                          const n = new Set(t);
                          if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                          return n;
                        })}
                        aria-expanded={buka}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "12px 16px", background: "transparent", border: "none",
                          cursor: "pointer", textAlign: "left", color: C.text,
                        }}
                      >
                        {buka
                          ? <ChevronDown size={16} aria-hidden="true" style={{ color: C.muted, flexShrink: 0 }} />
                          : <ChevronRight size={16} aria-hidden="true" style={{ color: C.muted, flexShrink: 0 }} />}
                        <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                          <strong style={{ fontSize: 13.5 }}>{nama}</strong>
                          <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>
                            {s.pegawai?.nomor_induk ?? "—"}
                            {s.pegawai?.jabatan ? ` · ${s.pegawai.jabatan}` : ""}
                            {s.status_ptkp ? ` · PTKP ${s.status_ptkp}` : ""}
                          </span>
                        </span>
                        <span style={{
                          fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums",
                          textAlign: "right", flex: "0 0 auto",
                        }}>
                          <span style={{ display: "block" }}>{rp(s.total_penghasilan)}</span>
                          <span style={{ display: "block", fontSize: 11, color: "var(--danger)" }}>
                            −{rp(s.total_potongan).replace("Rp ", "Rp ")}
                          </span>
                        </span>
                        <span style={{
                          fontSize: 15, fontWeight: 700, color: C.text,
                          fontVariantNumeric: "tabular-nums", minWidth: 130, textAlign: "right",
                          flex: "0 0 auto",
                        }}>{rp(s.gaji_bersih)}</span>
                      </button>

                      {buka && (
                        <div style={{ padding: "0 16px 14px 42px" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <caption style={{
                              captionSide: "top", textAlign: "left", fontSize: 11,
                              color: C.muted, paddingBottom: 6,
                            }}>
                              Rincian slip {nama} — {namaBulan(p.bulan)}
                            </caption>
                            <thead>
                              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                {["Komponen", "Dasar hitung", "Nominal"].map((h, i) => (
                                  <th key={h} scope="col" style={{
                                    textAlign: i === 2 ? "right" : "left",
                                    padding: "6px 8px", fontSize: 11, fontWeight: 700,
                                    color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em",
                                  }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {s.komponen.map((k) => (
                                <tr key={k.id} style={{ borderBottom: "1px solid var(--surface-hover)" }}>
                                  <td style={{ padding: "6px 8px", color: C.text }}>
                                    {k.label}
                                    {/* `informasi` = ditanggung perusahaan. Dinyatakan
                                        eksplisit supaya tak terbaca sebagai potongan. */}
                                    {k.jenis === "informasi" && (
                                      <span style={{ fontSize: 11, color: C.muted }}> · tidak mengurangi</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "6px 8px", color: C.muted, fontSize: 11.5 }}>
                                    {k.dasar_hitung ?? "—"}
                                  </td>
                                  <td style={{
                                    padding: "6px 8px", textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                    color: k.jenis === "potongan" ? "var(--danger)"
                                      : k.jenis === "informasi" ? C.muted : C.text,
                                  }}>
                                    {k.jenis === "potongan" ? "−" : ""}{rp(k.nominal)}
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={2} style={{
                                  padding: "8px 8px 0", textAlign: "right",
                                  fontSize: 12, fontWeight: 700, color: C.text,
                                }}>Diterima</td>
                                <td style={{
                                  padding: "8px 8px 0", textAlign: "right",
                                  fontSize: 14, fontWeight: 700, color: C.text,
                                  fontVariantNumeric: "tabular-nums",
                                }}>{rp(s.gaji_bersih)}</td>
                              </tr>
                            </tbody>
                          </table>

                          {(!s.tarif_bpjs_id || !s.tarif_ter_id) && (
                            <p style={{
                              fontSize: 11.5, color: "var(--warning-teks)", marginTop: 8,
                              padding: "8px 10px", borderRadius: 6,
                              background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                            }}>
                              Slip ini dihitung saat tarif belum ditetapkan — potongan yang
                              hilang bukan berarti nol.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : null}

      <DialogBersama
        terbuka={buatBaru}
        onTutup={() => setBuatBaru(false)}
        judul="Periode penggajian baru"
        keterangan="Tarif yang dipakai adalah yang berlaku pada akhir bulan periode ini."
        kaki={
          <>
            <button type="button" onClick={() => setBuatBaru(false)} disabled={bekerja}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: bekerja ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void buatPeriode()} disabled={bekerja}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: bekerja ? "not-allowed" : "pointer",
                opacity: bekerja ? 0.7 : 1,
              }}>{bekerja ? "Membuat…" : "Buat"}</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="pr-bulan" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Bulan</label>
            <input
              id="pr-bulan" type="month" value={fBulan} onChange={(e) => setFBulan(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}
            />
          </div>

          {galatModal && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
              color: "var(--danger)",
            }}>{galatModal}</div>
          )}
        </div>
      </DialogBersama>
    </div>
  );
}
