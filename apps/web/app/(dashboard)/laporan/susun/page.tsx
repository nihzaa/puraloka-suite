"use client";

/**
 * SUSUN LAPORAN — memilih dari yang terdaftar, bukan menulis query (G6d).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR YANG SENGAJA TIDAK MENYEDIAKAN KOTAK KONDISI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Report builder" biasanya berarti layar dengan kotak tempat orang mengetik
 * kondisi. Di sini tidak ada kotak itu, dan alasannya bukan kesederhanaan:
 * kondisi yang diketik adalah teks yang berakhir di query, dan tiap penyaring
 * adalah tebakan tentang apa yang berbahaya.
 *
 * Yang ada: sumber, kolom, dan saringan — semuanya DIPILIH dari daftar yang
 * dikirim server. Nama tabel tak pernah menyeberang dari peramban.
 *
 * ── Kenapa daftar sumbernya bisa pendek, dan itu bukan kerusakan
 *
 * Server hanya mengirim sumber yang BOLEH dibaca orangnya. Yang tak punya
 * `finance:view` tak akan melihat Invoice sama sekali — bukan melihatnya lalu
 * ditolak saat menjalankan. Layar yang menjanjikan sesuatu yang tak bisa
 * ditepati lebih buruk daripada layar yang lebih sedikit.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk "hasil terpotong". Sisanya tenang: memilih
 * kolom dan saringan adalah pekerjaan, bukan peringatan.
 */

import { useCallback, useMemo, useState } from "react";
import { Table2, TriangleAlert, Info, Play, Plus, X, Download } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, gayaInput, type Kolom as KolomTabel,
} from "@/components/dasar";
import { Pilihan } from "@/components/pilihan";

type JenisKolom = "teks" | "angka" | "uang" | "tanggal" | "bool";

interface KolomSumber { kunci: string; label: string; jenis: JenisKolom }

interface Sumber {
  kunci: string;
  label: string;
  keterangan: string;
  kolom: KolomSumber[];
}

interface Muatan {
  sumber: Sumber[];
  operator: Record<JenisKolom, string[]>;
  batas_maks: number;
}

interface Saringan { kolom: string; operator: string; nilai: string }

/**
 * Nilai berkode → bahasa yang dibaca orang.
 *
 * Isinya DIUKUR dari definisi enum (`pg_enum`), bukan dari isi tabel: nilai
 * yang belum pernah terpakai hari ini tetap bisa muncul besok, dan kode yang
 * lolos tanpa terjemahan akan tampil mentah di laporan yang dibawa ke rapat.
 *
 *   project_status : draft, active, on_hold, completed, cancelled
 *   invoice_status : draft, sent, partial, paid, overdue, cancelled
 *   expense_status : draft, submitted, approved, rejected
 *
 * `draft` dan `cancelled` dipakai bersama beberapa enum dengan arti yang sama,
 * jadi satu peta datar cukup. Kalau kelak ada dua enum memakai kode sama
 * dengan arti BERBEDA, peta ini harus dipecah per kolom — dan itu akan
 * terlihat karena terjemahannya jadi salah, bukan hilang.
 */
const KODE: Record<string, string> = {
  draft: "Draf",
  active: "Berjalan",
  on_hold: "Ditahan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  sent: "Terkirim",
  partial: "Dibayar sebagian",
  paid: "Lunas",
  overdue: "Lewat jatuh tempo",
  submitted: "Diajukan",
  approved: "Disetujui",
  rejected: "Ditolak",
};

interface Hasil {
  sumber: { kunci: string; label: string };
  kolom: KolomSumber[];
  baris: Array<Record<string, unknown>>;
  jumlah: number;
  terpotong: boolean;
  batas: number;
}

