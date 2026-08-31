"use client";

import { use } from "react";
import Link from "next/link";
import { Lock, ArrowRight, Check } from "lucide-react";
import { KepalaHalaman, Tombol } from "@/components/dasar";

/**
 * MODUL TERKUNCI — halaman yang dituju menu bergembok.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN, BUKAN SEKADAR PESAN GALAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * API sudah menolak modul tertutup dengan 402. Yang tak dijawab 402: APA
 * modulnya, APA gunanya, dan APA yang harus dilakukan orang yang menginginkan-
 * nya. Pengguna yang cuma melihat penolakan menyimpulkan aplikasinya rusak.
 *
 * Halaman ini menjawab tiga hal — bentuk yang sama dengan halaman
 * "belum dibangun" di `/m/[key]`, dan karena alasan yang sama: penolakan yang
 * tak menjelaskan apa pun adalah bentuk paling jujur dari tidak-diurus.
 *
 *   1. APA modul ini, dengan bahasa kerja — bukan nama teknis
 *   2. APA yang bisa dikerjakan di dalamnya (daftar konkret, bukan janji)
 *   3. KE MANA sekarang — hubungi siapa untuk membukanya
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG SENGAJA TIDAK DILAKUKAN DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tak ada hitung mundur, tak ada "khusus hari ini", tak ada harga yang dicoret.
 * Pengguna yang melihat halaman ini sedang bekerja dan baru saja terhalang —
 * menekannya di titik itu merusak kepercayaan yang justru dibutuhkan untuk
 * menjual.
 *
 * Dan satu hal yang lebih praktis: harga TIDAK ditampilkan di sini. Harga
 * hidup di konsol vendor dan berubah; angka yang dipaku di halaman produk akan
 * membusuk, lalu berbohong ke pelanggan tentang berapa yang harus ia bayar.
 *
 * ── Arah visual
 *
 * Mengikuti `ARAH-VISUAL-2026.md`: navy `var(--navy)` sebagai satu-satunya
 * aksi utama di layar (§3d — satu aksen per layar), kartu di atas `var(--bg)`,
 * token spasi `--pad-*`. Tak ada gaya baru yang diciptakan di sini.
 */

/**
 * Apa yang bisa dikerjakan tiap modul, dengan bahasa kerja.
 *
 * ⚠ Ditulis TANGAN dan sengaja konkret. "Fitur akuntansi lengkap" tak memberi
 * tahu apa pun — yang berguna adalah kalimat yang bisa dikenali orang sebagai
 * pekerjaannya sendiri.
 *
 * Kuncinya cermin katalog (`plan_features.key`). Modul yang tak terdaftar di
 * sini tetap menampilkan halaman ini, hanya tanpa daftar isinya — jatuh yang
 * lunak, bukan halaman rusak.
 */
