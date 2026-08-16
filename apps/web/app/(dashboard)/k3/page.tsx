"use client";

/**
 * K3 LAPANGAN — inspeksi · induksi · APD · lingkungan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA EMPAT TAB, DAN KENAPA INSIDEN TIDAK DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026` §6a: tab = sudut pandang berbeda atas data yang SAMA;
 * halaman = entitas berbeda.
 *
 * Keempat tab di sini adalah sudut pandang atas KEADAAN KESELAMATAN PROYEK
 * yang sama, dan dibaca bersama-sama: yang memeriksa temuan inspeksi biasanya
 * juga memeriksa apakah pekerjanya sudah diinduksi dan APD-nya masih layak.
 *
 * Insiden TIDAK jadi tab di sini karena ia entitas yang DIRUJUK DARI LUAR —
 * evaluasi subkon menggugurkan berdasarkan jumlahnya. Yang dirujuk dari luar
 * butuh alamat sendiri (`/k3/insiden`).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU AKSEN (§3d): TEMUAN YANG BERULANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiga kali "APD tak dipakai di area las" dalam tiga inspeksi adalah SATU
 * masalah yang tak pernah diselesaikan — bukan tiga temuan yang masing-masing
 * ditutup. Daftar yang memperlakukannya sebagai tiga baris terpisah
 * menyembunyikan yang paling penting: bahwa perbaikannya tak bekerja.
 *
 * Karena itu pengulangan mendapat spanduknya sendiri, dan itulah satu-satunya
 * hal yang berwarna di halaman ini.
 *
 * ── Induksi: persen yang `null` bukan 0
 *
 * Proyek yang belum mendata pekerjanya menghasilkan `null`, bukan 0% — dan
 * keduanya sangat berbeda: 0% berarti tak seorang pun diinduksi, `null`
 * berarti belum bisa dihitung. Menyamakannya membuat proyek yang belum didata
 * terlihat paling buruk, dan orang berhenti mempercayai angkanya.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, TriangleAlert, Repeat, Plus, GraduationCap, HardHat,
  Leaf, ClipboardCheck, CircleCheck,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, KartuAngka, BarisAngka,
  Tabel, Kosong, Rangka, Galat, Tombol, Lencana, Medan, gayaInput,
  type Kolom,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { TabBagian } from "@/components/tab-bagian";

type StatusTemuan = "terbuka" | "diperbaiki" | "ditutup";

interface Temuan {
  id: string;
  inspeksi_id: string;
  uraian: string;
  kategori: string | null;
  tingkat: number;
  tindakan: string | null;
  tenggat: string | null;
  status: StatusTemuan;
  tanggal_inspeksi: string;
}

interface Inspeksi {
  id: string; nomor: string | null; tanggal: string;
  area: string | null; ringkasan: string | null;
}

interface Induksi {
  id: string; worker_id: string | null; peserta_nama: string | null;
  jenis: string; tanggal: string; berlaku_sampai: string | null; materi: string | null;
}

interface Apd {
  id: string; worker_id: string | null; penerima_nama: string | null;
  jenis_apd: string; jumlah: number; tanggal: string;
  ganti_sebelum: string | null; kondisi: string | null;
}

interface Ukur {
  id: string; parameter: string; tanggal: string; lokasi: string | null;
  nilai: string | number; satuan: string; baku_mutu: string | number | null;
}

interface Muatan {
  proyek: { id: string; name: string };
  pada: string;
  inspeksi: Inspeksi[];
  temuan: Temuan[];
  rekap_temuan: {
    total: number; terbuka: number; berat_terbuka: number; lewat_tenggat: number;
    berulang: Array<{
      kategori: string; jumlah: number; terbuka: number;
      pertama: string; terakhir: string;
    }>;
  };
  induksi: Induksi[];
  status_induksi: {
    terinduksi: number; kedaluwarsa: number; belum: number;
    total_pekerja: number; persen_berlaku: number | null;
  };
  apd: Apd[];
  rekap_apd: {
    serah_terima: number; jatuh_tempo: number; akan_jatuh_tempo: number;
    per_jenis: Array<{ jenis: string; jumlah: number }>;
  };
  lingkungan: Ukur[];
  rekap_lingkungan: {
    total: number; melebihi: number; tanpa_pembanding: number; parameter: number;
  };
}

interface Proyek { id: string; name: string }

const TINGKAT: Record<number, { label: string; nada: "netral" | "peringatan" | "bahaya" }> = {
  1: { label: "Ringan", nada: "netral" },
  2: { label: "Sedang", nada: "peringatan" },
  3: { label: "Berat", nada: "bahaya" },
};

const STATUS_TEMUAN: Record<StatusTemuan, { label: string; nada: "peringatan" | "info" | "sukses" }> = {
  terbuka: { label: "Terbuka", nada: "peringatan" },
  diperbaiki: { label: "Diperbaiki", nada: "info" },
  ditutup: { label: "Ditutup", nada: "sukses" },
};

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

const angka = (v: string | number | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function K3Page() {
  return (
    <Suspense fallback={
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat K3 lapangan…
      </div>
    }>
      <IsiK3 />
    </Suspense>
  );
}

function IsiK3() {
  const params = useSearchParams();
  const dariUrl = params.get("proyek") ?? "";
  const [proyekId, setProyekId] = useState("");
  const [tab, setTab] = useState<"inspeksi" | "induksi" | "apd" | "lingkungan">("inspeksi");

  const [tambahInsp, setTambahInsp] = useState(false);
  const [iArea, setIArea] = useState("");
  const [iTanggal, setITanggal] = useState("");
  const [iRingkasan, setIRingkasan] = useState("");

  const [temuanUntuk, setTemuanUntuk] = useState<Inspeksi | null>(null);
  const [tUraian, setTUraian] = useState("");
  const [tKategori, setTKategori] = useState("");
  const [tTingkat, setTTingkat] = useState("2");
  const [tTindakan, setTTindakan] = useState("");
  const [tTenggat, setTTenggat] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);
  // Galat AKSI untuk tutup-temuan (tak punya dialog sendiri) — dipisah dari
  // galat MUAT supaya gagal menutup temuan tak menghapus pesan gagal memuat.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData`: proyek (independen) + K3 (BERGANTUNG `proyekId`) — muat
    berantai dua tingkat.
  */
  const { data: dataProyek, galat: galatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyekList = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  // set-state di badan efek ditandai sadar, bukan dibungkam: `proyekList`
  // datang dari `useData`, dan efek ini hanya menetapkan pilihan AWAL sekali
  // saat daftarnya tiba — bukan render berantai sinkron.
  useEffect(() => {
    if (proyekList.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProyekId((s) =>
      s || (dariUrl && proyekList.some((p) => p.id === dariUrl) ? dariUrl : "") || proyekList[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyekList]);

  const jalurK3 = proyekId ? `/api/v1/proyek/${proyekId}/k3` : null;
  const { data, memuat, galat: galatK3, muatUlang } = useData<Muatan>(jalurK3);
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  const galat = galatAksi ?? (galatProyek
    ? "Gagal memuat daftar proyek"
    : (proyekId && galatK3 ? "Gagal memuat data K3" : null));

  const simpanInspeksi = useCallback(async () => {
    if (!proyekId) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/proyek/${proyekId}/k3/inspeksi`, {
        area: iArea.trim() || null,
        tanggal: iTanggal || null,
        ringkasan: iRingkasan.trim() || null,
      });
      setTambahInsp(false); setIArea(""); setIRingkasan(""); setITanggal("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal mencatat inspeksi");
    } finally { setMenyimpan(false); }
  }, [proyekId, iArea, iTanggal, iRingkasan, muat]);

  const simpanTemuan = useCallback(async () => {
    if (!temuanUntuk) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/k3/inspeksi/${temuanUntuk.id}/temuan`, {
        uraian: tUraian.trim(),
        kategori: tKategori.trim() || null,
        tingkat: tTingkat,
        tindakan: tTindakan.trim() || null,
        tenggat: tTenggat || null,
      });
      setTemuanUntuk(null);
      setTUraian(""); setTKategori(""); setTTindakan(""); setTTenggat("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah temuan");
    } finally { setMenyimpan(false); }
  }, [temuanUntuk, tUraian, tKategori, tTingkat, tTindakan, tTenggat, muat]);

  const tutupTemuan = useCallback(async (t: Temuan) => {
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/k3/temuan/${t.id}`, { status: "ditutup" });
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menutup temuan");
    }
  }, [muat]);

  const kolomTemuan: Array<Kolom<Temuan>> = [
    {
      kunci: "temuan", judul: "Temuan", kepalaBaris: true,
      render: (t) => {
        const telat = t.status !== "ditutup" && t.tenggat != null
          && data != null && t.tenggat < data.pada;
        return (
          <span style={{
            display: "block", paddingLeft: 9,
            borderLeft: telat ? "3px solid var(--danger)" : "3px solid transparent",
          }}>
            <strong style={{ fontSize: 13, color: C.text }}>{t.uraian}</strong>
            <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
              inspeksi {tanggal(t.tanggal_inspeksi)}
              {t.kategori ? ` · ${t.kategori}` : ""}
              {t.tindakan ? ` · ${t.tindakan}` : ""}
            </span>
          </span>
        );
      },
    },
    {
      kunci: "tingkat", judul: "Tingkat",
      render: (t) => (
        <Lencana nada={TINGKAT[t.tingkat]?.nada ?? "netral"}>
          {TINGKAT[t.tingkat]?.label ?? t.tingkat}
        </Lencana>
      ),
    },
    {
      kunci: "tenggat", judul: "Tenggat",
      render: (t) => {
        const telat = t.status !== "ditutup" && t.tenggat != null
          && data != null && t.tenggat < data.pada;
        return (
          <span style={{
            display: "block", fontSize: 12,
            color: telat ? "var(--danger)" : C.mid,
            fontWeight: telat ? 700 : 400,
          }}>
            {tanggal(t.tenggat)}
            {telat && <span style={{ display: "block", fontSize: 11 }}>lewat tenggat</span>}
          </span>
        );
      },
    },
    {
      kunci: "status", judul: "Status",
      render: (t) => (
        <Lencana nada={STATUS_TEMUAN[t.status].nada}>{STATUS_TEMUAN[t.status].label}</Lencana>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (t) => (
        t.status === "ditutup"
          ? <span aria-hidden="true" />
          : (
            <Tombol kecil ikon={<CircleCheck size={12} />}
              onClick={() => void tutupTemuan(t)}>Tutup</Tombol>
          )
      ),
    },
  ];

  const kolomInduksi: Array<Kolom<Induksi>> = [
    {
      kunci: "peserta", judul: "Peserta", kepalaBaris: true,
      render: (i) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 13, color: C.text }}>
            {i.peserta_nama ?? "Pekerja terdaftar"}
          </strong>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {i.jenis.replace(/_/g, " ")}{i.materi ? ` · ${i.materi}` : ""}
          </span>
        </span>
      ),
    },
    {
      kunci: "tanggal", judul: "Tanggal",
      render: (i) => (
        <span style={{ fontSize: 12, color: C.mid }}>{tanggal(i.tanggal)}</span>
      ),
    },
    {
      kunci: "berlaku", judul: "Berlaku sampai",
      render: (i) => {
        const habis = i.berlaku_sampai != null && data != null
          && i.berlaku_sampai < data.pada;
        return (
          <span style={{
            display: "block", fontSize: 12,
            color: habis ? "var(--danger)" : C.mid,
            fontWeight: habis ? 700 : 400,
          }}>
            {i.berlaku_sampai == null ? "Tanpa batas" : tanggal(i.berlaku_sampai)}
            {habis && <span style={{ display: "block", fontSize: 11 }}>kedaluwarsa</span>}
          </span>
        );
      },
    },
  ];

  const kolomApd: Array<Kolom<Apd>> = [
    {
      kunci: "apd", judul: "APD", kepalaBaris: true,
      render: (a) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 13, color: C.text }}>{a.jenis_apd}</strong>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {a.penerima_nama ?? "pekerja terdaftar"}
            {a.kondisi ? ` · ${a.kondisi}` : ""}
          </span>
        </span>
      ),
    },
    {
      kunci: "jumlah", judul: "Jumlah", rata: "kanan",
      render: (a) => (
        <span style={{ fontSize: 13, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {a.jumlah}
        </span>
      ),
    },
    {
      kunci: "tanggal", judul: "Diserahkan",
      render: (a) => (
        <span style={{ fontSize: 12, color: C.mid }}>{tanggal(a.tanggal)}</span>
      ),
    },
    {
      kunci: "ganti", judul: "Ganti sebelum",
      render: (a) => {
        const tempo = a.ganti_sebelum != null && data != null
          && a.ganti_sebelum < data.pada;
        return (
          <span style={{
            display: "block", fontSize: 12,
            color: tempo ? "var(--danger)" : C.mid,
            fontWeight: tempo ? 700 : 400,
          }}>
            {a.ganti_sebelum == null ? "—" : tanggal(a.ganti_sebelum)}
            {tempo && (
              // Bukan sekadar terlambat administratif: APD kedaluwarsa
              // memberi rasa aman tanpa melindungi.
              <span style={{ display: "block", fontSize: 11 }}>jatuh tempo diganti</span>
            )}
          </span>
        );
      },
    },
  ];

  const kolomLingkungan: Array<Kolom<Ukur>> = [
    {
      kunci: "parameter", judul: "Parameter", kepalaBaris: true,
      render: (u) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 13, color: C.text }}>{u.parameter}</strong>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {u.lokasi ?? "lokasi tak dicatat"} · {tanggal(u.tanggal)}
          </span>
        </span>
      ),
    },
    {
      kunci: "nilai", judul: "Hasil", rata: "kanan",
      render: (u) => {
        const n = angka(u.nilai);
        const b = angka(u.baku_mutu);
        const lebih = n != null && b != null && b > 0 && n > b;
        return (
          <span style={{ display: "block", fontVariantNumeric: "tabular-nums" }}>
            <strong style={{
              fontSize: 13,
              color: lebih ? "var(--danger)" : C.text,
            }}>{n ?? "—"} {u.satuan}</strong>
            <span style={{ display: "block", fontSize: 11, color: C.muted }}>
              {b == null
                // Dinyatakan, bukan dibiarkan kosong: pengukuran tanpa
                // pembanding tak menjawab apa pun, tetapi sering ditampilkan
                // seolah menjawab.
                ? "baku mutu belum dicatat"
                : `baku mutu ${b} ${u.satuan}`}
            </span>
          </span>
        );
      },
    },
    {
      kunci: "keadaan", judul: "Keadaan",
      render: (u) => {
        const n = angka(u.nilai);
        const b = angka(u.baku_mutu);
        if (n == null || b == null || b <= 0) {
          return <Lencana nada="netral">Tak bisa dinilai</Lencana>;
        }
        return n > b
          ? <Lencana nada="bahaya" ikon={<TriangleAlert size={11} aria-hidden="true" />}>Melebihi</Lencana>
          : <Lencana nada="sukses" ikon={<ShieldCheck size={11} aria-hidden="true" />}>Di bawah baku</Lencana>;
      },
    },
  ];

  const rt = data?.rekap_temuan;
  const si = data?.status_induksi;
  const ra = data?.rekap_apd;
  const rl = data?.rekap_lingkungan;
  const berulang = rt?.berulang ?? [];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<ShieldCheck size={18} />}
        judul="K3 & Lingkungan"
        keterangan={
          <>Inspeksi keselamatan, induksi pekerja, alat pelindung diri, dan
          pemantauan lingkungan. Yang paling menentukan: <strong>temuan yang
          berulang</strong> — tiga kali temuan yang sama adalah satu masalah
          yang tak pernah selesai, bukan tiga temuan.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambahInsp(true); setGalatModal(null); }}
            disabled={!proyekId}>
            Catat inspeksi
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      <Kartu pad="sedang">
        <label htmlFor="k3-pilih-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <select
          id="k3-pilih-proyek" value={proyekId}
          onChange={(e) => setProyekId(e.target.value)}
          style={{ ...gayaInput, maxWidth: 420 }}
        >
          <option value="">— pilih proyek —</option>
          {proyekList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Kartu>

      {/* ── SATU aksen: temuan berulang (§3d) ─────────────────────────────── */}
      {berulang.length > 0 && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Repeat size={15} aria-hidden="true" />
            {berulang.length === 1
              ? "1 jenis temuan berulang — perbaikannya tak bekerja"
              : `${berulang.length} jenis temuan berulang — perbaikannya tak bekerja`}
          </strong>
          {berulang.map((b) => (
            <span key={b.kategori} style={{ display: "block", fontSize: 12.5 }}>
              {b.kategori} — {b.jumlah}× sejak {tanggal(b.pertama)}
              {b.terbuka > 0 ? ` · ${b.terbuka} masih terbuka` : " · semuanya sudah ditutup"}
            </span>
          ))}
        </div>
      )}

      {data && (
        <BarisAngka>
          <KartuAngka
            label="Temuan berat terbuka"
            nilai={rt?.berat_terbuka ?? 0}
            ikon={<TriangleAlert size={15} />}
            sorot={(rt?.berat_terbuka ?? 0) > 0}
            sub={(rt?.lewat_tenggat ?? 0) > 0
              ? `${rt?.lewat_tenggat} temuan lewat tenggat`
              : "tak ada yang lewat tenggat"}
          />
          <KartuAngka
            label="Induksi berlaku"
            // `null` ditulis apa adanya — 0% berarti tak seorang pun
            // diinduksi, `null` berarti belum bisa dihitung.
            nilai={si?.persen_berlaku == null ? "—" : `${si.persen_berlaku}%`}
            ikon={<GraduationCap size={15} />}
            sub={si?.persen_berlaku == null
              ? "pekerja proyek belum didata"
              : `${si.terinduksi} dari ${si.total_pekerja} pekerja · ${si.kedaluwarsa} kedaluwarsa`}
          />
          <KartuAngka
            label="APD jatuh tempo"
            nilai={ra?.jatuh_tempo ?? 0}
            ikon={<HardHat size={15} />}
            sub={(ra?.akan_jatuh_tempo ?? 0) > 0
              ? `${ra?.akan_jatuh_tempo} akan jatuh tempo dalam 30 hari`
              : "APD kedaluwarsa memberi rasa aman tanpa melindungi"}
          />
          <KartuAngka
            label="Lingkungan melebihi baku"
            nilai={rl?.melebihi ?? 0}
            ikon={<Leaf size={15} />}
            sub={(rl?.tanpa_pembanding ?? 0) > 0
              // Dinyatakan: pengukuran tanpa baku mutu tak boleh terhitung
              // "aman" hanya karena ia tak terhitung "melebihi".
              ? `${rl?.tanpa_pembanding} pengukuran tanpa baku mutu — belum bisa dinilai`
              : `${rl?.parameter ?? 0} parameter dipantau`}
          />
        </BarisAngka>
      )}

      <TabBagian
        label="Sudut pandang K3 lapangan"
        aktif={tab}
        onPilih={setTab}
        bagian={[
          {
            kunci: "inspeksi" as const, label: "Inspeksi & Temuan",
            jumlah: rt?.terbuka || undefined,
            mendesak: (rt?.berat_terbuka ?? 0) > 0,
            artiJumlah: "temuan masih terbuka",
          },
          {
            kunci: "induksi" as const, label: "Induksi K3",
            jumlah: si?.kedaluwarsa || undefined,
            artiJumlah: "induksi kedaluwarsa",
          },
          {
            kunci: "apd" as const, label: "APD",
            jumlah: ra?.jatuh_tempo || undefined,
            artiJumlah: "APD jatuh tempo diganti",
          },
          {
            kunci: "lingkungan" as const, label: "Lingkungan",
            jumlah: rl?.melebihi || undefined,
            mendesak: (rl?.melebihi ?? 0) > 0,
            artiJumlah: "pengukuran melebihi baku mutu",
          },
        ]}
      />

      {!proyekId ? (
        <Kosong
          ikon={<ShieldCheck size={28} />}
          judul="Pilih proyek dulu"
          sebab="Keselamatan dinilai per lokasi kerja — bahaya, pekerja, dan pengawasnya berbeda tiap proyek."
        />
      ) : memuat ? (
        <Rangka tinggi={56} jumlah={4} />
      ) : tab === "inspeksi" ? (
        <Kartu pad="rapat">
          <JudulKartu
            sub={data ? `${data.inspeksi.length} inspeksi · ${rt?.total ?? 0} temuan seluruhnya` : undefined}
            aksi={
              data && data.inspeksi.length > 0 ? (
                <Tombol kecil ikon={<Plus size={12} />}
                  onClick={() => {
                    setTemuanUntuk(data.inspeksi[0]);
                    setGalatModal(null);
                  }}>
                  Tambah temuan
                </Tombol>
              ) : undefined
            }
          >
            Temuan inspeksi
          </JudulKartu>
          <Tabel
            kolom={kolomTemuan}
            data={data?.temuan ?? []}
            kunciBaris={(x) => x.id}
            caption="Temuan inspeksi K3 beserta tingkat, tenggat, dan status penanganannya"
            tandaiBaris={(x) =>
              (x.status !== "ditutup" && x.tingkat >= 3 ? "bahaya" : undefined)}
            kosong={
              <Kosong
                ikon={<ClipboardCheck size={28} />}
                judul="Belum ada temuan"
                sebab="Inspeksi tanpa temuan bisa berarti dua hal: lokasinya memang rapi, atau pemeriksaannya belum cukup teliti."
              />
            }
          />
        </Kartu>
      ) : tab === "induksi" ? (
        <Kartu pad="rapat">
          <JudulKartu
            sub={si && si.total_pekerja > 0
              ? `${si.belum} pekerja belum pernah diinduksi · ${si.kedaluwarsa} kedaluwarsa`
              : "pekerja proyek belum didata — persentase belum bisa dihitung"}
          >
            Induksi & pelatihan K3
          </JudulKartu>
          <Tabel
            kolom={kolomInduksi}
            data={data?.induksi ?? []}
            kunciBaris={(x) => x.id}
            caption="Catatan induksi K3 beserta masa berlakunya"
            kosong={
              <Kosong
                ikon={<GraduationCap size={28} />}
                judul="Belum ada induksi tercatat"
                sebab="Pekerja yang belum diinduksi tak tahu jalur evakuasi dan titik kumpul — dan itu baru ketahuan saat terjadi sesuatu."
              />
            }
          />
        </Kartu>
      ) : tab === "apd" ? (
        <Kartu pad="rapat">
          <JudulKartu
            sub={ra && ra.per_jenis.length > 0
              ? `${ra.per_jenis.length} jenis · ${ra.per_jenis.reduce((a, b) => a + b.jumlah, 0)} unit diserahkan`
              : undefined}
          >
            Serah terima APD
          </JudulKartu>
          <Tabel
            kolom={kolomApd}
            data={data?.apd ?? []}
            kunciBaris={(x) => x.id}
            caption="Serah terima alat pelindung diri beserta jatuh tempo penggantiannya"
            tandaiBaris={(x) =>
              (x.ganti_sebelum != null && data != null && x.ganti_sebelum < data.pada
                ? "bahaya" : undefined)}
            kosong={
              <Kosong
                ikon={<HardHat size={28} />}
                judul="Belum ada serah terima APD"
                sebab="APD yang tak diketahui pemegangnya tak bisa diperiksa kondisinya — dan yang rusak baru ketahuan saat dibutuhkan."
              />
            }
          />
        </Kartu>
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub={rl ? `${rl.parameter} parameter · ${rl.total} pengukuran` : undefined}
          >
            Pemantauan lingkungan
          </JudulKartu>
          <Tabel
            kolom={kolomLingkungan}
            data={data?.lingkungan ?? []}
            kunciBaris={(x) => x.id}
            caption="Hasil pengukuran parameter lingkungan dibandingkan baku mutunya"
            tandaiBaris={(x) => {
              const n = angka(x.nilai); const b = angka(x.baku_mutu);
              return n != null && b != null && b > 0 && n > b ? "bahaya" : undefined;
            }}
            kosong={
              <Kosong
                ikon={<Leaf size={28} />}
                judul="Belum ada pengukuran"
                sebab="Kebisingan dan kualitas air limbah adalah dua yang paling sering diadukan warga — dan aduan tanpa data pembanding sulit dijawab."
              />
            }
          />
        </Kartu>
      )}

      {/* ── Catat inspeksi ────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambahInsp}
        judul="Catat inspeksi K3"
        onTutup={() => setTambahInsp(false)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTambahInsp(false)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanInspeksi()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan inspeksi"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}
        <Medan id="ip-area" label="Area yang diperiksa"
          anak={
            <input id="ip-area" value={iArea}
              onChange={(e) => setIArea(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="ip-tanggal" label="Tanggal"
          keterangan="Kosong = hari ini."
          anak={
            <input id="ip-tanggal" type="date" value={iTanggal}
              onChange={(e) => setITanggal(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="ip-ringkasan" label="Ringkasan"
          anak={
            <textarea id="ip-ringkasan" value={iRingkasan} rows={3}
              onChange={(e) => setIRingkasan(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
      </DialogBersama>

      {/* ── Tambah temuan ─────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={temuanUntuk != null}
        judul="Tambah temuan"
        keterangan="Kategori dipakai mencari temuan BERULANG — pakai kata yang sama untuk masalah yang sama, supaya pengulangannya terlihat."
        onTutup={() => setTemuanUntuk(null)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTemuanUntuk(null)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanTemuan()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan temuan"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}

        {temuanUntuk && data && data.inspeksi.length > 1 && (
          <Medan id="tm-inspeksi" label="Inspeksi"
            anak={
              <select id="tm-inspeksi" value={temuanUntuk.id}
                onChange={(e) => setTemuanUntuk(
                  data.inspeksi.find((x) => x.id === e.target.value) ?? temuanUntuk)}
                style={gayaInput}>
                {data.inspeksi.map((i) => (
                  <option key={i.id} value={i.id}>
                    {tanggal(i.tanggal)}{i.area ? ` — ${i.area}` : ""}
                  </option>
                ))}
              </select>
            }
          />
        )}

        <Medan id="tm-uraian" label="Temuan" wajib
          anak={
            <input id="tm-uraian" value={tUraian}
              onChange={(e) => setTUraian(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="tm-kategori" label="Kategori"
          keterangan="Mis. apd · housekeeping · pagar_pengaman · peralatan. Huruf besar-kecil tak dibedakan."
          anak={
            <input id="tm-kategori" value={tKategori} list="tm-usul-kategori"
              onChange={(e) => setTKategori(e.target.value)} style={gayaInput} />
          }
        />
        <datalist id="tm-usul-kategori">
          {[...new Set((data?.temuan ?? []).map((t) => t.kategori).filter(Boolean))]
            .map((k) => <option key={k as string} value={k as string} />)}
        </datalist>
        <Medan id="tm-tingkat" label="Tingkat"
          anak={
            <select id="tm-tingkat" value={tTingkat}
              onChange={(e) => setTTingkat(e.target.value)} style={gayaInput}>
              <option value="1">1 — Ringan</option>
              <option value="2">2 — Sedang</option>
              <option value="3">3 — Berat</option>
            </select>
          }
        />
        <Medan id="tm-tindakan" label="Tindakan perbaikan"
          anak={
            <input id="tm-tindakan" value={tTindakan}
              onChange={(e) => setTTindakan(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="tm-tenggat" label="Tenggat"
          anak={
            <input id="tm-tenggat" type="date" value={tTenggat}
              onChange={(e) => setTTenggat(e.target.value)} style={gayaInput} />
          }
        />
      </DialogBersama>
    </Halaman>
  );
}
