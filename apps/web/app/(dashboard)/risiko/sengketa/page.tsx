"use client";

/**
 * SENGKETA & KLAIM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ESKALASI, BUKAN MODUL BARU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Klaim kontraktual sudah hidup di halaman detail proyek (`contract_claims`,
 * migrasi 184). Yang tak ada sebelumnya: apa yang terjadi SESUDAH klaim
 * ditolak. Enum `claim_status` berakhir di `ditolak` dan `gugur` — dan di
 * situlah lubangnya, karena klaim yang ditolak tidak hilang. Ia jadi sengketa.
 *
 * Kalau sengketa dibangun sebagai modul lepas, orang akan mengetik ulang
 * nilai, tanggal kejadian, dan dasar klaimnya. Angka yang diketik ulang akan
 * berbeda dari angka aslinya — dan dalam sengketa, selisih angka antara dua
 * dokumen milik sendiri adalah senjata pihak lawan.
 *
 * Karena itu sengketa menyimpan tautan ke klaimnya, dan hanya klaim yang
 * sudah DITOLAK atau GUGUR yang bisa disengketakan. Menyengketakan klaim yang
 * masih diproses adalah menyerah sebelum jawabannya keluar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA ANGKA YANG SENGAJA DIPISAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Paparan" hanya menjumlahkan tuntutan yang MASIH BERJALAN — yang sudah
 * diputus bukan lagi paparan, hasilnya sudah diketahui.
 *
 * Di sebelahnya ada angka kedua yang biasanya dihilangkan orang: berapa
 * sengketa berjalan yang NILAINYA BELUM DICATAT. Tanpa angka itu, paparan
 * Rp 250 juta dari 5 sengketa yang 4 di antaranya belum bernilai terbaca
 * seolah seluruh paparannya Rp 250 juta. Menghitungnya sebagai nol adalah
 * cara paling halus untuk berbohong dengan angka yang benar.
 *
 * ── Satu aksen (§3d)
 *
 * Halaman ini sengaja TENANG. Sengketa yang berjalan memang buruk, tetapi
 * mewarnai semuanya merah tak menolong siapa pun memutuskan apa pun — yang
 * ditandai hanya yang sudah masuk arbitrase/pengadilan, karena di situlah
 * biayanya melonjak dan keputusannya keluar dari tangan sendiri.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Gavel, Scale, Plus, ArrowRight, CircleHelp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Pilihan } from "@/components/pilihan";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, KartuAngka, BarisAngka,
  Tabel, Kosong, Rangka, Galat, Tombol, Lencana, Medan, gayaInput,
  type Kolom,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type StatusSengketa =
  | "dicatat" | "negosiasi" | "mediasi" | "arbitrase" | "pengadilan" | "selesai";

interface Sengketa {
  id: string;
  nomor: string | null;
  judul: string;
  pihak_lawan: string;
  pokok_perkara: string;
  dasar_hukum: string | null;
  nilai_tuntutan: string | number | null;
  nilai_putusan: string | number | null;
  status: StatusSengketa;
  tanggal_mulai: string;
  selesai_pada: string | null;
  forum: string | null;
  hasil: string | null;
  klaim_id: string | null;
}

interface Muatan {
  proyek: { id: string; name: string };
  pada: string;
  sengketa: Sengketa[];
  ringkas: {
    total: number;
    berjalan: number;
    selesai: number;
    paparan: number;
    tanpa_nilai: number;
    selisih_putusan: number | null;
    terlama_hari: number | null;
  };
}

interface Proyek { id: string; name: string }
interface Klaim { id: string; claim_number: string; title: string; status: string }

/**
 * Urutan eskalasi. Maju boleh melompat (pihak lawan bisa menolak berunding);
 * MUNDUR tidak, karena jejak "perkara ini pernah sampai pengadilan" adalah
 * yang menentukan biaya dan risikonya.
 */
const URUTAN: StatusSengketa[] = [
  "dicatat", "negosiasi", "mediasi", "arbitrase", "pengadilan", "selesai"];

