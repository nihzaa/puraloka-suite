"use client";

/**
 * INSIDEN K3 — kecelakaan & nyaris celaka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN SENDIRI, TERPISAH DARI /k3
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026` §6a: tab = sudut pandang atas data yang sama; halaman =
 * entitas berbeda.
 *
 * Insiden adalah entitas yang DIRUJUK DARI LUAR: evaluasi subkon menggugurkan
 * berdasarkan jumlahnya, register risiko menautkannya, JSA diperbaiki
 * karenanya. Yang dirujuk dari luar butuh alamat sendiri — bukan tab yang
 * hanya bisa dicapai lewat halaman lain.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKA YANG MENGGUGURKAN ORANG DARI PEKERJAAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/kepatuhan-k3.ts` menggugurkan subkon bila `jumlah_kecelakaan > 0`, dan
 * sebelum modul ini angka itu diketik manual — tanpa satu pun baris yang
 * menjelaskan kecelakaan apa, kapan, siapa yang terluka.
 *
 * Kartu "Angka evaluasi tak cocok" adalah alasan halaman ini ada. Ia
 * membandingkan yang DIKETIK dengan yang DIHITUNG, dan menyebut insiden mana
 * yang dimaksud — supaya yang dinilai bisa membantah dengan menunjuk baris,
 * bukan dengan berdebat soal ingatan.
 *
 * ── Nyaris celaka: angka yang NAIK adalah kabar baik
 *
 * Satu kecelakaan berat biasanya didahului puluhan nyaris celaka yang tak
 * dilaporkan karena "tidak ada apa-apa". Karena itu nyaris celaka:
 *
 *   · tidak menggugurkan subkon
 *   · ditampilkan NETRAL, bukan merah
 *   · sub-teksnya menyatakan bahwa naiknya berarti orang mulai melapor
 *
 * Menandainya merah akan menghentikan pelaporan — dan sistemnya berhenti
 * melihat hal yang paling ingin ia lihat.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya ketidakcocokan angka evaluasi. Daftar insidennya
 * sendiri tenang: insiden yang sudah ditutup dengan tindakan korektif adalah
 * pekerjaan yang selesai, bukan masalah yang menunggu.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  HardHat, TriangleAlert, ShieldAlert, Plus, Scale, Link2, CircleCheck,
} from "lucide-react";
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

type JenisInsiden =
  | "nyaris_celaka" | "kecelakaan_ringan" | "kecelakaan_berat" | "fatal"
  | "kerusakan_properti" | "pencemaran_lingkungan";
type StatusInsiden = "dilaporkan" | "diselidiki" | "tindakan_berjalan" | "ditutup";

interface Insiden {
  id: string;
  nomor: string | null;
  jenis: JenisInsiden;
  tanggal: string;
  lokasi: string | null;
  kronologi: string;
  korban_nama: string | null;
  melukai: boolean;
  hari_kerja_hilang: number;
  penyebab_dasar: string | null;
  tindakan_korektif: string | null;
  jsa_id: string | null;
  status: StatusInsiden;
  subkon: { id: string; name: string } | null;
}

interface Muatan {
  proyek: { id: string; name: string };
  pada: string;
  insiden: Insiden[];
  rekap_insiden: {
    total: number; nyaris_celaka: number; melukai: number; fatal: number;
    hari_kerja_hilang: number; terbuka: number;
    ditutup_tanpa_korektif: number; bertaut_jsa: number;
  };
  trir: number | null;
}

interface Selaras {
  periksa: Array<{
    evaluasi_id: string; pihak_nama: string | null; periode: string | null;
    supplier_id: string; diketik: number; dihitung: number;
    selaras: boolean | null; selisih: number; insiden_id: string[];
  }>;
  tak_selaras: Array<{
    pihak_nama: string | null; diketik: number; dihitung: number;
    insiden_id: string[];
  }>;
}

interface Proyek { id: string; name: string }
interface Subkon { id: string; name: string }
interface Pekerja { id: string; name: string }

/**
 * Enam jenis, dan warnanya TIDAK sekadar mengikuti keparahan.
 *
 * `nyaris_celaka` netral dengan sengaja — lihat kepala berkas.
 */
