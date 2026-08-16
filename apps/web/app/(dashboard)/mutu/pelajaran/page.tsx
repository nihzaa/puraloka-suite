"use client";

/**
 * PELAJARAN (Lessons Learned) — sisi PREVENTIF dari CAPA.
 *
 * ── Pertanyaan yang dijawab halaman ini
 *
 * "Proyek kemarin meleset. Apa yang berubah supaya proyek berikutnya tidak
 * meleset dengan cara yang sama?"
 *
 * NCR menjawab sisi KOREKTIF: cacat yang sudah terjadi, siapa memperbaikinya,
 * kapan selesai. Yang tak dijawabnya: apakah cara kita MERENCANAKAN ikut
 * berubah. Kalau koefisien AHSP dan harga satuan tetap sama, kesalahan yang
 * sama akan lahir lagi di proyek berikutnya — dan setiap kali diperbaiki
 * dengan biaya yang sama.
 *
 * ── Kenapa halaman ini baru ada sekarang
 *
 * Diukur 2026-08-13: modul ini punya tabel, empat trigger, fungsi propagasi
 * atomik, alur persetujuan lewat engine, dan lima test — tetapi rutenya HANYA
 * tiga PATCH (submit/approve/reject). Tak ada GET, tak ada POST, nol menu,
 * nol halaman.
 *
 * Jadi pelajaran hanya bisa DISETUJUI, kalau ada yang menyisipkannya lewat
 * SQL. Mesin belajarnya lengkap; pintunya tak pernah dipasang.
 *
 * ── Kenapa usulan ditampilkan sebagai bagian dari barisnya
 *
 * Pelajaran tanpa usulan tak mengubah apa pun saat disetujui — approve-nya
 * berhasil, knowledge base tetap sama, dan tak ada satu pun galat. Yang
 * membuat cacat itu sunyi adalah usulan tak terlihat dari daftar. Di sini ia
 * ikut di baris, sehingga "pelajaran yang tak mengubah apa-apa" ketahuan
 * sebelum ada yang menyetujuinya.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Send, Sprout, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom, KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { formatRupiah } from "@/lib/format";

type Proyek = { id: string; name: string };

type ResourceRingkas = { id: string; code: string; name: string; unit_code: string | null };

type StatusPelajaran = "draft" | "under_review" | "approved" | "propagated";

type Usulan = {
  id: string;
  target_type: "productivity" | "price_book";
  proposed_value: number | string;
  created_record_id: string | null;
};

type Akar = { id: string; description: string; category: string | null; sort_order: number };

type Pelajaran = {
  id: string;
  project_id: string;
  title: string;
  summary: string | null;
  status: StatusPelajaran;
  planned_amount: number | string;
  actual_amount: number | string;
  variance_amount: number | string;
  created_at: string;
  proyek: { id: string; name: string } | null;
  usulan: Usulan[];
  akar: Akar[];
};

const STATUS_META: Record<StatusPelajaran, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  draft: {
    label: "Draf", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Belum diajukan. Angka yang dipakai merencanakan belum berubah.",
  },
  under_review: {
    label: "Menunggu putusan", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Menunggu persetujuan. Perubahan knowledge base menuntut putusan manusia.",
  },
  approved: {
    label: "Disetujui", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Disetujui; propagasi ke price book / produktivitas sedang berjalan.",
  },
  propagated: {
    label: "Sudah diterapkan", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Angka baru sudah masuk knowledge base sebagai versi baru — versi lama tetap utuh.",
  },
};

const TARGET_LABEL: Record<Usulan["target_type"], string> = {
  price_book: "Harga satuan",
  productivity: "Produktivitas",
};

const rupiah = formatRupiah;

const labelGaya: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted,
  textTransform: "uppercase", letterSpacing: "0.05em",
};
const isianGaya: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
  background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
};

function kolomPelajaran(
  ajukan: (p: Pelajaran) => void,
): Array<Kolom<Pelajaran>> {
  return [
    {
      kunci: "judul", judul: "Pelajaran", kepalaBaris: true,
      render: (p) => (
        <span style={{ display: "block" }}>
          <span style={{ fontWeight: 600, color: C.text }}>{p.title}</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 2 }}>
            {p.proyek?.name ?? "—"}
            {p.akar.length > 0 && ` · ${p.akar.length} akar masalah`}
          </span>
        </span>
      ),
    },
    {
      kunci: "varians", judul: "Selisih dari rencana", rata: "kanan",
      // Selisih POSITIF berarti lebih mahal dari rencana — dan itulah yang
      // paling layak jadi pelajaran, jadi ia ditandai, bukan disembunyikan.
      render: (p) => {
        const v = Number(p.variance_amount);
        const dasar = Number(p.planned_amount);
        return (
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 700, color: v > 0 ? "var(--danger)" : v < 0 ? "var(--success)" : C.mid }}>
              {v > 0 ? "+" : ""}{rupiah(v)}
            </span>
            {dasar > 0 && (
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                {v > 0 ? "+" : ""}{Math.round((v / dasar) * 1000) / 10}% dari rencana
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "usulan", judul: "Yang diubahnya",
      // Ditampilkan di baris, bukan disembunyikan di detail: pelajaran tanpa
      // usulan disetujui tanpa mengubah apa pun, dan itu kegagalan paling
      // sunyi di modul ini.
      render: (p) =>
        p.usulan.length === 0 ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--warning-teks)", fontSize: 11.5 }}>
            <TriangleAlert size={13} aria-hidden="true" />
            tak mengubah apa pun
          </span>
        ) : (
          <span style={{ fontSize: 12, color: C.mid }}>
            {p.usulan.map((u) => (
              <span key={u.id} style={{ display: "block" }}>
                {TARGET_LABEL[u.target_type]} → {Number(u.proposed_value).toLocaleString("id-ID")}
                {u.created_record_id && (
                  <span style={{ color: "var(--success)", marginLeft: 5 }}>✓ diterapkan</span>
                )}
              </span>
            ))}
          </span>
        ),
    },
    {
      kunci: "status", judul: "Status",
      render: (p) => {
        const m = STATUS_META[p.status];
        return (
          <span title={m.arti} style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            color: m.warna, background: m.bg, border: `1px solid ${m.border}`,
          }}>{m.label}</span>
        );
      },
    },
    {
      kunci: "tindakan", judul: "Tindakan", rata: "kanan",
      render: (p) =>
        p.status === "draft" ? (
          <button type="button" onClick={() => ajukan(p)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            cursor: "pointer", padding: "4px 10px", borderRadius: 5, fontSize: 12,
            border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
            whiteSpace: "nowrap",
          }}>
            <Send size={12} aria-hidden="true" /> Ajukan
          </button>
        ) : (
          <span style={{ fontSize: 11.5, color: C.muted }}>—</span>
        ),
    },
  ];
}

export default function PelajaranPage() {
  const [sukses, setSukses] = useState("");

  const [dialogBuka, setDialogBuka] = useState(false);
  const [mengirim, setMengirim] = useState(false);

  const [fProyek, setFProyek] = useState("");
  const [fJudul, setFJudul] = useState("");
  const [fRingkas, setFRingkas] = useState("");
  const [fRencana, setFRencana] = useState("");
  const [fAktual, setFAktual] = useState("");
  const [fAkar, setFAkar] = useState("");

  // ── Usulan perubahan: satu, dan WAJIB ───────────────────────────────────
  //
  // Rancangan pertama halaman ini mengirim `usulan: []` selalu, dengan alasan
  // "menyusul lewat layar tersendiri". Servernya menolak — dan benar menolak:
  // pelajaran tanpa usulan disetujui tanpa mengubah apa pun. Jadi formnya
  // MUSTAHIL berhasil, dan itu ketahuan dari layar, bukan dari test.
  //
  // Yang diperbaiki: usulan diisi di sini juga. Satu usulan cukup untuk
  // membuat pelajaran bermakna; menambah yang kedua adalah pekerjaan
  // penyuntingan, bukan pencatatan.
  const [cariResource, setCariResource] = useState("");
  const [resources, setResources] = useState<ResourceRingkas[]>([]);
  const [fResource, setFResource] = useState("");
  const [fNilaiUsulan, setFNilaiUsulan] = useState("");
  const [galatResource, setGalatResource] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData`: proyek dan daftar pelajaran. `muatUlangKe` (penghitung
    yang dinaikkan untuk memicu efek muat ulang) digantikan `muatUlang()`
    langsung — dengan `paksa: true`, jadi menyimpan pelajaran baru langsung
    terlihat sesudah `setMuatUlangKe` lama diganti.
  */
  const { data: dataProyek, galat: galatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const { data: dataDaftar, memuat, galat: galatDaftar, muatUlang } =
    useData<{ lessons: Pelajaran[] }>("/api/v1/lessons-learned");
  // `useMemo`, bukan `?? []` biasa: turunan array yang masuk dependensi
  // `useMemo` lain (`ringkas` di bawah) butuh referensi stabil, kalau tidak
  // ratchet exhaustive-deps merah setiap render.
  const daftar = useMemo(() => dataDaftar?.lessons ?? [], [dataDaftar]);

  // Galat MUAT vs galat AKSI (mengirim/mengajukan) dipisah — satu state
  // untuk keduanya membuat gagal mengirim menghapus pesan gagal memuat.
  const [galatAksi, setGalatAksi] = useState("");
  const galat = galatAksi || (galatProyek
    ? "Gagal memuat daftar proyek"
    : galatDaftar
      ? "Gagal memuat daftar pelajaran"
      : "");

  useEffect(() => {
    if (!dialogBuka) return;
    const t = setTimeout(() => {
      const q = cariResource.trim() ? `?q=${encodeURIComponent(cariResource.trim())}&limit=50` : "?limit=50";
      api.get<{ data: ResourceRingkas[] }>(`/api/v1/cecep/resources${q}`)
        .then((r) => { setResources(r.data.data ?? []); setGalatResource(""); })
        .catch((e) => {
          // Kegagalan DINYATAKAN, bukan ditelan. Versi pertama berkas ini
          // menelannya, dan dropdown kosong terbaca "tak ada resource yang
          // cocok" — padahal ada 2.829 dan yang gagal adalah permintaannya.
          // Pesan yang salah lebih berbahaya daripada tak ada pesan.
          const m = (e as { response?: { data?: { error?: string } }; message?: string })
            ?.response?.data?.error;
          setResources([]);
          setGalatResource(m ?? "Daftar resource gagal dimuat. Muat ulang halaman.");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [cariResource, dialogBuka]);

  const ringkas = useMemo(() => {
    const belumDiterapkan = daftar.filter((p) => p.status !== "propagated");
    const tanpaUsulan = daftar.filter((p) => p.usulan.length === 0);
    const nilai = daftar.reduce((s, p) => s + Number(p.variance_amount || 0), 0);
    return { total: daftar.length, belumDiterapkan: belumDiterapkan.length, tanpaUsulan: tanpaUsulan.length, nilai };
  }, [daftar]);

  const halangan = useMemo(() => {
    if (!fProyek) return "Pilih proyek lebih dulu.";
    if (fJudul.trim().length < 8) {
      return "Judul terlalu pendek — tulis apa yang berbeda dari rencana, bukan nama pekerjaannya.";
    }
    if (!fRencana.trim() || !fAktual.trim()) return "Isi nilai rencana dan nilai aktual.";
    if (!Number.isFinite(Number(fRencana)) || !Number.isFinite(Number(fAktual))) {
      return "Nilai rencana dan aktual harus berupa angka.";
    }
    if (!fAkar.trim()) {
      return "Sebutkan minimal satu akar masalah — pelajaran tanpa akar masalah adalah keluhan.";
    }
    if (!fResource) {
      return "Pilih resource yang harganya perlu diubah — tanpa usulan, pelajaran ini "
        + "tak mengubah apa pun saat disetujui.";
    }
    if (!fNilaiUsulan.trim() || !Number.isFinite(Number(fNilaiUsulan)) || Number(fNilaiUsulan) === 0) {
      return "Isi harga satuan usulan (bukan nol).";
    }
    return null;
  }, [fProyek, fJudul, fRencana, fAktual, fAkar, fResource, fNilaiUsulan]);

  async function kirim() {
    if (halangan) return;
    setMengirim(true); setGalatAksi(""); setSukses("");
    try {
      await api.post("/api/v1/lessons-learned", {
        project_id: fProyek,
        title: fJudul.trim(),
        summary: fRingkas.trim() || undefined,
        planned_amount: fRencana,
        actual_amount: fAktual,
        akar: fAkar.split("\n").map((s) => s.trim()).filter(Boolean)
          .map((description) => ({ description })),
        usulan: [{
          target_type: "price_book",
          resource_id: fResource,
          proposed_value: fNilaiUsulan,
        }],
      });
      setSukses("Pelajaran tersimpan sebagai draf beserta usulan perubahan harganya.");
      setDialogBuka(false);
      void muatUlang();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menyimpan pelajaran");
    } finally {
      setMengirim(false);
    }
  }

  async function ajukan(p: Pelajaran) {
    setGalatAksi(""); setSukses("");
    try {
      await api.patch(`/api/v1/lessons-learned/${p.id}/submit`, {});
      setSukses(`"${p.title}" diajukan untuk disetujui.`);
      void muatUlang();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal mengajukan pelajaran");
    }
  }

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman judul="Pelajaran Proyek"         ikon={<Sprout size={19} />}
      />
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          NCR memperbaiki cacat yang <strong>sudah</strong> terjadi. Halaman ini menjawab
          pertanyaan berikutnya: apa yang berubah supaya kesalahan sejenis tak lahir lagi
          di proyek berikutnya. Yang disetujui di sini <strong>mengubah angka</strong> yang
          dipakai menyusun estimasi — karena itu ia menuntut putusan manusia.
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

      <div className="rise rise-2" style={{
        ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      }}>
        <button type="button" onClick={() => { setGalatAksi(""); setDialogBuka(true); }} style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          padding: "9px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
          border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
        }}>
          <Plus size={15} aria-hidden="true" /> Catat pelajaran
        </button>

        <button type="button" onClick={() => void muatUlang()}
          aria-label="Muat ulang daftar pelajaran" style={{
            display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
            padding: "9px 12px", borderRadius: 6, fontSize: 13,
            border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid,
          }}>
          <RefreshCw size={15} aria-hidden="true" />
        </button>

        {daftar.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: C.mid, lineHeight: 1.5 }}>
            {ringkas.total} pelajaran · {ringkas.belumDiterapkan} belum diterapkan
            {ringkas.tanpaUsulan > 0 && (
              <span style={{ color: "var(--warning-teks)" }}>
                {" · "}{ringkas.tanpaUsulan} tanpa usulan perubahan
              </span>
            )}
          </span>
        )}
      </div>

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.mid, fontSize: 13 }}>
          Memuat…
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<Sprout size={28} />}
          judul="Belum ada pelajaran tercatat"
          sebab={
            "Setiap proyek yang meleset dari rencana menyimpan satu keterangan yang "
            + "berguna untuk proyek berikutnya — asalkan ditulis. Catat yang pertama "
            + "dari selisih terbesar antara rencana dan realisasi."
          }
        />
      ) : (
        <div className="rise rise-3">
          <Tabel<Pelajaran>
            kolom={kolomPelajaran(ajukan)}
            data={daftar}
            kunciBaris={(p) => p.id}
            caption="Daftar pelajaran proyek beserta usulan perubahan knowledge base"
            tandaiBaris={(p) => (p.usulan.length === 0 ? "var(--warning-bg)" : undefined)}
          />
        </div>
      )}

      <DialogBersama
        terbuka={dialogBuka}
        onTutup={() => setDialogBuka(false)}
        judul="Catat pelajaran"
        lebar={620}
      >
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label htmlFor="pl-proyek" style={labelGaya}>Proyek</label>
            <select id="pl-proyek" value={fProyek} onChange={(e) => setFProyek(e.target.value)} style={isianGaya}>
              <option value="">— pilih —</option>
              {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label htmlFor="pl-judul" style={labelGaya}>Apa yang berbeda dari rencana</label>
            <input id="pl-judul" type="text" value={fJudul} onChange={(e) => setFJudul(e.target.value)}
              aria-describedby="pl-judul-bantu"
              placeholder="mis. Bekisting kolom butuh 1,4× tenaga dari asumsi AHSP"
              style={isianGaya} />
            <span id="pl-judul-bantu" style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
              Tulis temuannya, bukan nama pekerjaannya — judul inilah yang dicari orang
              enam bulan lagi saat menyusun estimasi sejenis.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="pl-rencana" style={labelGaya}>Nilai rencana (Rp)</label>
            <input id="pl-rencana" type="number" inputMode="numeric" value={fRencana}
              onChange={(e) => setFRencana(e.target.value)} style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="pl-aktual" style={labelGaya}>Nilai aktual (Rp)</label>
            <input id="pl-aktual" type="number" inputMode="numeric" value={fAktual}
              onChange={(e) => setFAktual(e.target.value)} style={isianGaya} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label htmlFor="pl-akar" style={labelGaya}>Akar masalah — satu per baris</label>
            <textarea id="pl-akar" value={fAkar} onChange={(e) => setFAkar(e.target.value)}
              rows={3} aria-describedby="pl-akar-bantu"
              placeholder={"Tinggi kolom 4,2 m menuntut perancah tambahan\nKoefisien AHSP mengasumsikan kolom 3 m"}
              style={{ ...isianGaya, resize: "vertical", fontFamily: "inherit" }} />
            <span id="pl-akar-bantu" style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
              Wajib. Pelajaran tanpa akar masalah adalah keluhan — “biayanya membengkak”
              tak memberitahu siapa pun apa yang harus berbeda lain kali.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label htmlFor="pl-ringkas" style={labelGaya}>Keterangan — opsional</label>
            <textarea id="pl-ringkas" value={fRingkas} onChange={(e) => setFRingkas(e.target.value)}
              rows={2} style={{ ...isianGaya, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* ── Usulan perubahan: WAJIB, dan inti modulnya ────────────────
            Pelajaran tanpa usulan disetujui tanpa mengubah apa pun — approve
            berhasil, knowledge base tetap sama, nol galat. Server menolaknya;
            form yang tak menyediakan medannya membuat form itu mustahil
            berhasil (ketahuan dari layar, bukan dari test). */}
        <div style={{
          marginTop: "var(--gap-bagian)", paddingTop: 14,
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ ...labelGaya, marginBottom: 8 }}>Yang harus berubah</div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label htmlFor="pl-cari" style={labelGaya}>Cari resource</label>
              <input id="pl-cari" type="text" value={cariResource}
                onChange={(e) => setCariResource(e.target.value)}
                placeholder="mis. semen, bekisting, tukang batu" style={isianGaya} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label htmlFor="pl-resource" style={labelGaya}>Resource yang harganya perlu diubah</label>
              <select id="pl-resource" value={fResource}
                onChange={(e) => setFResource(e.target.value)} style={isianGaya}>
                <option value="">— pilih —</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.unit_code ? ` (${r.unit_code})` : ""} · {r.code}
                  </option>
                ))}
              </select>
              {galatResource ? (
                <span role="alert" style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.45 }}>
                  {galatResource}
                </span>
              ) : resources.length === 0 && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  Tak ada resource yang cocok. Ubah kata pencarian.
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor="pl-nilai" style={labelGaya}>Harga satuan usulan (Rp)</label>
              <input id="pl-nilai" type="number" inputMode="numeric" value={fNilaiUsulan}
                onChange={(e) => setFNilaiUsulan(e.target.value)}
                aria-describedby="pl-nilai-bantu" style={isianGaya} />
              <span id="pl-nilai-bantu" style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
                Berlaku setelah disetujui, sebagai <strong>versi baru</strong> di price book —
                versi lama tetap utuh, jadi estimasi yang sudah terbit tak berubah.
              </span>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: "var(--gap-bagian)", paddingTop: 14, borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 9, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap",
        }}>
          {halangan && (
            <span style={{ fontSize: 12, color: C.mid, marginRight: "auto", maxWidth: "44ch", lineHeight: 1.45 }}>
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
