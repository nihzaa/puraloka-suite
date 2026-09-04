"use client";

/**
 * HAPUS BERSTATUS — satu bentuk untuk enam modul yang aturannya sama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PRINSIP YANG DITULIS API-NYA SENDIRI, BERULANG DI ENAM TEMPAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap rute hapus di repo ini menolak dengan kalimat yang bentuknya sama:
 *
 *   punch-items  "Temuan berstatus 'X' tidak bisa dihapus. Gunakan status
 *                `ditolak` dengan alasan — RIWAYATNYA HARUS TETAP ADA."
 *   inspections  "Gunakan status `dibatalkan` — HASIL PEMERIKSAAN HARUS
 *                TETAP TEREKAM."
 *   bids         "Tender yang sudah diputuskan menang/kalah tak bisa dihapus
 *                — ubah statusnya jadi 'batal' bila perlu"
 *   rfis         hanya `draft`
 *   submittals   hanya `draft`
 *
 * Prinsipnya satu: **yang sudah bergerak meninggalkan jejak, dan jejak itu
 * lebih berharga daripada kerapian daftar.** Menghapus RFI yang sudah dikirim
 * ke konsultan menghapus bukti bahwa ia pernah dikirim — dan lama menggantung
 * RFI itulah angka yang dibawa ke klaim perpanjangan waktu.
 *
 * ── Kenapa komponen bersama, bukan enam modal
 *
 * Enam salinan akan menyimpang, dan yang menyimpang pertama adalah
 * KALIMATNYA — lalu satu modul menjelaskan alasannya dan lima lainnya cuma
 * berkata "yakin hapus?". Yang bernilai di sini justru kalimatnya.
 *
 * Yang TIDAK diseragamkan: aturan status per modul. Itu datang dari API dan
 * berbeda-beda (`draft`, `terbuka`, `diminta`, bukan-`menang/kalah`), jadi
 * pemanggil yang menentukannya — komponen ini hanya menyampaikan.
 */

import { useState } from "react";
import { C } from "@/lib/warna-ui";
import {
  ModalDasar, TombolModal, KakiModal, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";

export type SasaranHapus = {
  /**
   * Yang MENJALANKAN penghapusan. Komponen ini sengaja tak tahu apa-apa
   * tentang HTTP.
   *
   * ⚠️ Versi pertama menerima `jalur: string` dan memanggil
   * `api.delete(jalur)` sendiri. Dua hal salah dengannya:
   *
   * 1. Modal konfirmasi jadi tahu bentuk API — dan tiap modul yang jalurnya
   *    tak persis "DELETE <path>" (mis. butuh badan, atau dua panggilan)
   *    harus dikecualikan.
   * 2. `ukur-kematangan-modul` MENOLAKNYA, dan penolakannya benar: literal
   *    path ada di halaman pemanggil, `api.delete` ada di berkas ini, dan
   *    keduanya dipisah batas modul. Endpoint tetap terhitung tak berjalan.
   *
   * Dengan `jalankan`, literal path dan `api.delete` berdiri berdampingan di
   * halaman pemanggil — terbaca alat, dan lebih jujur soal siapa yang
   * bertanggung jawab atas panggilannya.
   */
  jalankan: () => Promise<void>;
  /** Nama benda dalam kalimat, mis. "RFI-012". */
  nama: string;
  /** Jenis benda untuk kalimat, mis. "RFI" · "temuan" · "pengajuan". */
  jenis: string;
  /** Status sekarang. Dipakai memutuskan boleh-tidaknya + kalimatnya. */
  status: string;
  /**
   * Status yang MASIH boleh dihapus. Diambil dari aturan API modul itu —
   * komponen ini tak menebaknya.
   */
  statusBolehHapus: readonly string[];
  /**
   * Apa yang harus dilakukan sebagai gantinya bila statusnya sudah lewat.
   * Kalimat ini datang dari API modulnya, bukan dikarang di sini.
   */
  gantinya: string;
};

export function ModalHapusBerstatus({ sasaran, onClose, onSukses }: {
  sasaran: SasaranHapus; onClose: () => void; onSukses: () => void;
}) {
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const boleh = sasaran.statusBolehHapus.includes(sasaran.status);

  async function hapus() {
    if (!boleh || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await sasaran.jalankan();
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, `Gagal menghapus ${sasaran.jenis}.`));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-hapus-status" judul={`Hapus ${sasaran.nama}?`}
      lebar={460} onClose={onClose}>
      {boleh ? (
        <>
          <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
            {sasaran.jenis.charAt(0).toUpperCase() + sasaran.jenis.slice(1)}{" "}
            <strong style={{ color: C.text }}>{sasaran.nama}</strong> dihapus permanen.
            Tak bisa dikembalikan.
          </p>
          <p style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.5 }}>
            Statusnya masih <strong>{sasaran.status}</strong> — belum bergerak ke mana
            pun, jadi tak ada jejak yang hilang karenanya. {sasaran.gantinya}
          </p>
        </>
      ) : (
        /*
          Modal tetap DIBUKA meski tak boleh, alih-alih tombolnya
          disembunyikan sepenuhnya di beberapa tempat dan tidak di tempat
          lain.

          Alasannya: pemakai yang mencari cara membatalkan sesuatu perlu tahu
          BAHWA ada caranya dan APA caranya. Tombol yang menghilang tanpa
          jejak membuat orang menyimpulkan fiturnya tak ada, lalu mencari ke
          tempat yang salah.
        */
        <div role="alert" style={{
          padding: "10px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.55,
          background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
          color: C.text,
        }}>
          <strong style={{ color: "var(--warning)" }}>
            Berstatus &ldquo;{sasaran.status}&rdquo; — tak bisa dihapus.
          </strong>
          <div style={{ marginTop: 4, color: C.mid }}>
            {sasaran.gantinya}
          </div>
        </div>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>{boleh ? "Batal" : "Tutup"}</TombolModal>
        {boleh && (
          <TombolModal utama onClick={hapus} mati={kirim}>
            {kirim ? "Menghapus…" : "Hapus"}
          </TombolModal>
        )}
      </KakiModal>
    </ModalDasar>
  );
}