const ISI_MODUL: Record<string, { nama: string; guna: string; butir: string[] }> = {
  "modul.akuntansi": {
    nama: "Akuntansi",
    guna: "Mencatat semua transaksi ke pembukuan yang bisa diaudit.",
    butir: ["Bagan akun dan jurnal umum", "Buku besar dan neraca saldo", "Tutup buku bulanan", "Jurnal otomatis dari transaksi proyek"],
  },
  "modul.keuangan": {
    nama: "Keuangan",
    guna: "Mengatur uang masuk dan keluar proyek.",
    butir: ["Invoice dan penagihan termin", "Kas, bank, dan rekonsiliasi", "Kasbon dan pertanggungjawaban", "Piutang dan umur tagihan"],
  },
  "modul.gudang": {
    nama: "Gudang & Material",
    guna: "Melacak material dari datang sampai terpakai di lapangan.",
    butir: ["Stok per gudang dan per proyek", "Transfer antar gudang", "Susut material dan rekonsiliasi", "Material milik klien"],
  },
  "modul.pengadaan": {
    nama: "Pengadaan",
    guna: "Membeli material dan jasa dengan jejak yang bisa diperiksa.",
    butir: ["Permintaan material dan persetujuannya", "Pesanan pembelian ke supplier", "Penerimaan barang", "Perbandingan harga antar supplier"],
  },
  "modul.sdm": {
    nama: "SDM & Payroll",
    guna: "Mengelola pegawai tetap, absensi, dan penggajian.",
    butir: ["Data pegawai dan kontraknya", "Absensi dan timesheet", "Perhitungan gaji", "Cuti dan klaim perjalanan"],
  },
  "modul.mandor": {
    nama: "Mandor & Subkon",
    guna: "Mengelola pekerja borongan dan subkontraktor.",
    butir: ["Penugasan mandor per proyek", "Opname bersama di lapangan", "SPK dan pembayaran borongan", "Back-charge dan potongan"],
  },
  "modul.alat": {
    nama: "Alat & Aset",
    guna: "Melacak alat berat dan peralatan operasional.",
    butir: ["Daftar alat dan kondisinya", "Penempatan alat per proyek", "Jadwal perawatan", "Penyusutan aset"],
  },
  "modul.uji_mutu": {
    nama: "Mutu (QA/QC)",
    guna: "Memastikan pekerjaan sesuai spesifikasi, dengan buktinya.",
    butir: ["Rencana mutu dan ITP", "Uji material dan hasilnya", "NCR dan tindak lanjutnya", "Audit mutu internal"],
  },
  "modul.k3_lingkungan": {
    nama: "K3 & Lingkungan",
    guna: "Memenuhi syarat keselamatan kerja yang diminta pemberi tugas.",
    butir: ["Induksi K3 dan APD", "JSA dan izin kerja", "Pelaporan insiden", "RK3K dan kepatuhan lingkungan"],
  },
  "modul.risiko": {
    nama: "Risiko & Kepatuhan",
    guna: "Mencatat risiko proyek sebelum jadi masalah.",
    butir: ["Register risiko dan mitigasinya", "Sengketa dan klaim", "Dokumen kepatuhan", "Perizinan proyek"],
  },
  "modul.dokumen": {
    nama: "Dokumen",
    guna: "Menyimpan dokumen proyek dengan versi dan persetujuannya.",
    butir: ["Kendali dokumen dan revisinya", "Surat masuk dan keluar", "Submittal ke pemberi tugas", "Verifikasi keaslian dokumen"],
  },
  "modul.bi": {
    nama: "Pelaporan & BI",
    guna: "Melihat keadaan seluruh proyek dalam satu layar.",
    butir: ["Laporan tersusun siap cetak", "Dasbor lintas proyek", "Ekspor ke Excel", "Grafik tren dan perbandingan"],
  },
  "modul.ai": {
    nama: "AI & Otomasi",
    guna: "Menyerahkan pekerjaan berulang ke asisten dan aturan otomatis.",
    butir: ["Asisten yang menjawab dari data Anda", "Pengingat otomatis lewat WhatsApp", "Tugas terjadwal tanpa dijalankan manual", "Ringkasan proyek harian"],
  },
  "modul.crm": {
    nama: "CRM & Tender",
    guna: "Mengelola calon pekerjaan sebelum jadi proyek.",
    butir: ["Prospek dan tindak lanjutnya", "Tender yang diikuti", "Penawaran ke calon klien", "Kualifikasi vendor"],
  },
  "modul.kontrak": {
    nama: "Kontrak",
    guna: "Mengelola kontrak, perubahannya, dan terminnya.",
    butir: ["Register kontrak dan addendum", "Change order", "Termin pembayaran", "Asuransi dan jaminan"],
  },
  "modul.jadwal": {
    nama: "Perencanaan & Jadwal",
    guna: "Merencanakan urutan pekerjaan dan memantau keterlambatan.",
    butir: ["Kurva S dan baseline", "Lintasan kritis (CPM)", "Milestone dan denda keterlambatan", "Perbandingan rencana vs realisasi"],
  },
  "modul.rap": {
    nama: "RAP & Kendali Biaya",
    guna: "Menjaga biaya pelaksanaan tidak melewati anggaran.",
    butir: ["Rencana anggaran pelaksanaan", "Realisasi biaya per item", "Varians dan penyebabnya", "Proyeksi biaya akhir proyek"],
  },
  "modul.lapangan": {
    nama: "Lapangan",
    guna: "Mencatat apa yang benar-benar terjadi di lokasi, harian.",
    butir: ["Progres harian dengan foto", "Instruksi lapangan", "Punch list dan serah terima", "Inspeksi pekerjaan"],
  },
  "modul.estimasi": {
    nama: "Estimasi & Anggaran",
    guna: "Menyusun RAB dari analisa harga satuan.",
    butir: ["RAB berjenjang", "AHSP dan harga satuan", "Versi estimasi dan perbandingannya", "Take-off volume dari gambar"],
  },
};

