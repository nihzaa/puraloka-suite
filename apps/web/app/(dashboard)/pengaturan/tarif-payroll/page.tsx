"use client";

/**
 * TARIF PAYROLL — PTKP, PPh 21 (TER), dan BPJS sebagai DATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA SEBELUM HALAMAN PAYROLL-NYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * R-011 (2026-08-11) mencabut larangan membangun payroll dengan syarat yang
 * diucapkan founder lewat alasan penolakan aslinya:
 *
 *   "aturan pajak berubah tiap tahun; salah hitung = urusan hukum, bukan bug"
 *
 * Konsekuensinya: tarif TIDAK BOLEH ditulis ke dalam kode. Sampai diisi di
 * sini, layar payroll menyatakan "tarif belum ditetapkan" dan tidak
 * menghitung apa pun.
 *
 * Slip gaji yang salah keluar dengan tampilan meyakinkan — nama benar,
 * periode benar, potongan tampak masuk akal — dan penerimanya tak punya cara
 * tahu bahwa angkanya lahir dari tebakan, bukan dari peraturan.
 *
 * ── Kenapa tarif DITAMBAH, bukan diganti
 *
 * Tiap perubahan aturan menjadi periode baru dengan tanggal berlaku sendiri.
 * Slip Januari harus tetap bisa dihitung ulang dengan tarif Januari bahkan
 * sesudah tarif berubah di Juli — kalau tidak, riwayat penggajian tak bisa
 * diaudit dan perbaikan retroaktif tak bisa dibedakan dari kesalahan.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol HANYA spanduk kesiapan. Tabel dan kartu tenang.
 */

import { useCallback, useState } from "react";
import { Scale, TriangleAlert, ShieldCheck, Plus, Trash2 , Percent } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Tabel } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type Jenis = "ptkp" | "ter_pph21" | "bpjs";

interface Baris {
  id: string;
  periode_id: string;
  urutan: number;
  kunci: string;
  label: string | null;
  batas_bawah: string | number | null;
  batas_atas: string | number | null;
  nilai_nominal: string | number | null;
  nilai_persen: string | number | null;
  persen_perusahaan: string | number | null;
  persen_karyawan: string | number | null;
}

interface Periode {
  id: string;
  jenis: Jenis;
  berlaku_sejak: string;
  dasar_hukum: string;
  catatan: string | null;
  baris: Baris[];
}

interface Data {
  periode: Periode[];
  kesiapan: { siap: boolean; belum_ditetapkan: Jenis[]; kosong: Jenis[] };
  pada: string;
  berlaku: Record<string, string | null>;
}

/**
 * Penjelasan tiap jenis — ditulis di layar.
 *
 * Yang mengisi halaman ini bukan akuntan pajak. Ia perlu tahu apa yang
 * diminta dan dari mana angkanya, bukan sekadar nama kolom.
 */
/**
 * `tampil` menyebut kolom mana yang RELEVAN untuk tiap jenis.
 *
 * Tanpa ini, tabel BPJS menampilkan tiga kolom yang isinya "—" selamanya
 * (Rentang, Nominal, Persen) — kolom kosong yang tak akan pernah terisi
 * membuat pembacanya mengira ada data yang belum diisi. Ketahuan dari layar.
 *
 * Batas atas TETAP ditampilkan untuk BPJS: sebagian iuran punya batas upah
 * (ceiling), dan itulah satu-satunya alasan angka iuran bisa tak sama dengan
 * persen × gaji.
 */
const JENIS: Record<Jenis, {
  label: string; guna: string; contohKunci: string; kolom: string;
  tampil: Array<"rentang" | "nominal" | "persen" | "perusahaan" | "karyawan">;
}> = {
  ptkp: {
    label: "PTKP",
    guna: "Penghasilan Tidak Kena Pajak menurut status keluarga karyawan.",
    contohKunci: "TK/0 · K/0 · K/1 · K/2 · K/3",
    kolom: "Isi Nominal (rupiah per tahun).",
    tampil: ["nominal"],
  },
  ter_pph21: {
    label: "PPh 21 (TER)",
    guna: "Lapisan Tarif Efektif Rata-rata — dipakai memotong pajak bulanan.",
    contohKunci: "A · B · C (kategori TER menurut status PTKP)",
    kolom: "Isi Batas bawah, Batas atas, dan Persen. Lapisan terakhir dikosongkan batas atasnya.",
    tampil: ["rentang", "persen"],
  },
  bpjs: {
    label: "BPJS",
    guna: "Persentase iuran jaminan sosial, terpisah antara perusahaan dan karyawan.",
    contohKunci: "jht · jp · jkk · jkm · kesehatan",
    kolom: "Isi Persen perusahaan dan/atau Persen karyawan. Batas atas dipakai bila iuran punya batas upah.",
    tampil: ["rentang", "perusahaan", "karyawan"],
  },
};

