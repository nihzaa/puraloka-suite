"use client";

/**
 * REGISTER NCR — ketidaksesuaian mutu dengan siklus tutup formal (INTI #7).
 *
 * ── Yang membuat layar ini berbeda dari punch list
 *
 * Punch list menampilkan cacat dan status perbaikannya. NCR menampilkan
 * ketidaksesuaian dan **keputusan formal atasnya** — disposisi. Itu yang
 * disyaratkan tender pemerintah, dan itu yang menentukan tata letak di sini:
 * kolom disposisi tak bisa disembunyikan di balik klik.
 *
 * ── Urutan bagian
 *
 * 1. Kritis yang belum tertutup — angka yang menentukan apakah proyek boleh
 *    diserahterimakan. Kalau ada, ia yang pertama dibaca.
 * 2. Yang menunggu disposisi — pekerjaan yang tertahan karena belum ada
 *    keputusan. Ini paling sering jadi sumbat: temuan menumpuk sementara
 *    tak ada yang merasa berwenang memutuskan.
 * 3. Register penuh.
 */

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Gavel, Plus, RefreshCw, TriangleAlert, UserPlus, AlertTriangle } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";
import { PilihanKartu } from "@/components/pilihan-kartu";

interface Ncr {
  id: string; nomor: string; judul: string; deskripsi: string | null;
  lokasi: string | null; acuan: string | null;
  severity: "minor" | "major" | "kritis";
  status: "terbuka" | "disposisi" | "perbaikan" | "verifikasi" | "ditutup" | "dibatalkan";
  disposisi: "perbaiki" | "terima" | "bongkar" | "ubah_spek" | null;
  disposisi_catatan: string | null;
  tindakan_perbaikan: string | null;
  akar_masalah: string | null;
  biaya_dampak: number | null;
  target_selesai: string | null;
  pelapor: { id: string; name: string } | null;
  petugas: { id: string; name: string } | null;
  verifikator: { id: string; name: string } | null;
  pemutus: { id: string; name: string } | null;
  created_at: string;
}

interface Meta {
  per_status: Record<string, number>;
  per_severity: Record<string, number>;
  total: number;
  belum_selesai: number;
  kritis_terbuka: number;
  biaya_dampak_total: number;
  rekap_lengkap: boolean;
}

/**
 * Inspeksi yang GAGAL tapi belum punya NCR.
 *
 * Diukur 2026-08-11: `inspection_requests` 24 baris (3 `tidak_lolos`),
 * `ncr_items.inspection_request_id` terisi **0**. Kolomnya ada, API
 * menerimanya, datanya ada di kedua sisi — yang tak ada satu pun cara di
 * layar ini untuk mengirimkannya.
 *
 * Akibatnya: inspeksi yang dinyatakan tidak lolos berhenti di situ. Tak ada
 * yang menugaskan perbaikan, tak ada yang memverifikasi, dan saat auditor
 * bertanya "apa tindak lanjutnya", jawabannya cuma ingatan orang.
 */
interface KandidatNcr {
  inspection_request_id: string;
  nomor_inspeksi: string;
  judul: string;
  deskripsi: string;
  lokasi: string | null;
  rab_item_id: string | null;
  work_scope_id: string | null;
  /** SELALU null — severity tak ditebak mesin, manusia yang memilih. */
  severity: null;
  diperiksa_pada: string | null;
}

interface KandidatResponse {
  kandidat: KandidatNcr[];
  /** Sudah ber-NCR — dihitung supaya daftarnya tak terlihat menyusut. */
  sudah_ber_ncr: number;
  jumlah_diperiksa: number;
  jumlah_inspeksi: number;
}

interface Proyek { id: string; name: string }

const SEVERITY: Record<string, { label: string; warna: string; latar: string; tepi: string }> = {
  minor:  { label: "Minor",  warna: C.mid,          latar: "var(--surface-hover)", tepi: C.border },
  major:  { label: "Major",  warna: C.onWarningBg,  latar: C.yellowBg,             tepi: C.yellowBorder },
  kritis: { label: "Kritis", warna: C.onDangerBg,   latar: C.redBg,                tepi: C.redBorder },
};

const STATUS: Record<string, { label: string; warna: string; latar: string }> = {
  terbuka:    { label: "Terbuka",           warna: C.onDangerBg,  latar: C.redBg },
  disposisi:  { label: "Disposisi",         warna: C.onWarningBg, latar: C.yellowBg },
  perbaikan:  { label: "Perbaikan",         warna: C.onInfoBg,    latar: C.blueBg },
  verifikasi: { label: "Menunggu Verifikasi", warna: C.onInfoBg,  latar: C.blueBg },
  ditutup:    { label: "Ditutup",           warna: C.onSuccessBg, latar: C.greenBg },
  dibatalkan: { label: "Dibatalkan",        warna: C.muted,       latar: "var(--surface-hover)" },
};

