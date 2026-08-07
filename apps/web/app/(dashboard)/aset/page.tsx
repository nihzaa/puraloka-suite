"use client";

/**
 * ASET & ALAT — RINGKASAN. Dashboard modul, bukan langsung tabel (UI-2-3).
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  empat kartu KPI       "apa yang terjadi?"
 *   LAPIS 2  sewa perlu diputuskan "yang mana yang menuntut keputusan?"
 *   LAPIS 3  tabel milik/sewa      "apa yang harus saya kerjakan?"
 *
 * ── Kenapa KPI-nya BUKAN "total aset"
 *
 * §5c tak memberi daftar KPI untuk menu ini, jadi keempatnya diturunkan dari
 * field yang benar-benar dikirim `/api/v1/assets` + `/api/v1/asset-rentals`.
 * Aturan yang dipakai memilih: angka yang MENGUBAH RENCANA, bukan angka yang
 * sudah terbaca dari tabel di bawah.
 *
 *   "47 aset milik"       → sudah tertulis di label tab. Tidak dipakai.
 *   "3 alat rusak"        → menentukan apakah proyek minggu depan bisa jalan.
 *   "2 sewa jatuh tempo"  → menentukan perpanjang atau kembalikan, pekan ini.
 *
 * ── Kenapa "sewa lewat tanggal" jadi spanduk, bukan kartu
 *
 * `biayaSewa` di API menghitung sewa berjalan SAMPAI HARI INI. Sewa yang
 * tanggal selesainya sudah lewat tapi statusnya masih "berjalan" karena itu
 * terus menambah biaya tiap hari atas alat yang mungkin sudah lama kembali —
 * dan angka yang membengkak diam-diam tak pernah dipertanyakan. Ia dijadikan
 * spanduk karena ia menuntut tindakan HARI INI, dan karena itu ia menghilang
 * saat tak ada.
 *
 * ── Yang SENGAJA tidak ada: utilisasi alat
 *
 * "Alat mana yang menganggur" adalah pertanyaan yang tepat, tapi jawabannya
 * TIDAK ada di endpoint ini. Utilisasi hanya dihitung di
 * `/api/v1/assets/:id/movements` — satu permintaan PER ASET. Menghitungnya di
 * sini berarti 40 permintaan sebelum satu angka muncul, dan syarat kerja ini
 * nol endpoint baru. Status `tersedia` juga bukan penggantinya: alat yang di
 * gudang seminggu antara dua proyek bukan uang tertidur, dan daftar ini tak
 * bisa membedakannya dari yang menganggur delapan bulan.
 *
 * ── Dua tab, bukan dua halaman
 *
 * "Milik" dan "Sewa" dipisah tab karena pertanyaannya beda: aset milik soal
 * nilai buku & penyusutan, sewa soal biaya berjalan. Tapi keduanya menjawab
 * satu pertanyaan yang sama — "alat apa yang saya punya dan berapa biayanya" —
 * jadi memisahkannya jadi dua halaman memaksa orang mengingat mana yang mana.
 *
 * ── Kenapa status pakai warna DAN teks
 *
 * WCAG 1.4.1: warna saja tak boleh jadi satu-satunya pembawa makna. Pemakai
 * di lapangan sering membaca di HP di bawah sinar matahari, tempat perbedaan
 * warna tipis praktis hilang.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Wallet, Wrench, MapPin, AlertTriangle, CalendarClock,
  CircleSlash, Clock,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

import { C } from "@/lib/warna-ui";
import { useTabUrl } from "@/lib/use-tab-url";
import { KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import { Tabel } from "@/components/dasar";
import {
  hariIniWIB, ringkasAset, sewaPerluDiputuskan,
  type BarisSewaPerhatian,
} from "@/lib/ringkasan-aset";

type StatusAset = "tersedia" | "dipakai" | "perawatan" | "rusak" | "dilepas";

interface Aset {
  id: string; asset_code: string; name: string; category: string;
  ownership: "milik" | "sewa";
  brand: string | null; model: string | null;
  purchase_date: string | null; purchase_price: number | null;
  residual_value: number; useful_life_months: number;
  depreciation_method: string;
  current_project_id: string | null;
  status: StatusAset; condition: string;
  akumulasi_penyusutan: number; nilai_buku: number; sudah_disusutkan: boolean;
}

interface MetaAset {
  total: number; milik: number; sewa: number;
  nilai_perolehan: number; nilai_buku: number;
  dipakai: number; perawatan: number;
}

interface Sewa {
  id: string; item_name: string; project_id: string | null;
  rate: number; rate_unit: string;
  start_date: string; end_date: string | null;
  status: string; biaya_sampai_kini: number;
}

interface MetaSewa {
  total: number; berjalan: number; biaya_berjalan: number; biaya_total: number;
}

const STATUS: Record<StatusAset, { teks: string; warna: string; bg: string; border: string }> = {
  tersedia:  { teks: "Di gudang", warna: C.mid,    bg: "var(--surface-subtle)", border: C.border },
  dipakai:   { teks: "Dipakai",   warna: C.green,  bg: C.greenBg,  border: C.greenBorder },
  perawatan: { teks: "Perawatan", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  rusak:     { teks: "Rusak",     warna: C.red,    bg: C.redBg,    border: C.redBorder },
  dilepas:   { teks: "Dilepas",   warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
};

const KATEGORI: Record<string, string> = {
  alat_berat: "Alat berat", alat_ringan: "Alat ringan", kendaraan: "Kendaraan",
  scaffolding: "Scaffolding", perlengkapan: "Perlengkapan", lainnya: "Lainnya",
};

const fmtRp = (n: number | null) =>
  n == null ? "—"
  : n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

const TAB_ASET = ['milik', 'sewa'] as const;

export default function AsetPage() {
  return (
    <Suspense fallback={null}>
      <IsiAset />
    </Suspense>
  );
}

function IsiAset() {
  // Tab hidup di URL supaya menu "Sewa Alat" bisa menunjuknya langsung,
  // bukan mendarat di tab Milik lalu menuntut satu klik lagi.
  const [tab, setTab] = useTabUrl<"milik" | "sewa">(TAB_ASET, "milik");
  const [aset, setAset] = useState<Aset[]>([]);
  const [metaAset, setMetaAset] = useState<MetaAset | null>(null);
  const [sewa, setSewa] = useState<Sewa[]>([]);
  const [metaSewa, setMetaSewa] = useState<MetaSewa | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formBuka, setFormBuka] = useState(false);

  // Tanggal acuan DIBEKUKAN saat halaman dipasang, bukan dibaca ulang tiap
  // render. Kalau tidak, kartu KPI dan tabel di bawahnya bisa memakai tanggal
  // berbeda saat halaman dibuka melewati tengah malam — dan angka yang tak
  // cocok dengan daftarnya sendiri adalah cara tercepat membuat orang berhenti
  // memercayai keduanya.
  const [hariIni] = useState(() => hariIniWIB());

  // `setMemuat(true)` SENGAJA tidak di sini. Fungsi ini dipanggil dari effect,
  // dan set-state sinkron di dalam effect memicu render tambahan sebelum data
  // sempat datang (`react-hooks/set-state-in-effect`). Keadaan awal sudah
  // `true`; pemanggilan ulang dari tombol/form memakai `muatUlang()` di bawah
  // yang boleh menyalakannya karena berjalan di handler, bukan di effect.
  const muat = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      api.get<{ data: Aset[]; meta: MetaAset }>("/api/v1/assets", { signal }),
      api.get<{ data: Sewa[]; meta: MetaSewa }>("/api/v1/asset-rentals", { signal }),
    ])
      .then(([a, s]) => {
        setAset(a.data.data ?? []); setMetaAset(a.data.meta);
        setSewa(s.data.data ?? []); setMetaSewa(s.data.meta);
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat data aset"); })
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  /** Muat ulang dari handler (tombol/form) — di sini spinner boleh dinyalakan. */
  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  const asetMilik = aset.filter((a) => a.ownership === "milik");

  // ── LAPIS 1 & 2 — dihitung dari respons yang SAMA dengan tabelnya ─────────
  const ringkas = useMemo(() => ringkasAset(aset, sewa, hariIni), [aset, sewa, hariIni]);
  const perluDiputuskan = useMemo(
    () => sewaPerluDiputuskan(sewa, hariIni), [sewa, hariIni]);

  /** Pindah ke tab sewa lalu gulirkan — dipakai KPI & spanduk yang bisa diklik. */
  function lompatKeSewa() {
    setTab("sewa");
    document.getElementById("daftar-aset")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
            Aset &amp; Alat
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.mid }}>
            Alat milik perusahaan, lokasinya sekarang, nilai bukunya, dan biaya sewa yang berjalan.
          </p>
        </div>
        <button
          onClick={() => setFormBuka((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 10, border: "none", background: C.navy, color: C.onNavy,
            fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={15} aria-hidden="true" /> {tab === "milik" ? "Aset baru" : "Sewa baru"}
        </button>
      </header>

      {formBuka && (
        <FormBaru
          jenis={tab}
          onSelesai={() => { setFormBuka(false); muatUlang(); }}
          onBatal={() => setFormBuka(false)}
        />
      )}

      {/* ── LAPIS 1 — KEADAAN ──
          Keempatnya dipilih karena MENGUBAH RENCANA. "Total aset" sengaja
          tidak ada: angkanya sudah tertulis di label tab tepat di bawah, dan
          KPI yang mengulang angka yang sudah terlihat tak menambah apa pun. */}
      {metaAset && metaSewa && (
        <div className="rise rise-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
          <KartuKPI
            sorot
            label="Nilai Buku Alat"
            nilai={fmtRp(ringkas.nilaiBuku)}
            ikon={<Wallet size={15} />}
            keterangan={ringkas.tanpaHargaPerolehan > 0
              // Angka yang belum lengkap MENGAKU begitu. Tanpa kalimat ini,
              // total yang terlalu kecil terbaca sebagai fakta.
              ? `${ringkas.tanpaHargaPerolehan} aset belum diisi harga perolehannya — belum masuk hitungan`
              : `dari perolehan ${fmtRp(ringkas.nilaiPerolehan)} · ${ringkas.milik} aset milik`}
          />
          <KartuKPI
            label="Alat Tak Siap Pakai"
            nilai={String(ringkas.takSiap)}
            nilaiAngka={ringkas.takSiap}
            naikBagus={false}
            ikon={<CircleSlash size={15} />}
            keterangan={ringkas.takSiap === 0
              ? `seluruh ${ringkas.milik} alat milik siap dipakai`
              : `${ringkas.rusak} rusak · ${ringkas.perawatan} perawatan — tak bisa dijadwalkan ke proyek`}
          />
          <KartuKPI
            label="Sewa Jatuh Tempo"
            nilai={String(ringkas.sewaJatuhTempo)}
            nilaiAngka={ringkas.sewaJatuhTempo}
            naikBagus={false}
            ikon={<CalendarClock size={15} />}
            onClick={ringkas.sewaJatuhTempo > 0 ? lompatKeSewa : undefined}
            keterangan={ringkas.sewaJatuhTempo === 0
              ? "tak ada sewa yang berakhir dalam 30 hari"
              : "berakhir ≤30 hari — perpanjang atau kembalikan"}
          />
          <KartuKPI
            label="Biaya Sewa Berjalan"
            nilai={fmtRp(ringkas.biayaSewaBerjalan)}
            ikon={<Wrench size={15} />}
            keterangan={ringkas.sewaBerjalan === 0
              ? "tak ada sewa berjalan"
              // Angka ini BERTAMBAH sendiri tiap hari — dinyatakan supaya
              // tak dikira nilai tetap yang bisa dicatat lalu dilupakan.
              : `${ringkas.sewaBerjalan} alat disewa · masih bertambah tiap hari`}
          />
        </div>
      )}

      {/* Sewa yang tanggalnya sudah lewat tapi statusnya masih berjalan.
          Spanduk, bukan kartu KPI kelima: kartu menyatakan keadaan, spanduk
          menyatakan ada yang harus DIBERESKAN, dan karena itu ia menghilang
          saat tak ada. Yang membuatnya mendesak: biayanya sedang bertambah
          tiap hari atas alat yang mungkin sudah lama dikembalikan. */}
      {!memuat && ringkas.sewaLewat > 0 && (
        <div className="rise rise-1" style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 10, marginBottom: 20,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
        }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ color: C.onDangerBg, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.onDangerBg, fontWeight: 600 }}>
            {ringkas.sewaLewat} sewa masih berstatus berjalan padahal tanggal
            selesainya sudah lewat — biayanya terus bertambah tiap hari.
          </span>
          <button onClick={lompatKeSewa} style={{
            marginLeft: "auto", fontSize: 11, color: C.onDangerBg, fontWeight: 700,
            background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Lihat daftar sewa →
          </button>
        </div>
      )}

      {/* ── LAPIS 2 — YANG MENUNTUT KEPUTUSAN ──
          Pertanyaan yang dijawab: "sewa mana yang harus saya putuskan pekan
          ini, dan mana dulu?"

          Ini BUKAN grafik, dan itu disengaja. Grafik batang biaya sewa per
          alat hanya akan menggambar ulang kolom "Biaya s.d. kini" yang sudah
          ada di tabel — tinta tanpa informasi. Yang tak bisa dibaca dari tabel
          mana pun adalah URUTAN MENDESAK-nya: tabel diurutkan tanggal mulai,
          sementara yang menentukan adalah sisa hari ke tanggal selesai,
          dengan yang sudah lewat naik ke atas. Itu perbandingan tiga keadaan
          (lewat · segera · tanpa akhir) yang harus dilakukan baris per baris
          dengan kalender di tangan kalau tak dihitung kodenya. */}
      {!memuat && perluDiputuskan.length > 0 && (
        <div className="rise rise-2" style={{ marginBottom: 20 }}>
          <Panel
            judul="Sewa yang Perlu Diputuskan"
            keterangan="berakhir ≤30 hari, sudah lewat tanggal, atau berjalan tanpa tanggal selesai — yang paling mendesak di atas"
          >
            <DaftarSewaPerhatian baris={perluDiputuskan} />
          </Panel>
        </div>
      )}

      {/* ── LAPIS 3 — DETAIL ── */}
      {/* Tab */}
      <div id="daftar-aset" role="tablist" aria-label="Jenis aset" style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        {([["milik", `Milik (${metaAset?.milik ?? 0})`], ["sewa", `Sewa (${metaSewa?.total ?? 0})`]] as const).map(([k, label]) => (
          <button
            key={k} role="tab" aria-selected={tab === k} data-tab={k}
            onClick={() => setTab(k)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === k ? 700 : 500,
              color: tab === k ? C.navy : C.mid,
              borderBottom: `2px solid ${tab === k ? C.navy : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {galat && (
        <div role="alert" style={{
          display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 12px",
          borderRadius: 10, background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 13, marginBottom: 14,
        }}>
          <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          {galat}
        </div>
      )}

      {memuat ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Memuat…</p>
      ) : tab === "milik" ? (
        <TabelAset baris={asetMilik} />
      ) : (
        <TabelSewa baris={sewa} />
      )}
    </div>
  );
}

/**
 * Daftar sewa yang menuntut keputusan, terparah di atas.
 *
 * ── Kenapa daftar, bukan batang
 *
 * Yang dibandingkan di sini bukan BESARAN melainkan KEADAAN: "lewat 18 hari"
 * dan "sisa 3 hari" tak berada pada satu sumbu yang bisa digambar berdampingan
 * secara jujur, dan "tanpa tanggal selesai" tak punya angka sama sekali.
 * Memaksakan ketiganya ke satu batang berarti memilih angka yang salah untuk
 * dua di antaranya.
 *
 * ── Kenapa keadaannya ditulis, bukan cuma diwarnai
 *
 * WCAG 1.4.1. Merah dan kuning di bawah sinar matahari di lapangan praktis
 * sama, dan halaman ini justru dibuka di sana.
 */
function DaftarSewaPerhatian({ baris }: { baris: BarisSewaPerhatian[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {baris.map((b) => {
        const lewat = b.sisaHari !== null && b.sisaHari < 0;
        const terbuka = b.sisaHari === null;
        const keadaan = lewat
          ? `Lewat ${Math.abs(b.sisaHari!)} hari`
          : terbuka
            ? "Tanpa tanggal selesai"
            : b.sisaHari === 0 ? "Berakhir hari ini" : `Sisa ${b.sisaHari} hari`;

        return (
          <li key={b.id} style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "10px 12px", borderRadius: 10,
            background: lewat ? C.redBg : terbuka ? "var(--surface-subtle)" : C.yellowBg,
            border: `1px solid ${lewat ? C.redBorder : terbuka ? C.border : C.yellowBorder}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 140 }}>
              {b.nama}
            </span>

            {/* Keadaan: ikon + teks + warna, bukan warna saja. */}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              color: lewat ? C.onDangerBg : terbuka ? C.mid : C.onWarningBg,
            }}>
              {lewat ? <AlertTriangle size={11} aria-hidden="true" />
                : terbuka ? <Clock size={11} aria-hidden="true" />
                : <CalendarClock size={11} aria-hidden="true" />}
              {keadaan}
            </span>

            <span style={{ fontSize: 11, color: C.mid, whiteSpace: "nowrap" }}>
              {fmtRp(b.tarif)} / {b.satuan}
            </span>

            <span style={{
              fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums", minWidth: 84, textAlign: "right",
            }}>
              {fmtRp(b.biaya)}
            </span>
          </li>
        );
      })}

      <li style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
        <Clock size={10} aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 4 }} />
        Biaya dihitung sampai hari ini, jadi baris yang sudah lewat tanggal
        masih terus bertambah selama statusnya belum ditutup.
      </li>
    </ul>
  );
}

