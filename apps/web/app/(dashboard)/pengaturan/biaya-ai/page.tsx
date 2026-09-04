"use client";

/**
 * PENGATURAN → PEMAKAIAN & BIAYA AI
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI: "KENAPA NAIK?"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman Penyedia AI sudah menjawab *berapa* bulan ini. Yang belum terjawab
 * di mana pun: **kenapa** angkanya berubah. Total bulanan tak bisa menjawab
 * "melonjaknya Selasa lalu karena apa" — dan itu pertanyaan yang datang
 * setelah tagihan, bukan sebelumnya.
 *
 * Karena itu halaman ini deret HARIAN lebih dulu, lalu pemecahannya per model
 * dan per asisten. Urutan itu mengikuti cara orang menelusuri: lihat lonjakan,
 * lalu cari penyebabnya.
 *
 * ── Hari NOL tetap digambar
 *
 * Grafik yang melompati hari tanpa pemakaian menarik garis lurus antara dua
 * puncak — dan itu membaca tren yang tak pernah terjadi. Server mengirim
 * seluruh hari dalam rentang, termasuk yang nol.
 *
 * ── Penghematan cache DINYATAKAN
 *
 * Migrasi 250 memisahkan `token_cache_baca` justru supaya penghematannya
 * terlihat: cache read ~0,1x harga input. Kalau ia dijumlahkan diam-diam ke
 * token biasa, penghematan itu tak pernah muncul di layar — dan yang tak
 * terlihat tak akan dioptimalkan.
 *
 * ── Warna
 *
 * `ARAH-VISUAL-2026.md` §3d: satu aksen per layar. Navy hanya untuk garis
 * grafik nilai utama dan angka KPI paling penting (total biaya). Sisanya
 * netral.
 */

import { useState } from "react";
import { useData } from "@/lib/data-cache";
import { useTerpasang } from "@/lib/use-terpasang";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Coins, Info, Zap } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { PanduanHalaman } from "@/components/panduan-halaman";


interface Kelompok {
  kunci: string;
  idr: number;
  panggilan: number;
  token: number;
}

interface Muatan {
  hari: number;
  total: {
    idr: number;
    panggilan: number;
    token: number;
    cache_baca: number;
    rasio_cache: number;
  };
  harian: Array<{ tanggal: string; idr: number; panggilan: number; token: number }>;
  per_asisten: Kelompok[];
  per_model: Kelompok[];
}

const PERAN: Record<string, string> = {
  insight: "Wawasan portofolio",
  owner: "Asisten pemilik",
  staff: "Asisten staf",
  web: "Asisten web",
};

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const ringkasAngka = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} jt`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)} rb`
  : String(n);

const RENTANG = [
  { hari: 7, label: "7 hari" },
  { hari: 30, label: "30 hari" },
  { hari: 90, label: "90 hari" },
];

