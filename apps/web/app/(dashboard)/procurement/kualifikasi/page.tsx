"use client";

/**
 * PRAKUALIFIKASI & EVALUASI KINERJA VENDOR (TUNDA kelompok A)
 *
 * ── Yang dijawab halaman ini
 *
 * "Vendor mana yang boleh diundang tender, dan mana yang sudah terbukti
 * mengecewakan?"
 *
 * ── Tiga hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Vendor "lolos" yang izinnya sudah mati.** Statusnya hijau, SIUJK-nya
 *    habis Maret lalu. Yang membacanya akan mengundangnya tender, lalu
 *    penawarannya gugur di meja panitia — dan tak ada satu pun kolom yang
 *    berteriak sebelum itu terjadi.
 *
 * 2. **Rata-rata yang menyembunyikan satu dimensi nol.** Vendor dengan mutu
 *    100 dan ketepatan waktu 0 punya rata-rata yang sama dengan vendor
 *    serba-75. Padahal yang pertama TIDAK PERNAH tepat waktu.
 *
 * 3. **Daftar hitam yang tenggelam di antara skor rendah.** Skor 46 karena
 *    sekali telat berbeda dari 46 karena mengirim barang palsu lalu menolak
 *    retur.
 *
 * Ketiganya dikunci di `apps/api/src/lib/vendor-penilaian.ts` — 14 test,
 * 4 mutasi tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Tata letak: tiga lapis (ARAH-VISUAL §5b)
 *
 * KEADAAN (4 KPI) → POLA (sebaran skor) → DETAIL (tabel). Urutannya mengikuti
 * pertanyaan yang dibawa orang saat membuka halaman; menaruh tabel di atas
 * memaksa memindai 40 baris untuk hal yang bisa dijawab satu angka.
 */

import { useCallback, useMemo } from "react";
import { ShieldCheck, RefreshCw, TriangleAlert, Ban, Clock } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type Peringatan =
  | "dokumen_kedaluwarsa" | "dokumen_segera_habis"
  | "prakualifikasi_kedaluwarsa" | "ada_titik_lemah" | "daftar_hitam";

type StatusPrakualifikasi = "draft" | "lolos" | "ditolak" | "kedaluwarsa";

type Dokumen = {
  jenis: string;
  nomor: string | null;
  berlaku_sampai: string | null;
  terverifikasi: boolean | null;
};

type NilaiPrakualifikasi = {
  skor: number;
  status: StatusPrakualifikasi;
  dokumenKedaluwarsa: Dokumen[];
  dokumenSegeraHabis: Dokumen[];
  peringatan: Peringatan[];
  bolehDiundang: boolean;
};

type Prakualifikasi = {
  id: string;
  tanggal: string | null;
  berlaku_sampai: string | null;
  status: StatusPrakualifikasi;
  catatan: string | null;
  alasan_tolak: string | null;
  vendor: { id: string; name: string; city: string | null } | null;
  dokumen: Dokumen[];
  nilai: NilaiPrakualifikasi;
};

type NilaiEvaluasi = {
  skor: number;
  rataPolos: number;
  titikLemah: string[];
  peringatan: Peringatan[];
  bolehDipakai: boolean;
};