const DISPOSISI: Record<string, { label: string; ket: string }> = {
  perbaiki:  { label: "Perbaiki",       ket: "kerjakan ulang sampai sesuai" },
  terima:    { label: "Terima apa adanya", ket: "perusahaan menanggung — wajib beralasan" },
  bongkar:   { label: "Bongkar",        ket: "dibongkar, dikerjakan dari awal" },
  ubah_spek: { label: "Ubah Spesifikasi", ket: "spesifikasinya yang berubah" },
};

const rp = formatRupiah;

/**
 * Tanggal pemeriksaan — aman untuk `timestamptz` MAUPUN `date`.
 *
 * `inspection_requests.diperiksa_pada` bertipe **`timestamptz`**, nilainya
 * "2026-08-04T20:11:25.172Z". Versi pertama panel kandidat menambahkan
 * `"T00:00:00"` — pola yang benar untuk kolom `date` di halaman lain — dan
 * menghasilkan **"Invalid Date"** di layar.
 *
 * Ketahuan dari tangkapan layar, bukan dari test: keduanya lolos TypeScript
 * karena sama-sama `string`.
 *
 * Nilai tak terbaca mengembalikan `null`, bukan "Invalid Date": tanggal yang
 * absen lebih jujur daripada tanggal yang salah.
 */