export default function SusunLaporanPage() {
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [berjalan, setBerjalan] = useState(false);

  const [sumberKunci, setSumberKunci] = useState("");
  const [kolomDipilih, setKolomDipilih] = useState<string[]>([]);
  const [saringan, setSaringan] = useState<Saringan[]>([]);
  const [urutKolom, setUrutKolom] = useState("");
  const [urutArah, setUrutArah] = useState<"naik" | "turun">("turun");
  const [batas, setBatas] = useState("500");
  const [hasil, setHasil] = useState<Hasil | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController. Yang didapat:
    dedup permintaan, cache lintas navigasi, dan langganan invalidasi — halaman
    ini menyegarkan diri saat data yang dipakainya dibuang di tempat lain.

    `makeAbortController` tak lagi perlu: `useData` sudah menjaga agar jawaban
    yang datang sesudah komponen mati tidak menyentuh state.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>("/api/v1/laporan/sumber");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI dipisah lalu digabung saat dipakai.
    Satu state untuk keduanya punya cacat halus yang sudah ditemukan
    DUA KALI di batch sebelumnya: gagal menyimpan MENGHAPUS pesan gagal
    memuat, dan pengguna mengira datanya sudah termuat.
  */
  const galat = galatAksi ?? (galatMuat ? "Gagal memuat daftar sumber" : null);

  // Diturunkan dari jawaban, bukan disalin ke state sendiri: satu sumber
  // kebenaran, dan tak ada jendela di mana keduanya berbeda.
  const muatan = data;


  const sumber = useMemo(
    () => muatan?.sumber.find((s) => s.kunci === sumberKunci) ?? null,
    [muatan, sumberKunci]);

  /** Berganti sumber MENGOSONGKAN pilihan — kolomnya milik sumber lain. */
  const gantiSumber = useCallback((k: string) => {
    setSumberKunci(k);
    setKolomDipilih([]);
    setSaringan([]);
    setUrutKolom("");
    // Hasil lama ikut dibuang: membiarkannya berarti tabel di bawah
    // menampilkan data sumber LAIN di bawah judul sumber yang baru dipilih.
    setHasil(null);
  }, []);

  const jalankan = useCallback(async () => {
    if (!sumber) return;
    setBerjalan(true); setGalatAksi(null);
    try {
      const r = await api.post<Hasil>("/api/v1/laporan/susun", {
        sumber: sumber.kunci,
        kolom: kolomDipilih,
        saringan: saringan.filter((f) => f.kolom && f.operator),
        urut: urutKolom ? { kolom: urutKolom, arah: urutArah } : undefined,
        batas: batas === "" ? "" : Number(batas),
      });
      setHasil(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menjalankan laporan");
      // Hasil lama DIBUANG saat gagal. Membiarkannya membuat orang membaca
      // angka lama sebagai jawaban atas susunan baru.
      setHasil(null);
    } finally { setBerjalan(false); }
  }, [sumber, kolomDipilih, saringan, urutKolom, urutArah, batas]);

  const unduh = useCallback(async () => {
    if (!hasil) return;
    const XLSX = await import("xlsx");
    const data = hasil.baris.map((b) => {
      const r: Record<string, unknown> = {};
      for (const k of hasil.kolom) {
        const v = b[k.kunci];
        // Label, bukan nama kolom basis: berkas yang keluar dibaca orang, dan
        // "contract_value" tak berarti apa pun di luar sini.
        //
        // Nilai berkode DITERJEMAHKAN dengan peta yang SAMA dengan layar.
        // Kalau tidak, tabel di layar berkata "Berjalan" sementara berkas
        // yang diunduh berkata "active" — dan yang membandingkan keduanya
        // akan mengira ada dua data yang berbeda.
        //
        // Angka dan tanggal dibiarkan mentah: Excel harus menerimanya sebagai
        // angka dan tanggal, bukan teks. Menyerahkan "Rp 850.000.000" ke sana
        // membuat kolomnya tak bisa dijumlah — dan itu justru yang pertama
        // dilakukan orang setelah membuka berkasnya.
        r[k.label] = (k.jenis === "teks" && typeof v === "string")
          ? (KODE[v] ?? v)
          : v;
      }
      return r;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Laporan");
    XLSX.writeFile(wb, `laporan-${hasil.sumber.kunci}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [hasil]);

  const toggleKolom = (k: string) => {
    setKolomDipilih((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);
  };

  /**
   * Nilai sesuai jenisnya — angka rata kanan, uang berformat, dan nilai
   * berkode dibaca manusia.
   *
   * Tangkapan layar pertama menampilkan `active` dan `on_hold` apa adanya.
   * Itu nilai BASIS, bukan bahasa yang dibaca orang — dan laporan yang keluar
   * dari sini dibawa ke rapat. Yang tak ada di peta dibiarkan apa adanya:
   * menebak terjemahan lebih buruk daripada menampilkan yang asli.
   */
  const tampilNilai = (nilai: unknown, jenis: JenisKolom) => {
    if (nilai === null || nilai === undefined || nilai === "") {
      return <span style={{ color: C.muted }}>—</span>;
    }
    if (jenis === "uang") return formatRupiah(nilai as number);
    if (jenis === "tanggal") return formatTanggal(nilai as string);
    if (jenis === "bool") return nilai ? "Ya" : "Tidak";
    const s = String(nilai);
    return KODE[s] ?? s;
  };

  const kolomHasil: Array<KolomTabel<Record<string, unknown>>> = (hasil?.kolom ?? []).map((k, i) => ({
    kunci: k.kunci,
    judul: k.label,
    rata: k.jenis === "uang" || k.jenis === "angka" ? "kanan" : "kiri",
    kepalaBaris: i === 0,
    render: (b) => (
      <span style={{ fontSize: 12.5, color: C.text }}>
        {tampilNilai(b[k.kunci], k.jenis)}
      </span>
    ),
  }));

  const bisaJalan = !!sumber && kolomDipilih.length > 0 && !berjalan;

  /** Indeks tiap baris — dihitung sekali, bukan `indexOf` di tiap render. */
  const indeksBaris = useMemo(() => {
    const m = new Map<Record<string, unknown>, number>();
    (hasil?.baris ?? []).forEach((b, i) => m.set(b, i));
    return m;
  }, [hasil]);

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Table2 size={18} />}
        judul="Susun Laporan"
        keterangan={
          <>Pilih sumber, kolom, dan saringan — lalu unduh hasilnya. Yang bisa
          dipilih <strong>dibatasi daftar yang sudah ditetapkan</strong>: tak
          ada kotak untuk mengetik kondisi, karena kondisi yang diketik adalah
          teks yang berakhir di query.</>
        }
        aksi={
          <Tombol jenis="sekunder" href="/laporan">Laporan siap-pakai</Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {memuat ? (
        <Rangka tinggi={56} jumlah={3} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu sub="hanya sumber yang boleh Anda baca yang muncul di sini">
            1 · Sumber data
          </JudulKartu>
          {(muatan?.sumber.length ?? 0) === 0 ? (
            <p style={{ padding: "16px 4px", fontSize: 13, color: C.mid, margin: 0, lineHeight: 1.6 }}>
              Tidak ada sumber data yang bisa Anda baca. Itu bukan kerusakan —
              tiap sumber punya izinnya sendiri, dan laporan yang bisa disusun
              mengikuti izin itu.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {muatan!.sumber.map((s) => (
                <button
                  key={s.kunci} type="button"
                  aria-pressed={sumberKunci === s.kunci}
                  onClick={() => gantiSumber(s.kunci)}
                  style={{
                    textAlign: "left", padding: "10px 12px", borderRadius: 8,
                    cursor: "pointer",
                    border: `1px solid ${sumberKunci === s.kunci ? "var(--aksen)" : C.border}`,
                    background: sumberKunci === s.kunci ? "var(--aksen-lembut)" : "transparent",
                  }}
                >
                  <strong style={{ display: "block", fontSize: 13, color: C.text }}>{s.label}</strong>
                  <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 2, lineHeight: 1.45 }}>
                    {s.keterangan}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Kartu>
      )}

      {sumber && (
        <Kartu pad="rapat">
          <JudulKartu sub={`${kolomDipilih.length} dari ${sumber.kolom.length} kolom dipilih`}>
            2 · Kolom
          </JudulKartu>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sumber.kolom.map((k) => {
              const aktif = kolomDipilih.includes(k.kunci);
              return (
                <button
                  key={k.kunci} type="button" aria-pressed={aktif}
                  onClick={() => toggleKolom(k.kunci)}
                  style={{
                    padding: "5px 11px", borderRadius: 999, fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${aktif ? "var(--aksen)" : C.border}`,
                    background: aktif ? "var(--aksen)" : "transparent",
                    color: aktif ? "var(--on-aksen)" : C.mid,
                  }}
                >{k.label}</button>
              );
            })}
          </div>
        </Kartu>
      )}

      {sumber && (
        <Kartu pad="rapat">
          <JudulKartu
            sub="saringan bernilai kosong DITOLAK — saringan yang hilang diam-diam menghasilkan laporan yang jauh lebih besar dari yang diminta"
            aksi={
              <Tombol kecil jenis="sekunder" ikon={<Plus size={12} aria-hidden="true" />}
                onClick={() => setSaringan((p) => [...p, {
                  kolom: sumber.kolom[0].kunci,
                  operator: muatan!.operator[sumber.kolom[0].jenis][0],
                  nilai: "",
                }])}>
                Tambah saringan
              </Tombol>
            }
          >
            3 · Saringan <span style={{ fontWeight: 400, color: C.muted }}>(opsional)</span>
          </JudulKartu>

          {saringan.length === 0 ? (
            <p style={{ fontSize: 12.5, color: C.mid, margin: 0 }}>
              Tanpa saringan, seluruh baris ikut — sampai batas yang Anda
              tetapkan di bawah.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {saringan.map((f, i) => {
                const kol = sumber.kolom.find((k) => k.kunci === f.kolom);
                const opSah = kol ? muatan!.operator[kol.jenis] : [];
                return (
                  <div key={i} style={{
                    display: "grid", gap: 8, alignItems: "end",
                    gridTemplateColumns: "minmax(140px,1.2fr) minmax(110px,.8fr) minmax(140px,1.2fr) auto",
                  }}>
                    <div>
                      <label htmlFor={`f-kol-${i}`} style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 3 }}>
                        Kolom
                      </label>
                      <Pilihan id={`f-kol-${i}`} style={{ ...gayaInput, fontSize: 12.5 }}
                        value={f.kolom}
                        onChange={(e) => {
                          const baru = sumber.kolom.find((k) => k.kunci === e.target.value)!;
                          setSaringan((p) => p.map((x, j) => j === i ? {
                            kolom: baru.kunci,
                            // Operator ikut diganti: yang berlaku untuk teks
                            // belum tentu berlaku untuk angka, dan operator
                            // yang tertinggal akan ditolak server dengan
                            // pesan yang membingungkan.
                            operator: muatan!.operator[baru.jenis][0],
                            nilai: x.nilai,
                          } : x));
                        }}>
                        {sumber.kolom.map((k) => (
                          <option key={k.kunci} value={k.kunci}>{k.label}</option>
                        ))}
                      </Pilihan>
                    </div>
                    <div>
                      <label htmlFor={`f-op-${i}`} style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 3 }}>
                        Operator
                      </label>
                      <Pilihan id={`f-op-${i}`} style={{ ...gayaInput, fontSize: 12.5 }}
                        value={f.operator}
                        onChange={(e) => setSaringan((p) => p.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))}>
                        {opSah.map((o) => <option key={o} value={o}>{o}</option>)}
                      </Pilihan>
                    </div>
                    <div>
                      <label htmlFor={`f-nil-${i}`} style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 3 }}>
                        Nilai
                      </label>
                      <input id={`f-nil-${i}`} style={{ ...gayaInput, fontSize: 12.5 }}
                        type={kol?.jenis === "tanggal" ? "date" : "text"}
                        value={f.nilai}
                        onChange={(e) => setSaringan((p) => p.map((x, j) => j === i ? { ...x, nilai: e.target.value } : x))}
                        placeholder={kol?.jenis === "uang" || kol?.jenis === "angka" ? "angka" : ""} />
                    </div>
                    <Tombol kecil jenis="hantu" ikon={<X size={12} aria-hidden="true" />}
                      onClick={() => setSaringan((p) => p.filter((_, j) => j !== i))}>
                      Hapus
                    </Tombol>
                  </div>
                );
              })}
            </div>
          )}
        </Kartu>
      )}

      {sumber && (
        <Kartu pad="rapat">
          <JudulKartu sub={`maksimal ${muatan?.batas_maks.toLocaleString("id-ID")} baris — lebih dari itu membekukan peramban yang membukanya`}>
            4 · Urutan &amp; batas
          </JudulKartu>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div>
              <label htmlFor="urut-kol" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Urut berdasarkan
              </label>
              <Pilihan id="urut-kol" style={gayaInput} value={urutKolom}
                onChange={(e) => setUrutKolom(e.target.value)}>
                <option value="">— tanpa urutan —</option>
                {sumber.kolom.map((k) => <option key={k.kunci} value={k.kunci}>{k.label}</option>)}
              </Pilihan>
            </div>
            <div>
              <label htmlFor="urut-arah" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Arah
              </label>
              <Pilihan id="urut-arah" style={gayaInput} value={urutArah}
                disabled={!urutKolom}
                onChange={(e) => setUrutArah(e.target.value as "naik" | "turun")}>
                <option value="turun">Terbesar dulu</option>
                <option value="naik">Terkecil dulu</option>
              </Pilihan>
            </div>
            <div>
              <label htmlFor="batas" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Batas baris
              </label>
              <input id="batas" type="number" min="1" max={muatan?.batas_maks}
                style={gayaInput} value={batas}
                onChange={(e) => setBatas(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Tombol jenis="utama" disabled={!bisaJalan}
              ikon={<Play size={13} aria-hidden="true" />}
              onClick={() => void jalankan()}>
              {berjalan ? "Menjalankan…" : "Jalankan"}
            </Tombol>
            {kolomDipilih.length === 0 && (
              <span style={{ fontSize: 12, color: C.muted }}>
                Pilih minimal satu kolom lebih dulu.
              </span>
            )}
          </div>
        </Kartu>
      )}

      {/* ── SATU aksen: hasil terpotong (§3d) ─────────────────────────────── */}
      {hasil?.terpotong && (
        <div role="alert" style={{
          padding: "11px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
          border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
          color: "var(--warning-teks)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <TriangleAlert size={14} aria-hidden="true" />
            Hasil terpotong di {hasil.batas.toLocaleString("id-ID")} baris
          </strong>
          Masih ada baris lain yang tak ikut. Persempit saringannya, atau
          naikkan batas — <strong>angka di bawah bukan keseluruhan</strong>.
        </div>
      )}

      {hasil && (
        <Kartu pad="rapat">
          <JudulKartu
            sub={`${hasil.jumlah.toLocaleString("id-ID")} baris`}
            aksi={
              hasil.jumlah > 0 && (
                <Tombol kecil jenis="sekunder" ikon={<Download size={12} aria-hidden="true" />}
                  onClick={() => void unduh()}>
                  Unduh Excel
                </Tombol>
              )
            }
          >
            Hasil — {hasil.sumber.label}
          </JudulKartu>
          <Tabel
            kolom={kolomHasil}
            data={hasil.baris}
            // Baris tak punya id yang dijamin ada — kolomnya dipilih pengguna,
            // dan `id` belum tentu termasuk. Kuncinya indeks, dan itu aman DI
            // SINI karena daftar ini tak pernah disunting: ia ditampilkan lalu
            // dibuang utuh saat susunan berikutnya dijalankan.
            //
            // (`indexOf` pada objek akan O(n²) dan salah saat ada dua baris
            // identik — dipakai `Map` sekali di luar render.)
            kunciBaris={(b) => String(indeksBaris.get(b) ?? 0)}
            caption={`Hasil laporan ${hasil.sumber.label} yang disusun sendiri`}
            kosong={
              <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0 }}>
                Tidak ada baris yang cocok dengan saringan ini.
              </p>
            }
          />
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Sumber data <strong>terdaftar di kode</strong>, bukan di pengaturan —
          menaruhnya di basis akan membuat &quot;tabel mana yang boleh dibaca
          laporan&quot; bisa diubah lewat UI, dan itu memindahkan keputusan
          keamanan ke tempat yang paling mudah salah tekan. Butuh sumber baru?
          Sebutkan, dan ia ditambahkan beserta pemeriksaan izinnya.
        </span>
      </p>
    </Halaman>
  );
}