const JENIS: Record<JenisInsiden, { label: string; nada: "netral" | "info" | "peringatan" | "bahaya"; arti: string }> = {
  nyaris_celaka: {
    label: "Nyaris celaka", nada: "netral",
    arti: "Kecelakaan yang kebetulan tak melukai siapa pun. TIDAK menggugurkan subkon — kalau ia ikut menggugurkan, tak akan ada yang melaporkannya lagi.",
  },
  kecelakaan_ringan: {
    label: "Kecelakaan ringan", nada: "peringatan",
    arti: "Melukai, tetapi tanpa perawatan lanjutan. Menggugurkan subkon dari penilaian.",
  },
  kecelakaan_berat: {
    label: "Kecelakaan berat", nada: "bahaya",
    arti: "Melukai dengan perawatan lanjutan atau hari kerja hilang. Menggugurkan subkon.",
  },
  fatal: {
    label: "Fatal", nada: "bahaya",
    arti: "Korban meninggal. Wajib dilaporkan ke Disnaker.",
  },
  kerusakan_properti: {
    label: "Kerusakan properti", nada: "info",
    arti: "Merusak tanpa melukai. Tidak menggugurkan — yang rusak bisa diganti, yang terluka tidak.",
  },
  pencemaran_lingkungan: {
    label: "Pencemaran", nada: "peringatan",
    arti: "Dampak lingkungan di luar baku mutu.",
  },
};

const STATUS: Record<StatusInsiden, { label: string; nada: "netral" | "info" | "peringatan" | "sukses" }> = {
  dilaporkan: { label: "Dilaporkan", nada: "peringatan" },
  diselidiki: { label: "Diselidiki", nada: "info" },
  tindakan_berjalan: { label: "Tindakan berjalan", nada: "info" },
  ditutup: { label: "Ditutup", nada: "sukses" },
};

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

/**
 * `useSearchParams` memaksa render sisi klien, dan Next menuntut batas
 * Suspense untuk itu — tanpa ini `pnpm build` gagal saat prerender.
 */
export default function InsidenK3Page() {
  return (
    <Suspense fallback={
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat insiden K3…
      </div>
    }>
      <IsiInsiden />
    </Suspense>
  );
}

