"use client";

/**
 * KONTRAK — RINGKASAN. Dashboard modul, bukan langsung daftar (UI-2-3).
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  kartu KPI                "apa yang terjadi?"
 *   LAPIS 2  sebaran jaminan/jenis    "uang saya tertahan di mana?"
 *   LAPIS 3  jaminan yang mendesak    "apa yang harus saya kerjakan?"
 *
 * ── §5c menjanjikan empat KPI. Dua dipakai, satu diganti, satu dihilangkan.
 *
 * Usul §5c: kontrak aktif · EOT menggantung · klaim terbuka · jaminan mau
 * habis. Diukur 2026-08-07 terhadap rute yang benar-benar terdaftar:
 *
 *   ✓ kontrak aktif      `GET /api/v1/projects` — status + contract_value
 *   ✓ jaminan mau habis  `GET /api/v1/bonds` — TENANT-WIDE, bukan bersarang
 *   ✗ EOT menggantung    hanya `GET /api/v1/projects/:id/eot`
 *   ✗ klaim terbuka      hanya `GET /api/v1/projects/:id/claims`
 *
 * Dua yang terakhir DIHILANGKAN. Keduanya hanya punya bentuk bersarang
 * per-proyek, jadi menghitungnya untuk seluruh perusahaan berarti N
 * permintaan untuk N proyek dari peramban — dan begitu satu gagal, angkanya
 * turun diam-diam. "3 klaim terbuka" saat sebenarnya 11 jauh lebih berbahaya
 * daripada kartu yang absen, karena tak ada yang akan curiga.
 *
 * Menghidupkannya butuh endpoint agregat baru dengan pola yang sudah
 * terbukti di `/api/v1/dashboard/fokus` (`db.projectIds()` lalu satu query
 * per tabel). Itu pekerjaan API; tugas ini bersyarat NOL endpoint baru.
 *
 * ── Yang MENGGANTIKANNYA — bukan tambalan, melainkan angka yang lebih tajam
 *
 * `GET /api/v1/asuransi` sudah meringkas polis LINTAS-PROYEK di sisi server
 * (`lib/register-asuransi.ts`), lengkap dengan jumlah kadaluarsa dan yang
 * segera berakhir. Itu angka yang menuntut tindakan hari ini dengan bentuk
 * yang sama seperti "jaminan mau habis": dokumen yang habis masa berlakunya
 * sementara pekerjaannya masih berjalan.
 *
 * ── Kenapa ADA grafik di sini, sementara /lapangan tidak
 *
 * Grafik hanya berhak ada kalau ia menjawab pertanyaan yang tak bisa dibaca
 * dari daftar tanpa kalkulator. Pertanyaannya: "uang jaminan saya tertahan
 * paling banyak di jenis yang mana?" Register jaminan adalah daftar per
 * BARIS diurut tanggal kadaluarsa; menjawabnya dari sana menuntut orang
 * menjumlahkan nilai lintas puluhan baris sambil mengelompokkannya sendiri.
 * Itu justru yang tak bisa dilakukan mata. Empat batang menjawabnya seketika.
 *
 * Perhatikan bedanya dengan daftar di LAPIS 3: grafiknya memakai SELURUH
 * jaminan aktif, sedangkan daftarnya hanya yang mendesak. Dua populasi
 * berbeda menjawab dua pertanyaan berbeda — kalau sama, grafiknya cuma
 * menggambar ulang daftarnya, dan itu tinta tanpa informasi.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, FileSignature, RefreshCw, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Galat, Lencana, Rangka, Tabel, Tombol, type Kolom } from "@/components/dasar";
import { GrafikBatang, KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import {
  LABEL_JAMINAN, hariIniWIB, ringkasKontrak,
  type BarisJaminan, type JaminanMendesak, type ProyekKontrak,
  type RingkasAsuransi,
} from "@/lib/ringkasan-kontrak";

/** Rupiah ringkas — "Rp 1,2 M". Angka penuh tetap ada di kolom tabel. */
function rupiahRingkas(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

export default function KontrakRingkasanPage() {
  const [proyek, setProyek] = useState<ProyekKontrak[]>([]);
  const [jaminan, setJaminan] = useState<BarisJaminan[]>([]);
  // `null` = tak diketahui, BUKAN nol. Bedanya menentukan apakah kartunya tampil.
  const [asuransi, setAsuransi] = useState<RingkasAsuransi | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  // Tanggal acuan DIBEKUKAN saat halaman dipasang — kalau tidak, KPI dan
  // daftar di bawahnya bisa memakai tanggal berbeda saat halaman terbuka
  // melewati tengah malam, dan angka yang tak cocok dengan daftarnya sendiri
  // adalah cara tercepat membuat orang berhenti memercayai keduanya.
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

    // Dua muatan inti berjalan bersama; keduanya wajib ada untuk KPI utama.
    try {
      const [rProyek, rJaminan] = await Promise.all([
        api.get<{ projects: ProyekKontrak[] }>("/api/v1/projects", { signal }),
        api.get<{ data: BarisJaminan[] }>("/api/v1/bonds", { signal }),
      ]);
      setProyek(rProyek.data.projects ?? []);
      setJaminan(rJaminan.data.data ?? []);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      setGalat("Gagal memuat kontrak dan jaminan. Pastikan API server berjalan.");
      setMemuat(false);
      return;
    }

    // Asuransi DIPISAH: modul ini baru (migrasi 199) dan izinnya berbeda
    // (`projects:contract`, bukan `projects:view`). Orang yang boleh melihat
    // jaminan belum tentu boleh melihat polis — dan saat itu terjadi,
    // kartunya yang menghilang, bukan seluruh halamannya.
    try {
      const r = await api.get<RingkasAsuransi>("/api/v1/asuransi", { signal });
      setAsuransi(r.data ?? null);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== "CanceledError") setAsuransi(null);
    }
    setMemuat(false);
  }

  const ringkas = useMemo(
    () => ringkasKontrak(proyek, jaminan, asuransi, hariIni),
    [proyek, jaminan, asuransi, hariIni]);

  // Batang yang disorot = jenis yang menahan uang paling banyak. Hanya SATU
  // yang boleh disorot — itu yang membuat "mana yang penting" terbaca
  // sebelum ada yang membaca sumbunya.
  const dataGrafik = useMemo(
    () => ringkas.perJenis.map((j, i) => ({
      label: j.label, nilai: j.nilai, sorot: i === 0,
    })), [ringkas.perJenis]);

  const kolom: Array<Kolom<JaminanMendesak>> = [
    {
      kunci: "nomor",
      judul: "Jaminan",
      kepalaBaris: true,
      render: (j) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>
            {j.bond_number ?? "tanpa nomor"}
          </span>
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>
            {LABEL_JAMINAN[j.bond_type] ?? j.bond_type}
            {j.issuer ? ` · ${j.issuer}` : ""}
          </span>
        </span>
      ),
    },
    {
      kunci: "proyek",
      judul: "Proyek",
      render: (j) => j.project_id
        ? (
          <Link href={`/proyek/${j.project_id}`} style={{
            color: "var(--aksen)", textDecoration: "none",
          }}>{j.namaProyek}</Link>
        )
        : <span style={{ color: C.muted }}>{j.namaProyek}</span>,
    },
    {
      kunci: "nilai",
      judul: "Nilai",
      rata: "kanan",
      render: (j) => `Rp ${Number(j.amount).toLocaleString("id-ID", {
        maximumFractionDigits: 0 })}`,
    },
    {
      kunci: "habis",
      judul: "Masa berlaku habis",
      rata: "kanan",
      render: (j) => (
        <span>
          {j.sisaHari < 0
            ? <Lencana nada="bahaya">lewat {Math.abs(j.sisaHari)} hari</Lencana>
            : j.sisaHari === 0
              ? <Lencana nada="bahaya">hari ini</Lencana>
              : <Lencana nada="peringatan">{j.sisaHari} hari lagi</Lencana>}
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>
            {j.expiry_date.slice(0, 10)}
          </span>
        </span>
      ),
    },
  ];

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
          }}>Kontrak</h1>
          <p style={{ fontSize: 13, color: C.mid }}>
            Dokumen yang menjaga kontrak tetap sah — dan mana yang mau habis
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
              label="Kontrak aktif"
              nilai={String(ringkas.kontrakAktif)}
              nilaiAngka={ringkas.kontrakAktif}
              ikon={<FileSignature size={16} />}
              keterangan={`Nilai ${rupiahRingkas(ringkas.nilaiKontrakAktif)}`}
            />

            <KartuKPI
              label="Jaminan mau habis"
              nilai={String(ringkas.jaminanMauHabis)}
              nilaiAngka={ringkas.jaminanMauHabis}
              ikon={<ShieldAlert size={16} />}
              sorot={ringkas.jaminanLewat > 0}
              // Menyebut berapa yang SUDAH lewat, bukan menyembunyikannya di
              // dalam angka gabungan: memperbarui jaminan bank butuh surat,
              // tanda tangan, dan antrean bank. Yang sudah lewat menuntut
              // telepon pagi ini; yang tinggal 30 hari menuntut surat minggu ini.
              keterangan={
                ringkas.jaminanLewat > 0
                  ? `Habis dalam 30 hari — ${ringkas.jaminanLewat} sudah lewat tanggalnya`
                  : "Habis dalam 30 hari. Hanya jaminan berstatus aktif."
              }
            />

            {/* MENGHILANG saat `/api/v1/asuransi` gagal atau izinnya tak ada —
                tidak menampilkan nol. "0 perlu tindakan" terbaca sebagai
                "semua polis aman", dan itu kebohongan yang menenangkan. */}
            {asuransi && (
              /* Proyek TANPA POLIS ikut dihitung sebagai "perlu tindakan" —
                 2026-08-07.

                 Versi pertama menaruhnya di keterangan kecil: angka besarnya
                 "0", keterangannya "· 15 proyek tanpa polis". Nol yang tenang
                 di atas berita buruk. Padahal 15 proyek berjalan tanpa
                 asuransi bukan keadaan aman — ia CELAH TERBESAR di halaman
                 ini, dan justru yang tak punya polis tak akan pernah muncul
                 di register polis mana pun.

                 Polis kadaluarsa dan proyek tanpa polis menuntut tindakan
                 yang sama: terbitkan/perpanjang sebelum ada kejadian. Jadi
                 keduanya dijumlahkan, dan keterangannya memecah asalnya. */
              <KartuKPI
                label="Polis perlu tindakan"
                nilai={String(ringkas.asuransiPerluTindakan + asuransi.proyek_tanpa_polis.length)}
                nilaiAngka={ringkas.asuransiPerluTindakan + asuransi.proyek_tanpa_polis.length}
                ikon={<ShieldCheck size={16} />}
                sorot={asuransi.jumlah_kadaluarsa > 0 || asuransi.proyek_tanpa_polis.length > 0}
                keterangan={
                  (asuransi.proyek_tanpa_polis.length > 0
                    ? `${asuransi.proyek_tanpa_polis.length} proyek TANPA polis · `
                    : "") +
                  `${asuransi.jumlah_kadaluarsa} kadaluarsa · ` +
                  `${asuransi.jumlah_segera_berakhir} segera berakhir`
                }
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
              untuk EOT menggantung dan klaim terbuka. Keduanya hanya tersedia
              per proyek, jadi angkanya dibaca di halaman proyek
              masing-masing — bukan diperkirakan di sini.
            </p>
          </div>

          {/* ── LAPIS 2 — grafik ──────────────────────────────────────────── */}
          <div className="rise rise-3" style={{ marginBottom: "var(--r4)" }}>
            <Panel
              judul="Uang jaminan tertahan, per jenis"
              keterangan="Seluruh jaminan berstatus aktif — bukan hanya yang mau habis"
            >
              {dataGrafik.length > 0
                ? <GrafikBatang data={dataGrafik} format={rupiahRingkas} />
                : (
                  <Kosong
                    judul="Belum ada jaminan aktif"
                    sebab="Register jaminan kosong, atau seluruhnya sudah dilepas/dicairkan."
                  />
                )}
            </Panel>
          </div>

          {/* ── LAPIS 3 — daftar ──────────────────────────────────────────── */}
          <div className="rise rise-3">
            <Panel
              judul="Jaminan yang menuntut tindakan"
              keterangan="Habis dalam 30 hari ke depan, atau sudah lewat. Paling genting di atas."
              padat
            >
              <Tabel<JaminanMendesak>
                kolom={kolom}
                data={ringkas.daftarMendesak}
                kunciBaris={(j) => j.id}
                caption="Daftar jaminan yang masa berlakunya habis dalam 30 hari atau sudah lewat"
                tandaiBaris={(j) => (j.sisaHari < 0 ? C.redBg : undefined)}
                kosong={
                  <Kosong
                    ikon={<ShieldCheck size={26} />}
                    judul="Tidak ada jaminan yang mendesak"
                    sebab={
                      jaminan.length === 0
                        ? "Register jaminan masih kosong."
                        : "Semua jaminan aktif masih berlaku lebih dari 30 hari lagi."
                    }
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
