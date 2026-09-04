"use client";

/**
 * REGISTER TENDER — RINGKASAN. Dashboard modul, bukan langsung tabel (UI-2-3).
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  empat kartu KPI          "apa yang terjadi?"
 *   LAPIS 2  penawaran menggantung    "mana yang harus saya tagih jawabannya?"
 *   LAPIS 3  tabel tender + saringan  "apa yang harus saya kerjakan?"
 *
 * ── Yang dijawab halaman ini
 *
 * 1. **Kenapa tender kalah?** Kolom "selisih vs pemenang" membuat "kalah karena
 *    harga" bisa dibedakan dari "kalah karena syarat". Yang paling berguna
 *    justru angka NEGATIF: kalau kita lebih murah dan tetap kalah, menurunkan
 *    harga di tender berikutnya membuang margin tanpa menambah peluang.
 * 2. **Berapa backlog saat memutuskan ambil kerja?** Nilai yang sudah
 *    dimenangkan tapi belum selesai — beban kapasitas yang paling sering
 *    terlupa.
 *
 * ── Dari mana KPI-nya — NOL endpoint baru
 *
 * Keempat kartu memakai `meta` yang SUDAH dikirim `/api/v1/bids`, dihitung
 * `apps/api/src/lib/bid-backlog.ts` dan teruji di sana. Web sengaja TIDAK
 * menghitung ulang backlog/win-rate: dua sumber untuk angka yang sama berarti
 * saat keduanya menyimpang, tak ada yang tahu mana yang benar.
 *
 * Yang DITAMBAHKAN web hanya satu hal yang `meta` memang tak punya, karena
 * `meta` sengaja tak sadar waktu: berapa LAMA sebuah penawaran menggantung
 * (`lib/ringkasan-tender.ts`).
 *
 * ── Kenapa "menggantung", dan kenapa ia menggeser "pipeline" dari kartu
 *
 * "12 tender menunggu keputusan" tak menuntut tindakan apa pun — menunggu
 * memang pekerjaan tender. Yang menuntut tindakan adalah berapa di antaranya
 * sudah menunggu terlalu lama: tender yang menggantung >45 hari biasanya sudah
 * diputuskan tanpa kita diberi tahu, dan selama statusnya tetap "diajukan",
 * nilainya ikut menggelembungkan pipeline yang dipakai memutuskan sanggup
 * atau tidaknya mengambil kerja baru. Nilai pipeline tetap ada — ia pindah ke
 * keterangan kartu yang sama, tempat ia jadi konteks, bukan angka utama.
 *
 * ── Kenapa tabel, bukan kanban
 *
 * Kanban mengundang pemakaian sebagai pipeline CRM, dan CRM penuh sengaja
 * dicoret (PETA §"Sengaja tidak dibangun"). Tabel juga jauh lebih baik untuk
 * membandingkan angka antar-baris — dan membandingkan angka justru inti
 * halaman ini.
 */

import { useMemo, useState } from "react";
import {
  Plus, Trophy, XCircle, Clock, Wallet, AlertTriangle, Hourglass, Gavel } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { KartuKPI, Panel } from "@/components/ui-dasar";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import { Pilihan } from "@/components/pilihan";
import {
  hariIniWIB, penawaranMenggantung, ringkasTender,
  type BarisMenggantung,
} from "@/lib/ringkasan-tender";

import { C } from "@/lib/warna-ui";

type Status = "prospek" | "go" | "no_go" | "diajukan" | "menang" | "kalah" | "batal";

interface Bid {
  id: string; bid_number: string | null; title: string;
  owner_name: string | null; location: string | null;
  bid_value: number | null; winner_value: number | null;
  submitted_at: string | null; decided_at: string | null;
  status: Status; decision_note: string | null; project_id: string | null;
}

interface Meta {
  backlogNilai: number; backlogJumlah: number;
  pipelineNilai: number; pipelineJumlah: number;
  menang: number; kalah: number;
  winRatePct: number | null;
  selisihHargaRataPct: number | null;
  kalahDenganPembanding: number;
}