const JUDUL_KOLOM: Record<string, string> = {
  rentang: "Rentang upah",
  nominal: "Nominal",
  persen: "Persen",
  perusahaan: "Perusahaan",
  karyawan: "Karyawan",
};

const rp = (v: string | number | null) => {
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
};

const pct = (v: string | number | null) => {
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(n)} %`;
};

const tanggal = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

export default function TarifPayrollPage() {
  const [buatPeriode, setBuatPeriode] = useState(false);
  const [fJenis, setFJenis] = useState<Jenis>("bpjs");
  const [fSejak, setFSejak] = useState("");
  const [fDasar, setFDasar] = useState("");

  const [tambahKe, setTambahKe] = useState<Periode | null>(null);
  const [bKunci, setBKunci] = useState("");
  const [bLabel, setBLabel] = useState("");
  const [bBawah, setBBawah] = useState("");
  const [bAtas, setBAtas] = useState("");
  const [bNominal, setBNominal] = useState("");
  const [bPersen, setBPersen] = useState("");
  const [bPerusahaan, setBPerusahaan] = useState("");
  const [bKaryawan, setBKaryawan] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect. Pesan galat server (dari
    body respons) tak lagi tersedia lewat `useData` (ia hanya memaparkan
    `Error`), jadi pesan bawaan yang dipakai — perilaku yang sama dengan
    halaman lain yang sudah dipindah lebih dulu.
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<Data>("/api/v1/payroll/tarif");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const galat = galatMuat ? "Gagal memuat tarif payroll" : null;
  // Galat AKSI (hapus baris) terpisah dari `galat` (galat MUAT) di atas —
  // satu state untuk keduanya membuat gagal menghapus menutupi pesan gagal
  // memuat, dan sebaliknya.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const simpanPeriode = useCallback(async () => {
    if (!fSejak) { setGalatModal("Tanggal berlaku wajib diisi"); return; }
    if (!fDasar.trim()) { setGalatModal("Dasar hukum wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post("/api/v1/payroll/tarif", {
        jenis: fJenis, berlaku_sejak: fSejak, dasar_hukum: fDasar.trim(),
      });
      setBuatPeriode(false); setFSejak(""); setFDasar("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menyimpan periode tarif");
    } finally { setMenyimpan(false); }
  }, [fJenis, fSejak, fDasar, muat]);

  const simpanBaris = useCallback(async () => {
    if (!tambahKe) return;
    if (!bKunci.trim()) { setGalatModal("Kunci wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/payroll/tarif/${tambahKe.id}/baris`, {
        kunci: bKunci.trim(), label: bLabel.trim() || null,
        batas_bawah: bBawah, batas_atas: bAtas,
        nilai_nominal: bNominal, nilai_persen: bPersen,
        persen_perusahaan: bPerusahaan, persen_karyawan: bKaryawan,
      });
      setTambahKe(null);
      setBKunci(""); setBLabel(""); setBBawah(""); setBAtas("");
      setBNominal(""); setBPersen(""); setBPerusahaan(""); setBKaryawan("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menyimpan baris tarif");
    } finally { setMenyimpan(false); }
  }, [tambahKe, bKunci, bLabel, bBawah, bAtas, bNominal, bPersen, bPerusahaan, bKaryawan, muat]);

  const hapusBaris = useCallback(async (id: string) => {
    setGalatAksi(null);
    try {
      await api.delete(`/api/v1/payroll/tarif/baris/${id}`);
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menghapus baris tarif");
    }
  }, [muat]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const belum = data?.kesiapan.belum_ditetapkan ?? [];
  const kosong = data?.kesiapan.kosong ?? [];

  return (
    // `--w-luas`: tabel tarif padat kolom (kunci, rentang, nominal, tiga
    // persen), dan angka kehilangan arti begitu kolomnya membungkus.
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Tarif Payroll"
          ikon={<Percent size={20} aria-hidden="true" />}
          keterangan={
            <>
              Tarif PTKP, PPh 21, dan BPJS disimpan sebagai <strong>data</strong>, bukan
              ditulis di dalam program. Aturannya berubah tiap tahun, dan slip gaji yang
              salah keluar dengan tampilan meyakinkan — penerimanya tak punya cara tahu.
              Perubahan tarif <strong>ditambahkan</strong> sebagai periode baru, tidak
              menimpa yang lama, supaya slip bulan lalu tetap bisa dihitung ulang.
            </>
          }
        />
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galat}</div>
      )}

      {galatAksi && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galatAksi}</div>
      )}

      {/* ── SPANDUK KESIAPAN — satu-satunya yang menonjol ───────────────── */}
      {data && (
        data.kesiapan.siap ? (
          <div role="status" className="rise" style={{
            ...kartu, padding: "14px 18px", marginBottom: 16,
            borderColor: "var(--success-border)", background: "var(--success-bg)",
            borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--success)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
              <strong style={{ fontSize: 15, color: "var(--success)" }}>
                Tarif lengkap — payroll boleh dihitung
              </strong>
            </div>
          </div>
        ) : (
          <div role="status" className="rise" style={{
            ...kartu, padding: "16px 18px", marginBottom: 16,
            borderColor: "var(--warning-border)", background: "var(--warning-bg)",
            borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--warning-teks)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <TriangleAlert size={18} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
              <strong style={{ fontSize: 15, color: "var(--warning-teks)" }}>
                Tarif belum ditetapkan — payroll tidak akan menghitung apa pun
              </strong>
            </div>
            <ul style={{ margin: "0 0 0 26px", padding: 0, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
              {belum.map((j) => (
                <li key={j}><strong>{JENIS[j].label}</strong> — belum ada tarif yang berlaku</li>
              ))}
              {kosong.map((j) => (
                <li key={j}>
                  <strong>{JENIS[j].label}</strong> — periodenya ada tapi{" "}
                  <strong>belum berisi baris</strong>, jadi perhitungannya menghasilkan nol
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: C.mid, margin: "8px 0 0 26px", maxWidth: "68ch", lineHeight: 1.5 }}>
              Ini disengaja. Menghitung dengan angka bawaan menghasilkan slip gaji
              yang tampak benar tanpa seorang pun pernah memutuskan angkanya.
            </p>
          </div>
        )
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setBuatPeriode(true); setGalatModal(null); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
            border: "1px solid var(--navy)", background: "var(--navy)",
            color: "var(--on-navy)", cursor: "pointer",
          }}
        >
          <Plus size={14} aria-hidden="true" /> Tetapkan tarif baru
        </button>
      </div>

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : data && data.periode.length === 0 ? (
        <div style={{ ...kartu, padding: "28px 22px", textAlign: "center" }}>
          <Scale size={28} aria-hidden="true" style={{ color: C.muted }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "10px 0 4px" }}>
            Belum ada satu pun tarif
          </p>
          <p style={{ fontSize: 12, color: C.mid, maxWidth: "56ch", margin: "0 auto", lineHeight: 1.6 }}>
            Isi ketiga jenis — PTKP, PPh 21, dan BPJS — beserta dasar hukum dan
            tanggal berlakunya. Sampai itu ada, payroll menolak menghitung.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(data?.periode ?? []).map((p) => {
            const j = JENIS[p.jenis];
            const berlaku = data?.berlaku[p.jenis] === p.id;
            return (
              <div key={p.id} className="rise" style={{ ...kartu, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14, color: C.text }}>{j.label}</strong>
                  <span style={{ fontSize: 12, color: C.mid }}>
                    berlaku sejak {tanggal(p.berlaku_sejak)}
                  </span>
                  {berlaku && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      color: "var(--success)", background: "var(--success-bg)",
                      border: "1px solid var(--success-border)",
                    }}>berlaku hari ini</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setTambahKe(p); setGalatModal(null); }}
                    style={{
                      marginLeft: "auto",
                      padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${C.border}`, background: "var(--surface)",
                      color: C.text, cursor: "pointer",
                    }}
                  >+ Baris</button>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  Dasar: {p.dasar_hukum}
                </div>

                {p.baris.length === 0 ? (
                  <p style={{
                    fontSize: 12, color: "var(--warning-teks)", marginTop: 10,
                    padding: "8px 10px", borderRadius: 6,
                    background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                  }}>
                    Periode ini belum berisi baris — perhitungannya akan menghasilkan
                    nol. {j.kolom}
                  </p>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    {/* Judul tabel dinaikkan jadi teks biasa di atasnya,
                        bukan `<caption>` yang terlihat. `<Tabel>` selalu
                        menyembunyikan caption-nya (sr-only), dan keterangan
                        "berlaku sejak" ini justru perlu DILIHAT — periode
                        yang keliru dibaca adalah cara paling mudah salah
                        menghitung gaji satu perusahaan. */}
                    <p style={{ fontSize: 11, color: C.muted, paddingBottom: 6 }}>
                      Baris tarif {j.label} yang berlaku sejak {tanggal(p.berlaku_sejak)}
                    </p>
                    <Tabel              berpermukaan
                      caption={`Baris tarif ${j.label} yang berlaku sejak ${tanggal(p.berlaku_sejak)}`}
                      data={p.baris}
                      kunciBaris={(b) => b.id}
                      kolom={[
                        {
                          kunci: "kunci",
                          judul: "Kunci",
                          kepalaBaris: true,
                          render: (b) => (
                            <>
                              <strong>{b.kunci}</strong>
                              {b.label && <span style={{ color: C.muted }}> · {b.label}</span>}
                            </>
                          ),
                        },
                        // Hanya kolom yang RELEVAN untuk jenis ini — lihat
                        // `tampil`. Kolom yang selamanya "—" membuat
                        // pembacanya mengira ada data yang belum diisi.
                        ...j.tampil.map((k) => ({
                          kunci: k,
                          judul: JUDUL_KOLOM[k],
                          rata: "kanan" as const,
                          render: (b: (typeof p.baris)[number]) => (
                            <span style={{ color: k === "rentang" ? C.mid : C.text }}>
                              {k === "rentang"
                                ? b.batas_bawah === null && b.batas_atas === null
                                  ? "—"
                                  : `${rp(b.batas_bawah)} – ${b.batas_atas === null ? "∞" : rp(b.batas_atas)}`
                                : k === "nominal" ? rp(b.nilai_nominal)
                                : k === "persen" ? pct(b.nilai_persen)
                                : k === "perusahaan" ? pct(b.persen_perusahaan)
                                : pct(b.persen_karyawan)}
                            </span>
                          ),
                        })),
                        {
                          kunci: "aksi",
                          judul: "",
                          // Lebar dipatok supaya kolom nominal di sebelahnya
                          // benar-benar berakhir di kanan. Tanpa ini kolom aksi
                          // memakan sisa lebar tabel, dan angka yang seharusnya
                          // rata kanan berhenti di tengah — persis alasan
                          // `rata: "kanan"` dipakai, dibatalkan oleh tetangganya.
                          lebar: 44,
                          render: (b) => (
                            <button
                              type="button"
                              onClick={() => void hapusBaris(b.id)}
                              aria-label={`Hapus baris ${b.kunci}`}
                              style={{
                                display: "inline-flex", alignItems: "center",
                                padding: 5, borderRadius: 6,
                                border: `1px solid ${C.border}`, background: "var(--surface)",
                                color: "var(--danger)", cursor: "pointer",
                              }}
                            ><Trash2 size={13} aria-hidden="true" /></button>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: periode baru ─────────────────────────────────────────── */}
      <DialogBersama
        terbuka={buatPeriode}
        onTutup={() => setBuatPeriode(false)}
        judul="Tetapkan tarif baru"
        keterangan="Perubahan tarif ditambahkan sebagai periode baru — yang lama tetap ada supaya slip lama bisa dihitung ulang."
        kaki={
          <>
            <button type="button" onClick={() => setBuatPeriode(false)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanPeriode()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label htmlFor="tp-jenis" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Jenis tarif</label>
            <select id="tp-jenis" value={fJenis} onChange={(e) => setFJenis(e.target.value as Jenis)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}>
              {(Object.keys(JENIS) as Jenis[]).map((k) => (
                <option key={k} value={k}>{JENIS[k].label}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              {JENIS[fJenis].guna} Kuncinya: {JENIS[fJenis].contohKunci}.
            </p>
          </div>

          <div>
            <label htmlFor="tp-sejak" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Berlaku sejak</label>
            <input id="tp-sejak" type="date" value={fSejak} onChange={(e) => setFSejak(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }} />
          </div>

          <div>
            <label htmlFor="tp-dasar" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Dasar hukum <span style={{ color: "var(--danger)" }}>· wajib</span></label>
            <input id="tp-dasar" type="text" value={fDasar} onChange={(e) => setFDasar(e.target.value)}
              placeholder="mis. PMK-168/2023 · PP 44/2015 Ps. 16"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }} />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Tarif tanpa dasar hukum tak bisa dipertanggungjawabkan saat pemeriksaan,
              dan yang memeriksanya tak punya cara tahu dari mana angkanya.
            </p>
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

      {/* ── Modal: baris tarif ──────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambahKe !== null}
        onTutup={() => setTambahKe(null)}
        judul="Tambah baris tarif"
        keterangan={tambahKe ? `${JENIS[tambahKe.jenis].label} · berlaku sejak ${tanggal(tambahKe.berlaku_sejak)}` : undefined}
        kaki={
          <>
            <button type="button" onClick={() => setTambahKe(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanBaris()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
          </>
        }
      >
        {tambahKe && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              background: "var(--surface-2)", border: `1px solid ${C.border}`, color: C.mid,
            }}>
              {JENIS[tambahKe.jenis].kolom} Kunci yang dipakai:{" "}
              <strong style={{ color: C.text }}>{JENIS[tambahKe.jenis].contohKunci}</strong>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label htmlFor="tb-kunci" style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Kunci <span style={{ color: "var(--danger)" }}>· wajib</span>
                </label>
                <input id="tb-kunci" value={bKunci} onChange={(e) => setBKunci(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text }} />
              </div>
              <div>
                <label htmlFor="tb-label" style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Label</label>
                <input id="tb-label" value={bLabel} onChange={(e) => setBLabel(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text }} />
              </div>
              {/* Hanya isian yang RELEVAN untuk jenis ini. Menampilkan enam
                  kolom yang empat di antaranya tak dipakai membuat pengisi
                  menebak mana yang wajib — dan tebakan yang salah di sini
                  menghasilkan tarif yang diam-diam tak pernah cocok. */}
              {[
                { id: "tb-bawah", l: "Batas bawah", v: bBawah, s: setBBawah, k: "rentang" },
                { id: "tb-atas", l: "Batas atas", v: bAtas, s: setBAtas, k: "rentang" },
                { id: "tb-nominal", l: "Nominal (Rp)", v: bNominal, s: setBNominal, k: "nominal" },
                { id: "tb-persen", l: "Persen (%)", v: bPersen, s: setBPersen, k: "persen" },
                { id: "tb-perusahaan", l: "Persen perusahaan (%)", v: bPerusahaan, s: setBPerusahaan, k: "perusahaan" },
                { id: "tb-karyawan", l: "Persen karyawan (%)", v: bKaryawan, s: setBKaryawan, k: "karyawan" },
              ].filter((f) => JENIS[tambahKe.jenis].tampil.includes(f.k as never)).map((f) => (
                <div key={f.id}>
                  <label htmlFor={f.id} style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.l}</label>
                  <input
                    id={f.id} type="number" step="any" inputMode="decimal"
                    value={f.v} onChange={(e) => f.s(e.target.value)}
                    placeholder="kosongkan bila tak berlaku"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text }} />
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              Kolom yang dikosongkan disimpan sebagai <strong>tak berlaku</strong>,
              bukan nol — jadi kosongkan yang memang tak dipakai jenis ini.
            </p>

            {galatModal && (
              <div role="alert" style={{
                padding: "10px 12px", borderRadius: 8, fontSize: 12,
                border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
                color: "var(--danger)",
              }}>{galatModal}</div>
            )}
          </div>
        )}
      </DialogBersama>
    </div>
  );
}
