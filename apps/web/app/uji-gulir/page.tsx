"use client";

import { useVirtualList } from "@/lib/use-virtual-list";

// ═════════════════════════════════════════════════════════════════════════════
// Halaman uji `useVirtualList` — HANYA untuk uji browser, tak pernah dipakai
// orang.
//
// ── Kenapa ada
//
// `use-virtual-list.test.tsx` mencatat dua invarian yang TIDAK bisa dijaga di
// jsdom, lengkap dengan alasannya: di sana `scrollTop` selalu 0 dan elemen tak
// punya tinggi, jadi `mulai` selalu 0 — dan mutasi `padTop = mulai * tinggi * 2`
// lolos karena `0 × 2` tetap 0.
//
// Memaksakan `scrollTop` lewat mock hanya akan menguji mock itu: nilainya tak
// mengalir lewat jalur yang sama (event `scroll` → `setState`), jadi test-nya
// hijau tanpa membuktikan apa pun tentang kode nyata.
//
// Halaman ini memberi hook itu viewport SUNGGUHAN dengan tinggi sungguhan,
// sehingga menggulir menghasilkan `scrollTop` sungguhan.
//
// ── Kenapa tidak lewat `/estimasi` yang memakainya beneran
//
// `/estimasi` butuh login Supabase dan data katalog. Uji browser yang
// bergantung pada kredensial tak bisa jalan di CI, dan yang sedang dijaga di
// sini adalah aritmetika jendela — bukan halaman estimasinya.
//
// Yang dipakai di sini adalah hook PRODUKSI (`@/lib/use-virtual-list`), bukan
// salinan. Kalau hook-nya berubah, halaman ini ikut berubah.
//
// ── Kenapa aman ada di `app/`
//
// Dua lapis: `notFound()` saat `NODE_ENV === 'production'` (tak bisa dibuka
// walau ter-build), dan `middleware.ts` hanya membuka rute ini di luar
// produksi. Test yang menjaga itu ada di `e2e/gulir-virtual.spec.ts`.
// ═════════════════════════════════════════════════════════════════════════════

const JUMLAH = 1000;
const TINGGI_BARIS = 40;
const TINGGI_VIEWPORT = 400;

// Dievaluasi saat modul dimuat, BUKAN di dalam komponen. `return null` di
// tengah komponen (sesudah hook dipanggil) membuat pohon render server dan
// klien berbeda, dan React diam-diam melewatkan hidrasinya — halaman tampak
// benar tapi tak pernah bereaksi pada apa pun.
const DI_PRODUKSI = process.env.NODE_ENV === "production";

export default function HalamanUjiGulir() {
  if (DI_PRODUKSI) return <NihilProduksi />;
  return <IsiUji />;
}

/** Komponen terpisah supaya tak ada hook yang dipanggil di jalur produksi. */
function NihilProduksi() {
  return null;
}

function IsiUji() {
  const { mulai, akhir, padTop, padBottom, pasang, nonaktif } = useVirtualList(
    JUMLAH,
    TINGGI_BARIS,
    { tinggiViewport: TINGGI_VIEWPORT },
  );

  const baris = Array.from({ length: akhir - mulai }, (_, i) => mulai + i);

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 15, marginBottom: 12 }}>Uji gulir virtual</h1>

      {/* Nilai hook dibaca test lewat atribut data — bukan lewat teks, supaya
          test tak pecah saat tata letaknya diubah. */}
      <div
        data-uji="nilai"
        data-mulai={mulai}
        data-akhir={akhir}
        data-pad-top={padTop}
        data-pad-bottom={padBottom}
        data-nonaktif={String(nonaktif)}
        data-jumlah={JUMLAH}
        data-tinggi-baris={TINGGI_BARIS}
        style={{ marginBottom: 12, fontSize: 12 }}
      >
        mulai={mulai} akhir={akhir} padTop={padTop} padBottom={padBottom}
      </div>

      <div
        ref={pasang}
        data-uji="viewport"
        style={{ height: TINGGI_VIEWPORT, overflowY: "auto", border: "1px solid #ccc" }}
      >
        <div style={{ height: padTop }} />
        {baris.map((i) => (
          <div
            key={i}
            data-uji="baris"
            data-indeks={i}
            style={{ height: TINGGI_BARIS, lineHeight: `${TINGGI_BARIS}px`, paddingLeft: 8 }}
          >
            Baris {i}
          </div>
        ))}
        <div style={{ height: padBottom }} />
      </div>
    </main>
  );
}
