"use client";

/**
 * REGISTER ASURANSI (F5 PEMBEDA)
 *
 * ── Yang dijawab halaman ini
 *
 * "Kejadiannya 15 Februari. Apakah tertanggung?"
 *
 * Daftar polis biasa hanya menjawab "punya atau tidak". Yang menentukan saat
 * klaim adalah apakah TANGGAL kejadiannya masuk masa berlaku — dan itu
 * pertanyaan tentang periode, bukan tentang keberadaan dokumen.
 *
 * ── Kenapa CELAH ditampilkan sekolom dengan polisnya
 *
 * Diukur pada data nyata: polis menutupi 1 Mar–30 Jun sementara proyeknya
 * 1 Feb–31 Jul — 59 hari tanpa penanggung (28 di awal, 31 di akhir). Dokumen
 * itu terlihat sah di lemari dan tak berguna di dua ujungnya.
 */

import { useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, CalendarClock, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom, KepalaHalaman } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";

type Proyek = { id: string; name: string };

type StatusPolis = "aktif" | "kadaluarsa" | "belum_berlaku" | "segera_berakhir" | "dibatalkan";

type Polis = {
  id: string;
  project_id: string;
  project_name: string;
  jenis: string;
  jenis_label: string;
  nomor_polis: string;
  penerbit: string;
  nilai_pertanggungan: number | null;
  periode_mulai: string;
  periode_selesai: string;
  status: StatusPolis;
  sisa_hari: number;
  celah_hari: number | null;
  celah_awal: number;
  celah_akhir: number;
};

type Hasil = {
  polis: Polis[];
  jumlah_aktif: number;
  jumlah_kadaluarsa: number;
  jumlah_segera_berakhir: number;
  jumlah_belum_berlaku: number;
  jumlah_ada_celah: number;
  proyek_tanpa_polis: Array<{ project_id: string; project_name: string }>;
  total_nilai_pertanggungan: number;
};

const STATUS_META: Record<StatusPolis, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  kadaluarsa: {
    label: "Kadaluarsa", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Masa berlakunya sudah lewat — tidak menanggung apa pun hari ini.",
  },
  segera_berakhir: {
    label: "Segera berakhir", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Berakhir dalam 30 hari ke depan. Perpanjangan perlu diurus sekarang.",
  },
  belum_berlaku: {
    label: "Belum berlaku", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Polis sudah terbit tapi periodenya belum mulai — belum menanggung apa pun.",
  },
  aktif: {
    label: "Aktif", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Berlaku hari ini.",
  },
  dibatalkan: {
    label: "Dibatalkan", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Dibatalkan secara administratif — tak menanggung apa pun walau periodenya masih berjalan.",
  },
};

const JENIS_PILIHAN = [
  { nilai: "car", label: "CAR — Contractor’s All Risk" },
  { nilai: "tpl", label: "TPL — Tanggung Jawab Pihak Ketiga" },
  { nilai: "car_tpl", label: "CAR + TPL (gabungan)" },
  { nilai: "jamsostek", label: "BPJS Ketenagakerjaan" },
  { nilai: "lainnya", label: "Lainnya" },
];

const rupiah = formatRupiah;

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/**
 * Kolom register polis.
 *
 * Di luar komponen karena tak bergantung state apa pun — hanya `STATUS_META`
 * dan dua pemformat di atas. Menaruhnya di dalam berarti seluruh definisi
 * kolom dibangun ulang tiap ketikan di formulir catat-polis.
 */
