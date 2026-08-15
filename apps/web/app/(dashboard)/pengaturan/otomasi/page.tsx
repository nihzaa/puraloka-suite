"use client";

/**
 * PENGATURAN AMBANG OTOMASI — angka yang menentukan kapan pesan dikirim.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lima ambang otomasi sudah tersimpan di basis sejak migrasi 396, dan rute
 * otomasinya sudah membacanya. Tetapi **tak ada satu pun tempat di UI untuk
 * mengubahnya** — ketahuan saat membangun halaman Katalog, yang hendak
 * menautkan "ubah" ke halaman yang ternyata tak pernah dibuat.
 *
 * CLAUDE.md §8 menyebut persis pola ini:
 *
 *   "Kolom DB sudah ada" BUKAN selesai. Config-first berarti ada halaman
 *   pengaturannya di UI.
 *
 * Tanpa halaman ini, satu-satunya cara menyesuaikan ambang adalah mengedit
 * basis langsung — yang berarti tak seorang pun di luar engineer bisa
 * melakukannya, dan angka yang tak bisa diubah pengguna pada akhirnya menjadi
 * angka yang diabaikan pengguna.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEPUTUSAN RANCANGAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── Tiap ambang menjelaskan AKIBATNYA, bukan namanya
 *
 * "otomasi.saldo_menipis.rupiah" tak memberi tahu apa pun. Yang ditampilkan:
 * kalimat yang menyebut apa yang terjadi kalau angkanya diubah — karena orang
 * yang membuka halaman ini sedang menjawab "kenapa saya kebanyakan/kekurangan
 * pesan", bukan sedang membaca dokumentasi.
 *
 * ── Batas atas dan bawah ditegakkan di dua tempat
 *
 * Server sudah menolak nilai di luar rentang. Tapi penolakan yang baru muncul
 * setelah tombol Simpan ditekan datang terlambat — orang sudah mengira
 * perubahannya berlaku. Jadi rentangnya juga ditampilkan dan diperiksa
 * sebelum kirim.
 *
 * ── Kenapa tak ada simpan-otomatis
 *
 * Mengubah ambang berarti mengubah berapa banyak orang menerima pesan besok
 * pagi. Menyimpannya begitu angka diketik membuat setengah-ketikan ("5" dalam
 * perjalanan menuju "50") sempat berlaku sebagai ambang sungguhan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Save, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Galat, Rangka, Kartu, Tombol, gayaInput } from "@/components/dasar";

interface Setelan {
  key: string;
  value: unknown;
}

/**
 * Penjelasan tiap ambang — dalam bahasa akibat, bukan bahasa kolom.
 *
 * Ditulis di sini, bukan diambil dari `description` basis: kolom itu berisi
 * catatan untuk engineer, dan menampilkannya apa adanya kepada pengguna adalah
 * cara paling mudah membuat halaman pengaturan terasa seperti layar debug.
 */
