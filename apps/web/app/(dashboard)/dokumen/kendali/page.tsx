"use client";

/**
 * KENDALI DOKUMEN (TUNDA kelompok D)
 *
 * ── Yang dijawab halaman ini
 *
 * "Gambar revisi berapa yang BERLAKU sekarang, siapa sudah menerimanya, dan
 * butir rapat mana yang belum dikerjakan?"
 *
 * ── Empat hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Gambar berstatus 'berlaku' yang sudah punya revisi lebih baru.**
 *    Tukang mengerjakan rev-2 karena rev-3 tak pernah sampai; pekerjaan
 *    dibongkar, dan yang menanggung biayanya ditentukan siapa yang punya
 *    bukti kirim. Di sini gambar seperti itu ditandai USANG meski kolom
 *    statusnya masih hijau.
 *
 * 2. **Transmittal "terkirim" yang tak pernah dikonfirmasi diterima.**
 *    "Sudah saya kirim" dan "sudah saya terima" adalah dua klaim berbeda,
 *    dan selisihnya persis yang diperdebatkan saat pekerjaan salah gambar.
 *
 * 3. **Butir tindakan rapat yang lewat tenggat, tenggelam di antara yang
 *    selesai.** Ditambah yang lebih halus: butir TANPA tenggat tak akan
 *    pernah muncul sebagai "lewat" — ia hanya mengendap, dan rapat
 *    berikutnya membahasnya lagi.
 *
 * 4. **Jadwal laporan yang diam-diam berhenti terkirim.** Tak ada yang
 *    mengeluh soal surel yang tak datang, sampai ada yang menanyakan angka
 *    yang seharusnya sudah dibaca berminggu-minggu lalu.
 *
 * Keempatnya dikunci di `apps/api/src/lib/kendali-dokumen.ts` — 23 test,
 * 11 mutasi tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Tata letak: tiga lapis (ARAH-VISUAL §5b)
 *
 * KEADAAN (4 KPI) → POLA (peringatan) → DETAIL (tabel).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FileStack, RefreshCw, TriangleAlert, Send, ListChecks, MailWarning } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { TabBagian } from "@/components/tab-bagian";
import { useTabUrl } from "@/lib/use-tab-url";

type Gambar = {
  id: string;
  nomor: string;
  judul: string | null;
  disiplin: string | null;
  revisi: number | string;
  tahap: string | null;
  status: string;
  tanggal_terbit: string | null;
  revisiTertinggi: number;
  usang: boolean;
};

type Transmittal = {
  id: string;
  nomor: string;
  perihal?: string | null;
  tujuan_nama?: string | null;
  tujuan_organisasi?: string | null;
  maksud?: string | null;
  status: string;
  dikirim_pada: string | null;
  diterima_pada: string | null;
  diterima_oleh?: string | null;
  umurHari: number | null;
  menggantung: boolean;
};

type Tindakan = {
  id: string;
  uraian?: string | null;
  status: string;
  tenggat: string | null;
  selesai_pada: string | null;
  pj_nama?: string | null;
  sisaHari: number | null;
  lewatTenggat: boolean;
};

type JadwalLaporan = {
  id: string;
  nama: string;
  jenis_laporan?: string | null;
  irama: string;
  hari_ke?: number | null;
  aktif: boolean;
  terakhir_dikirim: string | null;
  gagal_berturut?: number | string | null;
  galat_terakhir?: string | null;
  umurKirimHari: number | null;
  macet: boolean;
};

type Data = {
  tanggal: string;
  gambar: { gambar: Gambar[]; total: number; jumlahJudul: number; usang: number; gantungTanpaPengganti: number };
  transmittal: { transmittal: Transmittal[]; terkirim: number; diterima: number; menggantung: number; rasioDiterima: number | null };
  notulen: Array<{ id: string; nomor: string; judul: string; tanggal: string; jenis: string; status: string }>;
  tindakan: { tindakan: Tindakan[]; terbuka: number; selesai: number; lewatTenggat: number; tanpaTenggat: number; persenSelesai: number | null };
  distribusi: Array<{ id: string; jenis_dokumen: string; penerima_nama: string; penerima_email: string | null; organisasi: string | null; peran: string; aktif: boolean }>;
  jadwalLaporan: { jadwal: JadwalLaporan[]; aktif: number; macet: number };
};

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const kartu: React.CSSProperties = {
  background: "var(--surface)",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  boxShadow: "var(--naik-1)",
};

/** Satu angka besar dengan penjelasannya. Lapis 1 pola ARAH-VISUAL §5b. */
function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string; keterangan?: string; warna?: string;
}) {
  return (
    <div style={{ ...kartu, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, marginTop: 4,
        color: warna ?? C.text, fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      {keterangan && (
        <div style={{ fontSize: 12, color: C.mid, marginTop: 2, lineHeight: 1.4 }}>{keterangan}</div>
      )}
    </div>
  );
}

/** Banner peringatan yang menuntut tindakan. Lapis 2. */
function Peringatan({ ikon, judul, isi, nada }: {
  ikon: React.ReactNode; judul: string; isi: React.ReactNode; nada: "danger" | "warning";
}) {
  return (
    <div className="rise rise-3" style={{
      ...kartu, padding: "12px 16px", marginBottom: 12,
      borderColor: `var(--${nada}-border)`, background: `var(--${nada}-bg)`,
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{ color: `var(--${nada})`, flexShrink: 0, marginTop: 1, display: "flex" }}>
        {ikon}
      </span>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        <strong style={{ color: `var(--${nada})` }}>{judul}</strong>
        <div style={{ marginTop: 2, color: C.mid }}>{isi}</div>
      </div>
    </div>
  );
}

// Nilai sah untuk `?bagian=`. Empat modul di halaman ini.
const BAGIAN = ["gambar", "transmittal", "notulen", "jadwal"] as const;
type Bagian = (typeof BAGIAN)[number];

/**
 * `useTabUrl` memakai `useSearchParams`, yang memaksa render sisi klien —
 * Next menuntut batas Suspense untuk itu.
 */
export default function KendaliDokumenPage() {
  return (
    <Suspense fallback={null}>
      <IsiKendaliDokumen />
    </Suspense>
  );
}

function IsiKendaliDokumen() {
  // Modul yang terbuka hidup di URL, supaya menu sidebar bisa menunjuknya:
  // "Notulen Rapat" -> ?bagian=notulen, bukan mendarat di puncak halaman.
  const [bagian, setBagian] = useTabUrl<Bagian>(BAGIAN, "gambar", "bagian");
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat putaran yang datanya sudah tiba, bukan bendera
  // boolean yang dinyalakan di badan efek — bendera memicu render bertingkat.
  const [putaranTiba, setPutaranTiba] = useState(-1);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<Data>("/api/v1/kendali-dokumen", { signal: ac.signal })
      .then((r) => { setData(r.data); setGalat(""); })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat kendali dokumen"); })
      .finally(() => { if (!ac.signal.aborted) setPutaranTiba(muatUlangKe); });
    return () => ac.abort();
  }, [muatUlangKe]);

  const memuat = putaranTiba !== muatUlangKe;
  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);

  const kolomGambar: Array<Kolom<Gambar>> = useMemo(() => [
    {
      kunci: "nomor", judul: "Nomor", kepalaBaris: true,
      render: (g) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{g.nomor}</span>
          {g.judul && <span style={{ display: "block", fontSize: 11, color: C.muted }}>{g.judul}</span>}
        </span>
      ),
    },
    {
      kunci: "disiplin", judul: "Disiplin",
      render: (g) => <span style={{ fontSize: 12, color: C.mid, textTransform: "capitalize" }}>{g.disiplin ?? "—"}</span>,
    },
    {
      kunci: "revisi", judul: "Revisi", rata: "kanan",
      render: (g) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: C.text, fontWeight: 600 }}>
          {String(g.revisi)}
          {g.revisiTertinggi > Number(g.revisi) && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.mid }}>
              terbaru: rev {g.revisiTertinggi}
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "tahap", judul: "Tahap",
      render: (g) => <span style={{ fontSize: 12, color: C.mid }}>{g.tahap ?? "—"}</span>,
    },
    {
      kunci: "berlaku", judul: "Berlaku?",
      render: (g) =>
        // Bukan sekadar mengulang kolom `status`: gambar rev-1 berstatus
        // 'berlaku' yang sudah punya rev-2 menjawab TIDAK di sini, dan
        // itulah satu-satunya kolom yang mencegah pekerjaan dibongkar.
        g.usang ? (
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
            background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)",
          }}>
            Usang — ada rev {g.revisiTertinggi}
          </span>
        ) : g.status === "berlaku" ? (
          <span style={{ color: "var(--success)", fontWeight: 600 }}>Ya</span>
        ) : (
          <span style={{ fontSize: 12, color: C.mid, textTransform: "capitalize" }}>{g.status}</span>
        ),
    },
    {
      kunci: "terbit", judul: "Terbit", rata: "kanan",
      render: (g) => <span style={{ color: C.mid }}>{tanggalTerbaca(g.tanggal_terbit)}</span>,
    },
  ], []);

  const kolomTransmittal: Array<Kolom<Transmittal>> = useMemo(() => [
    {
      kunci: "nomor", judul: "Nomor", kepalaBaris: true,
      render: (t) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{t.nomor}</span>
          {t.perihal && <span style={{ display: "block", fontSize: 11, color: C.muted }}>{t.perihal}</span>}
        </span>
      ),
    },
    {
      kunci: "tujuan", judul: "Kepada",
      render: (t) => (
        <span>
          <span style={{ fontSize: 13, color: C.text }}>{t.tujuan_nama ?? "—"}</span>
          {t.tujuan_organisasi && (
            <span style={{ display: "block", fontSize: 11, color: C.muted }}>{t.tujuan_organisasi}</span>
          )}
        </span>
      ),
    },
    {
      kunci: "kirim", judul: "Dikirim", rata: "kanan",
      render: (t) => <span style={{ color: C.mid }}>{tanggalTerbaca(t.dikirim_pada)}</span>,
    },
    {
      kunci: "terima", judul: "Dikonfirmasi terima", rata: "kanan",
      render: (t) =>
        // "Sudah saya kirim" dan "sudah saya terima" adalah dua klaim
        // berbeda. Kolom ini menampilkan yang KEDUA, dan hanya itu.
        t.diterima_pada ? (
          <span style={{ color: "var(--success)", fontWeight: 600 }}>
            {tanggalTerbaca(t.diterima_pada)}
            {t.diterima_oleh && (
              <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.mid }}>
                oleh {t.diterima_oleh}
              </span>
            )}
          </span>
        ) : t.menggantung ? (
          <span style={{ color: "var(--danger)", fontWeight: 600, whiteSpace: "nowrap" }}>
            belum — {t.umurHari} hari
          </span>
        ) : (
          <span style={{ color: C.muted }}>belum</span>
        ),
    },
  ], []);

  const kolomTindakan: Array<Kolom<Tindakan>> = useMemo(() => [
    {
      kunci: "uraian", judul: "Butir tindakan", kepalaBaris: true,
      render: (t) => <span style={{ color: C.text }}>{t.uraian ?? "—"}</span>,
    },
    {
      kunci: "pj", judul: "Penanggung jawab",
      render: (t) => <span style={{ fontSize: 12, color: C.mid }}>{t.pj_nama ?? "—"}</span>,
    },
    {
      kunci: "tenggat", judul: "Tenggat", rata: "kanan",
      render: (t) => {
        if (!t.tenggat) {
          // Butir tanpa tenggat tak akan pernah muncul sebagai "lewat" —
          // ia hanya mengendap sampai rapat berikutnya membahasnya lagi.
          return t.status === "terbuka"
            ? <span style={{ color: "var(--warning)", fontWeight: 600, fontSize: 12 }}>tanpa tenggat</span>
            : <span style={{ color: C.muted }}>—</span>;
        }
        return (
          <span style={{
            color: t.lewatTenggat ? "var(--danger)" : C.mid,
            fontWeight: t.lewatTenggat ? 600 : 400, whiteSpace: "nowrap",
          }}>
            {tanggalTerbaca(t.tenggat)}
            {t.lewatTenggat && (
              <span style={{ display: "block", fontSize: 11 }}>
                lewat {Math.abs(t.sisaHari ?? 0)} hari
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "status", judul: "Status",
      render: (t) => {
        const meta = t.status === "selesai"
          ? { label: "Selesai", warna: "var(--success)", bg: "var(--success-bg)" }
          : t.status === "dibatalkan"
            ? { label: "Dibatalkan", warna: "var(--text-secondary)", bg: "var(--surface-subtle)" }
            : { label: "Terbuka", warna: "var(--info)", bg: "var(--info-bg)" };
        return (
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            color: meta.warna, background: meta.bg, whiteSpace: "nowrap",
          }}>
            {meta.label}
          </span>
        );
      },
    },
  ], []);

  const kolomJadwal: Array<Kolom<JadwalLaporan>> = useMemo(() => [
    {
      kunci: "nama", judul: "Laporan", kepalaBaris: true,
      render: (j) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{j.nama}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "capitalize" }}>
            {j.irama}
          </span>
        </span>
      ),
    },
    {
      kunci: "terakhir", judul: "Terakhir terkirim", rata: "kanan",
      render: (j) => (
        <span style={{ color: j.macet ? "var(--danger)" : C.mid, fontWeight: j.macet ? 600 : 400 }}>
          {tanggalTerbaca(j.terakhir_dikirim)}
          {j.umurKirimHari != null && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 400 }}>
              {j.umurKirimHari} hari lalu
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "keadaan", judul: "Keadaan",
      render: (j) =>
        !j.aktif ? (
          <span style={{ fontSize: 12, color: C.muted }}>dinonaktifkan</span>
        ) : j.macet ? (
          <span>
            <span style={{
              padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: "var(--danger-bg)", color: "var(--danger)", whiteSpace: "nowrap",
            }}>
              Macet
            </span>
            {j.galat_terakhir && (
              <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 3 }}>
                {j.galat_terakhir}
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: "var(--success)", fontWeight: 600, fontSize: 12 }}>berjalan</span>
        ),
    },
  ], []);

  const kosongSeluruhnya =
    !data ||
    (data.gambar.total === 0 &&
      data.transmittal.transmittal.length === 0 &&
      data.notulen.length === 0 &&
      data.jadwalLaporan.jadwal.length === 0);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            Kendali Dokumen
          </h2>
          <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
            Gambar revisi berapa yang <strong>berlaku sekarang</strong>, siapa sudah
            menerimanya, dan butir rapat mana yang belum dikerjakan. Gambar yang
            statusnya masih hijau tapi sudah ada revisi lebih baru ditandai usang —
            itulah yang membuat pekerjaan dibongkar.
          </p>
        </div>
        <button
          type="button"
          onClick={muatUlang}
          disabled={memuat}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, cursor: memuat ? "default" : "pointer", opacity: memuat ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Muat ulang
        </button>
      </div>

      {galat && (
        <div role="alert" style={{
          ...kartu, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat kendali dokumen…
        </div>
      ) : kosongSeluruhnya ? (
        <Kosong
          ikon={<FileStack size={28} />}
          judul="Belum ada dokumen terkendali"
          sebab={
            <>
              Register gambar mencatat revisi mana yang berlaku; transmittal
              mencatat siapa sudah menerimanya. Keduanya yang ditanyakan saat
              pekerjaan harus dibongkar karena dikerjakan dari gambar lama — dan
              jawabannya menentukan siapa yang menanggung biayanya.
            </>
          }
        />
      ) : (
        <>
          {/* Lapis 1 — keadaan */}
          <div className="rise rise-2" style={{
            display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
          }}>
            <Kpi
              label="Gambar usang"
              nilai={String(data.gambar.usang)}
              warna={data.gambar.usang > 0 ? "var(--danger)" : "var(--success)"}
              keterangan={`dari ${data.gambar.jumlahJudul} judul gambar`}
            />
            <Kpi
              label="Transmittal menggantung"
              nilai={String(data.transmittal.menggantung)}
              warna={data.transmittal.menggantung > 0 ? "var(--danger)" : undefined}
              keterangan={
                data.transmittal.rasioDiterima != null
                  ? `${data.transmittal.rasioDiterima}% dari kiriman dikonfirmasi`
                  : "belum ada yang dikirim"
              }
            />
            <Kpi
              label="Butir rapat lewat tenggat"
              nilai={String(data.tindakan.lewatTenggat)}
              warna={data.tindakan.lewatTenggat > 0 ? "var(--warning)" : undefined}
              keterangan={
                data.tindakan.persenSelesai != null
                  ? `${data.tindakan.persenSelesai}% butir sudah selesai`
                  : "belum ada butir tindakan"
              }
            />
            <Kpi
              label="Jadwal laporan macet"
              nilai={String(data.jadwalLaporan.macet)}
              warna={data.jadwalLaporan.macet > 0 ? "var(--danger)" : undefined}
              keterangan={`dari ${data.jadwalLaporan.aktif} jadwal aktif`}
            />
          </div>

          {/* Lapis 2 — pola & peringatan */}
          {data.gambar.usang > 0 && (
            <Peringatan
              nada="danger"
              ikon={<TriangleAlert size={16} aria-hidden="true" />}
              judul={`${data.gambar.usang} gambar berstatus "berlaku" padahal sudah ada revisi lebih baru`}
              isi={
                <>
                  Kolom status hanya benar kalau ada yang ingat memperbaruinya saat
                  revisi baru terbit. Yang membacanya bisa mengerjakan gambar lama,
                  dan pekerjaannya dibongkar — biayanya ditentukan siapa yang punya
                  bukti pengiriman revisi.
                </>
              }
            />
          )}

          {data.transmittal.menggantung > 0 && (
            <Peringatan
              nada="danger"
              ikon={<Send size={16} aria-hidden="true" />}
              judul={`${data.transmittal.menggantung} transmittal terkirim tanpa konfirmasi terima lebih dari sepekan`}
              isi={
                <>
                  &ldquo;Sudah saya kirim&rdquo; dan &ldquo;sudah saya terima&rdquo;
                  adalah dua klaim berbeda. Selisihnya persis yang diperdebatkan saat
                  pekerjaan salah gambar harus dibongkar — dan yang tak punya
                  konfirmasi terima berada di posisi lemah.
                </>
              }
            />
          )}

          {data.tindakan.tanpaTenggat > 0 && (
            <Peringatan
              nada="warning"
              ikon={<ListChecks size={16} aria-hidden="true" />}
              judul={`${data.tindakan.tanpaTenggat} butir rapat terbuka TANPA tenggat`}
              isi={
                <>
                  Butir tanpa tenggat tak akan pernah muncul sebagai
                  &ldquo;lewat tenggat&rdquo; — ia hanya mengendap, dan rapat
                  berikutnya membahas hal yang sama. Beri tenggat, atau tutup butirnya.
                </>
              }
            />
          )}

          {data.jadwalLaporan.macet > 0 && (
            <Peringatan
              nada="danger"
              ikon={<MailWarning size={16} aria-hidden="true" />}
              judul={`${data.jadwalLaporan.macet} jadwal laporan berhenti terkirim`}
              isi={
                <>
                  Tak ada yang mengeluh soal surel yang tak datang — sampai ada yang
                  menanyakan angka yang seharusnya sudah dibaca berminggu-minggu lalu.
                  Jadwal ditandai macet bila gagal 3 kali berturut, ATAU terlambat
                  lebih dari dua kali iramanya sendiri meski nol galat tercatat.
                </>
              }
            />
          )}

          {/* Lapis 3 — detail, dipisah per modul.
              Empat modul ini SALING DIBACA BERSAMA (transmittal merujuk
              register gambar), jadi ia tetap satu halaman — tapi tiap modul
              kini punya alamatnya sendiri (`?bagian=transmittal`), supaya
              menu sidebar bisa menunjuknya. */}
          <TabBagian
            label="Modul kendali dokumen"
            aktif={bagian}
            onPilih={setBagian}
            bagian={[
              { kunci: "gambar", label: "Register Gambar", jumlah: data.gambar.usang, mendesak: true },
              { kunci: "transmittal", label: "Transmittal", jumlah: data.transmittal.menggantung, mendesak: true },
              { kunci: "notulen", label: "Notulen Rapat", jumlah: data.tindakan.tanpaTenggat, mendesak: true },
              { kunci: "jadwal", label: "Laporan Terjadwal", jumlah: data.jadwalLaporan.macet, mendesak: true },
            ] as const}
          />
          {bagian === "gambar" && data.gambar.total > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Register gambar
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Satu nomor bisa punya banyak revisi. Yang menentukan berlaku-tidaknya
                  revisi TERTINGGI, bukan kolom status.
                </p>
              </div>
              <Tabel
                caption="Register gambar beserta revisi, tahap, dan apakah masih berlaku"
                kolom={kolomGambar}
                data={data.gambar.gambar}
                kunciBaris={(g) => g.id}
                tandaiBaris={(g) => (g.usang ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}

          {bagian === "transmittal" && data.transmittal.transmittal.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Transmittal
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Bukti kirim dan bukti terima dicatat terpisah — keduanya klaim berbeda.
                </p>
              </div>
              <Tabel
                caption="Daftar transmittal beserta tanggal kirim dan konfirmasi terimanya"
                kolom={kolomTransmittal}
                data={data.transmittal.transmittal}
                kunciBaris={(t) => t.id}
                tandaiBaris={(t) => (t.menggantung ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}

          {bagian === "notulen" && data.tindakan.tindakan.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Butir tindakan rapat
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Inilah yang membuat notulen berguna — bukan ringkasan pembicaraannya.
                </p>
              </div>
              <Tabel
                caption="Butir tindakan dari notulen rapat beserta penanggung jawab dan tenggatnya"
                kolom={kolomTindakan}
                data={data.tindakan.tindakan}
                kunciBaris={(t) => t.id}
                tandaiBaris={(t) => (t.lewatTenggat ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}

          {bagian === "jadwal" && data.jadwalLaporan.jadwal.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Distribusi laporan terjadwal
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Yang berhenti terkirim ditandai — bukan menunggu ada yang menanyakan.
                </p>
              </div>
              <Tabel
                caption="Jadwal distribusi laporan beserta waktu terakhir terkirim dan keadaannya"
                kolom={kolomJadwal}
                data={data.jadwalLaporan.jadwal}
                kunciBaris={(j) => j.id}
                tandaiBaris={(j) => (j.macet ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