/**
 * Aturan hapus per modul — DITURUNKAN dari API, bukan dikarang.
 *
 * Ditaruh bersama supaya enam pemanggil tak menuliskan versinya masing-masing
 * dan menyimpang. Kalau aturan di API berubah, ini satu tempat yang harus
 * ikut berubah — dan `ukur-kematangan-modul` takkan menangkapnya, jadi
 * catatan ini satu-satunya pengingat.
 */
export const ATURAN_HAPUS = {
  bids: {
    jenis: "tender",
    // API menolak `menang`/`kalah`; sisanya boleh.
    statusBolehHapus: ["prospek", "go", "no_go", "diajukan", "batal"],
    gantinya: "Tender yang sudah diputuskan menang atau kalah tak bisa dihapus — ubah statusnya jadi “batal” bila perlu.",
  },
  punch: {
    jenis: "temuan",
    statusBolehHapus: ["terbuka"],
    gantinya: "Temuan yang sudah dikerjakan atau diverifikasi tetap tercatat — pakai status “ditolak” beserta alasannya, karena riwayatnya harus tetap ada.",
  },
  rfi: {
    jenis: "RFI",
    statusBolehHapus: ["draft"],
    gantinya: "RFI yang sudah dikirim ke konsultan tak bisa dihapus — lama menggantungnya adalah angka yang dibawa ke klaim perpanjangan waktu.",
  },
  submittal: {
    jenis: "pengajuan",
    statusBolehHapus: ["draft"],
    gantinya: "Pengajuan yang sudah dikirim tetap tercatat — riwayat “ditolak 3× sebelum disetujui” adalah fakta yang menjelaskan keterlambatan pengadaan.",
  },
  inspeksi: {
    jenis: "permintaan inspeksi",
    statusBolehHapus: ["diminta"],
    gantinya: "Pakai status “dibatalkan” — hasil pemeriksaan harus tetap terekam.",
  },
  /**
   * Item lingkup borongan. Berbeda dari lima di atas: statusnya TIDAK ada di
   * basis — ia diturunkan dari `volume_done`.
   *
   * Aturannya sendiri bukan aturan API (rutenya menghapus tanpa syarat),
   * melainkan aturan yang datang dari akibatnya: volume yang sudah
   * direalisasikan adalah DASAR PEMBAYARAN borongan. Menghapus itemnya
   * menghapus dasar itu, dan pembayaran yang sudah jalan kehilangan
   * penjelasannya — tanpa satu pun galat, karena barisnya memang boleh
   * dihapus.
   */
  itemLingkup: {
    jenis: "item pekerjaan",
    statusBolehHapus: ["belum dikerjakan"],
    gantinya: "Item yang volumenya sudah direalisasikan tak bisa dihapus dari sini — realisasi itulah dasar pembayaran borongan. Kalau salah catat, turunkan volumenya lewat “Realisasi”, supaya koreksinya terlihat.",
  },
  penawaran: {
    jenis: "surat penawaran",
    // API menolak apa pun selain `draft`.
    statusBolehHapus: ["draft"],
    gantinya: "Surat yang sudah dikirim tak bisa dihapus — ia ada di tangan calon pemberi kerja, dan arsip yang tak memuatnya membuat kita tak bisa membuktikan apa yang pernah ditawarkan. Pakai status “batal” bila penawarannya ditarik.",
  },
} as const;
