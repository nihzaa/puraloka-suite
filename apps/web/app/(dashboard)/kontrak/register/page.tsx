"use client";

/**
 * REGISTER KONTRAK (kt-register)
 *
 * ── Pertanyaan yang dijawab halaman ini
 *
 * "Berapa nilai kontrak proyek ini sekarang, dan kenapa angkanya berbeda
 * dengan yang dipakai sistem?"
 *
 * Daftar dokumen biasa hanya menjawab yang pertama. Yang kedua adalah inti
 * masalahnya: ada DUA angka di repo ini dan keduanya sah.
 *
 *     kontrak.nilai            apa yang DITANDATANGANI
 *     projects.contract_value  apa yang BERLAKU (dipakai 104 tempat:
 *                              invoice, PPN, retensi, EVM, kurva S, IPC)
 *
 * Halaman ini TIDAK menulis `contract_value`. Dua penulis untuk satu kolom
 * pasti berselisih, dan yang kalah adalah invoice yang terbit dengan angka
 * salah tanpa satu pun galat. Yang disediakan: PEMBANDING — selisih beserta
 * kemungkinan sebabnya, lalu manusia yang memutuskan.
 *
 * ── Kenapa selisih ditaruh SEJAJAR dengan nilainya, bukan di kolom terpisah
 *
 * Selisih tanpa sebab hanya bikin panik. Change order yang sudah disetujui
 * tapi belum diaddendumkan adalah penjelasan yang SAH — proyeknya memang
 * sudah bertambah, dokumennya yang belum menyusul. Kalau itu tak ditampilkan
 * sekalimat dengan angkanya, staf akan membaca setiap selisih sebagai
 * kesalahan dan mengejar hantu.
 *
 * ── Addendum ditakik ke bawah induknya, bukan disusun sejajar
 *
 * Addendum tak berdiri sendiri: nilainya hanya berarti relatif terhadap
 * induknya. Daftar rata membuat "-25.000.000" terbaca sebagai kontrak
 * bernilai minus. Takik dan tanda +/− membuatnya terbaca sebagai perubahan.
 */

import { useEffect, useMemo, useState } from "react";
import { FileSignature, Plus, RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom, KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { formatRupiah } from "@/lib/format";
import { minta } from "@/components/tanya";

type Proyek = { id: string; name: string };

type StatusKontrak = "draf" | "berlaku" | "selesai" | "dibatalkan";

type Kontrak = {
  id: string;
  jenis: "induk" | "addendum";
  nomor: string;
  judul: string;
  tanggal_tanda_tangan: string;
  nilai: number | string;
  status: StatusKontrak;
  kontrak_induk_id: string | null;
};

type Banding = {
  cocok: boolean;
  selisih: number;
  menurutKontrak: number;
  menurutProyek: number;
  sebab: string;
};

type Hasil = {
  proyek: { id: string; name: string; contract_value: number | string } | null;
  kontrak: Kontrak[];
  nilai: { awal: number; addendum: number; berjalan: number; jumlahAddendum: number };
  banding: Banding;
  co_belum_addendum: number;
};

const STATUS_META: Record<StatusKontrak, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  draf: {
    label: "Draf", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Rancangan. Belum dihitung ke nilai proyek — rancangan bukan kesepakatan.",
  },
  berlaku: {
    label: "Berlaku", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Sudah ditandatangani dan mengikat. Nilainya terkunci.",
  },
  selesai: {
    label: "Selesai", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Pekerjaannya tuntas. Tetap dihitung — laporan penutupan membacanya.",
  },
  dibatalkan: {
    label: "Dibatalkan", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Tidak dihitung ke nilai proyek.",
  },
};

const rupiah = formatRupiah;

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const labelGaya: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted,
  textTransform: "uppercase", letterSpacing: "0.05em",
};
const isianGaya: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
  background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
};

const gayaTombolKecil: React.CSSProperties = {
  cursor: "pointer", padding: "4px 10px", borderRadius: 5, fontSize: 12,
  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
};

/** Satu baris daftar: kontrak, plus apakah ia ditakik sebagai addendum. */
type Baris = { k: Kontrak; takik: boolean };