const AMBANG: ReadonlyArray<{
  kunci: string;
  judul: string;
  akibat: string;
  satuan: string;
  min: number;
  maks: number;
  /** Kelipatan yang wajar untuk tombol naik/turun. */
  langkah: number;
}> = [
  {
    kunci: "otomasi.invoice_terlambat.hari",
    judul: "Tagihan lewat jatuh tempo",
    akibat:
      "Pesan dikirim setelah tagihan lewat jatuh tempo sekian hari. Angka kecil "
      + "berarti tahu lebih cepat, tapi juga lebih sering menegur klien yang "
      + "cuma telat sehari.",
    satuan: "hari",
    min: 0,
    maks: 90,
    langkah: 1,
  },
  {
    kunci: "otomasi.hutang_supplier.hari",
    judul: "Pembayaran supplier mendekat",
    akibat:
      "Pengingat dikirim sekian hari SEBELUM tagihan supplier jatuh tempo. "
      + "Angka besar memberi waktu menyiapkan dana; angka kecil membuat "
      + "pengingatnya datang saat sudah tak sempat.",
    satuan: "hari",
    min: 0,
    maks: 60,
    langkah: 1,
  },
  {
    kunci: "otomasi.milestone_berisiko.hari",
    judul: "Milestone terancam meleset",
    akibat:
      "Milestone ditandai berisiko bila tenggatnya tinggal sekian hari dan "
      + "pekerjaannya belum selesai.",
    satuan: "hari",
    min: 1,
    maks: 60,
    langkah: 1,
  },
  {
    kunci: "otomasi.saldo_menipis.rupiah",
    judul: "Saldo kas menipis",
    akibat:
      "Peringatan dikirim ketika total saldo kas turun di bawah angka ini. "
      + "Setel di sekitar kebutuhan operasional satu minggu.",
    satuan: "rupiah",
    min: 0,
    maks: 1_000_000_000,
    langkah: 1_000_000,
  },
  {
    kunci: "otomasi.sertifikat_berakhir.hari",
    judul: "Sertifikat pegawai berakhir",
    akibat:
      "Peringatan dikirim sekian hari sebelum sertifikat keahlian pegawai "
      + "habis masa berlakunya. Setel sesuai lama pengurusan perpanjangan — "
      + "sertifikat yang mati membuat orangnya tak boleh mengerjakan pekerjaan "
      + "tertentu.",
    satuan: "hari",
    min: 1,
    maks: 365,
    langkah: 1,
  },
  {
    kunci: "otomasi.sertifikat_lewat.maks_hari",
    judul: "Berhenti menagih sertifikat lama",
    akibat:
      "Sertifikat yang sudah lewat lebih lama dari ini berhenti ditegur. "
      + "Tanpa batas ini, dokumen yang memang sudah ditinggalkan akan ditagih "
      + "tiap minggu selamanya — dan yang ditagih terus berhenti dibaca.",
    satuan: "hari",
    min: 7,
    maks: 730,
    langkah: 7,
  },
  {
    kunci: "otomasi.transmittal_menggantung.hari",
    judul: "Transmittal belum dikonfirmasi",
    akibat:
      "Pengingat dikirim bila transmittal sudah terkirim sekian hari tanpa "
      + "konfirmasi diterima. Terlalu cepat membuat pesannya terbaca sebagai "
      + "desakan sebelum penerimanya sempat membalas.",
    satuan: "hari",
    min: 1,
    maks: 90,
    langkah: 1,
  },
  {
    kunci: "otomasi.polis_berakhir.hari",
    judul: "Asuransi mendekati berakhir",
    akibat:
      "Peringatan dikirim sekian hari sebelum polis asuransi berakhir. Setel "
      + "sesuai lama pengurusan perpanjangan di perusahaan Anda — peringatan "
      + "yang datang setelah polis lewat tak lagi bisa dipakai untuk apa pun.",
    satuan: "hari",
    min: 1,
    maks: 180,
    langkah: 1,
  },
  {
    kunci: "otomasi.evm_spi.minimum",
    judul: "Kinerja jadwal proyek (SPI)",
    akibat:
      "Proyek ditandai tertinggal bila indeks jadwalnya turun di bawah angka "
      + "ini. 1,0 berarti tepat rencana; 0,9 berarti tertinggal sekitar "
      + "sepersepuluh dari yang dijadwalkan. Menyetelnya ke 1,0 membuat hampir "
      + "semua proyek memicu pesan setiap hari.",
    satuan: "indeks",
    min: 0.1,
    maks: 1,
    // Desimal — satu-satunya bersama CPI. Langkah 0,05 supaya tombol naik/turun
    // bergerak dalam ukuran yang berarti, bukan 0,000001.
    langkah: 0.05,
  },
  {
    kunci: "otomasi.evm_cpi.minimum",
    judul: "Kinerja biaya proyek (CPI)",
    akibat:
      "Proyek ditandai boros bila indeks biayanya turun di bawah angka ini. "
      + "1,0 berarti biaya sepadan dengan pekerjaan yang selesai; di bawahnya "
      + "berarti pengeluaran melebihi nilai yang sudah diperoleh.",
    satuan: "indeks",
    min: 0.1,
    maks: 1,
    langkah: 0.05,
  },
  {
    kunci: "otomasi.harga_material.persen",
    judul: "Harga material naik",
    akibat:
      "Kenaikan harga material diberitahukan bila melampaui persentase ini "
      + "dibanding harga sebelumnya.",
    satuan: "persen",
    min: 1,
    maks: 100,
    langkah: 1,
  },
];

