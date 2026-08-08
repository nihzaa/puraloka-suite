"use client";

/**
 * LAPANGAN — RINGKASAN. Dashboard modul, bukan langsung daftar (UI-2-3).
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  kartu KPI              "apa yang terjadi?"
 *   LAPIS 2  — SENGAJA KOSONG       (alasannya di bawah)
 *   LAPIS 3  daftar proyek berjalan "di mana saya harus membukanya?"
 *
 * ── §5c menjanjikan empat KPI. Tiga di antaranya TIDAK BISA DIBUAT.
 *
 * ARAH-VISUAL-2026 §5c mengusulkan: RFI terbuka · punch belum tutup ·
 * instruksi belum konfirmasi · NCR aktif — lalu menyatakan "tiap angka di
 * sini sudah ada API-nya". Diukur 2026-08-07, pernyataan itu keliru untuk
 * tiga dari empat. Seluruh modul lapangan HANYA dilayani rute bersarang
 * per-proyek:
 *
 *     GET /api/v1/projects/:projectId/rfis          → RFI terbuka
 *     GET /api/v1/projects/:projectId/punch-items   → punch belum tutup
 *     GET /api/v1/projects/:projectId/ncr           → NCR aktif
 *
 * Tak satu pun punya bentuk lintas-proyek. Menghitungnya untuk seluruh
 * perusahaan berarti N permintaan untuk N proyek dari peramban, di halaman
 * yang dibuka paling sering — dan begitu satu proyek gagal dimuat, angkanya
 * turun tanpa ada yang tahu. Kegagalan yang menyamar jadi kabar baik adalah
 * persis cacat yang melahirkan `scripts/uji-endpoint-ada.mjs`.
 *
 * Jadi ketiganya DIHILANGKAN, bukan diperkirakan. Menghidupkannya butuh satu
 * endpoint agregat baru (mis. `GET /api/v1/lapangan/ringkasan`) dengan pola
 * yang sudah terbukti di `/api/v1/dashboard/fokus`: `db.projectIds()` lalu
 * satu query per tabel. Itu pekerjaan API, dan tugas ini bersyarat NOL
 * endpoint baru.
 *
 * ── Yang tersisa, dan kenapa ia sah
 *
 * `GET /api/v1/dashboard/fokus` SUDAH meringkas lintas-proyek di sisi server,
 * dan `rincian.instruksi_belum_dikonfirmasi` milik domain ini. Ia dipakai apa
 * adanya — tidak dihitung ulang di sini — dan kartunya MENYEBUT batasnya
 * sendiri: hanya lisan/telepon lewat 24 jam. KPI yang menuduh tanpa
 * menyatakan apa yang belum diperhitungkan akan membuat orang berdebat
 * dengan aplikasi alih-alih dengan kenyataan.
 *
 * ── Kenapa TIDAK ADA grafik
 *
 * Grafik hanya berhak ada kalau ia menjawab pertanyaan yang tak bisa dibaca
 * dari daftarnya. Dengan tiga sumber lapangan tak tersedia, satu-satunya
 * bahan yang tersisa adalah tanggal dan serapan proyek — dan keduanya sudah
 * terbaca langsung di daftar di bawah, per baris. Menggambarnya jadi batang
 * hanya memindahkan angka yang sama ke bentuk yang lebih sulit dibaca.
 * Grafik yang menggambar ulang daftar adalah tinta tanpa informasi.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarClock, ClipboardCheck, HardHat, RefreshCw,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Galat, Lencana, Rangka, Tabel, Tombol, type Kolom } from "@/components/dasar";
import { KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import {
  KETERBATASAN_INSTRUKSI, hariIniWIB, ringkasLapangan,
  type ProyekBerjalan, type ProyekLapangan, type RincianFokus,
} from "@/lib/ringkasan-lapangan";

interface JawabanFokus {
  rincian: RincianFokus;
}

export default function LapanganRingkasanPage() {
  const [proyek, setProyek] = useState<ProyekLapangan[]>([]);
  // `null` berarti "tak diketahui", BUKAN nol. Bedanya menentukan apakah
  // kartunya tampil — lihat `ringkasan-lapangan.ts`.
  const [fokus, setFokus] = useState<RincianFokus | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  // Tanggal acuan DIBEKUKAN saat halaman dipasang. Kalau dibaca ulang tiap
  // render, kartu KPI dan daftar di bawahnya bisa memakai tanggal berbeda
  // saat halaman terbuka melewati tengah malam — dan angka yang tak cocok
  // dengan daftarnya sendiri adalah cara tercepat membuat orang berhenti
  // memercayai keduanya.
  const [hariIni] = useState(() => hariIniWIB());

  // Pembatal disimpan di ref, dan `muat` ditulis sebagai fungsi biasa —
  // mengikuti `proyek/page.tsx` persis. Bukan gaya: `useCallback` yang
  // dirujuk dari daftar dependensi `useEffect` membuat
  // `react-hooks/set-state-in-effect` membaca setState di dalamnya sebagai
  // setState di badan efek, dan halaman ini tak boleh menambah warning baru
  // ke lint-ratchet. Efek dengan dependensi kosong tak punya masalah itu.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void muat();
    return () => abortRef.current?.abort();
  }, []);

  async function muat() {
    abortRef.current?.abort();
    abortRef.current = makeAbortController();
    const signal = abortRef.current.signal;
    setMemuat(true);
    setGalat("");
    try {
      const r = await api.get<{ projects: ProyekLapangan[] }>(
        "/api/v1/projects", { signal });
      setProyek(r.data.projects ?? []);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      setGalat("Gagal memuat proyek. Pastikan API server berjalan.");
      setMemuat(false);
      return;
    }

    // Dipisah dari muatan utama DENGAN SENGAJA: `/dashboard/fokus` gagal
    // keras bila salah satu querynya galat (disengaja, lihat
    // `routes/v1/dashboard.ts`). Kalau ia menjatuhkan seluruh halaman,
    // daftar proyek yang sehat ikut hilang. Yang benar: kartunya yang
    // menghilang, bukan halamannya.
    try {
      const r = await api.get<JawabanFokus>("/api/v1/dashboard/fokus", { signal });
      setFokus(r.data.rincian ?? null);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== "CanceledError") setFokus(null);
    }
    setMemuat(false);
  }

  const ringkas = useMemo(
    () => ringkasLapangan(proyek, fokus, hariIni), [proyek, fokus, hariIni]);

  const kolom: Array<Kolom<ProyekBerjalan>> = [
    {
      kunci: "nama",
      judul: "Proyek",
      kepalaBaris: true,
      render: (p) => (
        <Link href={`/proyek/${p.id}`} style={{
          color: C.text, fontWeight: 600, textDecoration: "none",
        }}>{p.name}</Link>
      ),
    },
    {
      kunci: "serapan",
      judul: "Serapan anggaran",
      rata: "kanan",
      // "Serapan anggaran", bukan "progres": `projects.progress_pct` adalah
      // bobot RAB yang terserap, bukan kemajuan fisik lapangan. Keduanya
      // sumber independen di basis ini, dan menyebutnya "progres" membuat
      // orang mengira 40% berarti bangunannya sudah 40% berdiri.
      render: (p) => `${p.serapan.toLocaleString("id-ID", {
        maximumFractionDigits: 1 })}%`,
    },
    {
      kunci: "tenggat",
      judul: "Tenggat kontrak",
      rata: "kanan",
      render: (p) => {
        if (p.sisaHari === Number.MAX_SAFE_INTEGER) {
          return <span style={{ color: C.muted }}>belum diisi</span>;
        }
        if (p.sisaHari < 0) {
          return <Lencana nada="bahaya">lewat {Math.abs(p.sisaHari)} hari</Lencana>;
        }
        if (p.sisaHari <= 30) {
          return <Lencana nada="peringatan">{p.sisaHari} hari lagi</Lencana>;
        }
        return `${p.sisaHari} hari lagi`;
      },
    },
    {
      kunci: "buka",
      judul: "Catatan lapangan",
      render: (p) => (
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/lapangan/punch-list?proyek=${p.id}`} style={{
            color: "var(--aksen)", fontSize: "var(--t-data)", textDecoration: "none",
          }}>Punch</Link>
          <Link href={`/lapangan/inspeksi?proyek=${p.id}`} style={{
            color: "var(--aksen)", fontSize: "var(--t-data)", textDecoration: "none",
          }}>Inspeksi</Link>
          <Link href={`/lapangan/submittal?proyek=${p.id}`} style={{
            color: "var(--aksen)", fontSize: "var(--t-data)", textDecoration: "none",
          }}>Submittal</Link>
        </span>
      ),
    },
  ];

  /*
    RAIL KONTEKSTUAL — catatan lengkapnya di `app/(dashboard)/proyek/page.tsx`.
    Yang relevan di halaman lapangan: proyek yang progresnya paling tertinggal,
    karena di sinilah pekerjaan fisik dikejar.
  */
  usePasangRail(
    <RailIsi
      tanggalTenggat={proyek.map((p) => p.end_date)}
      konteks={
        <KartuRail
          judul="Paling tertinggal"
          tautan="/proyek"
          kosong="Tak ada proyek berjalan."
        >
          {[...proyek]
            .filter((p) => p.status !== "completed" && p.status !== "cancelled")
            .sort((a, b) => Number(a.progress_pct ?? 0) - Number(b.progress_pct ?? 0))
            .slice(0, 6)
            .map((p, i) => (
              <BarisRail
                key={p.id}
                pertama={i === 0}
                utama={p.name}
                kanan={`${Math.round(Number(p.progress_pct ?? 0))}%`}
                nadaKanan={Number(p.progress_pct ?? 0) <= 0 ? "bahaya" : "normal"}
                href={`/proyek/${p.id}`}
              />
            ))}
        </KartuRail>
      }
    />,
    [proyek],
  );

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      <div className="rise" style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, flexWrap: "wrap", marginBottom: 20,
      }}>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
            color: C.text, marginBottom: 4,
          }}>Lapangan</h1>
          <p style={{ fontSize: 13, color: C.mid }}>
            Keadaan pekerjaan yang sedang berjalan, lalu jalan ke catatannya
          </p>
        </div>
        <Tombol onClick={() => void muat()} ikon={<RefreshCw size={14} />}>
          Muat ulang
        </Tombol>
      </div>

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {memuat && !galat && <Rangka tinggi={96} jumlah={2} />}

      {!memuat && !galat && (
        <>
          {/* ── LAPIS 1 — KPI ─────────────────────────────────────────────── */}
          <div className="rise rise-2" style={{
            display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          }}>
            <KartuKPI
              label="Proyek berjalan"
              nilai={String(ringkas.proyekBerjalan)}
              nilaiAngka={ringkas.proyekBerjalan}
              ikon={<HardHat size={16} />}
              keterangan="Di sinilah pekerjaan lapangan terjadi"
            />

            <KartuKPI
              label="Lewat tenggat"
              nilai={String(ringkas.lewatTenggat)}
              nilaiAngka={ringkas.lewatTenggat}
              ikon={<CalendarClock size={16} />}
              sorot={ringkas.lewatTenggat > 0}
              // "Lewat tenggat", BUKAN "telat" — preseden dari `/proyek`.
              // Keterlambatan yang sudah dimaafkan lewat EOT secara kontrak
              // bukan keterlambatan, dan `contract_eot` tidak dikirim
              // `/api/v1/projects`. Kartu ini menyatakan fakta tanggal, lalu
              // menyerahkan vonisnya ke halaman yang punya bahannya.
              keterangan="Lewat tanggal selesai kontrak. Belum memperhitungkan EOT yang disetujui."
            />

            {/* Kartu ini MENGHILANG saat `/dashboard/fokus` gagal — tidak
                menampilkan nol. "0 menunggu" terbaca sebagai "tidak ada yang
                perlu saya kerjakan", dan itu kebohongan yang menenangkan. */}
            {fokus && (
              <KartuKPI
                label="Instruksi menunggu bukti"
                nilai={String(ringkas.instruksiMenungguBukti)}
                nilaiAngka={ringkas.instruksiMenungguBukti}
                ikon={<ClipboardCheck size={16} />}
                sorot={ringkas.instruksiMenungguBukti > 0}
                keterangan={KETERBATASAN_INSTRUKSI}
              />
            )}
          </div>

          {/* ── Apa yang BELUM bisa ditampilkan, dinyatakan terus terang ──── */}
          <div className="rise rise-2" style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "12px 14px", marginBottom: "var(--r4)",
            border: `1px solid ${C.border}`, borderRadius: 10,
            background: C.subtle,
          }}>
            <AlertTriangle size={15} aria-hidden="true" style={{
              color: C.muted, flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 12, color: C.mid, lineHeight: 1.55 }}>
              <strong style={{ color: C.text }}>Belum ada angka lintas-proyek</strong>{" "}
              untuk RFI terbuka, punch belum tutup, dan NCR aktif. Ketiganya
              hanya tersedia per proyek, jadi angkanya dibaca di halaman
              masing-masing lewat tautan di tabel bawah — bukan diperkirakan
              di sini.
            </p>
          </div>

          {/* ── LAPIS 3 — daftar ──────────────────────────────────────────── */}
          <div className="rise rise-3">
            <Panel
              judul="Proyek berjalan"
              keterangan="Yang tenggatnya paling dekat di atas"
              padat
            >
              <Tabel<ProyekBerjalan>
                kolom={kolom}
                data={ringkas.daftar}
                kunciBaris={(p) => p.id}
                caption="Daftar proyek berjalan dengan tenggat kontrak dan jalan ke catatan lapangannya"
                tandaiBaris={(p) =>
                  p.sisaHari < 0 && p.sisaHari !== Number.MAX_SAFE_INTEGER
                    ? C.redBg : undefined}
                kosong={
                  <Kosong
                    ikon={<HardHat size={26} />}
                    judul="Tidak ada proyek berjalan"
                    sebab={
                      proyek.length === 0
                        ? "Belum ada proyek sama sekali di perusahaan ini."
                        : "Semua proyek sudah berstatus selesai atau dibatalkan."
                    }
                    aksi={<Tombol href="/proyek" jenis="utama">Buka daftar proyek</Tombol>}
                  />
                }
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