/**
 * Kolom register kontrak.
 *
 * Fungsi, bukan konstanta, karena kolom Tindakan memanggil `ubahStatus` yang
 * hidup di dalam komponen. Tapi tetap di LUAR komponen supaya definisinya tak
 * dibangun ulang tiap ketikan di formulir — pola yang sama dipakai register
 * asuransi.
 */
function kolomKontrak(
  ubahStatus: (k: Kontrak, status: StatusKontrak) => void,
): Array<Kolom<Baris>> {
  return [
    {
      kunci: "nomor", judul: "Nomor & judul", kepalaBaris: true,
      render: ({ k, takik }) => (
        <span style={{ display: "block", paddingLeft: takik ? 20 : 0 }}>
          <span style={{ fontWeight: 600, color: C.text }}>
            {takik && <span aria-hidden="true" style={{ color: C.muted, marginRight: 6 }}>↳</span>}
            {k.nomor}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 2 }}>
            {takik && <span className="sr-only">Addendum atas kontrak di atasnya. </span>}
            {k.judul}
          </span>
        </span>
      ),
    },
    {
      kunci: "tanggal", judul: "Tanggal",
      render: ({ k }) => (
        <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
          {tanggalTerbaca(k.tanggal_tanda_tangan)}
        </span>
      ),
    },
    {
      kunci: "nilai", judul: "Nilai", rata: "kanan",
      // Tanda + pada addendum bukan hiasan: tanpa itu, "25.000.000" di bawah
      // induk terbaca sebagai nilai kontrak, bukan sebagai penambahan.
      render: ({ k, takik }) => {
        const n = Number(k.nilai);
        return (
          <span style={{
            fontWeight: 600, whiteSpace: "nowrap",
            color: takik ? (n < 0 ? "var(--danger)" : "var(--success)") : C.text,
          }}>
            {takik && n > 0 ? "+" : ""}{rupiah(n)}
          </span>
        );
      },
    },
    {
      kunci: "status", judul: "Status",
      render: ({ k }) => {
        const meta = STATUS_META[k.status];
        return (
          <span title={meta.arti} style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            color: meta.warna, background: meta.bg, border: `1px solid ${meta.border}`,
          }}>{meta.label}</span>
        );
      },
    },
    {
      kunci: "tindakan", judul: "Tindakan", rata: "kanan",
      render: ({ k }) => {
        if (k.status === "selesai" || k.status === "dibatalkan") {
          return <span style={{ fontSize: 11.5, color: C.muted }}>—</span>;
        }
        return (
          <span style={{ whiteSpace: "nowrap" }}>
            {k.status === "draf" && (
              <button type="button" onClick={() => ubahStatus(k, "berlaku")} style={gayaTombolKecil}>
                Berlakukan
              </button>
            )}
            {k.status === "berlaku" && (
              <button type="button" onClick={() => ubahStatus(k, "selesai")} style={gayaTombolKecil}>
                Tandai selesai
              </button>
            )}
            <button type="button" onClick={() => ubahStatus(k, "dibatalkan")}
              style={{ ...gayaTombolKecil, marginLeft: 6, color: "var(--danger)" }}>
              Batalkan
            </button>
          </span>
        );
      },
    },
  ];
}