function TabelAset({ baris }: { baris: Aset[] }) {
  if (!baris.length) {
    return (
      <Kosong
        judul="Belum ada aset terdaftar"
        sebab="Daftarkan alat milik perusahaan supaya lokasinya terlacak dan nilai bukunya terhitung."
      />
    );
  }
  return (
    /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only, kolom
       pertama <th scope="row">, tabular-nums, dan pembungkus overflow-x
       sekarang dijamin komponen — empat hal yang tabel mentah harus ingat
       sendiri setiap kali, dan yang riwayat repo ini tunjukkan TIDAK selalu
       diingat.

       Kepala baris pindah dari "Kode" ke "Nama", dan kolomnya ikut ditukar
       urutannya supaya yang pertama tetap yang menamai. Alasannya: "AST-014"
       tidak memberi tahu alat apa itu. Pengguna pembaca layar yang menyusuri
       kolom "Nilai buku" akan mendengar "AST-014, Rp 42 jt" — dan harus
       mengingat pemetaan kode ke alat di kepalanya. "Molen Semen 350L,
       Rp 42 jt" langsung terbaca. Kodenya tetap ada, jadi kolom kedua.

       `minWidth: 780` sengaja dilepas, bukan lupa: pembungkus overflow-x dari
       komponen sudah memberi gulir horizontal tanpa memaksa lebar mati masuk
       ke primitif bersama. */
    <Tabel<Aset>
      caption="Daftar aset: nama, kode, kategori, status, nilai perolehan, nilai buku, dan penyusutan."
      data={baris}
      kunciBaris={(a) => a.id}
      kolom={[
        {
          kunci: "nama", judul: "Nama", kepalaBaris: true,
          render: (a) => (
            <span style={{ color: C.text, fontWeight: 600 }}>
              {a.name}
              {(a.brand || a.model) && (
                <span style={{ color: C.muted, fontSize: 11, display: "block", fontWeight: 400 }}>
                  {[a.brand, a.model].filter(Boolean).join(" ")}
                </span>
              )}
            </span>
          ),
        },
        {
          kunci: "kode", judul: "Kode",
          render: (a) => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{a.asset_code}</span>
          ),
        },
        {
          kunci: "kategori", judul: "Kategori",
          render: (a) => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
              {KATEGORI[a.category] ?? a.category}
            </span>
          ),
        },
        {
          kunci: "status", judul: "Status",
          render: (a) => {
            const s = STATUS[a.status] ?? STATUS.tersedia;
            return (
              // Warna DAN teks — WCAG 1.4.1
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
                whiteSpace: "nowrap",
              }}>
                {a.status === "dipakai" && <MapPin size={10} aria-hidden="true" />}
                {s.teks}
              </span>
            );
          },
        },
        {
          kunci: "perolehan", judul: "Perolehan", rata: "kanan",
          render: (a) => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
              {fmtRp(a.purchase_price)}
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                {fmtTgl(a.purchase_date)}
              </span>
            </span>
          ),
        },
        {
          kunci: "nilai_buku", judul: "Nilai buku", rata: "kanan",
          render: (a) => (
            <span style={{ fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
              {fmtRp(a.nilai_buku)}
            </span>
          ),
        },
        {
          kunci: "penyusutan", judul: "Penyusutan", rata: "kanan",
          render: (a) => (
            a.sudah_disusutkan
              ? <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{fmtRp(a.akumulasi_penyusutan)}</span>
              // Dibedakan dari "Rp 0" — belum dicatat bukan berarti nol.
              : <span style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>belum dicatat</span>
          ),
        },
      ]}
    />
  );
}