export default function ModulTerkunciPage({
  params,
}: {
  params: Promise<{ modul: string }>;
}) {
  const { modul } = use(params);
  // Kunci dinormalkan: tautan dari sidebar mengirim `modul.akuntansi`, tetapi
  // URL yang diketik orang bisa saja `akuntansi` saja.
  const kunci = modul.startsWith("modul.") ? modul : `modul.${modul}`;
  const isi = ISI_MODUL[kunci];

  const C = {
    navy: "var(--navy)",
    border: "var(--border-strong)",
    mid: "var(--text-secondary)",
    muted: "var(--text-muted)",
  };

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      <KepalaHalaman
        judul={isi ? isi.nama : "Modul terkunci"}
        ikon={<Lock size={19} />}
      />

      <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.mid, lineHeight: 1.65, maxWidth: "62ch" }}>
        {isi
          ? `${isi.guna} Modul ini belum termasuk paket langganan perusahaan Anda.`
          : "Modul ini belum termasuk paket langganan perusahaan Anda."}
      </p>

      {/* Kartu isi modul — jawaban atas "apa yang saya dapat kalau membukanya". */}
      {isi && (
        <div
          style={{
            marginTop: 20,
            padding: "var(--pad-kartu, 16px)",
            borderRadius: "var(--radius-md, 10px)",
            border: `1px solid ${C.border}`,
            background: "var(--surface-raised, #fff)",
            maxWidth: 640,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Yang bisa dikerjakan di modul ini
          </h2>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
            {isi.butir.map((b) => (
              <li key={b} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
                {/* Ikon centang PLUS teks — bukan warna sendirian (WCAG 1.4.1). */}
                <Check size={14} style={{ color: C.navy, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Satu aksi utama saja (ARAH-VISUAL §3d: satu aksen per layar).

        Harga sengaja TIDAK ditampilkan: ia hidup di konsol vendor dan berubah,
        dan angka yang dipaku di sini akan membusuk lalu berbohong ke pelanggan
        tentang berapa yang harus ia bayar.
      */}
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {/*
          ⚠ Menunjuk `/pengaturan/perusahaan`, BUKAN `/pengaturan/langganan`.
          Yang kedua saya tulis dari ingatan dan TIDAK ADA — tautan mati di
          halaman yang justru dibuat untuk memandu orang keluar dari jalan
          buntu adalah kegagalan yang paling menyakitkan bentuknya.
          Dijaga `audit-tautan-upsell-hidup.mjs` (ambang NOL).
        */}
        {/*
          `<Tombol jenis="utama">`, BUKAN gaya sendiri.
          `uji-tombol-primer-seragam.mjs` menangkap versi pertama saya yang
          menulis `background: C.navy` sendiri: dua konvensi tombol yang hidup
          berdampingan tak terlihat salah di satu halaman, tapi selisihnya
          terasa saat pengguna BERPINDAH halaman.
        */}
        {/* `/pengaturan/langganan` — paket, tagihan, dan keadaan akun.
            ⚠ Rute ini sempat ditulis dari INGATAN sebelum halamannya ada,
            dan `audit-tautan-upsell-hidup.mjs` merahkannya. Sekarang hidup;
            penjaganya tetap ada supaya tak terulang. */}
        <Tombol href="/pengaturan/langganan" jenis="utama" ikon={<ArrowRight size={14} aria-hidden="true" />}>
          Lihat paket & tagihan
        </Tombol>

        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 500, color: C.mid, textDecoration: "none" }}>
          Kembali ke Dashboard
        </Link>
      </div>

      <p style={{ marginTop: 18, fontSize: 12, color: C.muted, lineHeight: 1.6, maxWidth: "62ch" }}>
        Kalau Anda merasa modul ini seharusnya sudah terbuka, hubungi admin
        perusahaan Anda — paket diatur di satu tempat untuk seluruh pengguna.
      </p>
    </div>
  );
}