function formatSatuan(n: number, satuan: string): string {
  if (satuan === "rupiah") return `Rp ${n.toLocaleString("id-ID")}`;
  if (satuan === "persen") return `${n}%`;
  /*
    Indeks ditulis dengan koma desimal Indonesia dan DUA angka di belakangnya —
    "0,90", bukan "0.9".

    Bukan sekadar gaya penulisan: pembacanya orang yang sama yang membaca
    nominal rupiah di halaman ini, dan titik dalam angka Indonesia berarti
    pemisah ribuan. "0.9" bisa terbaca sebagai sembilan.
  */
  if (satuan === "indeks") return n.toLocaleString("id-ID", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${n} ${satuan}`;
}

export default function PengaturanOtomasiPage() {
  const [awal, setAwal] = useState<Record<string, number> | null>(null);
  const [nilai, setNilai] = useState<Record<string, number>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  // `setGalat(null)` di dalam blok async — lihat alasannya di halaman
  // Katalog Otomasi: sebagai baris pertama ia menaikkan ratchet lint.
  const muat = useCallback(async () => {
    try {
      setGalat(null);
      const r = await api.get<{ config: Setelan[] }>(
        "/api/v1/settings/config?category=otomasi",
      );
      const peta: Record<string, number> = {};
      for (const s of r.data.config ?? []) {
        if (s.key.startsWith("otomasi.")) peta[s.key] = Number(s.value);
      }
      setAwal(peta);
      setNilai(peta);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat pengaturan otomasi");
    }
  }, []);

  // `queueMicrotask` — sama dengan halaman Katalog Otomasi dan Riwayat
  // Asisten; tanpa itu `setState` berjalan sinkron di badan efek dan ratchet
  // lint naik.
  useEffect(() => { queueMicrotask(() => { void muat(); }); }, [muat]);

  /*
    Hanya yang BERUBAH yang dikirim.

    Mengirim kelimanya tiap Simpan akan mencatat lima perubahan di jejak audit
    untuk satu angka yang benar-benar diubah — dan jejak yang penuh perubahan
    palsu tak bisa dipakai menjawab "siapa yang menaikkan ambang ini".
  */
  const berubah = useMemo(() => {
    if (!awal) return [] as string[];
    return Object.keys(nilai).filter((k) => nilai[k] !== awal[k]);
  }, [nilai, awal]);

  const takSah = useMemo(
    () =>
      AMBANG.filter((a) => {
        const v = nilai[a.kunci];
        return v !== undefined && (!Number.isFinite(v) || v < a.min || v > a.maks);
      }).map((a) => a.kunci),
    [nilai],
  );

  const simpan = async () => {
    if (berubah.length === 0 || takSah.length > 0) return;
    setMenyimpan(true);
    setPesan(null);
    setGalat(null);
    try {
      await api.put("/api/v1/settings/config", {
        updates: berubah.map((k) => ({ key: k, value: nilai[k] })),
      });
      setAwal({ ...nilai });
      setPesan(`${berubah.length} pengaturan tersimpan. Berlaku pada pemeriksaan berikutnya.`);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan pengaturan");
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <>
      <KepalaHalaman
        judul="Ambang Otomasi"
        keterangan="Angka yang menentukan kapan otomasi mengirim pesan."
        ikon={<SlidersHorizontal size={20} />}
        aksi={
          <Tombol href="/otomasi/katalog" jenis="sekunder" ikon={<Bot size={15} />}>
            Lihat katalog
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}
      {!awal && !galat && <Rangka tinggi={104} jumlah={5} />}

      {awal && (
        <>
          {pesan && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginBottom: "var(--r4)",
                padding: "var(--r3)",
                borderRadius: 8,
                background: C.successBg,
                border: `1px solid ${C.successBorder}`,
                color: C.onSuccessBg,
                fontSize: 13,
              }}
            >
              {pesan}
            </div>
          )}

          <div style={{ display: "grid", gap: "var(--r3)" }}>
            {AMBANG.map((a) => {
              const v = nilai[a.kunci];
              const belumAda = v === undefined;
              const salah = takSah.includes(a.kunci);
              const diubah = awal[a.kunci] !== undefined && v !== awal[a.kunci];
              const idMedan = `ambang-${a.kunci.replace(/\./g, "-")}`;

              return (
                <Kartu key={a.kunci} pad="rapat">
                  <div style={{
                    display: "flex", gap: "var(--r4)",
                    flexWrap: "wrap", alignItems: "flex-start",
                  }}>
                    <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                      <label
                        htmlFor={idMedan}
                        style={{
                          display: "block", fontSize: 14, fontWeight: 600,
                          color: C.text, marginBottom: 4,
                        }}
                      >
                        {a.judul}
                      </label>
                      <p style={{
                        margin: 0, fontSize: 13, color: C.mid,
                        lineHeight: 1.6, maxWidth: "60ch",
                      }}>
                        {a.akibat}
                      </p>
                    </div>

                    <div style={{ flex: "0 0 auto", minWidth: 200 }}>
                      <input
                        id={idMedan}
                        type="number"
                        inputMode="numeric"
                        value={belumAda ? "" : v}
                        min={a.min}
                        max={a.maks}
                        step={a.langkah}
                        disabled={belumAda}
                        aria-describedby={`${idMedan}-bantu`}
                        aria-invalid={salah || undefined}
                        onChange={(ev) =>
                          setNilai((s) => ({ ...s, [a.kunci]: Number(ev.target.value) }))
                        }
                        style={{
                          ...gayaInput,
                          /* Angka tabular — kolom tak bergoyang saat digit bertambah. */
                          fontVariantNumeric: "tabular-nums",
                          borderColor: salah ? C.red : diubah ? C.navy : undefined,
                          /* 44px: target sentuh minimum untuk medan angka. */
                          minHeight: 44,
                        }}
                      />
                      <p
                        id={`${idMedan}-bantu`}
                        style={{ margin: "6px 0 0", fontSize: 12, color: salah ? C.red : C.muted }}
                      >
                        {belumAda
                          ? "Belum tersedia untuk perusahaan ini."
                          : salah
                            ? `Harus antara ${formatSatuan(a.min, a.satuan)} dan ${formatSatuan(a.maks, a.satuan)}.`
                            : `Sekarang ${formatSatuan(v, a.satuan)} · rentang ${formatSatuan(a.min, a.satuan)}–${formatSatuan(a.maks, a.satuan)}`}
                      </p>
                    </div>
                  </div>
                </Kartu>
              );
            })}
          </div>

          {/*
            Tombol Simpan tetap terlihat tetapi nonaktif saat tak ada
            perubahan — bukan disembunyikan. Tombol yang muncul-hilang membuat
            orang mengira halaman berubah sendiri.
          */}
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--r3)",
            marginTop: "var(--r4)", flexWrap: "wrap",
          }}>
            <Tombol
              jenis="utama"
              ikon={<Save size={15} />}
              onClick={() => void simpan()}
              disabled={menyimpan || berubah.length === 0 || takSah.length > 0}
            >
              {menyimpan ? "Menyimpan…" : "Simpan perubahan"}
            </Tombol>

            <span style={{ fontSize: 13, color: C.muted }} aria-live="polite">
              {takSah.length > 0
                ? "Ada nilai di luar rentang."
                : berubah.length === 0
                  ? "Belum ada perubahan."
                  : `${berubah.length} pengaturan diubah, belum disimpan.`}
            </span>
          </div>

          <p style={{ marginTop: "var(--r4)", fontSize: 13, color: C.muted, maxWidth: "68ch" }}>
            Ingin tahu apa yang dikerjakan tiap otomasi dan di bagian mana ia dipasang?{" "}
            <Link href="/otomasi/katalog" style={{ color: C.navy, textDecoration: "underline" }}>
              Buka katalog otomasi
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}