function tanggalPeriksa(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function NcrInner() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";

  const [buatBaru, setBuatBaru] = useState(false);
  /**
   * Kandidat yang sedang dicatat jadi NCR.
   *
   * Form-nya SAMA dengan "Catat NCR" biasa, hanya terisi lebih dulu dari
   * inspeksinya. Membuat form kedua yang mirip akan membuat dua tempat yang
   * harus dijaga tetap sama — dan yang menyimpang di antara keduanya adalah
   * data mutu yang dipakai dalam sengketa.
   */
  const [dariInspeksi, setDariInspeksi] = useState<KandidatNcr | null>(null);
  const [putuskan, setPutuskan] = useState<Ncr | null>(null);
  /**
   * NCR yang sedang ditugaskan / diisi tindakan korektifnya.
   *
   * Diukur 2026-08-11: `ditugaskan_ke` terisi **0 dari 19** — termasuk enam
   * NCR yang sudah berstatus `perbaikan`. Enam pekerjaan "sedang diperbaiki"
   * tanpa satu pun orang bertanggung jawab.
   *
   * API sudah menerimanya (`PATCH /ncr/:id`) dan bahkan MENGIRIM NOTIFIKASI
   * ke yang ditugaskan (`ncr.ts:322`) — notifikasi yang tak pernah terkirim
   * karena tak ada yang bisa mengisi kolomnya.
   */
  const [tindaki, setTindaki] = useState<Ncr | null>(null);

  const bolehKelola = useSyncExternalStore(
    () => () => {}, () => hasPermission("ncr:manage"), () => false,
  );
  const bolehDisposisi = useSyncExternalStore(
    () => () => {}, () => hasPermission("ncr:disposisi"), () => false,
  );

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Empat `useData`: pengguna (dropdown penugasan, gagal tak menggagalkan
    halaman), proyek (dengan efek redirect terpisah), kandidat (pelengkap,
    per proyekId), dan register NCR (per proyekId). Kandidat dan register
    tetap dimuat BERSAMA — keduanya bergantung `proyekId` yang sama.
  */
  const { data: dataPengguna } =
    useData<{ users: Array<{ id: string; name: string }> }>("/api/v1/users");
  const pengguna = dataPengguna?.users ?? [];

  const { data: dataProyek } = useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  // Pilih proyek pertama kalau URL belum menyebutkan — halaman yang terbuka
  // kosong dengan dropdown yang belum dipilih terbaca sebagai "belum ada
  // data", padahal cuma belum memilih. Efek tersendiri, bergantung `data`.
  useEffect(() => {
    if (!proyekId && dataProyek && dataProyek.projects.length) {
      router.replace(`/mutu/ncr?proyek=${dataProyek.projects[0].id}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataProyek, proyekId]);

  const jalurKandidat = proyekId ? `/api/v1/projects/${proyekId}/ncr/kandidat` : null;
  const { data: kandidat, muatUlang: muatUlangKandidat } =
    useData<KandidatResponse>(jalurKandidat);

  const jalurRegister = proyekId ? `/api/v1/projects/${proyekId}/ncr` : null;
  const { data: dataRegister, memuat, galat: galatMuat, muatUlang: muatUlangRegister } =
    useData<{ data: Ncr[]; meta: Meta }>(jalurRegister);
  const data = dataRegister?.data ?? [];
  const meta = dataRegister?.meta ?? null;
  const galat = galatMuat ? "Gagal memuat register NCR." : null;

  const muat = () => Promise.all([muatUlangKandidat(), muatUlangRegister()]);

  const menungguDisposisi = data.filter((n) => n.status === "terbuka");

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", marginBottom: 18, flexWrap: "wrap",
      }}>
        <div>
          <KepalaHalaman judul="Register NCR"         ikon={<AlertTriangle size={19} />}
      /><p style={{ fontSize: 13, color: C.mid, maxWidth: 640 }}>
            Ketidaksesuaian terhadap spesifikasi, gambar, atau standar — beserta
            keputusan formal atasnya. Berbeda dari punch list: NCR menuntut
            <strong> disposisi</strong> dan <strong>akar masalah</strong> sebelum bisa ditutup.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            aria-label="Pilih proyek"
            value={proyekId}
            onChange={(e) => router.replace(`/mutu/ncr?proyek=${e.target.value}`, { scroll: false })}
            style={{
              padding: "8px 12px", fontSize: 13, borderRadius: 6,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, outline: "none", minWidth: 190,
            }}>
            {/* Dulu selalu berbunyi "— memuat proyek —", termasuk setelah
                pemuatan selesai dan hasilnya memang kosong. Orang akan
                menunggu daftar yang tak akan pernah datang. */}
            {proyek.length === 0 && (
              <option value="">
                {memuat ? "Memuat proyek…" : "Tak ada proyek"}
              </option>
            )}
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => muat()} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6,
            background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Muat ulang
          </button>
          {bolehKelola && proyekId && (
            <button onClick={() => setBuatBaru(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              border: "none", borderRadius: 6, background: "var(--grad-aksen)",
              color: "var(--on-aksen)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={14} aria-hidden="true" /> Catat NCR
            </button>
          )}
        </div>
      </div>

      {/* ── Empat angka ── */}
      {meta && (
        <div className="rise rise-2" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8, marginBottom: 16,
        }}>
          {[
            { l: "Belum Selesai", v: `${meta.belum_selesai}`, s: "dari " + meta.total + " total",
              w: meta.belum_selesai ? C.yellow : C.green, t: meta.belum_selesai ? C.yellowBorder : C.greenBorder },
            { l: "Kritis Terbuka", v: `${meta.kritis_terbuka}`,
              s: meta.kritis_terbuka ? "menghalangi serah terima" : "aman untuk serah terima",
              w: meta.kritis_terbuka ? C.red : C.green, t: meta.kritis_terbuka ? C.redBorder : C.greenBorder },
            { l: "Menunggu Disposisi", v: `${menungguDisposisi.length}`, s: "belum diputuskan",
              w: menungguDisposisi.length ? C.navy : C.mid, t: undefined },
            { l: "Biaya Dampak", v: meta.biaya_dampak_total ? rp(meta.biaya_dampak_total) : "—",
              s: "tercatat sejauh ini", w: C.mid, t: undefined },
          ].map((k) => (
            <div key={k.l} style={{
              background: "var(--surface)", border: `1px solid ${k.t ?? C.border}`,
              borderRadius: 10, padding: "12px 16px",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
                textTransform: "uppercase", color: C.muted, marginBottom: 6,
              }}>{k.l}</div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "var(--teks-kpi)", fontWeight: 700,
                color: k.w, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
              }}>{k.v}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.s}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Inspeksi gagal yang belum ditindaklanjuti ──────────────────
          Ini mata rantai yang selama ini hilang: `ncr_items` punya kolom
          `inspection_request_id`, API menerimanya, tapi 0 dari 18 NCR
          terisi karena layar ini tak punya cara mengirimkannya.

          Ditaruh DI ATAS register: inspeksi yang gagal dan tak
          ditindaklanjuti lebih mendesak daripada membaca ulang NCR yang
          sudah tercatat. */}
      {kandidat && kandidat.kandidat.length > 0 && (
        <section
          aria-labelledby="judul-kandidat"
          style={{
            padding: "12px var(--pad-kartu-lega)", borderRadius: 10, marginBottom: 14,
            background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
          }}
        >
          <h2 id="judul-kandidat" style={{
            fontSize: 13, fontWeight: 700, color: C.onWarningBg, margin: 0,
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <TriangleAlert size={14} aria-hidden="true" />
            {kandidat.kandidat.length} inspeksi gagal belum jadi NCR
          </h2>

          <p style={{ fontSize: 12, color: C.onWarningBg, margin: "6px 0 10px", lineHeight: 1.55, maxWidth: "74ch" }}>
            Pemeriksa sudah menyatakan pekerjaan ini <strong>tidak lolos</strong>.
            Selama belum jadi NCR, tak ada yang ditugaskan memperbaiki dan tak ada
            yang memverifikasi.
            {kandidat.sudah_ber_ncr > 0 && (
              <> {kandidat.sudah_ber_ncr} inspeksi gagal lain sudah punya NCR dan tak
              ditampilkan di sini.</>
            )}
          </p>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {kandidat.kandidat.map((k) => (
              <li key={k.inspection_request_id} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "8px 10px", background: "var(--surface)",
                border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5,
              }}>
                <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                  {k.nomor_inspeksi}
                </span>
                <span style={{ color: C.text }}>{k.judul}</span>
                {k.lokasi && (
                  <span style={{ color: C.mid, fontSize: 11 }}>· {k.lokasi}</span>
                )}
                {/* `diperiksa_pada` bertipe `timestamptz`, BUKAN `date` —
                    nilainya "2026-08-04T20:11:25.172Z". Versi pertama
                    menambahkan "T00:00:00" (pola yang benar untuk kolom
                    `date` di halaman lain) dan menghasilkan **"Invalid
                    Date"** di layar.
                    
                    Ketahuan dari tangkapan layar, bukan dari test: keduanya
                    lolos tipe TypeScript karena sama-sama `string`. */}
                {tanggalPeriksa(k.diperiksa_pada) && (
                  <span style={{ color: C.muted, fontSize: 11 }}>
                    diperiksa {tanggalPeriksa(k.diperiksa_pada)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDariInspeksi(k)}
                  style={{
                    marginLeft: "auto", padding: "8px 14px", borderRadius: 6,
                    fontSize: 12, fontWeight: 700, minHeight: 40,
                    border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Catat NCR
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Rekap yang gagal dihitung DITANDAI — angka yang salah di layar mutu
          bisa membuat proyek diserahterimakan padahal belum layak. */}
      {meta && !meta.rekap_lengkap && (
        <div role="alert" style={{
          padding: "8px 12px", borderRadius: 10, marginBottom: 14, fontSize: 12,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, color: C.onWarningBg,
        }}>
          Rekap gagal dihitung — angka di atas mungkin tidak lengkap. Muat ulang halaman.
        </div>
      )}

      {galat && (
        <div role="alert" style={{
          padding: "12px var(--pad-kartu-lega)", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>
          {galat}{" "}
          <button onClick={() => muat()} style={{
            marginLeft: 6, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)", overflow: "hidden",
      }}>
        {memuat ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} aria-hidden="true" style={{
                height: 56, borderRadius: 10,
                background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
              }} />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            <CheckCircle2 size={34} aria-hidden="true" style={{ color: "var(--border)", marginBottom: 12 }} />
            <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
              {galat ? "Register tak bisa dimuat" : "Belum ada ketidaksesuaian tercatat"}
            </p>
            <p>
              {galat ? "Coba muat ulang." : "Itu kabar baik — atau berarti temuan belum dicatat di sini."}
            </p>
          </div>
        ) : (
          /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only, kolom
             pertama <th scope="row">, tabular-nums, dan pembungkus overflow-x
             sekarang dijamin komponen — empat hal yang tabel mentah harus
             ingat sendiri setiap kali, dan yang riwayat repo ini tunjukkan
             TIDAK selalu diingat.

             Kepala baris tetap di kolom NCR, dan itu pilihan sadar: nomor NCR
             yang dibacakan bersama judulnya adalah SATU-SATUNYA hal yang
             membedakan satu ketidaksesuaian dari yang lain. "Kritis" atau
             "Terbuka" dibacakan tanpa nomornya tak memberi tahu apa pun
             tentang temuan mana yang dimaksud.

             Penandaan baris "menunggu keputusan" pindah dari `style` inline ke
             `tandaiBaris` — perilakunya persis sama (latar, bukan warna teks,
             karena di tabel padat warna teks tenggelam). */
          <Tabel<Ncr>
            caption="Register ketidaksesuaian: nomor, tingkat, status, disposisi, dan penanggung jawab"
            data={data}
            kunciBaris={(n) => n.id}
            tandaiBaris={(n) => (n.status === "terbuka" ? "var(--surface-subtle)" : undefined)}
            kolom={[
              {
                kunci: "ncr", judul: "NCR", kepalaBaris: true,
                render: (n) => (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{
                        fontWeight: 700, color: C.navy, fontVariantNumeric: "tabular-nums",
                      }}>{n.nomor}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{n.judul}</div>
                    {(n.lokasi || n.acuan) && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {n.lokasi}
                        {n.lokasi && n.acuan && " · "}
                        {n.acuan && <span>acuan: {n.acuan}</span>}
                      </div>
                    )}
                  </>
                ),
              },
              {
                kunci: "tingkat", judul: "Tingkat",
                render: (n) => {
                  const sev = SEVERITY[n.severity] ?? SEVERITY.minor;
                  return (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: sev.latar, color: sev.warna,
                      border: `1px solid ${sev.tepi}`, whiteSpace: "nowrap",
                    }}>{sev.label}</span>
                  );
                },
              },
              {
                kunci: "status", judul: "Status",
                render: (n) => {
                  const st = STATUS[n.status] ?? STATUS.terbuka;
                  return (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      background: st.latar, color: st.warna, whiteSpace: "nowrap",
                    }}>{st.label}</span>
                  );
                },
              },
              {
                kunci: "disposisi", judul: "Disposisi",
                render: (n) => (
                  <span style={{ color: C.mid }}>
                    {n.disposisi ? (
                      <span title={n.disposisi_catatan ?? undefined}>
                        {DISPOSISI[n.disposisi]?.label ?? n.disposisi}
                        {n.pemutus && (
                          <span style={{ color: C.muted, fontSize: 11 }}> · {n.pemutus.name}</span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: C.muted, fontStyle: "italic" }}>belum diputuskan</span>
                    )}
                  </span>
                ),
              },
              {
                kunci: "petugas", judul: "Ditugaskan",
                render: (n) => <span style={{ color: C.mid }}>{n.petugas?.name ?? "—"}</span>,
              },
              {
                kunci: "target", judul: "Target",
                render: (n) => (
                  <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
                    {n.target_selesai
                      ? new Date(n.target_selesai).toLocaleDateString("id-ID",
                          { day: "2-digit", month: "short" })
                      : "—"}
                  </span>
                ),
              },
              {
                kunci: "aksi", judul: "", rata: "kanan",
                render: (n) => (
                  <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                    {bolehDisposisi && n.status === "terbuka" && (
                      <button onClick={() => setPutuskan(n)} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 12px", borderRadius: 6, border: "none",
                        background: "var(--grad-aksen)", color: "var(--on-aksen)",
                        fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      }}>
                        <Gavel size={12} aria-hidden="true" /> Putuskan
                      </button>
                    )}

                    {/* Tindak lanjut: menugaskan orang + akar masalah +
                        tindakan perbaikan.

                        Diukur 2026-08-11: `ditugaskan_ke` terisi 0 dari 19,
                        termasuk enam NCR berstatus `perbaikan`. Enam pekerjaan
                        "sedang diperbaiki" tanpa penanggung jawab.

                        Muncul untuk status yang MASIH BERJALAN saja — NCR yang
                        sudah ditutup atau dibatalkan tak perlu ditugaskan lagi,
                        dan tombol yang pasti ditolak adalah jalan buntu. */}
                    {bolehKelola && !["ditutup", "dibatalkan"].includes(n.status) && (
                      <button
                        onClick={() => setTindaki(n)}
                        title={n.petugas ? `Ditugaskan ke ${n.petugas.name}` : "Belum ada penanggung jawab"}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "4px 12px", borderRadius: 6,
                          // Yang BELUM punya petugas dibuat menonjol: itu
                          // keadaan yang menuntut tindakan, bukan sekadar
                          // pilihan yang tersedia.
                          border: n.petugas ? `1px solid ${C.border}` : `1px solid ${C.navy}`,
                          background: "transparent",
                          color: n.petugas ? C.mid : C.navy,
                          fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        <UserPlus size={12} aria-hidden="true" />
                        {n.petugas ? "Tindak lanjut" : "Tugaskan"}
                      </button>
                    )}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      {buatBaru && proyekId && (
        <ModalCatat
          proyekId={proyekId}
          onClose={() => setBuatBaru(false)}
          onSukses={() => { setBuatBaru(false); muat(); }}
        />
      )}

      {/* NCR yang lahir dari inspeksi — komponen yang SAMA, hanya terisi
          lebih dulu. Membuat form kedua yang mirip berarti dua tempat yang
          harus dijaga tetap sama, dan yang menyimpang di antara keduanya
          adalah data mutu yang dipakai dalam sengketa. */}
      {dariInspeksi && proyekId && (
        <ModalCatat
          proyekId={proyekId}
          awal={dariInspeksi}
          onClose={() => setDariInspeksi(null)}
          onSukses={() => { setDariInspeksi(null); muat(); }}
        />
      )}
      {tindaki && (
        <ModalTindakLanjut
          ncr={tindaki}
          pengguna={pengguna}
          onClose={() => setTindaki(null)}
          onSukses={() => { setTindaki(null); muat(); }}
        />
      )}

      {putuskan && (
        <ModalDisposisi
          ncr={putuskan}
          onClose={() => setPutuskan(null)}
          onSukses={() => { setPutuskan(null); muat(); }}
        />
      )}
    </div>
  );
}

const gayaInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6,
  border: `1px solid ${C.border}`, outline: "none", boxSizing: "border-box",
  background: "var(--surface)", color: C.text, fontFamily: "inherit",
};
const gayaLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
};

/** Form catat NCR baru. */
function ModalCatat({ proyekId, awal, onClose, onSukses }: {
  proyekId: string;
  /**
   * Bahan awal dari inspeksi yang gagal. `undefined` = NCR dicatat dari nol.
   *
   * Judul, lokasi, dan deskripsi DIWARISI supaya penerima tugas perbaikan
   * tahu pekerjaan mana yang dimaksud tanpa harus mencari sendiri.
   * `severity` sengaja TIDAK diwarisi — ia null dari server, dan menebaknya
   * berarti mesin memutuskan seberapa gawat sebuah temuan mutu.
   */
  awal?: KandidatNcr;
  onClose: () => void;
  onSukses: () => void;
}) {
  useTutupEsc(onClose);
  const [judul, setJudul] = useState(awal?.judul ?? "");
  const [lokasi, setLokasi] = useState(awal?.lokasi ?? "");
  const [acuan, setAcuan] = useState(awal ? `Inspeksi ${awal.nomor_inspeksi}` : "");
  const [deskripsi, setDeskripsi] = useState(awal?.deskripsi ?? "");
  const [severity, setSeverity] = useState("minor");
  const [target, setTarget] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!judul.trim()) return;
    setKirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${proyekId}/ncr`, {
        judul: judul.trim(),
        lokasi: lokasi.trim() || undefined,
        acuan: acuan.trim() || undefined,
        deskripsi: deskripsi.trim() || undefined,
        severity,
        target_selesai: target || undefined,
        // INILAH mata rantai yang hilang. Tanpa baris ini, NCR yang lahir
        // dari inspeksi tak punya jejak ke inspeksinya — dan pertanyaan
        // "temuan ini dari pemeriksaan mana?" tak terjawab selamanya.
        ...(awal
          ? {
              inspection_request_id: awal.inspection_request_id,
              rab_item_id: awal.rab_item_id ?? undefined,
              work_scope_id: awal.work_scope_id ?? undefined,
            }
          : {}),
      });
      onSukses();
    } catch (e: unknown) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal mencatat ketidaksesuaian.");
    } finally { setKirim(false); }
  }

  return (
    <div role="presentation" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-catat" style={{
        background: "var(--surface)", borderRadius: 14, padding: 20,
        width: "min(500px, 94vw)", maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "var(--naik-3)",
      }}>
        <h2 id="judul-catat" style={{
          margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
          fontFamily: "var(--font-display)",
        }}>Catat Ketidaksesuaian</h2>

        <div>
          <label htmlFor="ncr-judul" style={gayaLabel}>Judul</label>
          <input id="ncr-judul" value={judul} onChange={(e) => setJudul(e.target.value)}
            placeholder="mis. Mutu beton kolom lantai 2 di bawah spesifikasi"
            style={gayaInput} />
        </div>

        <div>
          <label htmlFor="ncr-acuan" style={gayaLabel}>
            Acuan yang dilanggar
          </label>
          <input id="ncr-acuan" value={acuan} onChange={(e) => setAcuan(e.target.value)}
            placeholder="mis. RKS Bab 4.2 · Gambar A-12 rev.3 · SNI 2847:2019"
            style={gayaInput} />
          {/* Ini yang membedakan NCR dari cacat biasa: selalu ada acuan yang
              dilanggar. Diberi penjelasan supaya kolomnya tak dilewati. */}
          <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted }}>
            NCR selalu menunjuk sesuatu yang dilanggar — itu yang membedakannya
            dari cacat biasa, dan yang dicari auditor.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label htmlFor="ncr-lokasi" style={gayaLabel}>Lokasi</label>
            <input id="ncr-lokasi" value={lokasi} onChange={(e) => setLokasi(e.target.value)}
              placeholder="Lantai 2, kolom K-3" style={gayaInput} />
          </div>
          <div>
            <label htmlFor="ncr-severity" style={gayaLabel}>Tingkat</label>
            <select id="ncr-severity" value={severity}
              onChange={(e) => setSeverity(e.target.value)} style={gayaInput}>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="kritis">Kritis</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="ncr-deskripsi" style={gayaLabel}>Uraian</label>
          <textarea id="ncr-deskripsi" value={deskripsi} rows={3}
            onChange={(e) => setDeskripsi(e.target.value)}
            placeholder="Apa yang ditemukan, bagaimana terukur"
            style={{ ...gayaInput, resize: "vertical" }} />
        </div>

        <div>
          <label htmlFor="ncr-target" style={gayaLabel}>Target selesai</label>
          <input id="ncr-target" type="date" value={target}
            onChange={(e) => setTarget(e.target.value)} style={gayaInput} />
        </div>

        {galat && (
          <div role="alert" style={{
            padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
          }}>{galat}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
          }}>Batal</button>
          <button onClick={simpan} disabled={!judul.trim() || kirim} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: judul.trim() && !kirim ? "var(--grad-aksen)" : "var(--surface-hover)",
            color: judul.trim() && !kirim ? "var(--on-aksen)" : C.muted,
            fontSize: 13, fontWeight: 600,
            cursor: judul.trim() && !kirim ? "pointer" : "not-allowed",
          }}>{kirim ? "Menyimpan..." : "Catat"}</button>
        </div>
      </div>
    </div>
  );
}

