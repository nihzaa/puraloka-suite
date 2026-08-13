"use client";

/**
 * MANAJEMEN CONTINGENCY (F5 PEMBEDA)
 *
 * ── Yang dijawab halaman ini
 *
 * "Cadangan proyek ini masih berapa? Boleh ambil lagi?"
 *
 * ── Kenapa DEFISIT ditampilkan negatif, bukan nol
 *
 * Diukur pada data nyata: cadangan Rp 28,5 juta, terpakai Rp 32 juta →
 * sisa −Rp 3,5 juta. Meratakannya ke nol menyembunyikan kejadian yang paling
 * mahal: uang sudah keluar melebihi bantalan, dan tak ada yang tahu.
 *
 * ── Kenapa "terlampaui" dipisah dari "kritis"
 *
 * Terpakai 112% adalah defisit; terpakai 95% adalah nyaris habis. Keduanya
 * menuntut tindakan berbeda — yang pertama mencari sumber dana lain, yang
 * kedua cukup berhenti menarik.
 */

import { useEffect, useMemo, useState } from "react";
import { PiggyBank, AlertTriangle, TrendingDown, ShieldCheck, Plus, RefreshCw } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { ContingencyTarikModal } from "@/components/contingency-tarik-modal";
import { formatRupiah } from "@/lib/format";

type Proyek = { id: string; name: string };

type StatusPos = "aman" | "menipis" | "kritis" | "terlampaui" | "ditutup";

type Pos = {
  id: string;
  project_id: string;
  project_name: string;
  nama: string;
  nilai: number;
  terpakai: number;
  sisa: number;
  terpakai_pct: number;
  porsi_kontrak_pct: number | null;
  status: StatusPos;
  jumlah_penarikan: number;
  penarikan_terakhir: string | null;
};

type Hasil = {
  pos: Pos[];
  total_cadangan: number;
  total_terpakai: number;
  total_sisa: number;
  jumlah_aman: number;
  jumlah_menipis: number;
  jumlah_kritis: number;
  jumlah_terlampaui: number;
  proyek_tanpa_pos: Array<{ project_id: string; project_name: string }>;
};

const STATUS_META: Record<StatusPos, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  terlampaui: {
    label: "Terlampaui", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Terpakai MELEBIHI cadangan — sudah defisit. Perlu sumber dana lain, bukan sekadar berhenti menarik.",
  },
  kritis: {
    label: "Kritis", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Terpakai ≥90% — nyaris habis, tapi belum defisit.",
  },
  menipis: {
    label: "Menipis", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Terpakai ≥60%. Belum gawat, tapi laju penarikannya perlu dilihat.",
  },
  aman: {
    label: "Aman", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Terpakai di bawah 60% — bantalannya masih tebal.",
  },
  ditutup: {
    label: "Ditutup", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Pos ditutup secara administratif — tak lagi dihitung sebagai bantalan yang tersedia.",
  },
};

const rupiah = formatRupiah;

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Pos yang menuntut tindakan — dipakai untuk pita kiri sekaligus latar baris. */
const mendesak = (p: Pos) => p.status === "terlampaui" || p.status === "kritis";

/**
 * Kolom tabel pos cadangan.
 *
 * Di tingkat modul, bukan di dalam komponen: isinya tak bergantung pada satu
 * pun state, jadi menyusunnya ulang tiap render hanya membuat `Tabel`
 * menerima array baru tanpa ada yang berubah.
 *
 * ── Kenapa kepala barisnya nama pos DAN nama proyek, bukan nama pos saja
 *
 * Nama pos hanya unik PER PROYEK — API menolak duplikat dengan pesan
 * "sudah ada di proyek ini" (`routes/v1/contingency.ts`), bukan secara
 * global. Jadi "Cadangan Risiko Utama" akan muncul berkali-kali begitu ada
 * beberapa proyek. Kepala baris yang cuma menyebut nama pos membuat pembaca
 * layar mengumumkan tiga baris berbeda dengan nama yang sama persis, dan
 * angka defisitnya tak bisa lagi ditelusuri ke proyek mana.
 *
 * Proyeknya sendiri tidak dijadikan kepala baris: satu proyek boleh punya
 * beberapa pos, jadi ia juga tak menamai baris secara unik. Yang menamai
 * baris adalah pasangannya — dan keduanya memang sudah tampil di sel ini
 * sejak awal.
 */
