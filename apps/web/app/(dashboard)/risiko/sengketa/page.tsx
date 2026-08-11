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

import { Suspense, useCallback, useEffect, useState } from "react";
import { Gavel, Scale, Plus, ArrowRight, CircleHelp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
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
  const [proyekList, setProyekList] = useState<Proyek[]>([]);
  const [proyekId, setProyekId] = useState("");
  const [data, setData] = useState<Muatan | null>(null);
  const [klaim, setKlaim] = useState<Klaim[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

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

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => {
        const d = r.data.projects ?? [];
        setProyekList(d);
        // Yang dari URL menang, TAPI hanya kalau id-nya benar-benar ada di
        // daftar: id ngawur dari tautan lama harus mendarat di sesuatu yang
        // nyata, bukan di layar kosong yang tak bisa dijelaskan.
        setProyekId((s) =>
          s || (dariUrl && d.some((p) => p.id === dariUrl) ? dariUrl : "") || d[0]?.id || "");
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek"); });
    return () => ac.abort();
  }, [dariUrl]);

  const muat = useCallback(async (id: string) => {
    // Lewat mikrotask, BUKAN setState langsung di badan efek: yang kedua
    // memicu render bertingkat (`set-state-in-effect`).
    if (!id) { void Promise.resolve().then(() => setData(null)); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Muatan>(`/api/v1/proyek/${id}/sengketa`);
      setData(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat sengketa");
      setData(null);
    } finally { setMemuat(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `muat()` menyetel state di
  // awalnya, dan memanggilnya dari badan efek adalah setState-di-dalam-efek
  // (`react-hooks/set-state-in-effect`) yang memicu render bertingkat. Pola
  // yang sama dipakai `/mutu/ncr`; ratchet lint mengukurnya 67 → 71 pada
  // percobaan pertama halaman ini.
  useEffect(() => { queueMicrotask(() => { void muat(proyekId); }); }, [proyekId, muat]);

  /**
   * Klaim yang BISA disengketakan saja yang ditawarkan — bukan seluruh klaim.
   * Menawarkan klaim yang masih diproses lalu menolaknya saat disimpan adalah
   * membiarkan orang mengisi formulir untuk ditolak belakangan.
   */
  const muatKlaim = useCallback(async (id: string) => {
    if (!id) { void Promise.resolve().then(() => setKlaim([])); return; }
    try {
      // Rutenya `/projects/:id/claims` dan kuncinya `data` — DIUKUR ke
      // `rantai-kontrak.ts`, bukan ditebak dari nama modulnya. Salah tebak di
      // sini gagal SENYAP: daftar klaim kosong terlihat seperti "memang belum
      // ada klaim yang ditolak".
      const r = await api.get<{ data: Klaim[] }>(`/api/v1/projects/${id}/claims`);
      setKlaim((r.data.data ?? []).filter(
        (k) => k.status === "ditolak" || k.status === "gugur"));
    } catch {
      // Bukan kegagalan yang menghalangi: sengketa boleh dicatat tanpa klaim.
      setKlaim([]);
    }
  }, []);

  useEffect(() => {
    if (tambah) queueMicrotask(() => { void muatKlaim(proyekId); });
  }, [tambah, proyekId, muatKlaim]);

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
      await muat(proyekId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal mencatat sengketa");
    } finally { setMenyimpan(false); }
  }, [proyekId, fJudul, fLawan, fPokok, fDasar, fNilai, fMulai, fKlaim, muat]);

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
      await muat(proyekId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal memindahkan tahap");
    } finally { setMenyimpan(false); }
  }, [pindah, pTahap, pForum, pHasil, pPutusan, proyekId, muat]);

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
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{s.nomor}</span>
              )}
              <strong style={{ fontSize: 13, color: C.text }}>{s.judul}</strong>
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
              lawan {s.pihak_lawan}
              {s.forum ? ` · ${s.forum}` : ""}
              {/* Tautan ke klaimnya disebut — itulah yang membuat angkanya
                  tak perlu diketik ulang. */}
              {s.klaim_id ? " · dari klaim yang ditolak" : ""}
            </span>
            {s.status === "selesai" && s.hasil && (
              <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2, maxWidth: "46ch" }}>
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
            <span style={{ display: "block", fontSize: 11, color: C.muted }}>
              putusan {rupiah(s.nilai_putusan)}
            </span>
          )}
          {s.nilai_tuntutan == null && s.status !== "selesai" && (
            // Dinyatakan, bukan dibiarkan strip — nilai yang belum dicatat
            // adalah paparan yang belum diketahui, bukan paparan nol.
            <span style={{ display: "block", fontSize: 11, color: "var(--warning-teks)" }}>
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
            <span style={{ display: "block", fontSize: 11, color: C.muted }}>
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

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat(proyekId)} />}

      <Kartu pad="sedang">
        <label htmlFor="sg-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <select
          id="sg-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
          style={{ ...gayaInput, maxWidth: 420 }}
        >
          <option value="">— pilih proyek —</option>
          {proyekList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
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
            <select id="sg-klaim" value={fKlaim}
              onChange={(e) => setFKlaim(e.target.value)} style={gayaInput}
              disabled={klaim.length === 0}>
              <option value="">— tanpa klaim —</option>
              {klaim.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.claim_number} — {k.title} ({k.status})
                </option>
              ))}
            </select>
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
            <select id="sg-tahap" value={pTahap}
              onChange={(e) => setPTahap(e.target.value as StatusSengketa)}
              style={gayaInput}>
              {/* Hanya tahap MAJU yang ditawarkan. Menawarkan yang mundur lalu
                  menolaknya saat disimpan adalah menjanjikan sesuatu yang
                  tak bisa ditepati. */}
              {lanjutan.map((t) => (
                <option key={t} value={t}>{TAHAP[t].label}</option>
              ))}
            </select>
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