/** Form disposisi — keputusan formal atas ketidaksesuaian. */
function ModalDisposisi({ ncr, onClose, onSukses }: {
  ncr: Ncr; onClose: () => void; onSukses: () => void;
}) {
  useTutupEsc(onClose);
  const [pilihan, setPilihan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // "Terima apa adanya" berarti perusahaan menanggung ketidaksesuaian —
  // alasan wajib. Ditegakkan di API juga; ini supaya tombolnya tak bisa
  // ditekan lebih dulu, bukan supaya API-nya boleh percaya klien.
  const perluAlasan = pilihan === "terima";
  const sah = pilihan && (!perluAlasan || catatan.trim().length > 0);

  async function simpan() {
    if (!sah) return;
    setKirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/ncr/${ncr.id}/disposisi`, {
        disposisi: pilihan,
        catatan: catatan.trim() || undefined,
      });
      onSukses();
    } catch (e: unknown) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal menyimpan disposisi.");
    } finally { setKirim(false); }
  }

  return (
    <div role="presentation" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-disposisi" style={{
        background: "var(--surface)", borderRadius: 14, padding: 20,
        width: "min(520px, 94vw)", maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "var(--naik-3)",
      }}>
        <div>
          <h2 id="judul-disposisi" style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display)",
          }}>Disposisi {ncr.nomor}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{ncr.judul}</p>
        </div>

        <div style={{
          padding: "8px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.55,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, color: C.onWarningBg,
        }}>
          Disposisi adalah keputusan formal yang tercatat di jejak audit dan
          berkonsekuensi biaya. Setelah ditetapkan, NCR masuk tahap berikutnya.
        </div>

        {/* `role="group"` + `aria-labelledby`, bukan `<label>` biasa: judul
            ini menamai SATU PERTANYAAN dengan empat pilihan, bukan satu
            kontrol. `htmlFor` hanya bisa menunjuk satu elemen, jadi ia akan
            menempel ke radio pertama seolah tiga lainnya tak dinamai.
            Pola yang sama dipakai di /kas dan /estimasi. */}
        {/* Kartu bersama (`PilihanKartu`). Pelajaran a11y yang dulu
            ditulis di sini — input ber-id eksplisit, teks yang bisa
            dijangkau tanpa menembus pembungkus, seluruh kartu bisa diketuk —
            semuanya pindah ke komponennya, jadi berlaku untuk SEMUA layar
            yang memakainya, bukan hanya layar ini. */}
        <PilihanKartu
          nama="disposisi"
          label="Keputusan"
          opsi={Object.entries(DISPOSISI).map(([k, d]) => ({
            nilai: k,
            label: d.label,
            ringkas: d.ket,
          }))}
          nilai={pilihan}
          onUbah={setPilihan}
          kolom={1}
        />

        <div>
          <label htmlFor="disposisi-catatan" style={gayaLabel}>
            Alasan {perluAlasan
              ? <span style={{ color: C.red, textTransform: "none" }}>· wajib</span>
              : <span style={{ fontWeight: 400, textTransform: "none" }}>(opsional)</span>}
          </label>
          <textarea id="disposisi-catatan" rows={3} value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder={perluAlasan
              ? "Kenapa diterima apa adanya — ini yang akan dibaca auditor"
              : "Pertimbangan yang mendasari keputusan"}
            style={{
              ...gayaInput, resize: "vertical",
              borderColor: perluAlasan && !catatan.trim() ? C.redBorder : C.border,
            }} />
        </div>

        {galat && (
          <div role="alert" style={{
            padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
          }}>{galat}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
          }}>Batal</button>
          <button onClick={simpan} disabled={!sah || kirim} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: sah && !kirim ? "var(--grad-aksen)" : "var(--surface-hover)",
            color: sah && !kirim ? "var(--on-aksen)" : C.muted,
            fontSize: 13, fontWeight: 600,
            cursor: sah && !kirim ? "pointer" : "not-allowed",
          }}>{kirim ? "Menyimpan..." : "Tetapkan Disposisi"}</button>
        </div>
      </div>
    </div>
  );
}

export default function NcrPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "var(--pad-atas) var(--pad-x)" }}>
        <div aria-hidden="true" style={{
          height: 44, width: 200, borderRadius: 6,
          background: "var(--surface-subtle)",
        }} />
      </div>
    }>
      <NcrInner />
    </Suspense>
  );
}

/**
 * TINDAK LANJUT NCR — menugaskan orang, akar masalah, tindakan perbaikan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-11:
 *
 *   ncr_items                     19 baris
 *   ditugaskan_ke terisi           0
 *   berstatus `perbaikan`          6
 *
 * **Enam pekerjaan "sedang diperbaiki" tanpa satu pun orang bertanggung
 * jawab.** Kolomnya ada, `PATCH /ncr/:id` menerimanya, dan server bahkan
 * MENGIRIM NOTIFIKASI ke yang ditugaskan (`ncr.ts:322`) — notifikasi yang tak
 * pernah terkirim karena tak ada yang bisa mengisi kolomnya.
 *
 * Komentar di server sudah menyebutkan akibatnya: NCR yang menunggu tanpa ada
 * yang tahu adalah cara paling umum ketidaksesuaian menumpuk sampai serah
 * terima. Itulah yang terjadi.
 *
 * Kelas cacat yang sama untuk KEENAM kalinya — `rfq.po_id`, endpoint
 * penawaran, `rfq.mr_id`, `sumber_change_order_id`, geotag,
 * `inspection_request_id`.
 *
 * ── Kenapa tiga hal ini SATU modal
 *
 * Menugaskan tanpa menyebut apa yang harus diperbaiki adalah melempar
 * pekerjaan. Mencatat tindakan perbaikan tanpa penanggung jawab adalah
 * mencatat harapan. Ketiganya satu keputusan, jadi satu layar — dan API
 * memang menerimanya dalam satu `PATCH`.
 *
 * ── Kenapa akar masalah TERPISAH dari tindakan
 *
 * Tindakan tanpa akar masalah memperbaiki gejala. Kolomnya sudah dipisah di
 * basis sejak migrasi 189, dan pemisahan itu yang membuat pola berulang bisa
 * ketahuan: sepuluh NCR dengan akar masalah yang sama adalah masalah proses,
 * bukan sepuluh kecelakaan.
 */
function ModalTindakLanjut({ ncr, pengguna, onClose, onSukses }: {
  ncr: Ncr;
  pengguna: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSukses: () => void;
}) {
  useTutupEsc(onClose);
  const [petugas, setPetugas] = useState(ncr.petugas?.id ?? "");
  const [akar, setAkar] = useState(ncr.akar_masalah ?? "");
  const [tindakan, setTindakan] = useState(ncr.tindakan_perbaikan ?? "");
  const [target, setTarget] = useState(ncr.target_selesai ?? "");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Setidaknya SATU hal harus berubah — menyimpan tanpa perubahan hanya
  // menambah baris audit yang tak berarti apa-apa.
  const berubah =
    petugas !== (ncr.petugas?.id ?? "") ||
    akar.trim() !== (ncr.akar_masalah ?? "") ||
    tindakan.trim() !== (ncr.tindakan_perbaikan ?? "") ||
    target !== (ncr.target_selesai ?? "");

  async function simpan() {
    if (!berubah) return;
    setKirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/ncr/${ncr.id}`, {
        // `null` eksplisit, bukan `undefined`: mengosongkan penugasan adalah
        // tindakan yang sah (orangnya keluar, pekerjaannya dialihkan), dan
        // `undefined` akan membuat server MENGABAIKANNYA alih-alih menghapus.
        ditugaskan_ke: petugas || null,
        akar_masalah: akar.trim() || undefined,
        tindakan_perbaikan: tindakan.trim() || undefined,
        target_selesai: target || null,
      });
      onSukses();
    } catch (e: unknown) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal menyimpan tindak lanjut.");
    } finally { setKirim(false); }
  }

  const isian: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${C.border}`, background: "var(--surface)",
    color: C.text, fontSize: 13,
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
  };

  return (
    <div role="presentation" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-tindak" style={{
        background: "var(--surface)", borderRadius: 14, padding: 20,
        width: "min(540px, 94vw)", maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "var(--naik-3)",
      }}>
        <div>
          <h2 id="judul-tindak" style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display)",
          }}>Tindak lanjut {ncr.nomor}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{ncr.judul}</p>
        </div>

        {galat && (
          <div role="alert" style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 12.5,
            background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
          }}>{galat}</div>
        )}

        <div>
          <label htmlFor="nc-petugas" style={label}>Penanggung jawab</label>
          <select id="nc-petugas" value={petugas} onChange={(e) => setPetugas(e.target.value)}
            style={isian} aria-describedby="nc-petugas-ket">
            <option value="">— belum ditugaskan —</option>
            {pengguna.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <span id="nc-petugas-ket" style={{ fontSize: 11, color: C.mid, lineHeight: 1.5, display: "block", marginTop: 4 }}>
            Yang ditugaskan menerima notifikasi. Tanpa penanggung jawab,
            ketidaksesuaian menumpuk sampai serah terima tanpa ada yang merasa
            berkewajiban menutupnya.
          </span>
        </div>

        <div>
          <label htmlFor="nc-akar" style={label}>Akar masalah</label>
          <textarea id="nc-akar" value={akar} onChange={(e) => setAkar(e.target.value)}
            rows={2} style={{ ...isian, resize: "vertical" }}
            placeholder="mis. adukan tidak sesuai takaran; tukang belum diberi contoh"
            aria-describedby="nc-akar-ket" />
          <span id="nc-akar-ket" style={{ fontSize: 11, color: C.mid, lineHeight: 1.5, display: "block", marginTop: 4 }}>
            Dipisah dari tindakan dengan sengaja: tindakan tanpa akar masalah
            memperbaiki gejala. Sepuluh NCR berakar sama adalah masalah proses,
            bukan sepuluh kecelakaan.
          </span>
        </div>

        <div>
          <label htmlFor="nc-tindakan" style={label}>Tindakan perbaikan</label>
          <textarea id="nc-tindakan" value={tindakan} onChange={(e) => setTindakan(e.target.value)}
            rows={3} style={{ ...isian, resize: "vertical" }}
            placeholder="apa yang dikerjakan untuk memperbaiki" />
        </div>

        <div>
          <label htmlFor="nc-target" style={label}>Target selesai</label>
          <input id="nc-target" type="date" value={target}
            onChange={(e) => setTarget(e.target.value)} style={isian} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} disabled={kirim} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            minHeight: 40, border: `1px solid ${C.border}`,
            background: "transparent", color: C.text,
            cursor: kirim ? "not-allowed" : "pointer",
          }}>Batal</button>
          <button type="button" onClick={simpan} disabled={!berubah || kirim} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            minHeight: 40, border: "none",
            background: !berubah || kirim ? C.border : C.navy,
            color: !berubah || kirim ? C.mid : "var(--on-navy)",
            cursor: !berubah || kirim ? "not-allowed" : "pointer",
          }}>{kirim ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}