const KOLOM_POLIS: Array<Kolom<Polis>> = [
  {
    kunci: "polis", judul: "Polis", kepalaBaris: true,
    render: (p) => {
      const meta = STATUS_META[p.status];
      const mendesak = p.status === "kadaluarsa" || p.status === "segera_berakhir";
      return (
        // Garis aksen kiri pindah dari `<th>` ke pembungkus isinya: gaya sel
        // kini milik `Tabel`, dan `tandaiBaris` hanya mengatur LATAR baris.
        // Yang terlihat sama: batang berwarna di tepi kiri untuk polis yang
        // menuntut tindakan.
        <span style={{
          display: "block", paddingLeft: 9, marginLeft: -12,
          borderLeft: mendesak ? `3px solid ${meta.warna}` : "3px solid transparent",
        }}>
          {p.nomor_polis}
          <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2 }}>
            {p.jenis_label} · {p.penerbit}
          </span>
        </span>
      );
    },
  },
  {
    kunci: "proyek", judul: "Proyek",
    render: (p) => <span style={{ color: C.mid }}>{p.project_name}</span>,
  },
  {
    kunci: "masa", judul: "Masa berlaku",
    render: (p) => (
      <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
        {tanggalTerbaca(p.periode_mulai)} – {tanggalTerbaca(p.periode_selesai)}
      </span>
    ),
  },
  {
    kunci: "sisa", judul: "Sisa", rata: "kanan",
    render: (p) => (
      <span style={{
        fontWeight: 600,
        color: p.sisa_hari < 0 ? "var(--danger)" : p.sisa_hari <= 30 ? "var(--warning-teks)" : C.mid,
      }}>
        {p.sisa_hari < 0 ? `lewat ${Math.abs(p.sisa_hari)} h` : `${p.sisa_hari} h`}
      </span>
    ),
  },
  {
    kunci: "celah", judul: "Celah", rata: "kanan",
    // null ≠ 0. null = "tanggal proyek tak diketahui", 0 = "tertanggung
    // penuh". Kabar baik palsu kalau keduanya ditulis sama.
    render: (p) =>
      p.celah_hari === null ? (
        <span style={{ fontSize: 11, color: C.muted }}>tanggal proyek kosong</span>
      ) : p.celah_hari === 0 ? (
        <span style={{ color: "var(--success)", fontWeight: 600 }}>tertutup penuh</span>
      ) : (
        <>
          <span style={{ color: "var(--danger)", fontWeight: 700 }}>{p.celah_hari} h</span>
          <span style={{ display: "block", fontSize: 10, color: C.muted }}>
            {p.celah_awal > 0 && `${p.celah_awal} h di awal`}
            {p.celah_awal > 0 && p.celah_akhir > 0 && " · "}
            {p.celah_akhir > 0 && `${p.celah_akhir} h di akhir`}
          </span>
        </>
      ),
  },
  {
    kunci: "nilai", judul: "Nilai pertanggungan", rata: "kanan",
    render: (p) =>
      p.nilai_pertanggungan === null
        ? <span style={{ fontSize: 11, color: C.muted }}>belum diisi</span>
        : <span style={{ color: C.text }}>{rupiah(p.nilai_pertanggungan)}</span>,
  },
  {
    kunci: "status", judul: "Status",
    render: (p) => {
      const meta = STATUS_META[p.status];
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

export default function AsuransiPage() {
  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData` menggantikan dua `useEffect` + `muatUlangKe`. Galat MUAT
    dan galat AKSI (kirim polis) dipisah: satu state gabungan sebelumnya
    membuat gagal mencatat polis menghapus pesan gagal memuat proyek.
  */
  const { data: dataProyek, memuat, galat: galatMuatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const { data: hasil, galat: galatMuatHasil, muatUlang: muatUlangHasil } =
    useData<Hasil>("/api/v1/asuransi");

  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const galat = galatAksi
    ?? (galatMuatProyek ? "Gagal memuat daftar proyek."
      : galatMuatHasil ? "Gagal memuat register asuransi." : null);

  const [sukses, setSukses] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);

  const [fProyek, setFProyek] = useState("");
  const [fJenis, setFJenis] = useState("car_tpl");
  const [fJenisLain, setFJenisLain] = useState("");
  const [fNomor, setFNomor] = useState("");
  const [fPenerbit, setFPenerbit] = useState("");
  const [fNilai, setFNilai] = useState("");
  const [fMulai, setFMulai] = useState("");
  const [fSelesai, setFSelesai] = useState("");

  // Alasan tombol mati DINYATAKAN, bukan sekadar membuat tombol abu-abu.
  const halangan = useMemo(() => {
    if (!fProyek) return "Pilih proyek lebih dulu.";
    if (!fNomor.trim()) return "Isi nomor polis.";
    if (!fPenerbit.trim()) return "Isi nama penerbit polis.";
    if (!fMulai || !fSelesai) return "Isi periode berlaku polis.";
    if (fSelesai < fMulai) return "Periode selesai tidak boleh lebih awal daripada mulai.";
    if (fJenis === "lainnya" && !fJenisLain.trim()) return "Sebutkan jenis asuransinya.";
    return null;
  }, [fProyek, fNomor, fPenerbit, fMulai, fSelesai, fJenis, fJenisLain]);

  async function kirim() {
    if (halangan) return;
    setMengirim(true); setGalatAksi(null); setSukses(null);
    try {
      await api.post("/api/v1/asuransi", {
        project_id: fProyek, jenis: fJenis,
        jenis_lain: fJenis === "lainnya" ? fJenisLain.trim() : undefined,
        nomor_polis: fNomor.trim(), penerbit: fPenerbit.trim(),
        nilai_pertanggungan: fNilai ? Number(fNilai) : undefined,
        periode_mulai: fMulai, periode_selesai: fSelesai,
      });
      setSukses(`Polis ${fNomor.trim()} tercatat. Celah pertanggungannya dihitung otomatis terhadap masa proyek.`);
      setFNomor(""); setFNilai("");
      await muatUlangHasil();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal mencatat polis");
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
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        <KepalaHalaman judul="Register Asuransi"         ikon={<ShieldCheck size={19} />}
      /><p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Bukti pertanggungan beserta <strong>celahnya</strong>. Yang menentukan
          saat klaim bukan “punya polis atau tidak”, melainkan apakah tanggal
          kejadiannya masuk masa berlaku — dan polis yang tak menutupi seluruh
          masa proyek meninggalkan hari-hari tanpa penanggung.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>{galat}</div>
      )}
      {sukses && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green,
        }}>{sukses}</div>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : proyek.length === 0 ? (
        <Kosong
          ikon={<ShieldCheck size={28} />}
          judul="Belum ada proyek"
          sebab="Polis dicatat per proyek. Daftar ini terisi sendiri begitu ada proyek berjalan."
        />
      ) : (
        <>
          {/* ── Form catat polis ─────────────────────────────────────── */}
          <div className="rise rise-2" style={{ ...GAYA_KARTU, padding: 16, marginBottom: 16 }}>
            <div style={{
              display: "grid", gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-proyek" style={labelGaya}>Proyek</label>
                <select id="as-proyek" value={fProyek} onChange={(e) => setFProyek(e.target.value)} style={isianGaya}>
                  <option value="">— pilih —</option>
                  {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-jenis" style={labelGaya}>Jenis</label>
                <select id="as-jenis" value={fJenis} onChange={(e) => setFJenis(e.target.value)} style={isianGaya}>
                  {JENIS_PILIHAN.map((j) => <option key={j.nilai} value={j.nilai}>{j.label}</option>)}
                </select>
              </div>

              {fJenis === "lainnya" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label htmlFor="as-jenislain" style={labelGaya}>Sebutkan jenisnya</label>
                  <input id="as-jenislain" type="text" value={fJenisLain}
                    onChange={(e) => setFJenisLain(e.target.value)}
                    placeholder="mis. Asuransi Alat Berat" style={isianGaya} />
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-nomor" style={labelGaya}>Nomor polis</label>
                <input id="as-nomor" type="text" value={fNomor}
                  onChange={(e) => setFNomor(e.target.value)}
                  placeholder="mis. POL/CAR/2026/001" style={isianGaya} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-penerbit" style={labelGaya}>Penerbit</label>
                <input id="as-penerbit" type="text" value={fPenerbit}
                  onChange={(e) => setFPenerbit(e.target.value)}
                  placeholder="mis. PT Asuransi Wahana" style={isianGaya} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-nilai" style={labelGaya}>
                  Nilai pertanggungan{" "}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(boleh kosong)</span>
                </label>
                <input id="as-nilai" type="number" min="0" inputMode="numeric" value={fNilai}
                  onChange={(e) => setFNilai(e.target.value)} placeholder="0" style={isianGaya} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-mulai" style={labelGaya}>Berlaku mulai</label>
                <input id="as-mulai" type="date" value={fMulai}
                  onChange={(e) => setFMulai(e.target.value)} style={isianGaya} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="as-selesai" style={labelGaya}>Berlaku sampai</label>
                <input id="as-selesai" type="date" value={fSelesai}
                  onChange={(e) => setFSelesai(e.target.value)} style={isianGaya} />
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
                {mengirim ? "Mencatat…" : "Catat polis"}
              </button>
              {halangan && <span role="status" style={{ fontSize: 12, color: C.mid }}>{halangan}</span>}

              <button type="button" onClick={() => void muatUlangHasil()}
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
                  { label: "Kadaluarsa", nilai: hasil.jumlah_kadaluarsa, sub: "tak menanggung hari ini", warna: "var(--danger)", Ikon: ShieldX },
                  { label: "Segera berakhir", nilai: hasil.jumlah_segera_berakhir, sub: "≤ 30 hari lagi", warna: "var(--warning-teks)", Ikon: CalendarClock },
                  { label: "Ada celah", nilai: hasil.jumlah_ada_celah, sub: "hari proyek tanpa penanggung", warna: "var(--danger)", Ikon: ShieldAlert },
                  {
                    label: "Aktif", nilai: hasil.jumlah_aktif,
                    sub: hasil.jumlah_aktif === 0 ? "tak ada yang berlaku hari ini" : "berlaku hari ini",
                    // NOL polis aktif adalah kabar BURUK, bukan baik. Hijau
                    // besar bertuliskan "0" terbaca sebagai capaian — pola
                    // kabar-baik-palsu yang sama dengan susut negatif,
                    // selisih negatif, dan "Rp 0" vendor tak menawar.
                    warna: hasil.jumlah_aktif === 0 ? C.mid : "var(--success)",
                    Ikon: ShieldCheck,
                  },
                ].map((k) => (
                  <div key={k.label} style={{ ...GAYA_KARTU, padding: "10px 14px", flex: "1 1 190px", minWidth: 178 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <k.Ikon size={12} aria-hidden="true" style={{ color: k.warna }} />
                      <span style={labelGaya}>{k.label}</span>
                    </div>
                    <div style={{
                      fontSize: 20, fontWeight: 800, color: k.warna, marginTop: 3,
                      fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                    }}>{k.nilai}</div>
                    <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Proyek TANPA polis dinyatakan. Tanpa ini, "nol polis
                  kadaluarsa" terbaca "semuanya aman" — padahal bisa jadi
                  memang tak ada polisnya sama sekali. */}
              {hasil.proyek_tanpa_polis.length > 0 && (
                <div role="status" style={{
                  marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 12,
                  border: `1px solid ${C.yellowBorder}`, background: C.yellowBg, color: C.text,
                  display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                }}>
                  <ShieldAlert size={14} aria-hidden="true" style={{ color: "var(--warning-teks)", flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{hasil.proyek_tanpa_polis.length} proyek belum punya satu polis pun</strong> —{" "}
                    {hasil.proyek_tanpa_polis.slice(0, 4).map((p) => p.project_name).join(", ")}
                    {hasil.proyek_tanpa_polis.length > 4 && `, dan ${hasil.proyek_tanpa_polis.length - 4} lainnya`}.
                    Angka di atas hanya menghitung polis yang sudah tercatat.
                  </span>
                </div>
              )}

              {/* ── Tabel ──────────────────────────────────────────── */}
              {hasil.polis.length === 0 ? (
                <Kosong
                  ikon={<ShieldCheck size={28} />}
                  judul="Belum ada polis tercatat"
                  sebab="Catat polis lewat formulir di atas. Celah pertanggungannya dihitung otomatis terhadap masa proyek."
                />
              ) : (
                <div className="rise rise-3" style={{ ...GAYA_KARTU, overflow: "hidden" }}>
                  {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption
                      sr-only, kolom pertama <th scope="row">, tabular-nums,
                      dan pembungkus overflow-x sekarang dijamin komponen —
                      empat hal yang tabel mentah harus ingat ulang tiap kali
                      kolomnya bertambah, dan tabel ini sudah punya tujuh.

                      Kepala baris = nomor polis. Itu yang dicari orang saat
                      klaim ("polis mana yang menanggung 15 Februari?"), dan
                      itu yang tercetak di dokumen fisiknya. Nama proyek tidak
                      dipakai: satu proyek bisa punya beberapa polis (CAR dan
                      TPL terpisah), jadi ia tak membedakan baris.

                      `minWidth: 860` dilepas — gulir horizontal sudah datang
                      dari pembungkus komponen. */}
                  <Tabel<Polis>
              berpermukaan
                    caption="Register polis asuransi: jenis, nomor, penerbit, masa berlaku, sisa hari, celah pertanggungan terhadap masa proyek, nilai pertanggungan, dan statusnya."
                    data={hasil.polis}
                    kunciBaris={(p) => p.id}
                    kolom={KOLOM_POLIS}
                  />

                  <p style={{
                    margin: 0, padding: "10px 14px", borderTop: `1px solid ${C.border}`,
                    background: "var(--surface-subtle)", fontSize: 11, color: C.mid, lineHeight: 1.55,
                  }}>
                    <strong>Celah</strong> = hari masa proyek yang tidak tertanggung polis ini,
                    dihitung dua arah: polis yang mulai <em>sesudah</em> proyek jalan
                    meninggalkan celah di awal, yang berakhir <em>sebelum</em> proyek usai
                    meninggalkan celah di akhir. Keduanya dijumlahkan terpisah — telat 10 hari
                    di depan tidak tertutup oleh lebih 10 hari di belakang.
                    {hasil.total_nilai_pertanggungan > 0 && (
                      <> Total pertanggungan yang masih berlaku:{" "}
                        <strong>{rupiah(hasil.total_nilai_pertanggungan)}</strong> — polis
                        kadaluarsa dan dibatalkan tidak ikut dijumlahkan.</>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
