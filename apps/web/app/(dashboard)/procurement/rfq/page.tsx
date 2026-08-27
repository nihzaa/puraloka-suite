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
import { FileText, RefreshCw, Plus, Award, Gavel, CheckCircle2, TriangleAlert, ArrowRight } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { RfqPenawaranModal } from "@/components/rfq-penawaran-modal";
import { formatRupiah } from "@/lib/format";

type Proyek = { id: string; name: string };

/**
 * MR yang layak dimintakan penawaran.
 *
 * `qty` adalah SISA (diminta − dipesan), bukan yang semula diminta.
 * MR-2026-003 di data nyata: 115 diminta, 85 sudah dipesan. Menawarkan 115
 * berarti meminta vendor menghargai 85 unit yang sudah dibeli — vendor
 * menjawab dengan benar, angkanya salah, dan RFQ-nya tetap terlihat rapi.
 */
type MrItemLayak = {
  material_id: string;
  material_name: string;
  unit: string | null;
  qty: number;
  qty_diminta: number;
};

type MrLayak = {
  id: string;
  mr_number: string;
  status: string;
  item: MrItemLayak[];
  total_sisa: number;
  tanpa_material: number;
};

type MrLayakResponse = {
  layak: MrLayak[];
  /** Yang tidak layak DIHITUNG, bukan dihilangkan diam-diam. */
  tak_layak: number;
  jumlah_mr: number;
};