const TAHAP: Record<StatusSengketa, { label: string; nada: "netral" | "info" | "peringatan" | "bahaya" | "sukses"; arti: string }> = {
  dicatat: { label: "Dicatat", nada: "netral", arti: "Baru dicatat — belum ada langkah penyelesaian." },
  negosiasi: { label: "Negosiasi", nada: "info", arti: "Dibicarakan langsung antara para pihak." },
  mediasi: { label: "Mediasi", nada: "info", arti: "Dibantu pihak ketiga yang tidak memutus." },
  arbitrase: { label: "Arbitrase", nada: "peringatan", arti: "Diputus di luar pengadilan — putusannya mengikat, dan biayanya melonjak." },
  pengadilan: { label: "Pengadilan", nada: "bahaya", arti: "Keputusannya keluar dari tangan sendiri, dan jadwalnya bukan milik kita." },
  selesai: { label: "Selesai", nada: "sukses", arti: "Sudah ada hasil tercatat. Tak bisa dibuka lagi — perkara baru adalah sengketa baru." },
};

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

const rupiah = (v: string | number | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
};

const rupiahRingkas = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
};

/**
 * `useSearchParams` memaksa render sisi klien, dan Next menuntut batas
 * Suspense untuk itu — tanpa ini `pnpm build` gagal saat prerender. Pola yang
 * sama dipakai `/jadwal`; ditemukan oleh build di sana, bukan oleh ingatan.
 */
export default function SengketaPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat sengketa…
      </div>
    }>
      <IsiSengketa />
    </Suspense>
  );
}

/**
 * Proyek terpilih dibaca dari `?proyek=<id>` bila ada dan sah, kalau tidak
 * proyek pertama daftar.
 *
 * Bukan sekadar kenyamanan: tanpa ini halaman tak bisa DITAUTKAN. Detail
 * proyek yang hendak mengarahkan ke registernya harus bisa menyebut proyek
 * mana — dan tanpa parameter, tautannya selalu mendarat di proyek pertama
 * menurut abjad, yang hampir tak pernah proyek yang dimaksud.
 */