export default function RegisterKontrakPage() {
  const [dipilih, setDipilih] = useState("");
  const [sukses, setSukses] = useState<string | null>(null);

  const [dialogBuka, setDialogBuka] = useState(false);
  const [mengirim, setMengirim] = useState(false);

  const [fJenis, setFJenis] = useState<"induk" | "addendum">("induk");
  const [fInduk, setFInduk] = useState("");
  const [fNomor, setFNomor] = useState("");
  const [fJudul, setFJudul] = useState("");
  const [fTanggal, setFTanggal] = useState("");
  const [fNilai, setFNilai] = useState("");
  const [fRetensi, setFRetensi] = useState("");
  const [fMulai, setFMulai] = useState("");
  const [fSelesai, setFSelesai] = useState("");
  const [fLingkup, setFLingkup] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData`: daftar proyek, lalu detail register yang bergantung
    `dipilih`. Galat AKSI (kirim kontrak / ubah status) dipisah dari galat
    MUAT — satu state gabungan sebelumnya membuat gagal menyimpan menghapus
    pesan gagal memuat.
  */
  const { data: dataProyek, memuat, galat: galatMuatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  // `useMemo`: masuk dependensi `useEffect` di bawah, dan array baru tiap
  // render membuat efek itu berjalan tanpa henti.
  const proyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  // Default `dipilih` ke proyek pertama begitu daftarnya datang.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDipilih((s) => s || proyek[0]?.id || ""); }, [proyek]);

  const { data: hasil, memuat: memuatDetail, galat: galatMuatDetail, muatUlang: muatUlangDetail } =
    useData<Hasil>(dipilih ? `/api/v1/kontrak/proyek/${dipilih}` : null);

  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const galat = galatAksi
    ?? (galatMuatProyek ? "Gagal memuat daftar proyek."
      : galatMuatDetail ? "Gagal memuat register kontrak." : null);

  // Induk yang boleh ditunjuk addendum: hanya yang berjenis induk DAN belum
  // dibatalkan. Menawarkan yang dibatalkan berarti membiarkan orang menyusun
  // addendum atas kontrak yang tak berlaku, lalu ditolak basis.
  const indukTersedia = useMemo(
    () => (hasil?.kontrak ?? []).filter((k) => k.jenis === "induk" && k.status !== "dibatalkan"),
    [hasil],
  );

  // Alasan tombol mati DINYATAKAN, bukan sekadar membuat tombol abu-abu.
  const halangan = useMemo(() => {
    if (!dipilih) return "Pilih proyek lebih dulu.";
    if (!fNomor.trim()) return "Isi nomor kontrak.";
    if (!fJudul.trim()) return "Isi judul kontrak.";
    if (!fTanggal) return "Isi tanggal tanda tangan.";
    if (!fNilai.trim()) return "Isi nilai kontrak.";
    const n = Number(fNilai);
    if (!Number.isFinite(n)) return "Nilai kontrak harus berupa angka.";
    if (fJenis === "induk" && n <= 0) return "Kontrak induk harus bernilai lebih dari nol.";
    if (fJenis === "addendum" && n === 0) {
      return "Addendum bernilai nol tak mengubah apa pun. Isi negatif bila lingkupnya berkurang.";
    }
    if (fJenis === "addendum" && !fInduk) return "Pilih kontrak induk yang diubah addendum ini.";
    if (fJenis === "addendum" && indukTersedia.length === 0) {
      return "Belum ada kontrak induk di proyek ini. Catat kontrak induknya lebih dulu.";
    }
    if (fSelesai && fMulai && fSelesai < fMulai) {
      return "Tanggal selesai tidak boleh lebih awal daripada tanggal mulai.";
    }
    if (fRetensi.trim()) {
      const r = Number(fRetensi);
      if (!Number.isFinite(r) || r < 0 || r > 100) return "Retensi harus antara 0 dan 100 persen.";
    }
    return null;
  }, [dipilih, fNomor, fJudul, fTanggal, fNilai, fJenis, fInduk, fMulai, fSelesai, fRetensi, indukTersedia]);

  function bukaDialog(jenis: "induk" | "addendum") {
    setFJenis(jenis);
    setFInduk(jenis === "addendum" && indukTersedia.length > 0 ? indukTersedia[0].id : "");
    setFNomor(""); setFJudul(""); setFTanggal(""); setFNilai("");
    setFRetensi(""); setFMulai(""); setFSelesai(""); setFLingkup("");
    setGalatAksi(null);
    setDialogBuka(true);
  }

  async function kirim() {
    if (halangan) return;
    setMengirim(true); setGalatAksi(null); setSukses(null);
    try {
      await api.post("/api/v1/kontrak", {
        project_id: dipilih,
        jenis: fJenis,
        kontrak_induk_id: fJenis === "addendum" ? fInduk : undefined,
        nomor: fNomor.trim(),
        judul: fJudul.trim(),
        tanggal_tanda_tangan: fTanggal,
        nilai: fNilai,
        retensi_pct: fRetensi.trim() ? fRetensi : undefined,
        tanggal_mulai: fMulai || undefined,
        tanggal_selesai: fSelesai || undefined,
        lingkup: fLingkup.trim() || undefined,
      });
      setSukses(
        `${fJenis === "induk" ? "Kontrak" : "Addendum"} ${fNomor.trim()} tercatat sebagai `
        + "draf. Nilainya belum dihitung sampai statusnya diberlakukan.",
      );
      setDialogBuka(false);
      await muatUlangDetail();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal mencatat kontrak");
    } finally {
      setMengirim(false);
    }
  }

  async function ubahStatus(k: Kontrak, status: StatusKontrak) {
    let alasan: string | undefined;
    if (status === "dibatalkan") {
      const jawab = await minta({
        judul: `Alasan pembatalan kontrak ${k.nomor}?`,
        pesan:
          "Alasan wajib diisi — kontrak yang batal tanpa keterangan tak bisa " +
          "dipertanggungjawabkan saat diaudit.",
        panjang: true,
        labelYa: "Batalkan kontrak",
        nada: "bahaya",
      });
      if (!jawab || !jawab.trim()) return;
      alasan = jawab.trim();
    }
    setGalatAksi(null); setSukses(null);
    try {
      await api.patch(`/api/v1/kontrak/${k.id}/status`, { status, alasan });
      setSukses(`Kontrak ${k.nomor} kini berstatus ${STATUS_META[status].label.toLowerCase()}.`);
      await muatUlangDetail();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal mengubah status kontrak");
    }
  }

  const daftarTersusun = useMemo(() => {
    const semua = hasil?.kontrak ?? [];
    const induk = semua.filter((k) => k.jenis === "induk");
    const keluar: Array<{ k: Kontrak; takik: boolean }> = [];
    for (const i of induk) {
      keluar.push({ k: i, takik: false });
      for (const a of semua.filter((x) => x.kontrak_induk_id === i.id)) {
        keluar.push({ k: a, takik: true });
      }
    }
    // Addendum yatim tetap ditampilkan — menyembunyikannya berarti dokumen
    // hilang dari layar padahal ada di basis.
    for (const a of semua) {
      if (a.jenis === "addendum" && !keluar.some((x) => x.k.id === a.id)) {
        keluar.push({ k: a, takik: true });
      }
    }
    return keluar;
  }, [hasil]);

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman judul="Register Kontrak"         ikon={<FileSignature size={19} />}
      />
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Kontrak induk beserta seluruh addendumnya, dan <strong>selisihnya</strong> terhadap
          nilai yang dipakai sistem untuk menagih. Halaman ini mencatat apa yang
          ditandatangani — ia tidak mengubah angka yang dipakai invoice.
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
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : proyek.length === 0 ? (
        <Kosong
          ikon={<FileSignature size={28} />}
          judul="Belum ada proyek"
          sebab="Kontrak dicatat per proyek. Daftar ini terisi sendiri begitu ada proyek berjalan."
        />
      ) : (
        <>
          {/* ── Pemilih proyek + tindakan ────────────────────────────── */}
          <div className="rise rise-2" style={{
            ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
            display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240, flex: 1 }}>
              <label htmlFor="kt-proyek" style={labelGaya}>Proyek</label>
              <select id="kt-proyek" value={dipilih} onChange={(e) => setDipilih(e.target.value)} style={isianGaya}>
                {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <button type="button" onClick={() => bukaDialog("induk")} style={{
              display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
              padding: "9px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
            }}>
              <Plus size={15} aria-hidden="true" /> Catat kontrak
            </button>

            <button type="button" onClick={() => bukaDialog("addendum")}
              disabled={indukTersedia.length === 0}
              title={indukTersedia.length === 0
                ? "Belum ada kontrak induk di proyek ini — addendum tak punya yang diubah."
                : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                cursor: indukTersedia.length === 0 ? "not-allowed" : "pointer",
                opacity: indukTersedia.length === 0 ? 0.45 : 1,
                padding: "9px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}>
              <ScrollText size={15} aria-hidden="true" /> Catat addendum
            </button>

            {/* Alasan tombol mati DINYATAKAN di layar, bukan hanya di `title`.
                Tooltip tak terjangkau keyboard maupun sentuh — dan pengguna
                yang tak tahu kenapa tombolnya abu-abu menyimpulkan aplikasinya
                rusak. */}
            {indukTersedia.length === 0 && (
              <p style={{
                fontSize: 11.5, color: C.muted, margin: 0, flexBasis: "100%",
                lineHeight: 1.45, maxWidth: "62ch",
              }}>
                Addendum baru bisa dicatat setelah ada kontrak induk di proyek ini —
                addendum mengubah sesuatu, jadi harus ada yang diubah.
              </p>
            )}

            <button type="button" onClick={() => void muatUlangDetail()}
              aria-label="Muat ulang register kontrak" style={{
                display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                padding: "9px 12px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid,
              }}>
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>

          {memuatDetail && !hasil ? (
            <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
          ) : hasil ? (
            <>
              {/* ── Nilai kontraktual + PEMBANDING ──────────────────── */}
              <div className="rise rise-3" style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
                <div style={{
                  display: "grid", gap: "var(--gap-bagian)",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                }}>
                  <div>
                    <div style={labelGaya}>Nilai awal</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: C.text, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                      {rupiah(hasil.nilai.awal)}
                    </div>
                  </div>
                  <div>
                    <div style={labelGaya}>Addendum ({hasil.nilai.jumlahAddendum})</div>
                    <div style={{
                      fontSize: 19, fontWeight: 700, marginTop: 3, fontVariantNumeric: "tabular-nums",
                      color: hasil.nilai.addendum < 0 ? "var(--danger)" : hasil.nilai.addendum > 0 ? "var(--success)" : C.mid,
                    }}>
                      {hasil.nilai.addendum > 0 ? "+" : ""}{rupiah(hasil.nilai.addendum)}
                    </div>
                  </div>
                  <div>
                    <div style={labelGaya}>Nilai berjalan</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: C.text, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                      {rupiah(hasil.nilai.berjalan)}
                    </div>
                  </div>
                  <div>
                    <div style={labelGaya}>Dipakai sistem</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: C.mid, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                      {rupiah(Number(hasil.proyek?.contract_value ?? 0))}
                    </div>
                  </div>
                </div>

                {/* Selisih SEJAJAR dengan sebabnya. Selisih tanpa sebab hanya
                    bikin panik — dan sebagian selisih memang sah. */}
                <div style={{
                  marginTop: "var(--gap-bagian)", paddingTop: "var(--pad-kartu)", borderTop: `1px solid ${C.border}`,
                  display: "flex", gap: 9, alignItems: "flex-start",
                }}>
                  {hasil.banding.cocok ? (
                    <>
                      <span aria-hidden="true" style={{ color: "var(--success)", fontWeight: 700, lineHeight: 1.5 }}>✓</span>
                      <p style={{ fontSize: 12.5, color: C.mid, margin: 0, lineHeight: 1.55 }}>
                        Nilai dokumen cocok dengan angka yang dipakai sistem untuk menagih.
                      </p>
                    </>
                  ) : (
                    <>
                      <TriangleAlert size={16} aria-hidden="true"
                        style={{ color: "var(--warning-teks)", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12.5, color: C.text, margin: 0, lineHeight: 1.55 }}>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                          Selisih {rupiah(Math.abs(hasil.banding.selisih))}
                        </strong>
                        {" — "}{hasil.banding.sebab}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* ── Daftar kontrak ──────────────────────────────────── */}
              {daftarTersusun.length === 0 ? (
                <Kosong
                  ikon={<FileSignature size={28} />}
                  judul="Belum ada kontrak tercatat"
                  sebab={
                    "Proyek ini berjalan tanpa dokumen kontrak di sistem. Catat kontrak "
                    + "induknya supaya nilai yang ditandatangani bisa dibandingkan dengan "
                    + "angka yang dipakai menagih."
                  }
                />
              ) : (
                <div className="rise rise-4">
                  <Tabel<Baris>
              berpermukaan
                    kolom={kolomKontrak(ubahStatus)}
                    data={daftarTersusun}
                    kunciBaris={(b) => b.k.id}
                    caption={`Daftar kontrak dan addendum proyek ${hasil.proyek?.name ?? ""}`}
                  />
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      {/* ── Dialog catat kontrak / addendum ────────────────────────── */}
      <DialogBersama
        terbuka={dialogBuka}
        onTutup={() => setDialogBuka(false)}
        judul={fJenis === "induk" ? "Catat kontrak induk" : "Catat addendum"}
        lebar={620}
      >
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          {fJenis === "addendum" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label htmlFor="kt-induk" style={labelGaya}>Kontrak induk yang diubah</label>
              <select id="kt-induk" value={fInduk} onChange={(e) => setFInduk(e.target.value)} style={isianGaya}>
                {indukTersedia.map((k) => (
                  <option key={k.id} value={k.id}>{k.nomor} — {k.judul}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="kt-nomor" style={labelGaya}>Nomor kontrak</label>
            <input id="kt-nomor" type="text" value={fNomor} onChange={(e) => setFNomor(e.target.value)}
              placeholder="mis. KTR-2026-014" style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="kt-tanggal" style={labelGaya}>Tanggal tanda tangan</label>
            <input id="kt-tanggal" type="date" value={fTanggal}
              onChange={(e) => setFTanggal(e.target.value)} style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label htmlFor="kt-judul" style={labelGaya}>Judul</label>
            <input id="kt-judul" type="text" value={fJudul} onChange={(e) => setFJudul(e.target.value)}
              placeholder="mis. Pembangunan Gedung B — Tahap I" style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="kt-nilai" style={labelGaya}>
              Nilai (Rp){fJenis === "addendum" && " — boleh negatif"}
            </label>
            <input id="kt-nilai" type="number" inputMode="numeric" value={fNilai}
              onChange={(e) => setFNilai(e.target.value)}
              aria-describedby={fJenis === "addendum" ? "kt-nilai-bantu" : undefined}
              style={isianGaya} />
            {fJenis === "addendum" && (
              <span id="kt-nilai-bantu" style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
                Isi negatif bila lingkup pekerjaan berkurang. Yang dicatat adalah
                perubahannya, bukan nilai kontrak yang baru.
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="kt-retensi" style={labelGaya}>Retensi (%) — opsional</label>
            <input id="kt-retensi" type="number" inputMode="decimal" value={fRetensi}
              onChange={(e) => setFRetensi(e.target.value)} placeholder="mis. 5" style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="kt-mulai" style={labelGaya}>Mulai kerja — opsional</label>
            <input id="kt-mulai" type="date" value={fMulai}
              onChange={(e) => setFMulai(e.target.value)} style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="kt-selesai" style={labelGaya}>Selesai kerja — opsional</label>
            <input id="kt-selesai" type="date" value={fSelesai}
              onChange={(e) => setFSelesai(e.target.value)} style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label htmlFor="kt-lingkup" style={labelGaya}>Lingkup — opsional</label>
            <textarea id="kt-lingkup" value={fLingkup} onChange={(e) => setFLingkup(e.target.value)}
              rows={3} placeholder="Ringkasan pekerjaan yang disepakati"
              style={{ ...isianGaya, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        </div>

        <div style={{
          marginTop: "var(--gap-bagian)", paddingTop: "var(--pad-kartu)", borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 9, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap",
        }}>
          {halangan && (
            <span style={{ fontSize: 12, color: C.mid, marginRight: "auto", maxWidth: "42ch", lineHeight: 1.45 }}>
              {halangan}
            </span>
          )}
          <button type="button" onClick={() => setDialogBuka(false)} style={{
            cursor: "pointer", padding: "8px 14px", borderRadius: 6, fontSize: 13,
            border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
          }}>Batal</button>
          <button type="button" onClick={kirim} disabled={!!halangan || mengirim} style={{
            cursor: halangan || mengirim ? "not-allowed" : "pointer",
            opacity: halangan || mengirim ? 0.5 : 1,
            padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
            border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
          }}>{mengirim ? "Menyimpan…" : "Simpan sebagai draf"}</button>
        </div>
      </DialogBersama>
    </div>
  );
}