type Rfq = {
  id: string;
  nomor: string;
  tanggal: string;
  batas_masuk: string | null;
  status: "draft" | "terkirim" | "selesai" | "batal";
  catatan: string | null;
  alasan_pilih: string | null;
  /** Terisi begitu RFQ diputuskan; jadi penanda tunggal "siapa menang". */
  po_id: string | null;
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

type HasilPutusan = {
  purchase_order: { id: string; po_number: string; total: number };
  putusan: {
    supplier_name: string;
    jumlah_item: number;
    seluruhnya_termurah: boolean;
    selisih_total: number;
  };
};

const STATUS_META: Record<Rfq["status"], { label: string; warna: string; bg: string; border: string }> = {
  draft: { label: "Draft", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  terkirim: { label: "Menunggu penawaran", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)" },
  selesai: { label: "Sudah diputuskan", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  batal: { label: "Dibatalkan", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
};

const rupiah = formatRupiah;

const angka = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/**
 * Ringkasan keputusan yang SUDAH diambil.
 *
 * Menggantikan form putusan, bukan mendampinginya: RFQ yang sudah punya PO
 * tak boleh diputuskan lagi (server menolak 409), dan tombol yang tetap
 * terlihat lalu ditolak adalah janji palsu.
 *
 * `hasil` hanya ada tepat setelah keputusan di sesi ini — ia membawa nomor PO
 * dan selisihnya. Saat halaman dibuka kembali, yang tersisa dari basis adalah
 * `alasan_pilih`, dan itu memang yang paling penting untuk dibaca ulang.
 */
function PutusanTerekam({
  rfq, hasil, kartu,
}: {
  rfq: Rfq;
  hasil: HasilPutusan | null;
  kartu: React.CSSProperties;
}) {
  return (
    <div className="rise rise-3" style={{
      ...kartu, padding: "14px 16px", marginTop: 16,
      borderColor: "var(--success-border)", background: "var(--success-bg)",
    }}>
      <h2 style={{
        fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700,
        color: "var(--success)", margin: 0, display: "flex", alignItems: "center", gap: 7,
      }}>
        <CheckCircle2 size={15} aria-hidden="true" />
        Sudah diputuskan
      </h2>

      {hasil && (
        <p style={{ fontSize: 13, color: C.text, margin: "8px 0 0", lineHeight: 1.6 }}>
          <strong>{hasil.putusan.supplier_name}</strong> menang ·{" "}
          PO <strong>{hasil.purchase_order.po_number}</strong> terbit dengan{" "}
          {hasil.putusan.jumlah_item} material, total{" "}
          <strong>{rupiah(hasil.purchase_order.total)}</strong>.
          {!hasil.putusan.seluruhnya_termurah && (
            <>
              {" "}Lebih mahal {rupiah(hasil.putusan.selisih_total)} daripada
              mengambil tiap material dari vendor termurahnya.
            </>
          )}
        </p>
      )}

      {/* PO-nya bisa dibuka dari sini.
          Tanpa tautan, satu-satunya cara memeriksa pesanan yang baru terbit
          adalah menghafal nomornya lalu mencarinya di daftar PO — dan yang
          paling ingin memeriksanya justru orang yang baru saja menekan
          tombolnya. Tautan mengarah ke DAFTAR, bukan ke detail: `/procurement/
          pesanan` adalah rute yang benar-benar ada; halaman detail per-PO
          belum, dan tautan ke halaman yang tak ada lebih buruk daripada tak
          ada tautan. */}
      <a
        href="/procurement/pesanan"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10,
          fontSize: 12.5, fontWeight: 600, color: "var(--success)",
          textDecoration: "underline", textUnderlineOffset: 3,
        }}
      >
        Lihat di daftar Purchase Order
        <ArrowRight size={13} aria-hidden="true" />
      </a>

      {rfq.alasan_pilih ? (
        <div style={{ marginTop: hasil ? 10 : 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            Alasan pemilihan
          </div>
          <p style={{ fontSize: 13, color: C.text, margin: "4px 0 0", lineHeight: 1.6, maxWidth: "72ch" }}>
            {rfq.alasan_pilih}
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: C.mid, margin: "8px 0 0", lineHeight: 1.55 }}>
          Vendor yang menang adalah yang termurah, jadi tak ada yang perlu dijelaskan.
        </p>
      )}
    </div>
  );
}

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
  const [buatMr, setBuatMr] = useState("");
  const [mrLayak, setMrLayak] = useState<MrLayakResponse | null>(null);
  const [membuat, setMembuat] = useState(false);

  const [formPenawaran, setFormPenawaran] = useState(false);
  const [vendorPilihan, setVendorPilihan] = useState("");
  const [alasanPilih, setAlasanPilih] = useState("");
  const [memutuskan, setMemutuskan] = useState(false);
  const [hasilPutusan, setHasilPutusan] = useState<HasilPutusan | null>(null);
  const [galatPutusan, setGalatPutusan] = useState<string | null>(null);

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

  // MR layak dimuat begitu proyek dipilih. Bukan di awal halaman: daftarnya
  // per-proyek, dan memuat semuanya lebih dulu berarti sembilan permintaan
  // untuk satu yang dipakai.
  useEffect(() => {
    setBuatMr("");
    if (!buatProyek) { setMrLayak(null); return; }
    const ac = makeAbortController();
    api.get<MrLayakResponse>(`/api/v1/rfq/mr-layak?project_id=${buatProyek}`, { signal: ac.signal })
      .then((r) => setMrLayak(r.data))
      // Gagal memuat MR TIDAK boleh memblokir pembuatan RFQ — RFQ tanpa MR
      // tetap sah. Yang hilang hanya kenyamanannya, dan itu bukan alasan
      // menghentikan pekerjaan orang.
      .catch((e) => { if (e?.name !== "CanceledError") setMrLayak(null); });
    return () => ac.abort();
  }, [buatProyek]);

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
        // Dikirim hanya bila dipilih. `mr_id: ""` akan ditolak server sebagai
        // MR yang tak ditemukan — dan itu galat yang membingungkan untuk
        // sesuatu yang memang tak diisi.
        ...(buatMr ? { mr_id: buatMr } : {}),
      });
      setBuatNomor("");
      setBuatMr("");
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

  /**
   * Material yang dimenangkan vendor terpilih PADAHAL ada yang lebih murah.
   *
   * ── Kenapa dihitung ulang di klien, padahal server sudah memutuskan
   *
   * Bukan untuk menggantikan pemeriksaan server — itu tetap satu-satunya yang
   * menentukan (`lib/putusan-rfq.ts`, dan endpointnya menolak 400). Ini supaya
   * formnya bisa memberi tahu **sebelum** tombol ditekan bahwa alasan akan
   * diminta, dan menyebut di material mana lebih mahalnya.
   *
   * Menunggu 400 dari server untuk mengetahuinya membuat orang menekan tombol,
   * ditolak, lalu mengarang alasan supaya lolos — persis kebiasaan yang modul
   * ini dibangun untuk mencegahnya. Yang dibaca auditor setahun kemudian adalah
   * alasan itu.
   *
   * Rumusnya SENGAJA sama dengan server (`harga > harga_termurah`), bukan
   * `!sel.termurah`: dua vendor pada harga yang persis sama sama-sama sah
   * menang tanpa alasan.
   */
  const lebihMahalDi = useMemo(() => {
    if (!vendorPilihan || !tabulasi) return [];
    return tabulasi.baris.flatMap((b) => {
      const sel = b.sel.find((s) => s.supplier_id === vendorPilihan);
      if (!sel || sel.harga_satuan == null) return [];
      if (b.harga_termurah == null || sel.harga_satuan <= b.harga_termurah) return [];
      return [{
        material_name: b.material_name,
        selisih: (sel.harga_satuan - b.harga_termurah) * b.qty,
      }];
    });
  }, [vendorPilihan, tabulasi]);

  /** Material yang benar-benar akan masuk PO — yang tak ditawar tidak ikut. */
  const jumlahItemPo = useMemo(() => {
    if (!vendorPilihan || !tabulasi) return 0;
    return tabulasi.baris.filter((b) => {
      const s = b.sel.find((x) => x.supplier_id === vendorPilihan);
      return s?.harga_satuan != null && b.qty > 0;
    }).length;
  }, [vendorPilihan, tabulasi]);

  const alasanWajib = lebihMahalDi.length > 0;
  const alasanCukup = alasanPilih.trim().length >= 10;
  const bolehPutuskan =
    !!vendorPilihan && jumlahItemPo > 0 && (!alasanWajib || alasanCukup) && !memutuskan;

  async function putuskan() {
    if (!idEfektif || !bolehPutuskan) return;
    setMemutuskan(true);
    setGalatPutusan(null);
    try {
      const r = await api.post<HasilPutusan>(`/api/v1/rfq/${idEfektif}/putuskan`, {
        supplier_id: vendorPilihan,
        alasan: alasanPilih.trim() || undefined,
      });
      setHasilPutusan(r.data);
      setVendorPilihan("");
      setAlasanPilih("");
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatPutusan(m ?? "Gagal memutuskan pemenang");
    } finally {
      setMemutuskan(false);
    }
  }

  /**
   * Kolom tabulasi — DITURUNKAN dari daftar vendor, bukan ditulis tetap.
   *
   * Tiap vendor jadi satu kolom, jadi jumlah kolomnya berubah per RFQ. Itu
   * sebabnya `kolom` dibangun di sini alih-alih di luar komponen: `Tabel`
   * menerima array biasa, dan array itu boleh sepanjang apa pun.
   *
   * Sel dicari lewat `find` pada `supplier_id`, bukan lewat indeks. Urutan
   * `b.sel` datang dari API dan tak dijamin sejajar dengan `tabulasi.vendor`;
   * mencocokkan lewat indeks membuat harga vendor A muncul di kolom vendor B
   * tanpa satu pun tanda bahwa ada yang salah.
   */
  const kolomTabulasi = useMemo<Array<Kolom<BarisTabulasi>>>(() => {
    const vendor = tabulasi?.vendor ?? [];
    return [
      {
        kunci: "material", judul: "Material", kepalaBaris: true,
        render: (b) => (
          <>
            {b.material_name}
            {b.unit && <span style={{ fontSize: 11, color: C.mid }}> · {b.unit}</span>}
          </>
        ),
      },
      {
        kunci: "qty", judul: "Qty", rata: "kanan",
        render: (b) => <span style={{ color: C.mid }}>{angka(b.qty)}</span>,
      },
      ...vendor.map((v): Kolom<BarisTabulasi> => ({
        kunci: v.supplier_id, judul: v.supplier_name, rata: "kanan",
        render: (b) => {
          const s = b.sel.find((x) => x.supplier_id === v.supplier_id);
          if (!s || s.harga_satuan == null) {
            // "Tidak menawar" ditulis sebagai KATA, bukan sel kosong: sel
            // kosong tak bisa dibedakan dari data yang hilang.
            return <span style={{ fontSize: 11, color: C.muted }}>tak menawar</span>;
          }
          return (
            <span style={{
              color: s.termurah ? "var(--success)" : C.text,
              fontWeight: s.termurah ? 700 : 400,
            }}>
              {rupiah(s.harga_satuan)}
              {s.termurah ? (
                <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--success)" }}>
                  termurah
                </span>
              ) : s.selisih_pct != null && s.selisih_pct > 0 ? (
                <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: C.muted }}>
                  +{s.selisih_pct.toFixed(1)}%
                </span>
              ) : null}
            </span>
          );
        },
      })),
      {
        kunci: "rentang", judul: "Rentang", rata: "kanan",
        render: (b) => (
          <span style={{
            fontWeight: 700,
            color: b.rentang_pct == null ? C.muted
              : b.rentang_pct >= 10 ? "var(--danger)" : C.mid,
          }}>
            {b.rentang_pct == null ? (
              <span style={{ fontSize: 11, fontWeight: 400 }}>
                {b.harga_termurah == null ? "tak ada penawaran" : "1 penawar"}
              </span>
            ) : `${b.rentang_pct.toFixed(1)}%`}
          </span>
        ),
      },
    ];
  }, [tabulasi]);

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
    // ── Tanpa <h1>, tanpa maxWidth, tanpa padding halaman
    //
    // `procurement/layout.tsx` sudah menyediakan ketiganya: `JudulBagian`
    // (judulnya diambil dari menu, jadi "RFQ & Tabulasi" — nama yang sama
    // dengan yang diklik di sidebar), pembungkus kartu, dan padding isi.
    //
    // Halaman ini sempat menyediakannya sendiri, dan hasilnya terlihat di
    // tangkapan layar 2026-08-08: DUA judul bertumpuk ("RFQ & Tabulasi" lalu
    // "RFQ & Perbandingan Penawaran") dan kartu di dalam kartu. Diukur, 10
    // dari 12 halaman procurement sudah benar — yang menyimpang hanya di sini
    // dan `riwayat-harga`.
    <div>
      <p style={{ fontSize: 13, color: C.mid, margin: "0 0 18px", maxWidth: "68ch", lineHeight: 1.55 }}>
        Harga datang dari perbandingan, bukan dari satu vendor langganan.
        Tabulasinya adalah bukti pemilihan vendor — jawaban saat seseorang
        bertanya kenapa yang lebih mahal yang dipilih.
      </p>

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

            {/* Kebutuhan (MR) — opsional, tapi inilah yang menjawab
                "RFQ ini untuk apa?".

                Diukur 2026-08-08: `rfq.mr_id` ada di schema dan rute API
                sudah menerimanya, tapi 3 dari 3 RFQ ber-`mr_id` NULL —
                halaman ini tak punya satu pun cara mengisinya. */}
            {buatProyek && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
                <label htmlFor="rq-mr" style={labelGaya}>
                  Untuk kebutuhan (MR){" "}
                  <span style={{ fontWeight: 400, color: C.mid }}>— opsional</span>
                </label>
                <select
                  id="rq-mr" value={buatMr} onChange={(e) => setBuatMr(e.target.value)}
                  style={isianGaya}
                  disabled={!mrLayak || mrLayak.layak.length === 0}
                  aria-describedby="rq-mr-ket"
                >
                  <option value="">— tanpa MR —</option>
                  {(mrLayak?.layak ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.mr_number} · {m.item.length} bahan, sisa {m.total_sisa}
                    </option>
                  ))}
                </select>
                <span id="rq-mr-ket" style={{ fontSize: 11, color: C.mid, lineHeight: 1.5 }}>
                  {!mrLayak
                    ? "Memuat kebutuhan…"
                    : mrLayak.layak.length === 0
                      // Angka "0" tanpa penyebutnya tak bisa dinilai: nol dari
                      // nol berarti belum ada MR; nol dari sembilan berarti
                      // semuanya sudah dipesan atau belum disetujui.
                      ? mrLayak.jumlah_mr === 0
                        ? "Belum ada MR di proyek ini."
                        : `${mrLayak.jumlah_mr} MR ada, tapi belum ada yang bisa ditawarkan — belum disetujui atau sudah dipesan penuh.`
                      : `${mrLayak.layak.length} dari ${mrLayak.jumlah_mr} MR bisa ditawarkan. Qty yang ditampilkan adalah SISA, bukan yang semula diminta.`}
                </span>
              </div>
            )}

            {/* Tombol mati yang tak menjelaskan sebabnya adalah jalan buntu.
                Terlihat saat menilai tangkapan layar: begitu MR dipilih,
                "Buat RFQ" tetap abu-abu — dan karena keduanya bersebelahan,
                terbaca seolah MEMILIH MR yang mematikannya. Yang sebenarnya
                kurang adalah nomor RFQ, dan tak ada yang mengatakannya. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button" onClick={buatRfq}
                disabled={!buatProyek || !buatNomor.trim() || membuat}
                style={{
                  padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: "none", minHeight: 40,
                  background: !buatProyek || !buatNomor.trim() || membuat ? C.border : C.navy,
                  color: !buatProyek || !buatNomor.trim() || membuat ? C.mid : "var(--on-navy)",
                  cursor: !buatProyek || !buatNomor.trim() || membuat ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                <Plus size={14} aria-hidden="true" />
                {membuat ? "Membuat…" : "Buat RFQ"}
              </button>
              {/* `aria-live` polite, bukan alert: ini keterangan yang menyusul
                  perbuatan pemakai, bukan galat yang menyela. */}
              {buatProyek && !buatNomor.trim() && !membuat && (
                <span aria-live="polite" style={{ fontSize: 11, color: C.mid }}>
                  Isi nomor RFQ dulu
                </span>
              )}
            </div>

            {/* "Lihat RFQ" dipisah ke barisnya sendiri, bukan didorong
                `marginLeft:auto` di baris yang sama.

                Terlihat saat menilai tangkapan layar: begitu kolom MR
                menambah lebar, ia terlempar ke baris kedua dan berdiri tepat
                di bawah kolom pembuatan — dua kelompok yang tujuannya
                berlawanan (MEMBUAT vs MELIHAT) jadi terbaca satu kolom.
                Yang salah bukan lebarnya, melainkan menaruhnya di sana. */}
            {daftar.length > 0 && (
              <div style={{
                flexBasis: "100%", display: "flex", justifyContent: "flex-end",
                borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label htmlFor="rq-pilih" style={{ ...labelGaya, marginBottom: 0, whiteSpace: "nowrap" }}>
                    Lihat RFQ
                  </label>
                  <select
                    id="rq-pilih" value={idEfektif} onChange={(e) => setTerpilih(e.target.value)}
                    style={{ ...isianGaya, minWidth: 260 }}
                  >
                    {daftar.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nomor} — {r.proyek?.name ?? "—"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Rincian MR terpilih — SELEBAR kartu, bukan sebaris.
                Dropdown menyatakan "sisa 30"; ini menyatakan sisa APA.
                Tanpa itu, angka 30 harus dipercaya begitu saja, dan yang
                menekan "Buat RFQ" tak punya cara memeriksanya lebih dulu. */}
            {(() => {
              const dipilih = mrLayak?.layak.find((m) => m.id === buatMr);
              if (!dipilih) return null;
              return (
                <div style={{
                  flexBasis: "100%", marginTop: 4, padding: "10px 12px",
                  background: C.subtle, border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  {/* Nomor MR TIDAK diulang di sini — dropdown tepat di
                      atasnya sudah menyebutnya, dan mengulanginya membuat
                      mata mencari beda yang tak ada. Yang dibawa panel ini
                      adalah yang belum terlihat: bahan dan jumlahnya. */}
                  <div style={{ fontSize: 11.5, color: C.mid, marginBottom: 7 }}>
                    Yang akan dimintakan harga
                    {dipilih.tanpa_material > 0 && (
                      // Item tanpa material tak bisa jadi baris penawaran
                      // (`rfq_penawaran.material_id` NOT NULL). Dilewati
                      // diam-diam membuat RFQ kekurangan baris tanpa gejala.
                      <> · <span style={{ color: "var(--warning-teks)" }}>
                        {dipilih.tanpa_material} item dilewati karena tak punya material
                      </span></>
                    )}
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                    {dipilih.item.map((it) => (
                      <li key={it.material_id} style={{
                        display: "flex", alignItems: "baseline", gap: 8,
                        fontSize: 12.5, color: C.text, flexWrap: "wrap",
                      }}>
                        <span style={{ fontWeight: 600 }}>{it.material_name}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {it.qty}{it.unit ? ` ${it.unit}` : ""}
                        </span>
                        {/* Selisih dinyatakan, bukan disembunyikan. "sisa 30
                            dari 115" adalah angka yang bisa diperiksa; "30"
                            saja adalah angka yang harus dipercaya. */}
                        {it.qty_diminta > it.qty && (
                          <span style={{ fontSize: 11, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
                            sisa dari {it.qty_diminta} — {it.qty_diminta - it.qty} sudah dipesan
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
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
                  display: "flex", gap: "var(--gap-bagian)", alignItems: "center", flexWrap: "wrap",
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

                  {/* Tombol catat penawaran TIDAK ditampilkan untuk RFQ yang
                      sudah diputuskan: endpoint penawaran menolaknya (400),
                      dan tombol yang terlihat lalu ditolak adalah janji palsu.
                      Aturan yang sama dipakai form putusan di bawah. */}
                  {rfqAktif.status !== "selesai" && rfqAktif.status !== "batal" && (
                    <button
                      type="button" onClick={() => setFormPenawaran(true)}
                      style={{
                        marginLeft: "auto", padding: "7px 13px", borderRadius: 6,
                        border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)",
                        fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 6, minHeight: 38,
                      }}
                    >
                      <Plus size={13} aria-hidden="true" /> Catat penawaran
                    </button>
                  )}

                  <button
                    type="button" onClick={() => setMuatUlangKe((n) => n + 1)}
                    style={{
                      marginLeft: rfqAktif.status === "selesai" || rfqAktif.status === "batal" ? "auto" : 0,
                      padding: "5px 10px", borderRadius: 6,
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
                  sebab={
                    <>
                      Perbandingan muncul begitu ada penawaran vendor yang tercatat
                      untuk RFQ ini. Catat surat penawaran yang sudah Anda terima.
                    </>
                  }
                  aksi={
                    /* Keadaan kosong yang HANYA menjelaskan adalah jalan buntu.
                       Sampai 2026-08-08 layar ini berhenti di sini selamanya:
                       endpoint penawaran hidup, tombolnya tak pernah ada. */
                    <button
                      type="button"
                      onClick={() => setFormPenawaran(true)}
                      style={{
                        padding: "9px 16px", borderRadius: 6, fontSize: 13,
                        fontWeight: 700, border: "none", background: "var(--grad-aksen)",
                        color: "var(--on-navy)", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 7,
                        minHeight: 40,
                      }}
                    >
                      <Plus size={14} aria-hidden="true" /> Catat penawaran
                    </button>
                  }
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
                    {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption
                        sr-only, kolom pertama <th scope="row">, tabular-nums,
                        dan pembungkus overflow-x sekarang dijamin komponen —
                        empat hal yang tabel mentah harus ingat ulang setiap
                        kali, dan yang di sini justru paling mudah terlupa:
                        jumlah kolomnya berubah tiap RFQ, jadi tak ada bentuk
                        tetap yang bisa dihafal penyuntingnya.

                        Kepala baris tetap "Material" — ia memang yang menamai
                        barisnya. Pengguna pembaca layar yang menyusuri kolom
                        vendor akan mendengar "Besi Ø12mm, Rp 120.000"; tanpa
                        penandaan itu yang terdengar cuma angkanya.

                        `minWidth: 720` sengaja dilepas, bukan lupa: gulir
                        horizontal sudah datang dari pembungkus komponen, dan
                        lebar mati tak perlu masuk ke primitif bersama. */}
                    <Tabel<BarisTabulasi>
              berpermukaan
                      caption={`Perbandingan penawaran vendor untuk RFQ ${rfqAktif?.nomor ?? "—"}: harga satuan tiap vendor per material, penanda vendor termurah, dan selisih terhadapnya.`}
                      data={tabulasi.baris}
                      kunciBaris={(b) => b.material_id}
                      kolom={kolomTabulasi}
                    />

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

                  {/* ── Putusan ───────────────────────────────────────────
                      Ditaruh SESUDAH tabulasi, bukan di kepala halaman:
                      keputusan diambil setelah perbandingannya dibaca, dan
                      tombol yang muncul lebih dulu mengundang orang memutuskan
                      sebelum melihat angkanya. */}
                  {rfqAktif?.status === "selesai" || rfqAktif?.po_id ? (
                    <PutusanTerekam rfq={rfqAktif} hasil={hasilPutusan} kartu={kartu} />
                  ) : (
                    <form
                      className="rise rise-3"
                      onSubmit={(e) => { e.preventDefault(); void putuskan(); }}
                      style={{ ...kartu, padding: "14px 16px", marginTop: 16 }}
                    >
                      <h2 style={{
                        fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700,
                        color: C.text, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 7,
                      }}>
                        <Gavel size={15} aria-hidden="true" />
                        Putuskan pemenang
                      </h2>
                      <p style={{ fontSize: 12, color: C.mid, margin: "0 0 12px", maxWidth: "72ch", lineHeight: 1.55 }}>
                        PO terbit langsung dari penawaran vendor yang dipilih — harganya
                        tak diketik ulang, jadi yang dipesan persis yang dibandingkan di atas.
                      </p>

                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                          <label htmlFor="rq-vendor" style={labelGaya}>Vendor yang menang</label>
                          <select
                            id="rq-vendor" value={vendorPilihan}
                            onChange={(e) => { setVendorPilihan(e.target.value); setGalatPutusan(null); }}
                            style={isianGaya}
                          >
                            <option value="">— pilih vendor —</option>
                            {tabulasi.vendor.map((v) => (
                              <option key={v.supplier_id} value={v.supplier_id} disabled={v.jumlah_ditawar === 0}>
                                {v.supplier_name}
                                {v.jumlah_ditawar === 0
                                  ? " — tak menawar apa pun"
                                  : ` — menawar ${v.jumlah_ditawar} item`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {vendorPilihan && (
                          <p style={{ fontSize: 12, color: C.mid, margin: 0, paddingBottom: 9 }}>
                            {jumlahItemPo} material masuk PO
                            {jumlahItemPo < tabulasi.baris.length && (
                              <span style={{ color: C.muted }}>
                                {" "}· {tabulasi.baris.length - jumlahItemPo} tak ditawar, tidak ikut
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Peringatan muncul SEBELUM tombol ditekan, bukan sesudah
                          ditolak server. Menunggu 400 melatih orang mengarang
                          alasan supaya lolos — dan alasan itulah yang dibaca
                          auditor setahun kemudian. */}
                      {alasanWajib && (
                        <div style={{
                          marginTop: 12, padding: "10px 12px", borderRadius: 8,
                          border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
                        }}>
                          <p style={{
                            margin: 0, fontSize: 12.5, fontWeight: 700, color: "var(--warning-teks)",
                            display: "flex", alignItems: "center", gap: 6,
                          }}>
                            <TriangleAlert size={13} aria-hidden="true" />
                            Bukan yang termurah di {lebihMahalDi.length} material
                          </p>
                          <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 12, color: C.mid, lineHeight: 1.6 }}>
                            {lebihMahalDi.slice(0, 4).map((x) => (
                              <li key={x.material_name}>
                                {x.material_name} — lebih mahal {rupiah(x.selisih)}
                              </li>
                            ))}
                            {lebihMahalDi.length > 4 && (
                              <li style={{ color: C.muted }}>dan {lebihMahalDi.length - 4} material lain</li>
                            )}
                          </ul>
                        </div>
                      )}

                      {vendorPilihan && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
                          <label htmlFor="rq-alasan" style={labelGaya}>
                            Alasan pemilihan {alasanWajib ? "(wajib)" : "(opsional)"}
                          </label>
                          <textarea
                            id="rq-alasan" rows={2} value={alasanPilih}
                            onChange={(e) => { setAlasanPilih(e.target.value); setGalatPutusan(null); }}
                            aria-describedby="rq-alasan-bantu"
                            placeholder="mis. stok siap kirim 2 hari; vendor termurah inden 3 minggu"
                            style={{ ...isianGaya, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                          />
                          <p id="rq-alasan-bantu" style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                            {alasanWajib
                              ? `Minimal 10 huruf. Inilah yang dibaca saat seseorang bertanya kenapa yang lebih mahal yang dipilih${alasanPilih.trim().length > 0 && !alasanCukup ? ` — baru ${alasanPilih.trim().length} huruf` : ""}.`
                              : "Vendor ini termurah di semua material yang ia tawar, jadi alasan tak diminta. Isi bila ada yang perlu dicatat."}
                          </p>
                        </div>
                      )}

                      {galatPutusan && (
                        <div role="alert" style={{
                          marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
                          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
                        }}>
                          {galatPutusan}
                        </div>
                      )}

                      <button
                        type="submit" disabled={!bolehPutuskan}
                        style={{
                          marginTop: 14, padding: "11px 22px", borderRadius: 6,
                          fontSize: 14, fontWeight: 700, border: "none",
                          // ── Kenapa BUKAN warna aksen yang berbeda
                          //
                          // ARAH-VISUAL §3d menyebut "tombol aksi utama, satu
                          // per layar" boleh memakai aksen. Tapi §3b mencatat
                          // indigo #6366F1 DITOLAK (kontras 4,47; butuh 4,5),
                          // dan `--aksen` sekarang #003366 — warna yang SAMA
                          // dengan tombol "Buat RFQ" di atas.
                          //
                          // Jadi pembedanya ukuran dan posisi, bukan rona:
                          // padding lebih besar, huruf 14 vs 13, dan berdiri
                          // sendiri di ujung alur. Mengarang warna keempat demi
                          // "menonjol" akan melanggar aturan satu-aksen yang
                          // justru sedang dipatuhi.
                          background: bolehPutuskan ? "var(--aksen)" : C.border,
                          color: bolehPutuskan ? "var(--on-aksen)" : C.mid,
                          cursor: bolehPutuskan ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", gap: 7,
                        }}
                      >
                        <Gavel size={14} aria-hidden="true" />
                        {memutuskan ? "Menerbitkan PO…" : "Putuskan & terbitkan PO"}
                      </button>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Dirender di luar percabangan supaya keadaannya tak ikut hilang saat
          RFQ ditukar. `rfqAktif` dipastikan ada sebelum dibuka. */}
      {rfqAktif && (
        <RfqPenawaranModal
          rfqId={rfqAktif.id}
          nomorRfq={rfqAktif.nomor}
          terbuka={formPenawaran}
          onTutup={() => setFormPenawaran(false)}
          onTersimpan={() => setMuatUlangKe((n) => n + 1)}
        />
      )}
    </div>
  );
}