const STATUS_LABEL: Record<Status, { teks: string; warna: string; bg: string; border: string }> = {
  prospek:  { teks: "Prospek",  warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
  go:       { teks: "Go",       warna: C.blue,   bg: C.blueBg,   border: C.blueBorder },
  no_go:    { teks: "No-Go",    warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
  diajukan: { teks: "Diajukan", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  menang:   { teks: "Menang",   warna: C.green,  bg: C.greenBg,  border: C.greenBorder },
  kalah:    { teks: "Kalah",    warna: C.red,    bg: C.redBg,    border: C.redBorder },
  batal:    { teks: "Batal",    warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
};

const fmtRp = (n: number | null) =>
  n == null ? "—"
  : n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

/**
 * Selisih harga kami terhadap pemenang, dalam persen.
 *
 * Sengaja memakai uji KEBENARAN (`&&`), bukan `!= null`: nilai pemenang 0
 * berarti "belum diisi dengan benar", dan membaginya menghasilkan Infinity —
 * yang akan tampil sebagai "+Infinity%" dan terbaca seolah kita menawar tak
 * terhingga lebih mahal. Perilaku ini dibawa apa adanya dari versi tabel
 * mentahnya, di mana perhitungan ini menempel di dalam perulangan baris.
 */
const selisihPersen = (b: Bid): number | null =>
  b.bid_value && b.winner_value
    ? ((b.bid_value - b.winner_value) / b.winner_value) * 100
    : null;

export default function TenderPage() {
  const [saring, setSaring] = useState<string>("");
  const [formBuka, setFormBuka] = useState(false);

  /**
   * Seluruh tender yang berstatus `diajukan`, TERLEPAS dari saringan.
   *
   * Dipisah dari `bids` dengan sengaja. `bids` disaring di SERVER lewat
   * `?status=`, jadi begitu pengguna memilih "Menang", `bids` tak lagi memuat
   * satu pun penawaran yang menunggu — dan KPI "menggantung" akan berkedip
   * jadi nol. Angka ringkasan yang berubah karena saringan daftar adalah
   * cacat yang sama seperti KPI yang mengikuti pencarian: pembacanya mengira
   * keadaan perusahaan berubah, padahal cuma tampilannya.
   *
   * Karena itu lapis 1 & 2 memakai deret ini, dan lapis 3 memakai `bids`.
   * Keduanya endpoint yang SAMA — tak ada rute baru, hanya satu permintaan
   * tambahan tanpa parameter status.
   *
   * ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16
   *
   * Dua `useData` terpisah: satu dengan URL dinamis mengikuti `saring`
   * (lapis 3), satu TANPA parameter status (lapis 1 & 2) — persis pola
   * `keuangan/invoice` untuk URL dinamis. `meta` diambil dari respons
   * PENUH, bukan yang tersaring — alasannya sama seperti sebelumnya.
   */
  const jalurBids = saring ? `/api/v1/bids?status=${saring}` : "/api/v1/bids";
  const { data: dataBids, memuat: memuatBids, galat: galatBids, muatUlang: muatUlangBids } =
    useData<{ data: Bid[]; meta: Meta }>(jalurBids);
  const { data: dataPenuh, memuat: memuatPenuh, galat: galatPenuh, muatUlang: muatUlangPenuh } =
    useData<{ data: Bid[]; meta: Meta }>("/api/v1/bids");

  // `useMemo`: `bidsAju` masuk dependensi dua `useMemo` lain di bawah, dan
  // array literal baru tiap render membuat keduanya hitung ulang terus.
  const bids = useMemo(() => dataBids?.data ?? [], [dataBids]);
  const bidsAju = useMemo(() => dataPenuh?.data ?? [], [dataPenuh]);
  const meta = dataPenuh?.meta ?? null;
  const memuat = memuatBids || memuatPenuh;
  const galat = (galatBids || galatPenuh) ? "Gagal memuat register tender" : null;

  // Tanggal acuan dibekukan saat halaman dipasang — lihat catatan yang sama
  // di `/proyek` dan `/aset`.
  const [hariIni] = useState(() => hariIniWIB());

  const muat = () => { void Promise.all([muatUlangBids(), muatUlangPenuh()]); };

  // ── LAPIS 1 & 2 ───────────────────────────────────────────────────────────
  const ringkas = useMemo(() => ringkasTender(bidsAju, hariIni), [bidsAju, hariIni]);
  const menggantung = useMemo(
    () => penawaranMenggantung(bidsAju, hariIni), [bidsAju, hariIni]);

  /*
    RAIL KONTEKSTUAL — catatan lengkapnya di `app/(dashboard)/proyek/page.tsx`.
    Yang relevan di tender: penawaran yang sudah dikirim dan belum diputus —
    itulah yang menunggu kabar dan mudah terlupa.
  */
  usePasangRail(
    <RailIsi
      konteks={
        <KartuRail judul="Menunggu keputusan" kosong="Tak ada penawaran menggantung.">
          {bidsAju
            .filter((b) => b.submitted_at && !b.decided_at)
            .slice(0, 6)
            .map((b, i) => (
              <BarisRail
                key={b.id}
                pertama={i === 0}
                utama={b.title}
                sub={b.owner_name ?? undefined}
                kanan={b.bid_number ?? undefined}
              />
            ))}
        </KartuRail>
      }
    />,
    [bidsAju],
  );

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--gap-bagian)", flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <KepalaHalaman judul="Register Tender" keterangan="Tender yang diikuti, alasan menang/kalah, dan backlog yang sudah dimenangkan."         ikon={<Gavel size={19} />}
      />
        </div>
        <button
          onClick={() => setFormBuka((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 10, border: "none", background: "var(--grad-aksen)", color: C.onNavy,
            fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={15} aria-hidden="true" /> Tender baru
        </button>
      </header>

      {formBuka && <FormTender onSelesai={() => { setFormBuka(false); muat(); }} />}

      {/* ── LAPIS 1 — KEADAAN ── */}
      {meta && (
        <div className="rise rise-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
          {/* Backlog disorot: ia satu-satunya angka di halaman ini yang
              menjawab "sanggup tidak saya ambil kerja baru". Backlog nol
              BUKAN kabar baik untuk kontraktor — itu berarti tak ada pekerjaan
              di tangan setelah proyek berjalan selesai — jadi keterangannya
              menyatakan keadaan itu dengan kalimat, bukan mewarnainya hijau.
              Pola yang sama sudah diperbaiki di /kas (saldo minus) dan
              /keuangan/profitabilitas (margin 100%). */}
          <KartuKPI
            sorot
            label="Backlog"
            nilai={fmtRp(meta.backlogNilai)}
            ikon={<Wallet size={15} />}
            keterangan={meta.backlogJumlah > 0
              ? `${meta.backlogJumlah} tender dimenangkan, belum selesai`
              : "belum ada pekerjaan di tangan setelah proyek berjalan selesai"}
          />
          <KartuKPI
            label="Menunggu Terlalu Lama"
            nilai={String(ringkas.menggantung)}
            nilaiAngka={ringkas.menggantung}
            naikBagus={false}
            ikon={<Hourglass size={15} />}
            keterangan={
              ringkas.diajukan === 0
                ? "tak ada penawaran yang sedang menunggu keputusan"
                : ringkas.menggantung === 0
                  ? `${ringkas.diajukan} penawaran menunggu, semuanya <45 hari`
                  // Nilai pipeline pindah ke sini: sebagai konteks ia memberi
                  // tahu SEBERAPA BESAR yang rapuh, tanpa jadi angka utama
                  // yang tak menuntut tindakan.
                  : `${fmtRp(ringkas.nilaiMenggantung)} dari ${fmtRp(meta.pipelineNilai)} pipeline · >45 hari sejak diajukan`}
          />
          <KartuKPI
            label="Win rate"
            nilai={meta.winRatePct == null ? "—" : `${meta.winRatePct}%`}
            ikon={<Trophy size={15} />}
            keterangan={meta.winRatePct == null
              // "belum pernah ikut" ≠ "selalu kalah" — 0% akan terbaca sebagai
              // yang kedua, jadi keadaan ini dinyatakan dengan kalimat.
              ? "belum ada tender yang diputuskan"
              : `${meta.menang} menang · ${meta.kalah} kalah`}
          />
          <KartuKPI
            label="Selisih vs Pemenang"
            nilai={meta.selisihHargaRataPct == null ? "—" : `${meta.selisihHargaRataPct > 0 ? "+" : ""}${meta.selisihHargaRataPct}%`}
            naikBagus={false}
            ikon={<XCircle size={15} />}
            keterangan={meta.selisihHargaRataPct == null
              ? "nilai pemenang belum pernah diisi — selisih tak bisa dihitung"
              : meta.selisihHargaRataPct > 0
                ? `rata-rata kita lebih mahal (${meta.kalahDenganPembanding} tender kalah)`
                : "kita lebih murah tapi tetap kalah — bukan soal harga"}
          />
        </div>
      )}

      {/* Tender `diajukan` yang tanggal pengajuannya kosong. Spanduk, bukan
          kartu: ia menyatakan ada DATA yang harus dilengkapi, bukan keadaan
          bisnis. Kenapa layak disebut sama sekali — tender ini tak pernah bisa
          masuk hitungan "menunggu terlalu lama" karena umurnya tak terhitung,
          jadi ia tak muncul di angka mana pun. Yang tak terlihat di mana pun
          tak akan pernah ditagih jawabannya. */}
      {!memuat && ringkas.tanpaTanggalAju > 0 && (
        <div className="rise rise-1" style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 10, marginBottom: 20,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
        }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ color: C.onWarningBg, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.onWarningBg, fontWeight: 600 }}>
            {ringkas.tanpaTanggalAju} tender berstatus &ldquo;diajukan&rdquo; belum
            punya tanggal pengajuan — umurnya tak terhitung, jadi ia tak akan
            pernah muncul sebagai penawaran yang menggantung.
          </span>
        </div>
      )}

      {/* ── LAPIS 2 — POLA ──
          Pertanyaan yang dijawab: "penawaran mana yang harus saya tagih
          jawabannya, dan mana dulu?"

          Grafik batang nilai penawaran per tender sengaja TIDAK dipilih: ia
          hanya menggambar ulang kolom "Nilai kami" yang sudah ada di tabel.
          Yang tak bisa dibaca dari tabel adalah UMUR penawaran — tabel
          menampilkan tanggal pengajuan, dan mengubah "12 Mei" jadi "87 hari
          lalu" adalah pengurangan kalender yang harus dilakukan baris per
          baris dengan kalkulator.

          Panjang batang di sini menyatakan umur relatif terhadap yang tertua,
          jadi "jauh lebih lama dari yang lain" terbaca sebelum angkanya
          dibaca. */}
      {!memuat && menggantung.length > 0 && (
        <div className="rise rise-2" style={{ marginBottom: 20 }}>
          <Panel
            judul="Penawaran yang Menggantung"
            keterangan="sudah diajukan >45 hari dan belum ada keputusan — yang terlama di atas"
          >
            <DaftarMenggantung baris={menggantung} tertua={ringkas.umurTertua ?? 1} />
          </Panel>
        </div>
      )}

      {/* ── LAPIS 3 — DETAIL ── */}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="saring-status" style={{ fontSize: 12, color: C.mid, marginRight: 8 }}>Status</label>
        <Pilihan id="saring-status" value={saring} onChange={(e) => { setSaring(e.target.value); }}
          style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13 }}>
          <option value="">Semua</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s].teks}</option>
          ))}
        </Pilihan>
      </div>

      {memuat && <div style={{ padding: 24, color: C.mid, fontSize: 13 }}>Memuat…</div>}
      {galat && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "var(--pad-kartu-lega)", fontSize: 13, color: C.red }}>
          <AlertTriangle size={15} aria-hidden="true" /> {galat}
        </div>
      )}

      {!memuat && !galat && bids.length === 0 && (
        <div style={{ padding: "28px 20px", textAlign: "center", borderRadius: 10, border: `1px dashed ${C.border}`, color: C.mid, fontSize: 13 }}>
          Belum ada tender tercatat. Mulai dengan mencatat tender yang sedang diikuti —
          termasuk yang akhirnya kalah, karena justru itu yang paling berguna dipelajari.
        </div>
      )}

      {!memuat && bids.length > 0 && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              kolom pertama <th scope="row">, tabular-nums, dan pembungkus
              overflow-x kini dijamin komponen, bukan diingat per halaman.
              Yang paling penting di sini justru tabular-nums: seluruh alasan
              halaman ini berbentuk tabel adalah MEMBANDINGKAN angka antar-baris
              (lihat catatan kepala berkas), dan itu runtuh begitu digit "1"
              lebih sempit daripada "8". */}
          <Tabel<Bid>
              berpermukaan
            caption="Daftar tender: nama, pemberi kerja, nilai penawaran kami, nilai pemenang, selisih, tanggal diajukan, dan status."
            data={bids}
            kunciBaris={(b) => b.id}
            kolom={[
              {
                kunci: "tender", judul: "Tender", kepalaBaris: true,
                render: (b) => (
                  <>
                    <div style={{ fontWeight: 600, color: C.text }}>{b.title}</div>
                    {b.bid_number && <div style={{ fontSize: "var(--t-kecil)", color: C.muted, fontFamily: "ui-monospace, monospace" }}>{b.bid_number}</div>}
                  </>
                ),
              },
              {
                kunci: "pemberi", judul: "Pemberi kerja",
                render: (b) => <span style={{ color: C.mid }}>{b.owner_name ?? "—"}</span>,
              },
              {
                kunci: "nilai_kami", judul: "Nilai kami", rata: "kanan",
                render: (b) => fmtRp(b.bid_value),
              },
              {
                kunci: "nilai_pemenang", judul: "Nilai pemenang", rata: "kanan",
                render: (b) => <span style={{ color: C.mid }}>{fmtRp(b.winner_value)}</span>,
              },
              {
                kunci: "selisih", judul: "Selisih", rata: "kanan",
                render: (b) => {
                  const selisih = selisihPersen(b);
                  return (
                    <span style={{
                      color: selisih == null ? C.muted : selisih > 0 ? C.red : C.green,
                      fontWeight: selisih == null ? 400 : 600,
                    }}>
                      {selisih == null ? "—" : `${selisih > 0 ? "+" : ""}${selisih.toFixed(1)}%`}
                    </span>
                  );
                },
              },
              {
                kunci: "diajukan", judul: "Diajukan",
                render: (b) => <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{fmtTgl(b.submitted_at)}</span>,
              },
              {
                kunci: "status", judul: "Status",
                // Status ditulis, bukan diwakili warna saja — WCAG 1.4.1.
                render: (b) => {
                  const s = STATUS_LABEL[b.status];
                  return (
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: "var(--t-kecil)", fontWeight: 700, color: s.warna, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
                      {s.teks}
                    </span>
                  );
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Batang menyamping: umur penawaran yang menggantung.
 *
 * ── Kenapa menyamping, bukan `GrafikBatang` tegak yang sudah ada
 *
 * Judul tender panjang ("Pembangunan Gedung Serbaguna Tahap 2"), dan pada
 * batang tegak label itu terpotong jadi tak terbaca — yang menghapus gunanya
 * grafik yang tugasnya menunjuk tender TERTENTU untuk ditelepon hari ini.
 *
 * ── Kenapa umurnya ditulis, bukan cuma digambar
 *
 * Panjang batang untuk memindai mana yang paling parah; angkanya untuk ditulis
 * di notulen dan disebut saat menelepon panitia.
 */
function DaftarMenggantung({ baris, tertua }: { baris: BarisMenggantung[]; tertua: number }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      {baris.map((b, i) => (
        <li key={b.id}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: C.text,
              flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{b.judul}</span>
            <span style={{ fontSize: "var(--t-kecil)", color: C.mid, whiteSpace: "nowrap" }}>
              {b.nilai == null
                // "Rp 0" akan terbaca sebagai penawaran tanpa nilai, padahal
                // nilainya hanya belum diisi.
                ? <span style={{ color: C.muted, fontStyle: "italic" }}>nilai belum diisi</span>
                : fmtRp(b.nilai)}
            </span>
            <span style={{
              fontSize: "var(--t-kecil)", fontWeight: 700, color: C.red,
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>
              {b.umurHari} hari
            </span>
          </div>

          <div
            role="img"
            aria-label={`${b.judul}: menggantung ${b.umurHari} hari sejak diajukan`}
            style={{ position: "relative", height: 10, background: "var(--surface-hover)", borderRadius: 4, overflow: "hidden" }}
          >
            <div style={{
              position: "absolute", inset: 0,
              width: `${Math.max(2, (b.umurHari / Math.max(tertua, 1)) * 100)}%`,
              // Hanya baris TERPARAH yang bergradasi — aturan "satu aksen per
              // layar" (`ui-dasar.tsx`). Kalau enam batang bergradasi, tak ada
              // yang menonjol dan daftar urut kehilangan gunanya.
              background: i === 0 ? "var(--grad-aksen)" : "var(--aksen)",
              borderRadius: 4, transition: "width 500ms cubic-bezier(.16,1,.3,1)",
            }} />
          </div>
        </li>
      ))}

      <li style={{ fontSize: "var(--t-mikro)", color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
        <Clock size={10} aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 4 }} />
        Panjang batang relatif terhadap penawaran tertua di daftar ini.
        Tender yang menggantung selama ini sering sudah diputuskan tanpa kita
        diberi tahu — selama statusnya belum diubah, nilainya masih ikut
        terhitung sebagai pipeline.
      </li>
    </ul>
  );
}

function FormTender({ onSelesai }: { onSelesai: () => void }) {
  const [judul, setJudul] = useState("");
  const [nomor, setNomor] = useState("");
  const [pemberi, setPemberi] = useState("");
  const [nilai, setNilai] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!judul.trim()) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/bids", {
        title: judul.trim(),
        bid_number: nomor.trim() || undefined,
        owner_name: pemberi.trim() || undefined,
        bid_value: nilai ? Number(nilai) : undefined,
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2.response?.data?.error ?? "Gagal menyimpan tender");
    } finally { setKirim(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 8px", borderRadius: 6,
    border: `1px solid ${C.border}`, background: C.surface, color: C.text,
    fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: C.mid, marginBottom: 4 };

  return (
    <form onSubmit={simpan} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <div>
          <label htmlFor="t-judul" style={lbl}>Judul tender *</label>
          <input id="t-judul" value={judul} onChange={(e) => setJudul(e.target.value)} required style={inp} />
        </div>
        <div>
          <label htmlFor="t-nomor" style={lbl}>Nomor tender</label>
          <input id="t-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)} style={inp}
            placeholder="dari penyelenggara" />
        </div>
        <div>
          <label htmlFor="t-pemberi" style={lbl}>Pemberi kerja</label>
          <input id="t-pemberi" value={pemberi} onChange={(e) => setPemberi(e.target.value)} style={inp} />
        </div>
        <div>
          <label htmlFor="t-nilai" style={lbl}>Nilai penawaran (Rp)</label>
          <input id="t-nilai" type="number" min="0" value={nilai} onChange={(e) => setNilai(e.target.value)} style={inp} />
        </div>
      </div>
      {galat && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>{galat}</div>}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={kirim || !judul.trim()} style={{
          padding: "8px 16px", borderRadius: 10, border: "none",
          background: kirim || !judul.trim() ? C.muted : C.navy, color: C.onNavy,
          fontSize: 13, fontWeight: 600, cursor: kirim || !judul.trim() ? "not-allowed" : "pointer",
        }}>
          {kirim ? "Menyimpan…" : "Simpan tender"}
        </button>
      </div>
    </form>
  );
}
