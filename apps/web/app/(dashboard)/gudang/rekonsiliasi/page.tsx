"use client";

/**
 * REKONSILIASI MATERIAL (F5 PEMBEDA — pembeda terlemah, 1,5/5)
 *
 * ── Yang dijawab halaman ini
 *
 * "Semen yang dibeli 100 sak, terpakai 80, di gudang tinggal 12 — ke mana
 * 8 sak sisanya?"
 *
 * Empat angkanya sudah tersimpan di basis dan tak pernah diadu: kebutuhan
 * RAB, penerimaan barang, pemakaian lapangan, dan sisa gudang. Tanpa layar
 * ini, semen yang hilang terlihat persis sama dengan semen yang habis
 * terpakai.
 *
 * ── Kenapa bukan bagian dari halaman proyek
 *
 * Halaman detail proyek sudah 12.554px dengan 20 bagian. Rekonsiliasi
 * dibuka saat seseorang MENCARI kebocoran — bukan dilewati tiap hari — jadi
 * ia layar tersendiri, bukan bagian ke-21 yang memperpanjang gulungan.
 *
 * ── Yang ditulis, bukan hanya diwarnai
 *
 * Status ditulis sebagai KATA di kolomnya sendiri. Baris yang cuma dibedakan
 * warna latar tak terbaca oleh yang tak bisa membedakan warna, dan tak
 * terbaca sama sekali oleh pembaca layar (WCAG 1.4.1).
 */

import { useEffect, useMemo, useState } from "react";
import { PackageSearch, RefreshCw, AlertTriangle, Info } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom, KepalaHalaman } from "@/components/dasar";

type Proyek = { id: string; name: string; status?: string };

type Status = "wajar" | "susut_tinggi" | "lebih_beli" | "belum_lengkap" | "belum_dibeli";

type Baris = {
  material_id: string;
  material_name: string;
  unit: string | null;
  teoritis: number;
  dibeli: number;
  dipakai: number;
  sisa: number;
  transfer_keluar: number;
  dari_klien: number;
  selisih: number;
  susut_pct: number | null;
  lebih_beli: number;
  status: Status;
};

type Hasil = {
  baris: Baris[];
  total_dibeli: number;
  total_dipakai: number;
  total_sisa: number;
  total_selisih: number;
  total_transfer_keluar: number;
  total_dari_klien: number;
  susut_pct_keseluruhan: number | null;
  jumlah_susut_tinggi: number;
  jumlah_lebih_beli: number;
  jumlah_belum_lengkap: number;
  jumlah_belum_dibeli: number;
  ambang: { susut_pct: number; lebih_beli_pct: number };
  gr_belum_dikonfirmasi: number;
};

/**
 * Label & warna per status.
 *
 * Kalimatnya menyebut APA YANG TERJADI, bukan nama kodenya: "susut_tinggi"
 * tak berarti apa pun bagi orang gudang yang membuka layar ini.
 */
const STATUS_META: Record<Status, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  susut_tinggi: {
    label: "Susut tinggi", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Dibeli tapi tak terpakai dan tak ada di gudang — periksa penerimaan & pemakaiannya.",
  },
  belum_lengkap: {
    label: "Data belum lengkap", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Terpakai/tersisa melebihi yang dibeli. Bukan susut — ada penerimaan yang belum tercatat.",
  },
  lebih_beli: {
    label: "Beli melebihi RAB", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Pembelian melampaui kebutuhan RAB. Belum tentu salah — bisa pembulatan satuan angkut.",
  },
  // Label sengaja TIDAK berbunyi "Ada di RAB, belum dibeli": status ini juga
  // menampung baris yang nol di keempat sumber (kartu stok kosong tanpa RAB).
  // Label yang menyebut RAB akan berbohong untuk separuh baris yang memakainya.
  belum_dibeli: {
    label: "Belum ada transaksi", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Belum ada pembelian, pemakaian, maupun sisa gudang yang tercatat untuk material ini.",
  },
  wajar: {
    label: "Wajar", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Selisihnya dalam ambang yang dianggap wajar.",
  },
};

const angka = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