export default function BiayaAiPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const [hari, setHari] = useState(30);

  /*
    Lapis cache bersama (F4-2) — dan di halaman ini efeknya paling terasa.

    URL-nya ikut `hari`, jadi 30/60/90 masing-masing punya entri cache
    sendiri. Bolak-balik antar rentang TAK menembak API lagi sesudah
    pertama kali; sebelumnya tiap klik memicu permintaan baru.

    `useData` juga yang mengosongkan datanya saat URL berganti, sehingga
    angka rentang LAMA tak sempat terlihat di bawah label rentang BARU.
  */
  const sumber = useData<Muatan>(`/api/v1/ai/biaya?hari=${hari}`);
  const muatan = sumber.data;
  const memuat = sumber.memuat;

  // Galat MUAT terpisah dari galat aksi — dijaga uji-galat-muat-terpisah.mjs.
  // Dinyatakan, bukan dibiarkan kosong: halaman yang diam saat gagal terbaca
  // sebagai "belum ada pemakaian" — kesimpulan yang keliru.
  const galat = sumber.galat ? "Gagal memuat riwayat biaya." : null;

  /*
    Tak ada `muat()` lagi — sesudah pindah ke `useData`, tak satu pun
    pemanggil tersisa (diperiksa: nol kecocokan `muat(`). Menyisakannya
    sebagai pembungkus `muatUlang` hanya menambah warning lint untuk fungsi
    yang tak pernah dipanggil. Muat ulang manual, bila kelak dibutuhkan,
    tinggal `sumber.muatUlang()`.
  */

  /*
    Effect pemuatan DIHAPUS — `useData` sudah mengikuti `hari` lewat URL-nya.
    Menyisakannya membuat permintaan GANDA tiap rentang diganti.
  */

  const t = muatan?.total;
  const adaData = (t?.panggilan ?? 0) > 0;

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "var(--gap-bagian)", display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Pemakaian & Biaya AI"
          keterangan="Berapa yang terpakai, kapan, dan oleh asisten mana."
          ikon={<Coins size={19} />}
        />
      </div>

      {/*
        Halaman ini MEMBACA, bukan mengatur — dan itu perlu dinyatakan.
        Tanpanya, orang yang membuka "Pemakaian & Biaya" mencari tombol untuk
        menurunkan biayanya di sini, lalu menyimpulkan halamannya belum jadi.
      */}
      <PanduanHalaman
        untuk={
          <>
            Halaman ini <strong>memperlihatkan</strong> ke mana biaya AI pergi — per hari, per
            model, per asisten. Ia tidak mengubah apa pun: batas biaya dan pilihan model diatur
            di halaman <strong>Penyedia AI</strong>.
          </>
        }
        langkah={[
          { teks: "Pilih rentang waktu yang ingin diperiksa" },
          { teks: "Lihat asisten mana yang paling banyak menyerap biaya" },
          { teks: "Kalau ada yang tak wajar, turunkan modelnya atau setel batas di halaman Penyedia AI" },
        ]}
        catatan="Angka di sini dihitung dari pemakaian yang benar-benar tercatat, bukan perkiraan. Biaya yang belum muncul berarti panggilannya memang belum terjadi."
      />

      {/* ── Pemilih rentang ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: "var(--gap-bagian)" }}>
        {RENTANG.map((r) => {
          const aktif = r.hari === hari;
          return (
            <button
              key={r.hari}
              type="button"
              onClick={() => setHari(r.hari)}
              aria-pressed={aktif}
              style={{
                padding: "var(--pad-lencana)",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 550,
                fontFamily: "inherit",
                cursor: "pointer",
                border: `1px solid ${aktif ? "transparent" : C.border}`,
                background: aktif ? C.aksen : "var(--surface)",
                // `C.onAksen`, bukan "#fff" dipaku: `--aksen` jadi #7ABDFF di
                // mode gelap, dan putih di atasnya 2,72 : 1 — di bawah AA.
                // Tokennya berbalik sendiri jadi #0F1117 → 6,94 : 1.
                color: aktif ? C.onAksen : C.mid,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {galat && (
        <div
          role="alert"
          style={{
            ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
            borderColor: "var(--danger)", background: "var(--danger-bg)",
            fontSize: 13, color: C.text,
          }}
        >
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : !adaData ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.65 }}>
            Belum ada panggilan AI dalam {hari} hari terakhir. Angka di halaman ini dihitung dari
            biaya yang <strong style={{ color: C.text }}>benar-benar tercatat per ronde</strong>,
            bukan dari perkiraan — jadi ia tetap nol sampai asisten dipakai.
          </div>
        </div>
      ) : (
        <>
          {/* ── Ringkasan ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--gap-grid)",
              marginBottom: "var(--gap-bagian)",
            }}
          >
            <Kpi judul="Total biaya" nilai={rupiah(t!.idr)} utama />
            <Kpi judul="Panggilan" nilai={t!.panggilan.toLocaleString("id-ID")} />
            <Kpi judul="Token" nilai={ringkasAngka(t!.token)} />
            <Kpi
              judul="Dari cache"
              nilai={`${t!.rasio_cache}%`}
              catatan={t!.rasio_cache > 0 ? `${ringkasAngka(t!.cache_baca)} token, ~10% harga` : "belum ada"}
              ikon={<Zap size={13} />}
            />
          </div>

          {/* ── Deret harian ── */}
          <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
            <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 12px" }}>
              Biaya harian
            </h2>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                {/*
                  `right: 16`, bukan 8. Tangkapan layar pertama menyingkapnya:
                  lonjakan yang jatuh di hari TERAKHIR menempel tepi kanan dan
                  puncaknya terpotong — padahal lonjakan terbaru justru yang
                  paling sering dicari orang saat membuka halaman ini.
                */}
                <AreaChart data={muatan!.harian} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="isiBiaya" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--navy)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--navy)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="tanggal"
                    tick={{ fontSize: "var(--t-kecil)", fill: C.muted }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    // Hanya tanggalnya — label penuh membuat sumbu bertumpuk
                    // pada rentang 90 hari.
                    tickFormatter={(v: string) => v.slice(8)}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fontSize: "var(--t-kecil)", fill: C.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: C.mid }}
                    // `unknown` lalu Number(): tipe recharts memberi
                    // ValueType|undefined, dan menganotasinya `number`
                    // gagal compile.
                    formatter={(v: unknown) => [rupiah(Number(v) || 0), "Biaya"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="idr"
                    stroke="var(--navy)"
                    strokeWidth={2}
                    fill="url(#isiBiaya)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── Pemecahan ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "var(--gap-grid)",
            }}
          >
            <Rincian judul="Per asisten" data={muatan!.per_asisten} peta={PERAN} total={t!.idr} />
            <Rincian judul="Per model" data={muatan!.per_model} total={t!.idr} mono />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  judul, nilai, catatan, utama, ikon,
}: {
  judul: string; nilai: string; catatan?: string; utama?: boolean; ikon?: React.ReactNode;
}) {
  return (
    <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {ikon && <span style={{ color: C.muted, display: "grid", placeItems: "center" }}>{ikon}</span>}
        <span style={{ fontSize: "var(--t-kecil)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted }}>
          {judul}
        </span>
      </div>
      <div
        style={{
          // Navy HANYA di angka paling penting — ARAH-VISUAL §3d: kalau semua
          // KPI beraksen, tak ada yang menonjol.
          fontSize: utama ? 28 : 22,
          fontWeight: 650,
          letterSpacing: "-0.02em",
          color: utama ? "var(--navy)" : C.text,
          lineHeight: 1.15,
        }}
      >
        {nilai}
      </div>
      {catatan && (
        <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{catatan}</div>
      )}
    </div>
  );
}

function Rincian({
  judul, data, peta, total, mono,
}: {
  judul: string; data: Kelompok[]; peta?: Record<string, string>; total: number; mono?: boolean;
}) {
  return (
    <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
      <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 12px" }}>
        {judul}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.map((d) => {
          const persen = total > 0 ? Math.round((d.idr / total) * 100) : 0;
          return (
            <div key={d.kunci}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: mono ? 11.5 : 12.5,
                    fontFamily: mono ? "var(--font-mono, monospace)" : "inherit",
                    color: C.text,
                    fontWeight: 550,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {peta?.[d.kunci] ?? d.kunci}
                </span>
                <span style={{ fontSize: "var(--t-kecil)", color: C.muted, whiteSpace: "nowrap" }}>
                  {d.panggilan.toLocaleString("id-ID")}×
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap", minWidth: 76, textAlign: "right" }}>
                  {rupiah(d.idr)}
                </span>
              </div>
              {/* Bilah proporsi — netral, bukan aksen. Yang perlu menonjol di
                  halaman ini satu: total biaya. */}
              <div
                aria-hidden
                style={{ height: 4, borderRadius: 999, background: "var(--surface-subtle)", overflow: "hidden" }}
              >
                <div style={{ width: `${persen}%`, height: "100%", background: C.mid, opacity: 0.55 }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
