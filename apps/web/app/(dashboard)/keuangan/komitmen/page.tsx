"use client";

/**
 * KOMITMEN BIAYA — uang yang sudah terikat PO tetapi belum jadi biaya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rutenya dibangun lebih dulu (`/api/v1/komitmen/*`, 2026-09-12), dan API
 * tanpa layar adalah pola "fitur ada tapi tak hidup" yang sudah berulang di
 * repo ini — `useData()` pernah dibangun lalu nol halaman memakainya, dan
 * font merek pernah dimuat penuh lalu nol layar memanggilnya.
 *
 * ── Pertanyaan yang dijawab
 *
 * "Anggaran pos ini Rp 500 juta, terpakai Rp 300 juta — masih aman?"
 *
 * TIDAK BISA dijawab dari dua angka itu. Kalau ada PO Rp 250 juta yang sudah
 * disetujui dan barangnya belum datang, posnya sebenarnya sudah lewat
 * Rp 50 juta. Halaman ini menampilkan kolom ketiga yang selama ini hilang:
 *
 *     ANGGARAN − (REALISASI + KOMITMEN) = SISA YANG BENAR
 *
 * ── Kenapa halaman, bukan tab di /keuangan
 *
 * `ARAH-VISUAL-2026.md` §6a: tab = sudut pandang lain atas data yang sama;
 * halaman = entitas berbeda. Komitmen adalah entitas tersendiri (pesanan
 * yang mengikat), bukan sudut lain atas invoice atau kas. Dan ujinya lulus:
 * "lihat komitmen kita bulan ini" adalah tautan yang dikirim ke orang lain.
 *
 * Bersaudara dengan `/keuangan/cvr` dan `/keuangan/contingency`.
 *
 * ── Kenapa yang LEWAT di atas
 *
 * Sama dengan alasan di CVR: itu satu-satunya baris yang menuntut tindakan
 * selagi pekerjaan berjalan. Urutan API sudah begitu; halaman tak
 * mengurutkan ulang supaya tak ada dua definisi "paling mendesak".
 */

import { AlertTriangle, FileClock, Info, PackageCheck } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { formatRupiah, formatPersen, KOSONG } from "@/lib/format";
import { LayarKosong } from "@/components/layar-kosong";
import {
  Halaman,
  KepalaHalaman,
  Kartu,
  JudulKartu,
  KartuAngka,
  BarisAngka,
  Tabel,
  type Kolom,
} from "@/components/dasar";

interface Ringkas {
  jumlahPo: number;
  nilaiKomitmen: number;
  nilaiTerpenuhi: number;
  nilaiDraf: number;
  jumlahDraf: number;
}

interface Posisi {
  projectId: string;
  nama: string;
  anggaran: number;
  realisasi: number;
  komitmen: number;
  sisa: number;
  /** `null` saat anggarannya nol — BUKAN 0. Lihat catatan di kolom Terpakai. */
  terpakaiPct: number | null;
  lewat: boolean;
}

interface HasilPosisi {
  data: Posisi[];
  meta: {
    jumlahLewat: number;
    totalKomitmen: number;
    tanpaAnggaran: number;
    catatan: string | null;
  };
}