function TabelSewa({ baris }: { baris: Sewa[] }) {
  if (!baris.length) {
    return (
      <Kosong
        judul="Belum ada sewa alat tercatat"
        sebab="Catat sewa alat supaya biayanya terlihat per proyek — termasuk sewa yang masih berjalan."
      />
    );
  }
  return (
    /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only, kolom
       pertama <th scope="row">, tabular-nums, dan pembungkus overflow-x
       sekarang dijamin komponen.

       Di sini `scope="row"` bukan sekadar dipindahkan — ia BARU. Versi
       mentahnya merender seluruh baris sebagai <td>, jadi pembaca layar
       membacakan "Rp 12 jt" tanpa pernah menyebut alat mana yang menagihnya.
       Kolom "Alat" memang yang menamai baris, jadi tak ada urutan yang perlu
       ditukar — cuma penandaannya yang hilang.

       `minWidth: 680` dilepas dengan alasan yang sama seperti tabel aset:
       gulir horizontal sudah datang dari pembungkus komponen. */
    <Tabel<Sewa>
      caption="Penyewaan alat: nama alat, tarif, tanggal mulai dan selesai, status, serta biaya sampai kini."
      data={baris}
      kunciBaris={(r) => r.id}
      kolom={[
        {
          kunci: "alat", judul: "Alat", kepalaBaris: true,
          render: (r) => <span style={{ color: C.text, fontWeight: 600 }}>{r.item_name}</span>,
        },
        {
          kunci: "tarif", judul: "Tarif",
          render: (r) => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
              {fmtRp(r.rate)} <span style={{ color: C.muted }}>/ {r.rate_unit}</span>
            </span>
          ),
        },
        {
          kunci: "mulai", judul: "Mulai",
          render: (r) => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{fmtTgl(r.start_date)}</span>
          ),
        },
        {
          kunci: "selesai", judul: "Selesai",
          render: (r) => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
              {r.end_date ? fmtTgl(r.end_date) : <span style={{ color: C.muted, fontStyle: "italic" }}>berjalan</span>}
            </span>
          ),
        },
        {
          kunci: "status", judul: "Status",
          render: (r) => {
            const berjalan = r.status === "berjalan";
            return (
              <span style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: berjalan ? C.yellow : C.mid,
                background: berjalan ? C.yellowBg : "var(--surface-subtle)",
                border: `1px solid ${berjalan ? C.yellowBorder : C.border}`,
                whiteSpace: "nowrap",
              }}>
                {berjalan ? "Berjalan" : r.status === "selesai" ? "Selesai" : "Batal"}
              </span>
            );
          },
        },
        {
          kunci: "biaya", judul: "Biaya s.d. kini", rata: "kanan",
          render: (r) => (
            <span style={{ fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
              {fmtRp(r.biaya_sampai_kini)}
              {r.status === "berjalan" && (
                <span style={{ display: "block", fontSize: 10, color: C.muted, fontWeight: 400 }}>
                  masih bertambah
                </span>
              )}
            </span>
          ),
        },
      ]}
    />
  );
}