function IsiInsiden() {
  const params = useSearchParams();
  const dariUrl = params.get("proyek") ?? "";
  const [proyekId, setProyekId] = useState("");

  const [tambah, setTambah] = useState(false);
  const [fJenis, setFJenis] = useState<JenisInsiden>("nyaris_celaka");
  const [fTanggal, setFTanggal] = useState("");
  const [fLokasi, setFLokasi] = useState("");
  const [fKronologi, setFKronologi] = useState("");
  const [fSubkon, setFSubkon] = useState("");
  const [fKorban, setFKorban] = useState("");
  const [fKorbanWorker, setFKorbanWorker] = useState("");
  const [fHari, setFHari] = useState("");

  const [tutupBaris, setTutupBaris] = useState<Insiden | null>(null);
  const [tKorektif, setTKorektif] = useState("");
  const [tPenyebab, setTPenyebab] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Lima `useData`: tiga independen (proyek, subkon, pekerja) + dua yang
    BERGANTUNG `proyekId` (K3 + selaras) — muat berantai dua tingkat, masih
    dalam batas yang dianjurkan. Subkon dan pekerja TETAP "gagal tak
    melumpuhkan": galatnya sengaja tak diperiksa di bawah, persis seperti
    versi lama yang menelannya lewat `.catch(() => setX([]))`.
  */
  const { data: dataProyek, galat: galatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyekList = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  // `/procurement/suppliers`, BUKAN `/penyedia` — DIUKUR, bukan ditebak dari
  // namanya. `/api/v1/penyedia` adalah penyedia AI/adaptor, dan memanggilnya
  // di sini menghasilkan dropdown berisi nama model bahasa. Pelajaran yang
  // sama dengan `/claims` di G3, hampir terulang.
  const { data: dataSubkon } = useData<{ suppliers: Subkon[] }>("/api/v1/procurement/suppliers");
  const subkon = dataSubkon?.suppliers ?? [];

  /**
   * Pekerja terdaftar — untuk memilih korban, bukan mengetik namanya.
   *
   * Penjaga `audit-kolom-tak-tersambung` menangkap versi pertama halaman ini:
   * API menerima `korban_worker_id` tanpa satu pun jalan pengisiannya. Bukan
   * cacat kosmetik — nama yang diketik ("Budi", "budi santoso", "Pak Budi")
   * tak bisa dihubungkan ke riwayat orangnya, dan justru riwayat itu yang
   * dicari saat menilai apakah kecelakaan berulang pada orang yang sama.
   *
   * Medan nama bebas TETAP ada: tak semua korban terdaftar (tamu, pengemudi
   * pengantar, warga sekitar).
   */
  const { data: dataPekerja } = useData<{ workers: Pekerja[] }>("/api/v1/mandor/workers");
  const pekerja = dataPekerja?.workers ?? [];

  // Proyek awal: dari URL bila valid, kalau tidak proyek pertama. Efek
  // terpisah bergantung `proyekList` saja — tak menimpa pilihan pengguna
  // begitu sudah memilih sendiri (lihat penjaga `s ||` di bawah).
  //
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
  const jalurSelaras = proyekId ? `/api/v1/proyek/${proyekId}/k3/selaras` : null;
  const { data, memuat, galat: galatK3, muatUlang: muatUlangK3 } = useData<Muatan>(jalurK3);
  const { data: selaras, muatUlang: muatUlangSelaras } = useData<Selaras>(jalurSelaras);

  const muat = useCallback(async () => {
    await Promise.all([muatUlangK3(), muatUlangSelaras()]);
  }, [muatUlangK3, muatUlangSelaras]);

  /*
    Galat MUAT dan galat AKSI (simpan/tutup insiden) sengaja dipisah —
    `galatModal` sudah menjalankan peran galat AKSI di dalam dialog, jadi
    galat muat ditambahkan sebagai lapis terpisah untuk daftar utama.
  */
  const galat = galatProyek
    ? "Gagal memuat daftar proyek"
    : (proyekId && galatK3 ? "Gagal memuat insiden K3" : null);

  const simpan = useCallback(async () => {
    if (!proyekId) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/proyek/${proyekId}/k3/insiden`, {
        jenis: fJenis,
        tanggal: fTanggal || null,
        lokasi: fLokasi.trim() || null,
        kronologi: fKronologi.trim(),
        supplier_id: fSubkon || null,
        korban_nama: fKorban.trim() || null,
        korban_worker_id: fKorbanWorker || null,
        melukai: ["kecelakaan_ringan", "kecelakaan_berat", "fatal"].includes(fJenis),
        hari_kerja_hilang: fHari || 0,
      });
      setTambah(false);
      setFKronologi(""); setFLokasi(""); setFKorban(""); setFKorbanWorker("");
      setFHari(""); setFTanggal("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal mencatat insiden");
    } finally { setMenyimpan(false); }
  }, [proyekId, fJenis, fTanggal, fLokasi, fKronologi, fSubkon, fKorban,
      fKorbanWorker, fHari, muat]);

  const simpanTutup = useCallback(async () => {
    if (!tutupBaris) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.patch(`/api/v1/k3/insiden/${tutupBaris.id}`, {
        status: "ditutup",
        tindakan_korektif: tKorektif.trim(),
        ...(tPenyebab.trim() ? { penyebab_dasar: tPenyebab.trim() } : {}),
      });
      setTutupBaris(null); setTKorektif(""); setTPenyebab("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menutup insiden");
    } finally { setMenyimpan(false); }
  }, [tutupBaris, tKorektif, tPenyebab, muat]);

  const kolom: Array<Kolom<Insiden>> = [
    {
      kunci: "insiden", judul: "Insiden", kepalaBaris: true,
      render: (i) => (
        <span style={{
          display: "block", paddingLeft: 9,
          // Pita kiri HANYA untuk yang MELUKAI dan belum ditutup. Nyaris
          // celaka tak berpita meski baru dilaporkan — menandainya merah
          // menghentikan pelaporan.
          borderLeft: i.melukai && i.status !== "ditutup"
            ? "3px solid var(--danger)" : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {i.nomor && (
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{i.nomor}</span>
            )}
            <strong style={{ fontSize: 13, color: C.text }}>
              {i.lokasi || "Lokasi tak dicatat"}
            </strong>
          </span>
          <span style={{
            display: "block", fontSize: 11.5, color: C.mid, marginTop: 1,
            maxWidth: "62ch", lineHeight: 1.45,
          }}>{i.kronologi}</span>
          {/* Barisnya HILANG saat tak ada isinya, bukan diisi strip.
              *
              * Terlihat di layar: insiden tanpa subkon, korban, dan JSA
              * menampilkan "—" sendirian di bawah kronologinya — menempati
              * ruang tanpa menyampaikan apa pun. Strip berguna di dalam KOLOM
              * (menandai sel yang memang kosong pada posisi yang sama tiap
              * baris); di teks mengalir seperti ini ia hanya kebisingan. */}
          {(() => {
            const tambahan = [
              i.subkon?.name,
              i.korban_nama ? `korban: ${i.korban_nama}` : null,
              i.jsa_id ? "tertaut JSA" : null,
            ].filter(Boolean).join(" · ");
            return tambahan ? (
              <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>
                {tambahan}
              </span>
            ) : null;
          })()}
        </span>
      ),
    },
    {
      kunci: "jenis", judul: "Jenis",
      render: (i) => (
        <span title={JENIS[i.jenis].arti}>
          <Lencana nada={JENIS[i.jenis].nada}>{JENIS[i.jenis].label}</Lencana>
        </span>
      ),
    },
    {
      kunci: "tanggal", judul: "Tanggal",
      render: (i) => (
        <span style={{ display: "block", fontSize: 12, color: C.mid }}>
          {tanggal(i.tanggal)}
          {i.hari_kerja_hilang > 0 && (
            <span style={{ display: "block", fontSize: 11, color: "var(--danger)" }}>
              {i.hari_kerja_hilang} hari kerja hilang
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (i) => (
        <span style={{ display: "block" }}>
          <Lencana nada={STATUS[i.status].nada}>{STATUS[i.status].label}</Lencana>
          {i.status === "ditutup" && !i.tindakan_korektif && (
            // Constraint DB melarangnya untuk baris baru, tetapi baris lama
            // bisa saja ada — dan itu dinyatakan, bukan didiamkan.
            <span style={{ display: "block", fontSize: 11, color: "var(--danger)", marginTop: 2 }}>
              tanpa tindakan korektif
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (i) => (
        i.status === "ditutup"
          ? <span aria-hidden="true" />
          : (
            <Tombol kecil ikon={<CircleCheck size={12} />}
              onClick={() => {
                setTutupBaris(i);
                setTKorektif(i.tindakan_korektif ?? "");
                setTPenyebab(i.penyebab_dasar ?? "");
                setGalatModal(null);
              }}>
              Tutup
            </Tombol>
          )
      ),
    },
  ];

  const r = data?.rekap_insiden;
  const takCocok = selaras?.tak_selaras ?? [];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<HardHat size={18} />}
        judul="Insiden K3"
        keterangan={
          <>Kecelakaan dan nyaris celaka. <strong>Nyaris celaka yang naik adalah
          kabar baik</strong> — artinya orang mulai melapor; satu kecelakaan berat
          biasanya didahului puluhan yang tak pernah dilaporkan karena
          &ldquo;tidak ada apa-apa&rdquo;.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambah(true); setGalatModal(null); }}
            disabled={!proyekId}>
            Laporkan insiden
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      <Kartu pad="sedang">
        <label htmlFor="k3-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <Pilihan
          id="k3-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
          style={{ ...gayaInput, maxWidth: 420 }}
        >
          <option value="">— pilih proyek —</option>
          {proyekList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Pilihan>
      </Kartu>

      {/* ── SATU aksen: angka evaluasi yang tak cocok (§3d) ───────────────
          *
          * Alasan halaman ini ada. Evaluasi subkon menggugurkan dari
          * pekerjaan berdasarkan jumlah kecelakaan — dan sebelum modul ini
          * angka itu tak punya sumber yang bisa ditunjuk. */}
      {takCocok.length > 0 && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Scale size={15} aria-hidden="true" />
            {takCocok.length === 1
              ? "1 penilaian subkon memakai angka kecelakaan yang tak cocok"
              : `${takCocok.length} penilaian subkon memakai angka kecelakaan yang tak cocok`}
          </strong>
          {takCocok.map((t, n) => (
            <span key={`${t.pihak_nama}-${n}`} style={{ display: "block", fontSize: 12.5 }}>
              {t.pihak_nama ?? "(tanpa nama)"} — evaluasi menulis {t.diketik},
              tercatat {t.dihitung} kecelakaan
              {t.diketik < t.dihitung
                ? " · subkon yang seharusnya gugur tetap dipakai"
                : " · digugurkan atas kecelakaan yang tak ada barisnya"}
            </span>
          ))}
        </div>
      )}

      {r && (
        <BarisAngka>
          <KartuAngka
            label="Melukai"
            nilai={r.melukai}
            ikon={<TriangleAlert size={15} />}
            sorot={r.melukai > 0}
            sub={r.melukai > 0
              ? `${r.hari_kerja_hilang} hari kerja hilang seluruhnya`
              : "belum ada yang melukai"}
          />
          <KartuAngka
            label="Nyaris celaka"
            nilai={r.nyaris_celaka}
            ikon={<ShieldAlert size={15} />}
            // Sengaja TIDAK diwarnai: naiknya berarti orang mulai melapor.
            sub="naiknya kabar baik — artinya orang melapor"
          />
          <KartuAngka
            label="Belum ditutup"
            nilai={r.terbuka}
            ikon={<HardHat size={15} />}
            sub={r.terbuka > 0
              ? "menunggu penyelidikan atau tindakan korektif"
              : "seluruhnya sudah ditutup"}
          />
          <KartuAngka
            label="TRIR"
            // `null` ditulis apa adanya — jam kerjanya belum didata, dan
            // 0 akan terbaca "tak ada insiden" (dua hal yang sangat beda).
            nilai={data?.trir === null || data?.trir === undefined ? "—" : data.trir}
            ikon={<Scale size={15} />}
            sub={data?.trir == null
              ? "belum bisa dihitung — jam kerja proyek belum didata"
              : "insiden tercatat per 200.000 jam kerja"}
          />
        </BarisAngka>
      )}

      {!proyekId ? (
        <Kosong
          ikon={<HardHat size={28} />}
          judul="Pilih proyek dulu"
          sebab="Insiden dicatat per proyek — lokasinya, pekerjanya, dan subkontraktornya berbeda tiap pekerjaan."
        />
      ) : memuat ? (
        <Rangka tinggi={64} jumlah={4} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub={r ? `${r.bertaut_jsa} dari ${r.total} tertaut JSA — yang tidak, pelajarannya tak masuk kembali ke analisa bahaya` : undefined}
          >
            Daftar insiden
          </JudulKartu>
          <Tabel
            kolom={kolom}
            data={data?.insiden ?? []}
            kunciBaris={(x) => x.id}
            caption="Insiden K3 proyek beserta jenis, korban, dan status penanganannya"
            tandaiBaris={(x) => (x.melukai && x.status !== "ditutup" ? "bahaya" : undefined)}
            kosong={
              <Kosong
                ikon={<HardHat size={28} />}
                judul="Belum ada insiden tercatat"
                sebab="Nol insiden bisa berarti dua hal yang sangat berbeda: benar-benar aman, atau tak ada yang melapor. Catat nyaris celaka juga — itu yang paling sering hilang."
              />
            }
          />
        </Kartu>
      )}

      {/* ── Laporkan insiden ──────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambah}
        judul="Laporkan insiden"
        keterangan="Nyaris celaka TIDAK menggugurkan subkon — laporkan apa adanya. Yang tak dilaporkan akan terulang dalam bentuk yang lebih parah."
        onTutup={() => setTambah(false)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTambah(false)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpan()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan laporan"}
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

        <Medan id="in-jenis" label="Jenis insiden" wajib
          keterangan={JENIS[fJenis].arti}
          anak={
            <Pilihan id="in-jenis" value={fJenis}
              onChange={(e) => setFJenis(e.target.value as JenisInsiden)} style={gayaInput}>
              {(Object.keys(JENIS) as JenisInsiden[]).map((k) => (
                <option key={k} value={k}>{JENIS[k].label}</option>
              ))}
            </Pilihan>
          }
        />
        <Medan id="in-kronologi" label="Kronologi" wajib
          keterangan="Minimal 10 huruf. Yang membaca laporan ini berbulan-bulan kemudian tak punya ingatan tentang kejadiannya — hanya kalimat yang Anda tulis hari ini."
          anak={
            <textarea id="in-kronologi" value={fKronologi} rows={4}
              onChange={(e) => setFKronologi(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="in-tanggal" label="Tanggal kejadian"
              keterangan="Kosong = hari ini. Tak boleh di masa depan."
              anak={
                <input id="in-tanggal" type="date" value={fTanggal}
                  onChange={(e) => setFTanggal(e.target.value)} style={gayaInput} />
              }
            />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="in-lokasi" label="Lokasi"
              anak={
                <input id="in-lokasi" value={fLokasi}
                  onChange={(e) => setFLokasi(e.target.value)} style={gayaInput} />
              }
            />
          </div>
        </div>
        <Medan id="in-subkon" label="Subkontraktor terkait"
          keterangan="Diisi bila pekerjanya subkon. Angka ini yang masuk ke penilaian subkon — dan sekarang punya barisnya."
          anak={
            <Pilihan id="in-subkon" value={fSubkon}
              onChange={(e) => setFSubkon(e.target.value)} style={gayaInput}>
              <option value="">— pekerja sendiri / tak terkait subkon —</option>
              {subkon.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Pilihan>
          }
        />
        {["kecelakaan_ringan", "kecelakaan_berat", "fatal"].includes(fJenis) && (
          <>
            <Medan id="in-korban-worker" label="Korban (pekerja terdaftar)"
              keterangan="Pilih dari daftar bila korbannya pekerja terdaftar — nama yang diketik tak bisa dihubungkan ke riwayat orangnya, dan riwayat itulah yang dicari saat menilai apakah kecelakaan berulang pada orang yang sama."
              anak={
                <Pilihan id="in-korban-worker" value={fKorbanWorker}
                  onChange={(e) => setFKorbanWorker(e.target.value)} style={gayaInput}>
                  <option value="">— bukan pekerja terdaftar —</option>
                  {pekerja.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </Pilihan>
              }
            />
            <Medan id="in-korban" label="Nama korban"
              wajib={!fKorbanWorker}
              keterangan={fKorbanWorker
                ? "Boleh dikosongkan — korbannya sudah dipilih dari daftar."
                : "Wajib bila korbannya tak terdaftar (tamu, pengemudi pengantar, warga sekitar)."}
              anak={
                <input id="in-korban" value={fKorban}
                  onChange={(e) => setFKorban(e.target.value)} style={gayaInput} />
              }
            />
            <Medan id="in-hari" label="Hari kerja hilang"
              keterangan="Berapa hari korban tak bisa bekerja. Nol bila langsung kembali bekerja."
              anak={
                <input id="in-hari" type="number" min="0" value={fHari}
                  onChange={(e) => setFHari(e.target.value)} style={gayaInput} />
              }
            />
          </>
        )}
      </DialogBersama>

      {/* ── Tutup insiden ─────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tutupBaris != null}
        judul="Tutup insiden"
        keterangan="Insiden yang ditutup tanpa tindakan korektif hanya menunggu terulang — dan yang terulang biasanya lebih parah dari yang pertama."
        onTutup={() => setTutupBaris(null)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTutupBaris(null)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanTutup()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Tutup insiden"}
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

        {tutupBaris && (
          <p style={{ fontSize: 12.5, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{tutupBaris.nomor ?? tutupBaris.lokasi}</strong>
            {" — "}{JENIS[tutupBaris.jenis].label.toLowerCase()},{" "}
            {tanggal(tutupBaris.tanggal)}.
          </p>
        )}

        <Medan id="tu-penyebab" label="Penyebab dasar"
          keterangan="Bukan “pekerja lalai” — cari yang di belakangnya: prosedurnya tak ada, alatnya rusak, pengawasnya tak hadir. Penyebab yang berhenti di orang tak bisa diperbaiki."
          anak={
            <textarea id="tu-penyebab" value={tPenyebab} rows={2}
              onChange={(e) => setTPenyebab(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
        <Medan id="tu-korektif" label="Tindakan korektif" wajib
          keterangan="Minimal 10 huruf. Tulis yang bisa dikerjakan orang dan diperiksa hasilnya."
          anak={
            <textarea id="tu-korektif" value={tKorektif} rows={3}
              onChange={(e) => setTKorektif(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
        <p style={{
          fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5,
          display: "flex", gap: 6, alignItems: "flex-start",
        }}>
          <Link2 size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          Kalau insiden ini terjadi pada pekerjaan yang punya JSA, perbaiki juga
          JSA-nya — di situlah pelajarannya masuk kembali, dan berlaku untuk
          semua izin kerja berikutnya.
        </p>
      </DialogBersama>
    </Halaman>
  );
}
