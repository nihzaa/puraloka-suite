import Link from "next/link";

/**
 * HALAMAN 404 — satu-satunya layar yang muncul justru saat orang tersesat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA, DAN KENAPA ISINYA BUKAN CUMA "HALAMAN TIDAK DITEMUKAN"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-16 berkas ini TIDAK ADA sama sekali: Next.js menampilkan
 * halaman bawaannya — teks hitam-putih tanpa identitas, tanpa jalan pulang.
 *
 * Ditemukan founder dengan cara yang paling jelek: mengeklik menu di sidebar
 * aplikasinya sendiri (`/aset/perawatan`) dan mendarat di layar kosong milik
 * framework. Diukur sesudahnya, LIMA menu aktif menunjuk halaman yang tak
 * pernah dibuat.
 *
 * ── Yang membedakan 404 yang berguna dari yang sekadar cantik
 *
 * Orang sampai ke sini karena SATU dari tiga sebab, dan ketiganya butuh
 * tindakan berbeda:
 *
 *   1. salah ketik alamat            → kembali saja
 *   2. menu menunjuk halaman mati    → bukan salah mereka; harus bisa lapor
 *   3. modulnya memang belum dibangun → mereka butuh tahu ITU, bukan menebak
 *
 * Halaman ini tak bisa membedakan ketiganya dari sisi klien — jadi ia tidak
 * berpura-pura tahu. Yang disediakan: jalan pulang yang jelas, DAN penunjuk
 * ke Peta Modul yang memang bertugas menjawab "apa yang sudah bisa dipakai".
 *
 * Itu sebabnya tautan kedua ke `/peta-modul`, bukan sekadar "Kembali".
 *
 * ── Kenapa nol JavaScript
 *
 * Server Component murni. Halaman galat yang butuh JS untuk tampil akan gagal
 * tampil persis saat aplikasinya sedang bermasalah — dan 404 adalah layar yang
 * harus paling tak mungkin ikut rusak.
 *
 * ── Kenapa tak memakai `C` dari `warna-ui`
 *
 * Berkas ini berada DI LUAR `(dashboard)`, jadi ia muncul juga untuk rute yang
 * tak punya shell. Token CSS langsung bekerja di kedua keadaan; objek warna
 * yang di-import ikut menyeret modul lain ke dalam bundel halaman galat.
 */
export default function TidakDitemukan() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560, textAlign: "center" }}>
        {/* Angka 404 sebagai grafik, bukan judul.
            `aria-hidden` supaya pembaca layar tak mengeja "empat nol empat"
            sebelum sampai ke kalimat yang sebenarnya berguna. */}
        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(84px, 22vw, 148px)",
            lineHeight: 0.9,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            background: "var(--grad-navy)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            // Cadangan bila background-clip:text tak didukung — tanpa ini
            // angkanya bisa hilang sama sekali, bukan sekadar kurang cantik.
            WebkitTextFillColor: "transparent",
          }}
        >
          404
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-judul)",
            fontWeight: 700,
            margin: "8px 0 10px",
            letterSpacing: "-0.02em",
          }}
        >
          Halaman ini tidak ada
        </h1>

        <p
          style={{
            fontSize: "var(--t-sedang)",
            lineHeight: "var(--tinggi-baris)",
            color: "var(--text-secondary)",
            margin: "0 auto 26px",
            maxWidth: "var(--w-baca)",
          }}
        >
          Alamatnya mungkin salah ketik, atau modulnya memang belum dibangun.
          <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {" "}Peta Modul
          </strong>{" "}
          memuat seluruh modul beserta keadaannya hari ini — termasuk yang
          belum bisa dipakai.
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "0 22px",
              borderRadius: 10,
              background: "var(--grad-aksen)",
              color: "var(--on-aksen)",
              fontSize: "var(--t-sedang)",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid var(--navy)",
            }}
          >
            Kembali ke Dasbor
          </Link>

          <Link
            href="/peta-modul"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "0 22px",
              borderRadius: 10,
              background: "var(--surface)",
              color: "var(--navy)",
              fontSize: "var(--t-sedang)",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid var(--border-strong)",
            }}
          >
            Lihat Peta Modul
          </Link>
        </div>

        {/* Kalimat penutup yang mengakui kemungkinan ini SALAH KAMI.
            Diukur 2026-08-16: lima menu aktif menunjuk halaman yang tak ada,
            jadi "mungkin salah ketik" saja bukan jawaban yang jujur. */}
        <p
          style={{
            marginTop: 26,
            fontSize: "var(--t-kecil)",
            color: "var(--text-muted)",
            lineHeight: "var(--tinggi-baris)",
          }}
        >
          Sampai ke sini lewat menu di samping? Berarti menunya menunjuk halaman
          yang belum ada — itu bukan kesalahan Anda, dan layak dilaporkan.
        </p>
      </div>
    </main>
  );
}