function FormBaru({ jenis, onSelesai, onBatal }: {
  jenis: "milik" | "sewa"; onSelesai: () => void; onBatal: () => void;
}) {
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSimpan(true); setGalat(null);
    try {
      if (jenis === "milik") {
        await api.post("/api/v1/assets", {
          asset_code: f.get("asset_code"),
          name: f.get("name"),
          category: f.get("category"),
          brand: f.get("brand") || null,
          purchase_date: f.get("purchase_date") || null,
          purchase_price: f.get("purchase_price") ? Number(f.get("purchase_price")) : null,
          residual_value: Number(f.get("residual_value") || 0),
          useful_life_months: Number(f.get("useful_life_months") || 60),
          depreciation_method: f.get("depreciation_method"),
        });
      } else {
        await api.post("/api/v1/asset-rentals", {
          item_name: f.get("item_name"),
          rate: Number(f.get("rate") || 0),
          rate_unit: f.get("rate_unit"),
          start_date: f.get("start_date"),
          end_date: f.get("end_date") || null,
        });
      }
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan");
    } finally {
      setSimpan(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 6,
    border: `1px solid ${C.border}`, fontSize: 13, background: C.surface,
    color: C.text, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4,
  };

  return (
    <form onSubmit={kirim} style={{
      padding: 16, borderRadius: 10, border: `1px solid ${C.border}`,
      background: C.surface, marginBottom: 20,
    }}>
      <h2 style={{ margin: "0 0 13px", fontSize: 15, fontWeight: 700, color: C.text }}>
        {jenis === "milik" ? "Aset baru" : "Catat sewa alat"}
      </h2>

      {galat && (
        <div role="alert" style={{
          padding: "8px 12px", borderRadius: 6, background: C.redBg,
          border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 12, marginBottom: 12,
        }}>{galat}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {jenis === "milik" ? (
          <>
            <div>
              <label htmlFor="asset_code" style={labelStyle}>Kode aset *</label>
              <input id="asset_code" name="asset_code" required placeholder="AST-001" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="name" style={labelStyle}>Nama alat *</label>
              <input id="name" name="name" required placeholder="Molen Semen 350L" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="category" style={labelStyle}>Kategori</label>
              <select id="category" name="category" defaultValue="alat_ringan" style={inputStyle}>
                {Object.entries(KATEGORI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="brand" style={labelStyle}>Merek</label>
              <input id="brand" name="brand" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="purchase_date" style={labelStyle}>Tanggal perolehan</label>
              <input id="purchase_date" name="purchase_date" type="date" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="purchase_price" style={labelStyle}>Harga perolehan (Rp)</label>
              <input id="purchase_price" name="purchase_price" type="number" min="0" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="residual_value" style={labelStyle}>Nilai sisa (Rp)</label>
              <input id="residual_value" name="residual_value" type="number" min="0" defaultValue={0} style={inputStyle} />
              <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 3 }}>
                Perkiraan harga jual saat umur habis — bukan nol.
              </span>
            </div>
            <div>
              <label htmlFor="useful_life_months" style={labelStyle}>Umur ekonomis (bulan)</label>
              <input id="useful_life_months" name="useful_life_months" type="number" min="1" defaultValue={60} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="depreciation_method" style={labelStyle}>Metode penyusutan</label>
              <select id="depreciation_method" name="depreciation_method" defaultValue="garis_lurus" style={inputStyle}>
                <option value="garis_lurus">Garis lurus</option>
                <option value="saldo_menurun">Saldo menurun ganda</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="item_name" style={labelStyle}>Nama alat *</label>
              <input id="item_name" name="item_name" required placeholder="Excavator PC200" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="rate" style={labelStyle}>Tarif (Rp) *</label>
              <input id="rate" name="rate" type="number" min="0" required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="rate_unit" style={labelStyle}>Satuan tarif</label>
              <select id="rate_unit" name="rate_unit" defaultValue="hari" style={inputStyle}>
                <option value="hari">Per hari</option>
                <option value="minggu">Per minggu</option>
                <option value="bulan">Per bulan</option>
              </select>
              <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 3 }}>
                Mingguan &amp; bulanan dibulatkan ke atas, seperti tagihan sewa.
              </span>
            </div>
            <div>
              <label htmlFor="start_date" style={labelStyle}>Mulai sewa *</label>
              <input id="start_date" name="start_date" type="date" required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="end_date" style={labelStyle}>Selesai sewa</label>
              <input id="end_date" name="end_date" type="date" style={inputStyle} />
              <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 3 }}>
                Kosongkan bila masih berjalan.
              </span>
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={simpan} style={{
          padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy,
          color: C.onNavy, fontSize: 13, fontWeight: 600,
          cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>
          {simpan ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={onBatal} style={{
          padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.surface, color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Batal
        </button>
      </div>
    </form>
  );
}