const KOLOM: Array<Kolom<Pos>> = [
  {
    kunci: "pos", judul: "Pos cadangan", kepalaBaris: true,
    render: (p) => (
      // Pita kiri digambar di DALAM sel, bukan lewat `borderLeft` sel seperti
      // versi tabel mentahnya: `Tabel` memiliki gaya selnya sendiri, dan
      // menempelkannya lewat prop akan memaksa primitif bersama tahu soal
      // status contingency. (Preseden: `gudang/rekonsiliasi`.)
      <span style={{
        display: "block", paddingLeft: 9,
        borderLeft: mendesak(p)
          ? `3px solid ${STATUS_META[p.status].warna}`
          : "3px solid transparent",
      }}>
        {p.nama}
        <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2 }}>
          {p.project_name}
          {p.jumlah_penarikan > 0 && ` · ${p.jumlah_penarikan}× tarik`}
          {p.penarikan_terakhir && ` · terakhir ${tanggalTerbaca(p.penarikan_terakhir)}`}
        </span>
      </span>
    ),
  },
  {
    kunci: "nilai", judul: "Cadangan", rata: "kanan",
    render: (p) => <span style={{ color: C.mid }}>{rupiah(p.nilai)}</span>,
  },
  {
    kunci: "terpakai", judul: "Terpakai", rata: "kanan",
    render: (p) => (
      <>
        {rupiah(p.terpakai)}
        <span style={{ display: "block", fontSize: 10, color: C.muted }}>
          {p.terpakai_pct.toFixed(1)}%
        </span>
      </>
    ),
  },
  {
    kunci: "sisa", judul: "Sisa", rata: "kanan",
    // NEGATIF dipertahankan dan diberi warna bahaya — meratakannya ke nol
    // menyembunyikan kejadian yang paling mahal (lihat kepala berkas).
    render: (p) => (
      <span style={{ fontWeight: 700, color: p.sisa < 0 ? "var(--danger)" : C.text }}>
        {rupiah(p.sisa)}
        {p.sisa < 0 && (
          <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--danger)" }}>
            defisit
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "porsi", judul: "Porsi kontrak", rata: "kanan",
    render: (p) => (
      <span style={{ color: C.mid }}>
        {/* null ≠ 0: null = kontraknya tak diketahui. */}
        {p.porsi_kontrak_pct === null
          ? <span style={{ fontSize: 11, color: C.muted }}>kontrak kosong</span>
          : `${p.porsi_kontrak_pct.toFixed(1)}%`}
      </span>
    ),
  },
  {
    kunci: "status", judul: "Status",
    render: (p) => {
      const meta = STATUS_META[p.status];
      // Status sebagai KATA, bukan hanya warna baris — yang tak bisa
      // membedakan warna, dan pembaca layar, sama-sama butuh teksnya.
      return (
        <span title={meta.arti} style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 20,
          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          color: meta.warna, background: meta.bg, border: `1px solid ${meta.border}`,
        }}>{meta.label}</span>
      );
    },
  },
];

/**
 * Kolom + tombol tarik.
 *
 * Dibuat sebagai FUNGSI, bukan konstanta seperti `KOLOM`, karena tombolnya
 * perlu memanggil state halaman. Konstanta modul tak bisa.
 *
 * Pos yang `ditutup` tak diberi tombol sama sekali — server menolaknya
 * (`contingency.ts`: "sudah ditutup — tidak menerima penarikan baru"), dan
 * tombol yang pasti ditolak adalah jalan buntu yang baru ketahuan setelah
 * seseorang mengisi seluruh formnya.
 */