function IsiSengketa() {
  const params = useSearchParams();
  const dariUrl = params.get("proyek") ?? "";
  const [proyekId, setProyekId] = useState("");

  const [tambah, setTambah] = useState(false);
  const [fJudul, setFJudul] = useState("");
  const [fLawan, setFLawan] = useState("");
  const [fPokok, setFPokok] = useState("");
  const [fDasar, setFDasar] = useState("");
  const [fNilai, setFNilai] = useState("");
  const [fMulai, setFMulai] = useState("");
  const [fKlaim, setFKlaim] = useState("");

  const [pindah, setPindah] = useState<Sengketa | null>(null);
  const [pTahap, setPTahap] = useState<StatusSengketa>("negosiasi");
  const [pForum, setPForum] = useState("");
  const [pHasil, setPHasil] = useState("");
  const [pPutusan, setPPutusan] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga `useData`: proyek, sengketa (bergantung `proyekId`), dan klaim yang
    bisa disengketakan (bergantung `proyekId` DAN `tambah` — hanya diambil
    saat dialog catat-sengketa dibuka, sama seperti versi lama).
  */
  const { data: dataProyek, galat: galatMuatProyek } = useData<{ projects: Proyek[] }>(
    "/api/v1/projects",
  );
  // `useMemo`: masuk dependensi `useEffect` di bawah, dan array baru tiap
  // render membuat efek itu berjalan tanpa henti.
  const proyekList = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  // Yang dari URL menang, TAPI hanya kalau id-nya benar-benar ada di daftar:
  // id ngawur dari tautan lama harus mendarat di sesuatu yang nyata, bukan
  // di layar kosong yang tak bisa dijelaskan.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProyekId((s) =>
      s || (dariUrl && proyekList.some((p) => p.id === dariUrl) ? dariUrl : "") || proyekList[0]?.id || "");
  }, [proyekList, dariUrl]);

  const { data, memuat, galat: galatMuatData, muatUlang } = useData<Muatan>(
    proyekId ? `/api/v1/proyek/${proyekId}/sengketa` : null,
  );
  const galat = galatMuatProyek
    ? "Gagal memuat daftar proyek"
    : galatMuatData ? "Gagal memuat sengketa" : null;

  /**
   * Klaim yang BISA disengketakan saja yang ditawarkan — bukan seluruh klaim.
   * Menawarkan klaim yang masih diproses lalu menolaknya saat disimpan adalah
   * membiarkan orang mengisi formulir untuk ditolak belakangan.
   *
   * Rutenya `/projects/:id/claims` dan kuncinya `data` — DIUKUR ke
   * `rantai-kontrak.ts`, bukan ditebak dari nama modulnya. Salah tebak di
   * sini gagal SENYAP: daftar klaim kosong terlihat seperti "memang belum
   * ada klaim yang ditolak".
   *
   * Bukan kegagalan yang menghalangi: sengketa boleh dicatat tanpa klaim —
   * jadi galat sumber ini sengaja TIDAK ikut dibaca ke banner `galat` di
   * atas.
   */
  const { data: dataKlaim } = useData<{ data: Klaim[] }>(
    tambah && proyekId ? `/api/v1/projects/${proyekId}/claims` : null,
  );
  const klaim = (dataKlaim?.data ?? []).filter(
    (k) => k.status === "ditolak" || k.status === "gugur");

  const simpan = useCallback(async () => {
    if (!proyekId) return;
    if (!fJudul.trim()) { setGalatModal("Judul sengketa wajib diisi"); return; }
    if (!fLawan.trim()) { setGalatModal("Pihak lawan wajib diisi"); return; }
    if (!fPokok.trim()) { setGalatModal("Pokok perkara wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/proyek/${proyekId}/sengketa`, {
        judul: fJudul.trim(),
        pihak_lawan: fLawan.trim(),
        pokok_perkara: fPokok.trim(),
        dasar_hukum: fDasar.trim() || null,
        nilai_tuntutan: fNilai || null,
        tanggal_mulai: fMulai || null,
        klaim_id: fKlaim || null,
      });
      setTambah(false);
      setFJudul(""); setFLawan(""); setFPokok(""); setFDasar("");
      setFNilai(""); setFMulai(""); setFKlaim("");
      await muatUlang();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal mencatat sengketa");
    } finally { setMenyimpan(false); }
  }, [proyekId, fJudul, fLawan, fPokok, fDasar, fNilai, fMulai, fKlaim, muatUlang]);

  const simpanPindah = useCallback(async () => {
    if (!pindah) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.patch(`/api/v1/sengketa/${pindah.id}/tahap`, {
        status: pTahap,
        forum: pForum.trim() || null,
        ...(pTahap === "selesai"
          ? { hasil: pHasil.trim(), nilai_putusan: pPutusan || null }
          : {}),
      });
      setPindah(null); setPForum(""); setPHasil(""); setPPutusan("");
      await muatUlang();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal memindahkan tahap");
    } finally { setMenyimpan(false); }
  }, [pindah, pTahap, pForum, pHasil, pPutusan, muatUlang]);

  const kolom: Array<Kolom<Sengketa>> = [
    {
      kunci: "perkara", judul: "Perkara", kepalaBaris: true,
      render: (s) => {
        const berat = s.status === "arbitrase" || s.status === "pengadilan";
        return (
          <span style={{
            display: "block", paddingLeft: 9,
            // Hanya yang sudah keluar dari perundingan — di situlah biayanya
            // melonjak dan keputusannya bukan lagi milik kita.
            borderLeft: berat ? "3px solid var(--danger)" : "3px solid transparent",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {s.nomor && (
                <span style={{ fontSize: "var(--t-kecil)", color: C.muted, fontWeight: 700 }}>{s.nomor}</span>
              )}
              <strong style={{ fontSize: 13, color: C.text }}>{s.judul}</strong>
            </span>
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.mid, marginTop: 1 }}>
              lawan {s.pihak_lawan}
              {s.forum ? ` · ${s.forum}` : ""}
              {/* Tautan ke klaimnya disebut — itulah yang membuat angkanya
                  tak perlu diketik ulang. */}
              {s.klaim_id ? " · dari klaim yang ditolak" : ""}
            </span>
            {s.status === "selesai" && s.hasil && (
              <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted, marginTop: 2, maxWidth: "46ch" }}>
                {s.hasil}
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "nilai", judul: "Tuntutan", rata: "kanan",
      render: (s) => (
        <span style={{ display: "block", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontSize: 12.5, color: C.text }}>{rupiah(s.nilai_tuntutan)}</span>
          {s.status === "selesai" && (
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>
              putusan {rupiah(s.nilai_putusan)}
            </span>
          )}
          {s.nilai_tuntutan == null && s.status !== "selesai" && (
            // Dinyatakan, bukan dibiarkan strip — nilai yang belum dicatat
            // adalah paparan yang belum diketahui, bukan paparan nol.
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: "var(--warning-teks)" }}>
              belum dicatat
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "mulai", judul: "Sejak",
      render: (s) => (
        <span style={{ display: "block", fontSize: 12, color: C.mid }}>
          {tanggal(s.tanggal_mulai)}
          {s.selesai_pada && (
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>
              selesai {tanggal(s.selesai_pada)}
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "tahap", judul: "Tahap",
      render: (s) => (
        <span title={TAHAP[s.status].arti}>
          <Lencana nada={TAHAP[s.status].nada}>{TAHAP[s.status].label}</Lencana>
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (s) => (
        s.status === "selesai"
          // Keadaan akhir — tombolnya dihilangkan supaya tak menjanjikan
          // sesuatu yang pasti ditolak.
          ? <span aria-hidden="true" />
          : (
            <Tombol kecil ikon={<ArrowRight size={12} />}
              onClick={() => {
                setPindah(s);
                const i = URUTAN.indexOf(s.status);
                setPTahap(URUTAN[Math.min(i + 1, URUTAN.length - 1)]);
                setPForum(s.forum ?? "");
                setGalatModal(null);
              }}>
              Pindah tahap
            </Tombol>
          )
      ),
    },
  ];

  const r = data?.ringkas;
  const lanjutan = pindah ? URUTAN.slice(URUTAN.indexOf(pindah.status) + 1) : [];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Gavel size={18} />}
        judul="Sengketa & Klaim"
        keterangan={
          <>Perselisihan beserta dasar hukum dan hasilnya. Sengketa yang lahir
          dari klaim <strong>menautkan klaim aslinya</strong> — angka yang
          diketik ulang akan berbeda dari angka aslinya, dan selisih antara dua
          dokumen milik sendiri adalah senjata pihak lawan.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambah(true); setGalatModal(null); }}
            disabled={!proyekId}>
            Catat sengketa
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muatUlang()} />}

      <Kartu pad="sedang">
        <label htmlFor="sg-proyek" style={{
          fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <Pilihan
          id="sg-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
          style={{ ...gayaInput, maxWidth: 420 }}
        >
          <option value="">— pilih proyek —</option>
          {proyekList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Pilihan>
      </Kartu>

      {r && r.total > 0 && (
        <BarisAngka>
          <KartuAngka
            label="Paparan berjalan"
            nilai={rupiahRingkas(r.paparan)}
            ikon={<Scale size={15} />}
            sub={`dari ${r.berjalan} sengketa yang belum diputus`}
          />
          <KartuAngka
            label="Nilainya belum dicatat"
            nilai={r.tanpa_nilai}
            ikon={<CircleHelp size={15} />}
            // Angka ini yang biasanya dihilangkan orang — dan tanpanya,
            // paparan di sebelah kiri terbaca seolah itulah seluruhnya.
            sub={r.tanpa_nilai > 0
              ? "paparan di kiri BELUM memasukkan mereka"
              : "seluruh sengketa berjalan sudah bernilai"}
            warna={r.tanpa_nilai > 0 ? "var(--warning-teks)" : undefined}
          />
          <KartuAngka
            label="Terlama berjalan"
            nilai={r.terlama_hari === null ? "—" : `${r.terlama_hari} hari`}
            ikon={<Gavel size={15} />}
            sub={r.terlama_hari === null
              ? "tak ada sengketa berjalan"
              : "sejak dicatat sampai hari ini"}
          />
          {/* `null` (belum ada yang selesai bernilai) dan 0 (dituntut berapa,
              diputus segitu) adalah hal BERBEDA — dan keduanya sama-sama
              tertulis "Rp 0" kalau tak dibedakan.
              *
              * Terlihat di layar: dengan satu sengketa selesai yang diputus
              * PENUH, kartunya berbunyi "Rp 0" — yang terbaca seperti "tidak
              * ada data", padahal itu hasil terbaik yang mungkin. Karena itu
              * nol punya kalimatnya sendiri. */}
          <KartuAngka
            label="Selisih putusan"
            nilai={
              r.selisih_putusan === null ? "—"
                : r.selisih_putusan === 0 ? "Nihil"
                : rupiahRingkas(r.selisih_putusan)
            }
            ikon={<Scale size={15} />}
            sub={
              r.selisih_putusan === null
                ? "belum ada sengketa selesai yang bernilai"
                : r.selisih_putusan === 0
                  ? "yang selesai diputus persis sebesar tuntutannya"
                  : "selisih tuntutan dengan yang benar-benar diputus"
            }
          />
        </BarisAngka>
      )}

      {!proyekId ? (
        <Kosong
          ikon={<Gavel size={28} />}
          judul="Pilih proyek dulu"
          sebab="Sengketa melekat pada proyek dan kontraknya — pihak lawan, dasar hukum, dan forumnya berbeda tiap pekerjaan."
        />
      ) : memuat ? (
        <Rangka tinggi={56} jumlah={3} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu sub={data ? `terbaru di atas · dinilai pada ${tanggal(data.pada)}` : undefined}>
            Sengketa
          </JudulKartu>
          <Tabel
            kolom={kolom}
            data={data?.sengketa ?? []}
            kunciBaris={(x) => x.id}
            caption="Sengketa proyek beserta tahap, nilai tuntutan, dan hasilnya"
            tandaiBaris={(x) =>
              (x.status === "arbitrase" || x.status === "pengadilan") ? "bahaya" : undefined}
            kosong={
              <Kosong
                ikon={<Gavel size={28} />}
                judul="Belum ada sengketa"
                sebab="Semoga tetap begitu. Kalau terjadi, catatlah sejak hari pertama — catatan yang dibuat belakangan selalu kalah lengkap dari yang dibuat saat kejadiannya."
              />
            }
          />
        </Kartu>
      )}

      {/* ── Catat sengketa ───────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambah}
        judul="Catat sengketa"
        keterangan="Hanya klaim yang sudah DITOLAK atau GUGUR yang bisa disengketakan — menyengketakan klaim yang masih diproses adalah menyerah sebelum jawabannya keluar."
        onTutup={() => setTambah(false)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTambah(false)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpan()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan sengketa"}
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

        <Medan id="sg-judul" label="Judul perkara" wajib
          anak={
            <input id="sg-judul" value={fJudul}
              onChange={(e) => setFJudul(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="sg-lawan" label="Pihak lawan" wajib
          anak={
            <input id="sg-lawan" value={fLawan}
              onChange={(e) => setFLawan(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="sg-pokok" label="Pokok perkara" wajib
          keterangan="Apa yang diperselisihkan, dalam kalimat yang bisa dibaca orang yang belum tahu perkaranya."
          anak={
            <textarea id="sg-pokok" value={fPokok} rows={3}
              onChange={(e) => setFPokok(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
        <Medan id="sg-klaim" label="Berasal dari klaim"
          keterangan={klaim.length === 0
            ? "Belum ada klaim yang ditolak atau gugur di proyek ini — sengketa boleh dicatat tanpa klaim (mis. sengketa lahan)."
            : "Menautkan klaim membuat nilai dan tanggal kejadiannya tak perlu diketik ulang."}
          anak={
            <Pilihan id="sg-klaim" value={fKlaim}
              onChange={(e) => setFKlaim(e.target.value)} style={gayaInput}
              disabled={klaim.length === 0}>
              <option value="">— tanpa klaim —</option>
              {klaim.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.claim_number} — {k.title} ({k.status})
                </option>
              ))}
            </Pilihan>
          }
        />
        <Medan id="sg-dasar" label="Dasar hukum"
          keterangan="Pasal kontrak atau ketentuan yang jadi sandaran."
          anak={
            <input id="sg-dasar" value={fDasar}
              onChange={(e) => setFDasar(e.target.value)} style={gayaInput} />
          }
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="sg-nilai" label="Nilai tuntutan"
              keterangan="Boleh dikosongkan bila belum jelas — yang belum dicatat dihitung terpisah, bukan dianggap nol."
              anak={
                <input id="sg-nilai" type="number" min="0" value={fNilai}
                  onChange={(e) => setFNilai(e.target.value)} style={gayaInput} />
              }
            />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="sg-mulai" label="Sejak tanggal"
              keterangan="Kosong = hari ini."
              anak={
                <input id="sg-mulai" type="date" value={fMulai}
                  onChange={(e) => setFMulai(e.target.value)} style={gayaInput} />
              }
            />
          </div>
        </div>
      </DialogBersama>

      {/* ── Pindah tahap ─────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={pindah != null}
        judul="Pindah tahap sengketa"
        keterangan="Tahap boleh melompat maju, tetapi tak bisa mundur — jejak bahwa perkara pernah sampai sejauh ini yang menentukan biaya dan risikonya."
        onTutup={() => setPindah(null)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setPindah(null)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanPindah()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Pindahkan"}
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

        {pindah && (
          <p style={{ fontSize: 12.5, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{pindah.judul}</strong> — sekarang{" "}
            {TAHAP[pindah.status].label.toLowerCase()}.
          </p>
        )}

        <Medan id="sg-tahap" label="Tahap berikutnya"
          anak={
            <Pilihan id="sg-tahap" value={pTahap}
              onChange={(e) => setPTahap(e.target.value as StatusSengketa)}
              style={gayaInput}>
              {/* Hanya tahap MAJU yang ditawarkan. Menawarkan yang mundur lalu
                  menolaknya saat disimpan adalah menjanjikan sesuatu yang
                  tak bisa ditepati. */}
              {lanjutan.map((t) => (
                <option key={t} value={t}>{TAHAP[t].label}</option>
              ))}
            </Pilihan>
          }
        />
        <p style={{ fontSize: 12, color: C.mid, margin: "-4px 0 12px", lineHeight: 1.5 }}>
          {TAHAP[pTahap].arti}
        </p>

        {pTahap !== "selesai" && (
          <Medan id="sg-forum" label="Forum"
            keterangan="BANI, PN Bandung, atau nama mediatornya."
            anak={
              <input id="sg-forum" value={pForum}
                onChange={(e) => setPForum(e.target.value)} style={gayaInput} />
            }
          />
        )}

        {pTahap === "selesai" && (
          <>
            <Medan id="sg-hasil" label="Hasil" wajib
              keterangan="Minimal 10 huruf. Sengketa yang ditutup tanpa hasil tercatat adalah sengketa yang hilang — dan yang hilang tak bisa dipakai saat perkara serupa datang lagi."
              anak={
                <textarea id="sg-hasil" value={pHasil} rows={3}
                  onChange={(e) => setPHasil(e.target.value)}
                  style={{ ...gayaInput, resize: "vertical" }} />
              }
            />
            <Medan id="sg-putusan" label="Nilai putusan"
              keterangan="Berapa yang benar-benar diputus. Selisihnya dengan tuntutan yang jadi bahan belajar untuk perkara berikutnya."
              anak={
                <input id="sg-putusan" type="number" min="0" value={pPutusan}
                  onChange={(e) => setPPutusan(e.target.value)} style={gayaInput} />
              }
            />
          </>
        )}
      </DialogBersama>
    </Halaman>
  );
}