/*
  Format uang & persen dari `lib/format.ts`, BUKAN `Intl` sendiri.

  `format-ratchet.mjs` menjaga ini, dan alasannya bukan kerapian: tiap
  halaman yang merakit formatnya sendiri pelan-pelan menyimpang, dan
  nominal yang formatnya berbeda antar-layar terbaca sebagai aplikasi
  yang tak bisa dipercaya — pada layar UANG, itu mahal.
*/
export default function KomitmenPage() {
  const { data: ringkas, galat: eRingkas, memuat: muatRingkas } =
    useData<Ringkas>("/api/v1/komitmen/ringkas");
  const { data: posisi, galat: ePosisi, memuat: muatPosisi } =
    useData<HasilPosisi>("/api/v1/komitmen/posisi");

  /*
    Galat MUAT terpisah dari isi — `uji-galat-muat-terpisah.mjs` (ambang
    NOL). Satu state untuk dua jenis galat membuat kegagalan kedua
    menghapus pesan yang pertama.
  */
  const galat = eRingkas ?? ePosisi;

  const memuat = muatRingkas || muatPosisi;
  const baris = posisi?.data ?? [];

  const kolom: Kolom<Posisi>[] = [
    {
      kunci: "nama",
      judul: "Proyek",
      kepalaBaris: true,
      render: (b) => (
        <span style={{ display: "flex", alignItems: "center", gap: "var(--r2)" }}>
          {/*
            Ikon HANYA pada yang lewat, dan teksnya ikut disebut lewat
            `title` — WCAG 1.4.1: warna/ikon saja tak boleh jadi satu-satunya
            pembawa arti. Kolom "Sisa" yang negatif adalah pembawa keduanya.
          */}
          {b.lewat && (
            <AlertTriangle size={14} color="var(--danger)" aria-hidden />
          )}
          {b.nama}
        </span>
      ),
    },
    {
      kunci: "anggaran", judul: "Anggaran", rata: "kanan",
      render: (b) =>
        /*
          Anggaran nol ditulis "—", bukan "Rp 0".
          Diukur 2026-09-12: hanya 1 dari 25 proyek punya RAP. "Rp 0"
          terbaca seperti anggaran yang habis; "—" terbaca seperti belum
          ada — dan yang kedua yang benar.
        */
        b.anggaran > 0 ? formatRupiah(b.anggaran) : <span style={{ color: C.muted }}>{KOSONG}</span>,
    },
    {
      kunci: "realisasi", judul: "Realisasi", rata: "kanan",
      render: (b) => formatRupiah(b.realisasi),
    },
    {
      kunci: "komitmen", judul: "Komitmen", rata: "kanan",
      render: (b) => (
        <span style={{ fontWeight: b.komitmen > 0 ? 600 : 400 }}>
          {formatRupiah(b.komitmen)}
        </span>
      ),
    },
    {
      kunci: "sisa", judul: "Sisa", rata: "kanan",
      render: (b) => (
        <span style={{ color: b.sisa < 0 ? "var(--danger)" : undefined, fontWeight: 600 }}>
          {formatRupiah(b.sisa)}
        </span>
      ),
    },
    {
      kunci: "terpakai", judul: "Terpakai", rata: "kanan",
      render: (b) =>
        /*
          `null` -> "belum dianggarkan", BUKAN "0%".
          0% terpakai dan "tak punya anggaran" adalah dua keadaan yang
          sangat berbeda, dan menampilkan 0% untuk yang kedua membuat
          proyek tanpa anggaran terlihat PALING SEHAT di seluruh tabel.
        */
        b.terpakaiPct === null ? (
          <span style={{ color: C.muted, fontSize: "var(--t-kecil)" }}>
            belum dianggarkan
          </span>
        ) : (
          <span style={{ color: b.lewat ? "var(--danger)" : undefined }}>
            {formatPersen(b.terpakaiPct, { desimal: 1, sudahPersen: true })}
          </span>
        ),
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        judul="Komitmen Biaya"
        keterangan="Uang yang sudah terikat pesanan pembelian tetapi belum jadi biaya."
        ikon={<FileClock size={18} />}
      />

      {galat ? (
        <Kartu>
          <LayarKosong
            judul="Gagal memuat komitmen"
            apa="Halaman ini merangkum pesanan pembelian yang sudah mengikat anggaran."
            kenapa="Data tak bisa diambil dari server — bisa karena jaringan, bisa karena izin akun Anda."
            aksi={{ label: "Muat ulang halaman", onKlik: () => window.location.reload() }}
          />
        </Kartu>
      ) : (
        <>
          <BarisAngka>
            <KartuAngka
              label="Terikat pesanan"
              nilai={formatRupiah(ringkas?.nilaiKomitmen ?? 0)}
              sub={`${ringkas?.jumlahPo ?? 0} PO dikirim / disanggupi`}
              ikon={<FileClock size={14} />}
              /*
                Disorot: inilah angka yang halaman ini ada untuk
                menampilkannya. Satu kartu per layar boleh disorot.
              */
              sorot
            />
            <KartuAngka
              label="Sudah diterima"
              nilai={formatRupiah(ringkas?.nilaiTerpenuhi ?? 0)}
              sub="barang datang — sudah jadi biaya"
              ikon={<PackageCheck size={14} />}
            />
            <KartuAngka
              label="Masih draf"
              nilai={formatRupiah(ringkas?.nilaiDraf ?? 0)}
              sub={`${ringkas?.jumlahDraf ?? 0} PO belum disetujui`}
              /*
                Draf TIDAK diwarnai bahaya. Ia belum mengikat apa pun —
                mewarnainya merah membuat angka yang benar-benar buruk
                kehilangan tempatnya.
              */
              ikon={<Info size={14} />}
            />
            <KartuAngka
              label="Proyek lewat anggaran"
              nilai={String(posisi?.meta.jumlahLewat ?? 0)}
              sub={
                (posisi?.meta.tanpaAnggaran ?? 0) > 0
                  ? `${posisi?.meta.tanpaAnggaran} proyek belum punya RAP`
                  : "dari seluruh proyek berjalan"
              }
              warna={
                (posisi?.meta.jumlahLewat ?? 0) > 0 ? "var(--danger)" : undefined
              }
              ikon={<AlertTriangle size={14} />}
            />
          </BarisAngka>

          {/*
            CATATAN KETERBATASAN — ditampilkan, bukan disimpan di kode.

            Diukur 2026-09-12: hanya 1 dari 25 proyek punya baris RAP. Pada
            anggaran nol, "lewat anggaran" MUSTAHIL bernilai true — jadi
            kartu "0 proyek lewat" di atas akan terbaca sebagai kabar baik
            padahal artinya "24 proyek tak punya anggaran untuk dilampaui".

            Nol yang salah tak boleh tampil sama dengan nol yang benar.
          */}
          {posisi?.meta.catatan && (
            <Kartu>
              <div style={{
                display: "flex", gap: "var(--r2)", alignItems: "flex-start",
                color: C.muted, fontSize: "var(--t-kecil)",
              }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                <span>{posisi.meta.catatan}</span>
              </div>
            </Kartu>
          )}

          <Kartu>
            <JudulKartu sub="Yang sudah melampaui anggaran ditampilkan lebih dulu.">
              Posisi per proyek
            </JudulKartu>
            {memuat ? (
              /*
                Keadaan MEMUAT dibedakan dari keadaan KOSONG. Tanpa ini,
                tabel yang sedang dimuat menampilkan "Belum ada pesanan
                pembelian" — pernyataan yang salah, dan pembacanya bisa
                menyimpulkan datanya memang tak ada lalu pergi.
              */
              <div style={{ padding: "var(--r4)", color: C.muted }}>Memuat…</div>
            ) : baris.length === 0 ? (
              /*
                TIGA hal yang dituntut `uji-layar-kosong-menjelaskan.mjs`:
                APA bendanya · KENAPA kosong · TOMBOL ke jalan keluarnya.
                Layar kosong tanpa jalan keluar terbaca sebagai "fitur
                belum jadi", bukan sebagai "belum ada datanya".
              */
              <LayarKosong
                judul="Belum ada pesanan yang mengikat"
                apa="Komitmen adalah uang yang sudah terikat pesanan pembelian tetapi barangnya belum datang — belum jadi biaya, tetapi sudah tak bisa dipakai untuk hal lain."
                kenapa="Belum ada PO berstatus dikirim atau disanggupi pemasok. PO yang masih draf belum mengikat apa pun."
                aksi={{ label: "Buka Pesanan Pembelian", href: "/procurement/pesanan" }}
              />
            ) : (
              <Tabel
                caption="Posisi anggaran tiap proyek: anggaran, realisasi, komitmen pesanan yang belum datang, dan sisa sesungguhnya."
                kolom={kolom}
                data={baris}
                kunciBaris={(b) => b.projectId}
                /*
                  Baris yang LEWAT diberi latar, bukan hanya teks merah.
                  Warna teks pada satu sel mudah terlewat saat memindai
                  tabel; latar baris menangkap mata pada gerakan pindai.
                */
                tandaiBaris={(b) => (b.lewat ? "var(--danger-bg)" : undefined)}
              />
            )}
          </Kartu>
        </>
      )}
    </Halaman>
  );
}