/**
 * Kolom tabel rekonsiliasi.
 *
 * Ditaruh di tingkat modul, bukan di dalam komponen: isinya tak bergantung
 * pada satu pun state, jadi menyusunnya ulang tiap render hanya membuat
 * `Tabel` menerima array baru tanpa ada yang berubah.
 *
 * Empat sumber angka (RAB · dibeli · dipakai · sisa) plus dua yang
 * MENJELASKAN selisih (pindah proyek · dari klien) berdiri sebagai kolom
 * terpisah — itu inti guna halaman ini, dan tak satu pun boleh dilebur.
 */
const KOLOM: Array<Kolom<Baris>> = [
  {
    kunci: "material", judul: "Material", kepalaBaris: true,
    render: (b) => (
      // Pita kiri adalah isyarat "periksa ini". Digambar di DALAM sel, bukan
      // lewat `borderLeft` sel seperti dulu: `Tabel` memiliki gaya selnya
      // sendiri, dan menempelkannya lewat prop akan memaksa primitif bersama
      // tahu soal status rekonsiliasi.
      //
      // `belum_dibeli` ikut tanpa pita, sama seperti `wajar`. Baris RAB yang
      // belum digarap tak perlu diperiksa, ia hanya perlu tidak disebut
      // beres — dan kata di kolom status sudah mengerjakan itu.
      <span style={{
        display: "block", paddingLeft: 9,
        borderLeft: b.status === "wajar" || b.status === "belum_dibeli"
          ? "3px solid transparent"
          : `3px solid ${STATUS_META[b.status].warna}`,
      }}>
        {b.material_name}
        {b.unit && <span style={{ fontSize: 11, color: C.mid }}> · {b.unit}</span>}
      </span>
    ),
  },
  {
    kunci: "teoritis", judul: "RAB", rata: "kanan",
    render: (b) => (
      <span style={{ color: b.teoritis > 0 ? C.mid : C.muted }}>
        {b.teoritis > 0 ? angka(b.teoritis) : "—"}
      </span>
    ),
  },
  {
    kunci: "dibeli", judul: "Dibeli", rata: "kanan",
    render: (b) => <span style={{ color: C.text }}>{angka(b.dibeli)}</span>,
  },
  {
    kunci: "dipakai", judul: "Dipakai", rata: "kanan",
    render: (b) => <span style={{ color: C.mid }}>{angka(b.dipakai)}</span>,
  },
  {
    kunci: "sisa", judul: "Sisa", rata: "kanan",
    render: (b) => <span style={{ color: C.mid }}>{angka(b.sisa)}</span>,
  },
  {
    kunci: "transfer_keluar", judul: "Pindah", rata: "kanan",
    // Material yang PINDAH proyek — bukan hilang. Ditulis di kolomnya sendiri,
    // bukan diam-diam dikurangkan dari selisih: pembaca yang menjumlah sendiri
    // (dibeli − dipakai − sisa) akan mendapat angka lain, dan laporan yang tak
    // bisa dicocokkan dengan tangan berhenti dipercaya.
    render: (b) => (
      <span style={{ color: b.transfer_keluar === 0 ? C.muted : C.mid }}>
        {b.transfer_keluar === 0 ? "—" : (
          <>
            {b.transfer_keluar > 0 ? "" : "+"}{angka(Math.abs(b.transfer_keluar))}
            <span style={{ display: "block", fontSize: 10, color: C.muted }}>
              {b.transfer_keluar > 0 ? "ke proyek lain" : "dari proyek lain"}
            </span>
          </>
        )}
      </span>
    ),
  },
  {
    kunci: "dari_klien", judul: "Dari klien", rata: "kanan",
    // Material dari klien (free issue) — BUKAN pembelian kita. Kolomnya
    // sendiri, tak dilebur ke "Dibeli": meleburnya menggelembungkan penyebut
    // susut DAN membuat perusahaan tampak memborong material yang tak pernah
    // ia beli sesen pun.
    render: (b) => (
      <span style={{ color: b.dari_klien === 0 ? C.muted : C.mid }}>
        {b.dari_klien === 0 ? "—" : (
          <>
            {angka(b.dari_klien)}
            <span style={{ display: "block", fontSize: 10, color: C.muted }}>
              dipasok owner
            </span>
          </>
        )}
      </span>
    ),
  },
  {
    kunci: "selisih", judul: "Selisih", rata: "kanan",
    // Selisih NEGATIF tidak diwarnai sebagai kerugian. "−92" merah terbaca
    // sebagai "92 hilang" — persis salah-baca yang kolom status berusaha
    // cegah. Yang sebenarnya terjadi adalah penerimaan yang belum tercatat,
    // jadi angkanya ditulis netral dan diberi keterangan; warna disimpan
    // untuk susut sungguhan.
    render: (b) => (
      <span style={{
        fontWeight: 700,
        color: b.selisih > 0 ? STATUS_META[b.status].warna : C.mid,
      }}>
        {b.selisih > 0 ? "+" : ""}{angka(b.selisih)}
        {b.selisih < 0 && (
          <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: C.muted }}>
            belum tercatat
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "susut_pct", judul: "Susut", rata: "kanan",
    // Persentase NEGATIF tidak ditampilkan sebagai angka. "−6,0%" terbaca
    // sebagai susut yang lebih baik daripada nol — kabar baik palsu. Yang
    // sebenarnya terjadi: terpakai + sisa melebihi yang masuk, yaitu
    // pencatatan yang belum lengkap. Kolom Selisih di sebelahnya sudah
    // menyebutkannya, jadi di sini cukup dinyatakan tak bisa dihitung.
    render: (b) => (
      <span style={{ color: C.mid }}>
        {b.susut_pct == null || b.susut_pct < 0 ? "—" : `${b.susut_pct.toFixed(1)}%`}
      </span>
    ),
  },
  {
    kunci: "status", judul: "Status",
    render: (b) => {
      const meta = STATUS_META[b.status];
      // Status sebagai KATA, bukan hanya warna baris — yang tak bisa
      // membedakan warna, dan pembaca layar, sama-sama butuh teksnya.
      return (
        <span title={meta.arti} style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 20,
          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          color: meta.warna, background: meta.bg, border: `1px solid ${meta.border}`,
        }}>
          {meta.label}
        </span>
      );
    },
  },
];

export default function RekonsiliasiMaterialPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [proyekId, setProyekId] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<{ proyekId: string; pesan: string } | null>(null);
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  const [saringStatus, setSaringStatus] = useState<Status | "semua">("semua");

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyek(r.data.projects ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat({ proyekId: "", pesan: "Gagal memuat daftar proyek" }); })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  // Proyek pertama dipilih sendiri — DITURUNKAN saat render, bukan lewat
  // efek+setState yang membuat halaman berkedip dari kosong ke isinya.
  const proyekEfektif = proyekId || proyek[0]?.id || "";
  const proyekAktif = proyek.find((p) => p.id === proyekEfektif) ?? null;

  useEffect(() => {
    if (!proyekEfektif) return;
    const ac = makeAbortController();
    api.get<Hasil>(`/api/v1/projects/${proyekEfektif}/rekonsiliasi-material`, { signal: ac.signal })
      .then((r) => setHasil(r.data))
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        // Galat dicatat BERSAMA proyek asalnya, bukan dibersihkan lewat
        // `setGalat(null)` sinkron di badan efek. Yang sinkron memicu render
        // beruntun (react-hooks/set-state-in-effect), dan yang lebih penting:
        // ia menyisakan celah satu render di mana pesan galat proyek LAMA
        // masih terpampang di atas angka proyek BARU.
        setGalat({ proyekId: proyekEfektif, pesan: m ?? "Gagal memuat rekonsiliasi" });
        setHasil(null);
      });
    return () => ac.abort();
  }, [proyekEfektif, muatUlangKe]);

  // Galat hanya ditampilkan kalau ia memang milik proyek yang sedang dibuka.
  // Diturunkan saat render — begitu proyeknya berganti, pesannya hilang sendiri
  // tanpa perlu ada yang membersihkannya.
  const galatTampil = galat && galat.proyekId === proyekEfektif ? galat.pesan : null;

  const terlihat = useMemo(
    () => (hasil?.baris ?? []).filter((b) => saringStatus === "semua" || b.status === saringStatus),
    [hasil, saringStatus],
  );

  const bermasalah = (hasil?.jumlah_susut_tinggi ?? 0) + (hasil?.jumlah_belum_lengkap ?? 0);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <KepalaHalaman
        judul="Rekonsiliasi Material"
        keterangan="Kebutuhan RAB diadu dengan yang dibeli, dipakai, dan tersisa di gudang. Selisihnya adalah material yang tak bisa dipertanggungjawabkan — dan tanpa layar ini, ia terlihat persis sama dengan material yang habis terpakai."
      />

      {/* ── Pemilih proyek ─────────────────────────────────────────────── */}
      <div className="rise rise-2" style={{
        ...kartu, padding: "12px 16px", marginBottom: 16,
        display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
          <label htmlFor="rk-proyek" style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Proyek
          </label>
          <select
            id="rk-proyek"
            value={proyekEfektif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13 }}
          >
            {proyek.length === 0 && <option value="">— belum ada proyek —</option>}
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <button
          onClick={() => setMuatUlangKe((n) => n + 1)}
          style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>

        {hasil && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>
            Ambang susut {hasil.ambang.susut_pct}% · beli melebihi RAB {hasil.ambang.lebih_beli_pct}%
          </span>
        )}
      </div>

      {galatTampil && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>
          {galatTampil}
        </div>
      )}

      {/* GR yang belum dikonfirmasi DINYATAKAN, bukan disembunyikan: laporan
          yang diam-diam mengabaikan sebagian data terbaca seperti data
          lengkap, dan angkanya dipercaya lebih dari yang seharusnya. */}
      {hasil && hasil.gr_belum_dikonfirmasi > 0 && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 12,
          border: `1px solid ${C.yellowBorder}`, background: C.yellowBg, color: C.text,
          display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
        }}>
          <Info size={14} aria-hidden="true" style={{ color: "var(--warning-teks)", flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>{hasil.gr_belum_dikonfirmasi} penerimaan barang belum dikonfirmasi</strong> dan
            tidak dihitung sebagai pembelian. Selama belum dikonfirmasi, materialnya akan
            tampak sebagai susut di sini.
          </span>
        </div>
      )}

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : proyek.length === 0 ? (
        <Kosong
          ikon={<PackageSearch size={28} />}
          judul="Belum ada proyek"
          sebab="Rekonsiliasi membandingkan material per proyek. Daftar ini terisi sendiri begitu ada proyek berjalan."
        />
      ) : !hasil ? null : hasil.baris.length === 0 ? (
        <Kosong
          ikon={<PackageSearch size={28} />}
          judul="Belum ada material untuk direkonsiliasi"
          sebab={
            <>
              Proyek ini belum punya kebutuhan material di RAB, penerimaan barang,
              maupun pemakaian yang tercatat. Rekonsiliasi butuh minimal salah
              satunya — dan paling berguna kalau ketiganya terisi.
            </>
          }
        />
      ) : (
        <>
          {/* ── Ringkasan ──────────────────────────────────────────────────
              MENGHITUNG MATERIAL, BUKAN MENJUMLAHKAN KUANTITASNYA.

              Versi pertama layar ini memajang "Total dibeli 437" — hasil
              penjumlahan m³, batang, sak, dan buah menjadi satu angka. Itu
              aritmetika di atas satuan yang tak sebanding: angkanya berubah
              kalau semen dijual per sak atau per ton, tanpa ada yang berubah
              di lapangan. Tak ada yang bisa menindaklanjuti "437".

              Yang bisa ditindaklanjuti adalah CACAHAN material per keadaan —
              "3 material susut tinggi" menunjuk baris yang harus dibuka.
              Kuantitasnya tetap ada, di kolom tabel, di samping satuannya. */}
          <div className="rise rise-2b" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              {
                label: "Material ditinjau", nilai: angka(hasil.baris.length),
                sub: "dari RAB, pembelian & kartu stok", tegang: false,
              },
              {
                label: "Susut tinggi", nilai: angka(hasil.jumlah_susut_tinggi),
                sub: `melebihi ambang ${hasil.ambang.susut_pct}%`,
                tegang: hasil.jumlah_susut_tinggi > 0,
              },
              {
                label: "Data belum lengkap", nilai: angka(hasil.jumlah_belum_lengkap),
                sub: "terpakai melebihi yang dibeli", tegang: false,
              },
              {
                label: "Belum ada transaksi", nilai: angka(hasil.jumlah_belum_dibeli ?? 0),
                sub: "belum dibeli & belum dipakai", tegang: false,
              },
            ].map((k) => (
              <div key={k.label} style={{
                ...kartu, padding: "10px 14px", flex: "1 1 180px", minWidth: 168,
                ...(k.tegang ? { borderColor: C.redBorder, background: C.redBg } : null),
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.tegang ? C.red : C.text, fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{k.nilai}</div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Saringan status ────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {([
              ["semua", `Semua (${hasil.baris.length})`],
              ["susut_tinggi", `Susut tinggi (${hasil.jumlah_susut_tinggi})`],
              ["belum_lengkap", `Data belum lengkap (${hasil.jumlah_belum_lengkap})`],
              ["lebih_beli", `Beli melebihi RAB (${hasil.jumlah_lebih_beli})`],
              ["belum_dibeli", `Belum ada transaksi (${hasil.jumlah_belum_dibeli ?? 0})`],
            ] as const).map(([k, label]) => {
              const aktif = saringStatus === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => setSaringStatus(k as Status | "semua")}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: aktif ? 700 : 500,
                    border: `1px solid ${aktif ? C.navy : C.border}`,
                    background: aktif ? C.navy : "var(--surface)",
                    color: aktif ? "var(--on-navy)" : C.mid,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {bermasalah > 0 && saringStatus === "semua" && (
            <p style={{ fontSize: 12, color: C.mid, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={13} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
              {bermasalah} material perlu diperiksa — sudah diurutkan paling atas.
            </p>
          )}

          {/* ── Tabel ──────────────────────────────────────────────────── */}
          <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
                kolom pertama <th scope="row">, tabular-nums, dan pembungkus
                overflow-x sekarang dijamin komponen — empat hal yang tabel
                mentah harus ingat sendiri setiap kali, dan yang riwayat repo
                ini tunjukkan TIDAK selalu diingat.

                Yang TIDAK berubah, dan memang tak boleh: sepuluh kolomnya
                utuh. Halaman ini mengadu empat sumber angka dan menyebut dua
                penjelasan sahnya (pindah proyek, dipasok owner) — melebur
                satu pun di antaranya membuat selisihnya tak bisa dicocokkan
                dengan tangan, dan laporan yang begitu berhenti dipercaya.

                `minWidth: 760` sengaja dilepas, bukan lupa: komponen sudah
                membungkus dengan overflow-x, jadi gulir horizontalnya tetap
                ada tanpa memaksa lebar mati ke primitif bersama. */}
            <Tabel<Baris>
              caption={`Rekonsiliasi material proyek ${proyekAktif?.name ?? "—"}: kebutuhan RAB, jumlah dibeli, dipakai, sisa gudang, yang pindah proyek, yang dipasok klien, selisih yang tak terjelaskan, dan status penilaiannya per material.`}
              data={terlihat}
              kunciBaris={(b) => b.material_id}
              kolom={KOLOM}
            />

            {terlihat.length === 0 && (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: C.mid }}>
                Tidak ada material berstatus itu — pilih “Semua” untuk melihat seluruhnya.
              </div>
            )}

            <p style={{
              margin: 0, padding: "10px 14px", borderTop: `1px solid ${C.border}`,
              background: "var(--surface-subtle)", fontSize: 11, color: C.mid, lineHeight: 1.55,
            }}>
              Selisih = (dibeli + dari klien) − dipakai − sisa − yang pindah proyek. Material dipasok owner masuk hitungan sebagai barang yang ADA di gudang, tapi TIDAK sebagai pembelian — jadi ia tak menggelembungkan “beli melebihi RAB”. Hanya penerimaan barang yang
              sudah <strong>dikonfirmasi</strong> dihitung sebagai pembelian, dan
              material yang dibeli tanpa ada di RAB tetap ditampilkan — pembelian
              di luar rencana justru yang paling perlu dilihat.
              {" "}
              {/* Persentase keseluruhan ditaruh di sini, BUKAN sebagai kartu
                  ringkasan. Sebagai kartu, ia terbaca sebagai temuan; padahal
                  ia rata-rata tertimbang lintas satuan (m³ dan sak dijumlahkan)
                  dan ikut memuat baris `belum_lengkap` yang selisihnya negatif.
                  Angkanya berguna sebagai isyarat arah, bukan sebagai tuduhan —
                  dan di sini peringatannya ikut terbaca bersamanya. */}
              Angka susut keseluruhan{" "}
              <strong>
                {hasil.susut_pct_keseluruhan == null || hasil.susut_pct_keseluruhan < 0
                  ? "belum bisa dihitung"
                  : `${hasil.susut_pct_keseluruhan.toFixed(1)}%`}
              </strong>{" "}
              hanya isyarat arah: ia menjumlahkan satuan yang berbeda (m³, sak,
              batang) dan ikut memuat baris yang datanya belum lengkap. Yang bisa
              ditindaklanjuti adalah baris per material di atas.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