function kolomDenganAksi(onTarik: (p: Pos) => void): Array<Kolom<Pos>> {
  return [
    ...KOLOM,
    {
      kunci: "aksi", judul: "", rata: "kanan",
      render: (p) =>
        p.status === "ditutup" ? (
          <span style={{ fontSize: 11, color: C.muted }}>ditutup</span>
        ) : (
          <button
            type="button" onClick={() => onTarik(p)}
            style={{
              padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              minHeight: 36, whiteSpace: "nowrap",
              border: `1px solid ${C.navy}`, background: "transparent", color: C.navy,
              cursor: "pointer",
            }}
          >
            Tarik
          </button>
        ),
    },
  ];
}

export default function ContingencyPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  const [mengirim, setMengirim] = useState(false);

  const [fProyek, setFProyek] = useState("");
  const [fNama, setFNama] = useState("");
  const [fNilai, setFNilai] = useState("");
  const [fDasar, setFDasar] = useState("");

  /** Pos yang sedang ditarik. `null` = modal tertutup. */
  const [posTarik, setPosTarik] = useState<Pos | null>(null);

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
    api.get<Hasil>("/api/v1/contingency", { signal: ac.signal })
      .then((r) => setHasil(r.data))
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setGalat(m ?? "Gagal memuat data contingency");
      });
    return () => ac.abort();
  }, [muatUlangKe]);

  const halangan = useMemo(() => {
    if (!fProyek) return "Pilih proyek lebih dulu.";
    if (!fNama.trim()) return "Isi nama pos cadangan.";
    if (!fNilai || Number(fNilai) <= 0) return "Isi nilai cadangan lebih dari 0.";
    return null;
  }, [fProyek, fNama, fNilai]);

  async function kirim() {
    if (halangan) return;
    setMengirim(true); setGalat(null); setSukses(null);
    try {
      await api.post("/api/v1/contingency", {
        project_id: fProyek, nama: fNama.trim(), nilai: Number(fNilai),
        dasar: fDasar.trim() || undefined,
      });
      setSukses(`Pos "${fNama.trim()}" tercatat. Sisanya dihitung otomatis dari tiap penarikan.`);
      setFNama(""); setFNilai(""); setFDasar("");
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal mencatat pos cadangan");
    } finally {
      setMengirim(false);
    }
  }

    const labelGaya: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const isianGaya: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
    background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
  };

  return (
    // TANPA padding & judul halaman-penuh: berkas ini adalah BAGIAN dari
    // modul Keuangan, dan `keuangan/layout.tsx` sudah menyediakan judul
    // modul, enam KPI, serta navigasi antar-bagian. Mengulang <h1> di sini
    // membuat dua judul bertumpuk dan merusak urutan heading (WCAG 1.3.1).
    //
    // Lebar tetap dipasang di sini meski `keuangan/layout.tsx` sudah membatasi
    // ke `--w-luas`: penjaga `tata-letak-ratchet` memeriksa PER-HALAMAN, dan
    // halaman ini juga bisa dibuka lewat rute lain nanti. `--w-page` dipilih
    // karena isinya kartu + tabel ringkas, bukan tabel padat kolom.
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
          Manajemen Contingency
        </h2>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Cadangan risiko yang <strong>terlacak</strong> — berapa disisihkan,
          berapa terpakai, dan untuk apa. Tanpa dilacak, cadangan tidak hilang;
          ia terpakai diam-diam, dan baru ketahuan habis saat dibutuhkan.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px var(--pad-kartu-lega)", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>{galat}</div>
      )}
      {sukses && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px var(--pad-kartu-lega)", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green,
        }}>{sukses}</div>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : proyek.length === 0 ? (
        <Kosong
          ikon={<PiggyBank size={28} />}
          judul="Belum ada proyek"
          sebab="Cadangan risiko ditetapkan per proyek. Daftar ini terisi sendiri begitu ada proyek berjalan."
        />
      ) : (
        <>
          {/* ── Form pos baru ────────────────────────────────────────── */}
          <div className="rise rise-2" style={{ ...GAYA_KARTU, padding: 16, marginBottom: 16 }}>
            <div style={{
              display: "grid", gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="cg-proyek" style={labelGaya}>Proyek</label>
                <select id="cg-proyek" value={fProyek} onChange={(e) => setFProyek(e.target.value)} style={isianGaya}>
                  <option value="">— pilih —</option>
                  {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="cg-nama" style={labelGaya}>Nama pos</label>
                <input id="cg-nama" type="text" value={fNama} onChange={(e) => setFNama(e.target.value)}
                  placeholder="mis. Cadangan Risiko Utama" style={isianGaya} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="cg-nilai" style={labelGaya}>Nilai cadangan</label>
                <input id="cg-nilai" type="number" min="0" inputMode="numeric" value={fNilai}
                  onChange={(e) => setFNilai(e.target.value)} placeholder="0" style={isianGaya} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="cg-dasar" style={labelGaya}>
                  Dasar penetapan{" "}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(boleh kosong)</span>
                </label>
                <input id="cg-dasar" type="text" value={fDasar} onChange={(e) => setFDasar(e.target.value)}
                  placeholder="mis. 5% nilai kontrak" style={isianGaya} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <button type="button" onClick={kirim} disabled={!!halangan || mengirim}
                style={{
                  padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: "none", background: halangan || mengirim ? C.border : C.navy,
                  color: halangan || mengirim ? C.mid : "var(--on-navy)",
                  cursor: halangan || mengirim ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 7,
                }}>
                <Plus size={14} aria-hidden="true" />
                {mengirim ? "Mencatat…" : "Tetapkan cadangan"}
              </button>
              {halangan && <span role="status" style={{ fontSize: 12, color: C.mid }}>{halangan}</span>}
              <button type="button" onClick={() => setMuatUlangKe((n) => n + 1)}
                style={{
                  marginLeft: "auto", padding: "8px 12px", borderRadius: 6,
                  border: `1px solid ${C.border}`, background: "var(--surface)",
                  color: C.text, fontSize: 13, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                <RefreshCw size={13} aria-hidden="true" /> Muat ulang
              </button>
            </div>
          </div>

          {hasil && (
            <>
              {/* ── Ringkasan ──────────────────────────────────────── */}
              <div className="rise rise-2b" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {[
                  {
                    label: "Terlampaui", nilai: String(hasil.jumlah_terlampaui),
                    sub: "sudah defisit", warna: "var(--danger)", Ikon: TrendingDown,
                  },
                  {
                    label: "Kritis", nilai: String(hasil.jumlah_kritis),
                    sub: "terpakai ≥90%", warna: "var(--warning-teks)", Ikon: AlertTriangle,
                  },
                  {
                    label: "Total cadangan", nilai: rupiah(hasil.total_cadangan),
                    sub: "pos aktif saja", warna: C.text, Ikon: PiggyBank,
                  },
                  {
                    label: "Sisa keseluruhan", nilai: rupiah(hasil.total_sisa),
                    // Sisa NEGATIF berwarna merah dan berkata defisit —
                    // meratakannya ke netral menyembunyikan hal terpenting.
                    sub: hasil.total_sisa < 0 ? "DEFISIT — melebihi cadangan" : "masih tersedia",
                    warna: hasil.total_sisa < 0 ? "var(--danger)" : "var(--success)",
                    Ikon: ShieldCheck,
                  },
                ].map((k) => (
                  <div key={k.label} style={{ ...GAYA_KARTU, padding: "10px var(--pad-kartu-lega)", flex: "1 1 200px", minWidth: 190 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <k.Ikon size={12} aria-hidden="true" style={{ color: k.warna }} />
                      <span style={labelGaya}>{k.label}</span>
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 800, color: k.warna, marginTop: 3,
                      fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                    }}>{k.nilai}</div>
                    <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Proyek tanpa pos DINYATAKAN — "nol pos kritis" bisa berarti
                  "tak ada cadangannya sama sekali". */}
              {hasil.proyek_tanpa_pos.length > 0 && (
                <div role="status" style={{
                  marginBottom: 14, padding: "10px var(--pad-kartu-lega)", borderRadius: 8, fontSize: 12,
                  border: `1px solid ${C.yellowBorder}`, background: C.yellowBg, color: C.text,
                  display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                }}>
                  <AlertTriangle size={14} aria-hidden="true" style={{ color: "var(--warning-teks)", flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{hasil.proyek_tanpa_pos.length} proyek belum punya pos cadangan</strong> —{" "}
                    {hasil.proyek_tanpa_pos.slice(0, 3).map((p) => p.project_name).join(", ")}
                    {hasil.proyek_tanpa_pos.length > 3 && `, dan ${hasil.proyek_tanpa_pos.length - 3} lainnya`}.
                    Angka di atas hanya menghitung pos yang sudah ditetapkan.
                  </span>
                </div>
              )}

              {hasil.pos.length === 0 ? (
                <Kosong
                  ikon={<PiggyBank size={28} />}
                  judul="Belum ada pos cadangan"
                  sebab="Tetapkan cadangan lewat formulir di atas. Sisanya dihitung otomatis dari tiap penarikan — tidak disimpan, supaya tak bisa basi."
                />
              ) : (
                <div className="rise rise-3" style={{ ...GAYA_KARTU, overflow: "hidden" }}>
                  {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
                      kolom pertama <th scope="row">, tabular-nums, dan pembungkus
                      overflow-x sekarang dijamin komponen — empat hal yang tabel
                      mentah harus ingat sendiri setiap kali, dan yang riwayat repo
                      ini tunjukkan TIDAK selalu diingat (16164e9, ed3a55d, 0adb9b9).

                      `minWidth: 840` sengaja dilepas, bukan lupa: komponen sudah
                      membungkus dengan overflow-x, jadi gulir horizontalnya tetap
                      ada tanpa memaksa lebar mati ke primitif bersama. Preseden:
                      `gudang/material-klien`, `aset`.

                      Baris mendesak kini ditandai DUA cara — pita kiri di sel
                      pertama dan latar barisnya lewat `tandaiBaris` — tapi kata
                      statusnya tetap ada di kolom terakhir, karena keduanya warna
                      dan warna saja tak terbaca (WCAG 1.4.1). */}
                  <Tabel<Pos>
              berpermukaan
                    caption="Pos cadangan risiko: nama, proyek, nilai cadangan, jumlah terpakai, sisa, porsi terhadap nilai kontrak, dan statusnya."
                    data={hasil.pos}
                    kunciBaris={(p) => p.id}
                    kolom={kolomDenganAksi(setPosTarik)}
                    tandaiBaris={(p) => (mendesak(p) ? STATUS_META[p.status].bg : undefined)}
                  />

                  <p style={{
                    margin: 0, padding: "10px var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
                    background: "var(--surface-subtle)", fontSize: 11, color: C.mid, lineHeight: 1.55,
                  }}>
                    Sisa <strong>dihitung</strong>, tidak disimpan — kolom sisa yang disimpan bisa
                    basi diam-diam saat satu penarikan disunting, dan angka “cadangan masih aman”
                    yang basi dipakai untuk menyetujui pengeluaran berikutnya.{" "}
                    <strong>Terlampaui</strong> dipisahkan dari <strong>kritis</strong>: terpakai
                    112% adalah defisit yang menuntut sumber dana lain, sedangkan 95% cukup
                    dijawab dengan berhenti menarik. Pos yang ditutup tidak ikut total cadangan.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Modal penarikan. Dirender di luar cabang kondisional supaya ia tak
          ikut hilang saat daftar dimuat ulang — `terbuka` dikendalikan
          `posTarik`, bukan oleh posisi dalam pohon. */}
      <ContingencyTarikModal
        pos={posTarik}
        onTutup={() => setPosTarik(null)}
        onBerhasil={() => {
          setSukses("Penarikan tercatat. Sisa pos dihitung ulang dari seluruh penarikan.");
          setMuatUlangKe((n) => n + 1);
        }}
      />
    </div>
  );
}