type Evaluasi = {
  id: string;
  periode: string | null;
  catatan: string | null;
  masuk_daftar_hitam: boolean;
  alasan_daftar_hitam: string | null;
  vendor: { id: string; name: string } | null;
  po: { id: string; po_number: string } | null;
  nilai: NilaiEvaluasi;
};

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const STATUS_META: Record<StatusPrakualifikasi, { label: string; warna: string; bg: string; border: string }> = {
  draft:       { label: "Draft",       warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  lolos:       { label: "Lolos",       warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  ditolak:     { label: "Ditolak",     warna: "var(--danger)",  bg: "var(--danger-bg)",  border: "var(--danger-border)" },
  kedaluwarsa: { label: "Kedaluwarsa", warna: "var(--warning)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
};

const LABEL_DIMENSI: Record<string, string> = {
  mutu: "mutu", waktu: "ketepatan waktu", harga: "harga", layanan: "layanan",
};


/** Satu angka besar dengan penjelasannya. Lapis 1 pola ARAH-VISUAL §5b. */
function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string; keterangan?: string; warna?: string;
}) {
  return (
    <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
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

/** Batang skor 0–100. Warnanya mengikuti nilai, KATA-nya tetap angka. */
function BatangSkor({ skor, warna }: { skor: number; warna: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 92 }}>
      <span style={{
        width: 44, height: 5, borderRadius: 6, background: "var(--surface-subtle)",
        overflow: "hidden", flexShrink: 0,
      }}>
        <span style={{
          display: "block", height: "100%", borderRadius: 6,
          width: `${Math.max(0, Math.min(100, skor))}%`, background: warna,
        }} />
      </span>
      <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{skor}</span>
    </span>
  );
}

export default function KualifikasiVendorPage() {
  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan pasangan useEffect+useState+AbortController dan
    penghitung "putaran tiba" — dipanggil dua kali, satu per URL.
  */
  const { data: dataPra, memuat: memuatPra, galat: galatPra, muatUlang: muatUlangPra } =
    useData<{ prakualifikasi: Prakualifikasi[] }>("/api/v1/vendor-kualifikasi");
  const { data: dataEval, memuat: memuatEval, galat: galatEval, muatUlang: muatUlangEval } =
    useData<{ evaluasi: Evaluasi[] }>("/api/v1/vendor-kualifikasi/evaluasi");

  const memuat = memuatPra || memuatEval;
  const galat = (galatPra || galatEval) ? "Gagal memuat kualifikasi vendor" : "";
  const muatUlang = useCallback(() => { void muatUlangPra(); void muatUlangEval(); }, [muatUlangPra, muatUlangEval]);

  // Diturunkan, bukan disalin. Dibungkus `useMemo` — `?? []` inline melahirkan
  // larik baru tiap render, dan `useMemo` di bawah yang membacanya tak pernah
  // berhenti menghitung ulang (react-hooks/exhaustive-deps).
  const prakualifikasi = useMemo(() => dataPra?.prakualifikasi ?? [], [dataPra]);
  const evaluasi = useMemo(() => dataEval?.evaluasi ?? [], [dataEval]);

  const ringkas = useMemo(() => {
    const bolehDiundang = prakualifikasi.filter((p) => p.nilai.bolehDiundang).length;
    // "Lolos tapi izin mati" — angka yang paling perlu dilihat, dan yang
    // paling mudah tak pernah dihitung siapa pun.
    const lolosTapiMati = prakualifikasi.filter(
      (p) => p.status === "lolos" && !p.nilai.bolehDiundang).length;
    const segeraHabis = prakualifikasi.filter(
      (p) => p.nilai.peringatan.includes("dokumen_segera_habis")).length;
    const daftarHitam = evaluasi.filter((e) => e.masuk_daftar_hitam).length;
    return { bolehDiundang, lolosTapiMati, segeraHabis, daftarHitam };
  }, [prakualifikasi, evaluasi]);

  const kolomPra: Array<Kolom<Prakualifikasi>> = useMemo(() => [
    {
      kunci: "vendor", judul: "Vendor", kepalaBaris: true,
      render: (p) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{p.vendor?.name ?? "—"}</span>
          {p.vendor?.city && (
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>{p.vendor.city}</span>
          )}
        </span>
      ),
    },
    {
      kunci: "skor", judul: "Skor", rata: "kanan",
      render: (p) => (
        <BatangSkor
          skor={p.nilai.skor}
          warna={p.nilai.skor >= 70 ? "var(--success)" : p.nilai.skor >= 50 ? "var(--warning)" : "var(--danger)"}
        />
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (p) => (
        <span style={{
          padding: "2px 8px", borderRadius: 20, fontSize: "var(--t-kecil)", fontWeight: 600, whiteSpace: "nowrap",
          color: STATUS_META[p.nilai.status].warna,
          background: STATUS_META[p.nilai.status].bg,
        }}>
          {STATUS_META[p.nilai.status].label}
        </span>
      ),
    },
    {
      kunci: "undang", judul: "Boleh diundang?",
      render: (p) =>
        // Bukan sekadar mengulang status: vendor "lolos" dengan izin mati
        // menjawab TIDAK di sini, dan itulah satu-satunya kolom yang
        // menyelamatkan penawaran dari gugur di meja panitia.
        p.nilai.bolehDiundang ? (
          <span style={{ color: "var(--success)", fontWeight: 600 }}>Ya</span>
        ) : (
          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
            Tidak
            {p.nilai.dokumenKedaluwarsa.length > 0 && (
              <span style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 400, color: C.mid }}>
                {p.nilai.dokumenKedaluwarsa.map((d) => d.jenis.toUpperCase()).join(", ")} kedaluwarsa
              </span>
            )}
          </span>
        ),
    },
    {
      kunci: "berlaku", judul: "Berlaku sampai", rata: "kanan",
      render: (p) => <span style={{ color: C.mid }}>{tanggalTerbaca(p.berlaku_sampai)}</span>,
    },
    {
      kunci: "dokumen", judul: "Dokumen", rata: "kanan",
      render: (p) => <span style={{ color: C.mid }}>{p.dokumen?.length ?? 0}</span>,
    },
  ], []);

  const kolomEval: Array<Kolom<Evaluasi>> = useMemo(() => [
    {
      kunci: "vendor", judul: "Vendor", kepalaBaris: true,
      render: (e) => <span style={{ fontWeight: 600, color: C.text }}>{e.vendor?.name ?? "—"}</span>,
    },
    {
      kunci: "skor", judul: "Skor berbobot", rata: "kanan",
      render: (e) => (
        <BatangSkor
          skor={e.nilai.skor}
          warna={!e.nilai.bolehDipakai ? "var(--danger)"
            : e.nilai.skor >= 70 ? "var(--success)"
            : e.nilai.skor >= 50 ? "var(--warning)" : "var(--danger)"}
        />
      ),
    },
    {
      kunci: "rata", judul: "Rata polos", rata: "kanan",
      // Ditampilkan BERSANDINGAN dengan skor berbobot supaya selisihnya
      // terlihat. Rata-rata yang jauh lebih tinggi berarti bobotnya sedang
      // menahan sesuatu.
      render: (e) => <span style={{ color: C.muted }}>{e.nilai.rataPolos}</span>,
    },
    {
      kunci: "lemah", judul: "Titik lemah",
      render: (e) => e.nilai.titikLemah.length === 0
        ? <span style={{ color: C.muted }}>—</span>
        : (
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {e.nilai.titikLemah.map((t) => (
              <span key={t} style={{
                padding: "1px 7px", borderRadius: 20, fontSize: "var(--t-mikro)", fontWeight: 600,
                background: "var(--warning-bg)", color: "var(--warning)", whiteSpace: "nowrap",
              }}>{LABEL_DIMENSI[t] ?? t}</span>
            ))}
          </span>
        ),
    },
    {
      kunci: "pakai", judul: "Boleh dipakai?",
      render: (e) => e.nilai.bolehDipakai
        ? <span style={{ color: "var(--success)", fontWeight: 600 }}>Ya</span>
        : (
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: "var(--t-kecil)", fontWeight: 700,
            background: "var(--danger-bg)", color: "var(--danger)",
            border: "1px solid var(--danger-border)", whiteSpace: "nowrap",
          }}>Daftar hitam</span>
        ),
    },
    {
      kunci: "catatan", judul: "Catatan",
      render: (e) => {
        const teks = e.alasan_daftar_hitam ?? e.catatan;
        return teks
          ? <span style={{ fontSize: 12, color: C.mid }}>{teks}</span>
          : <span style={{ color: C.muted }}>—</span>;
      },
    },
  ], []);

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
          Kualifikasi Vendor
        </h2>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Siapa yang <strong>boleh diundang tender</strong>, dan siapa yang sudah
          terbukti mengecewakan. Status &ldquo;lolos&rdquo; saja tak cukup — vendor dengan
          izin yang sudah mati akan gugur di meja panitia, dan itu baru ketahuan
          setelah penawaran dikirim.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          ...GAYA_KARTU, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat kualifikasi vendor…
        </div>
      ) : prakualifikasi.length === 0 && evaluasi.length === 0 ? (
        <Kosong
          ikon={<ShieldCheck size={28} />}
          judul="Belum ada penilaian vendor"
          sebab={
            <>
              Prakualifikasi mencatat siapa yang berhak diundang tender beserta
              masa berlaku izinnya; evaluasi mencatat bagaimana kinerjanya sesudah
              pekerjaan selesai. Keduanya yang ditanyakan saat pemilihan vendor
              dipersoalkan.
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
              label="Boleh diundang"
              nilai={String(ringkas.bolehDiundang)}
              keterangan={`dari ${prakualifikasi.length} vendor dinilai`}
              warna="var(--success)"
            />
            <Kpi
              label="Lolos tapi izin mati"
              nilai={String(ringkas.lolosTapiMati)}
              warna={ringkas.lolosTapiMati > 0 ? "var(--danger)" : undefined}
              keterangan={
                ringkas.lolosTapiMati > 0
                  ? "status hijau, dokumen kedaluwarsa"
                  : "tak ada yang tersembunyi"
              }
            />
            <Kpi
              label="Izin segera habis"
              nilai={String(ringkas.segeraHabis)}
              warna={ringkas.segeraHabis > 0 ? "var(--warning)" : undefined}
              keterangan="dalam 60 hari — masih bisa diurus"
            />
            <Kpi
              label="Daftar hitam"
              nilai={String(ringkas.daftarHitam)}
              warna={ringkas.daftarHitam > 0 ? "var(--danger)" : undefined}
              keterangan="tak boleh dipakai lagi"
            />
          </div>

          {/* Peringatan yang menuntut tindakan */}
          {ringkas.lolosTapiMati > 0 && (
            <div className="rise rise-3" style={{
              ...GAYA_KARTU, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <TriangleAlert size={16} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--danger)" }}>
                  {ringkas.lolosTapiMati} vendor berstatus lolos, tapi dokumennya sudah kedaluwarsa
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Mengundangnya tender berarti penawaran gugur di meja panitia — dan
                  itu baru ketahuan setelah berkas dikirim. Perbarui izinnya, atau
                  ubah statusnya.
                </div>
              </div>
            </div>
          )}

          {ringkas.segeraHabis > 0 && (
            <div className="rise rise-3" style={{
              ...GAYA_KARTU, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Clock size={16} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--warning)" }}>
                  {ringkas.segeraHabis} vendor izinnya habis dalam 60 hari
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Masih cukup waktu untuk mengurus perpanjangan. Itulah gunanya
                  peringatan ini datang sekarang, bukan saat sudah lewat.
                </div>
              </div>
            </div>
          )}

          {ringkas.daftarHitam > 0 && (
            <div className="rise rise-3" style={{
              ...GAYA_KARTU, padding: "12px 16px", marginBottom: "var(--gap-bagian)",
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Ban size={16} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--danger)" }}>
                  {ringkas.daftarHitam} vendor masuk daftar hitam
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Berbeda dari sekadar skor rendah: ini keputusan yang menutup pintu,
                  dan alasannya tercatat di tabel evaluasi di bawah.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              type="button" onClick={muatUlang}
              style={{
                padding: "8px 12px", borderRadius: 6,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.mid, fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <RefreshCw size={12} aria-hidden="true" /> Muat ulang
            </button>
          </div>

          {/* Lapis 3 — detail */}
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
            Prakualifikasi
          </h3>
          <div className="rise rise-4" style={{ ...GAYA_KARTU, padding: "4px 4px 0", overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
            <Tabel<Prakualifikasi>
              caption="Prakualifikasi vendor: skor berbobot, status, kelayakan diundang tender, dan masa berlaku dokumen."
              kolom={kolomPra}
              data={prakualifikasi}
              kunciBaris={(p) => p.id}
              tandaiBaris={(p) =>
                p.status === "lolos" && !p.nilai.bolehDiundang ? "var(--danger-bg)" : undefined}
              kosong={
                <Kosong
                  ikon={<ShieldCheck size={26} />}
                  judul="Belum ada prakualifikasi"
                  sebab="Penilaian muncul begitu ada vendor yang diprakualifikasi."
                />
              }
            />
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
            Evaluasi kinerja
          </h3>
          <div className="rise rise-4" style={{ ...GAYA_KARTU, padding: "4px 4px 0", overflow: "hidden" }}>
            <Tabel<Evaluasi>
              caption="Evaluasi kinerja vendor: skor berbobot dibanding rata-rata polos, titik lemah per dimensi, dan status daftar hitam."
              kolom={kolomEval}
              data={evaluasi}
              kunciBaris={(e) => e.id}
              tandaiBaris={(e) => (e.masuk_daftar_hitam ? "var(--danger-bg)" : undefined)}
              kosong={
                <Kosong
                  ikon={<ShieldCheck size={26} />}
                  judul="Belum ada evaluasi"
                  sebab="Penilaian kinerja muncul sesudah pekerjaan vendor selesai dan dinilai."
                />
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
