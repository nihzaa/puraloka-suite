"use client";

// Register Piutang (PETA §3 #3) — AR aging 30/60/90 + register retensi + register
// uang muka (DP recoupment). Satu tugas halaman: menunjukkan di mana uang tertahan
// dan mana yang harus dikejar sekarang. Signature: "Spektrum Umur Piutang" —
// bar proporsional per bucket dengan ramp urgensi, klik segmen = filter tabel.

import React, { useCallback, useMemo, useState } from "react";
import { useData } from "@/lib/data-cache";
import {
  RefreshCw, Landmark, HandCoins, AlertTriangle, Receipt, ShieldAlert,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { Tabel, type Kolom, KepalaHalaman } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";
import { GAYA_KARTU } from "@/components/ui-dasar";


/**
 * Ramp urgensi bucket — makin tua umur piutang, makin gelap merahnya.
 *
 * ── Kenapa BUKAN `--data-*`
 *
 * Bucket 31–60 hari sempat memakai `var(--data-5)`. Di mode terang itu
 * oranye dan ramp-nya utuh; di mode gelap `--data-5` adalah `#CBD5E1`,
 * abu-abu terang — sehingga bucket TENGAH tampil paling pucat di antara
 * kuning dan merah. Ramp-nya putus tepat di tengah, dan seluruh
 * Rp 119,6 juta yang jatuh di bucket itu terbaca sebagai keadaan paling
 * ringan, bukan paling perlu ditagih.
 *
 * Sebabnya: `--data-*` adalah deret KATEGORI — lima warna yang dipilih
 * supaya saling terbedakan, tanpa urutan gawat di antaranya. Mode gelap
 * sengaja mengorbankan kesetiaan rona demi keterbedaan itu (alasan
 * lengkap di `globals.css`). Memakainya untuk ramp berarti meminjam
 * palet yang dirancang untuk tujuan yang berlawanan.
 *
 * Token semantik (`--warning`, `--danger`) punya varian gelapnya sendiri
 * dan mempertahankan MAKNA di kedua mode — itu yang dibutuhkan di sini.
 */
const BUCKETS = [
  { key: "current", label: "Belum jatuh tempo", color: "var(--navy)" },
  { key: "d1_30",   label: "1–30 hari",         color: "var(--warning)" },
  // Antara kuning dan merah: oranye. `color-mix` menurunkannya dari kedua
  // token semantik itu, jadi ia ikut berubah sendiri saat mode berganti —
  // tak ada hex mode-gelap kedua yang bisa lupa diperbarui.
  { key: "d31_60",  label: "31–60 hari",        color: "color-mix(in srgb, var(--warning) 45%, var(--danger))" },
  { key: "d61_90",  label: "61–90 hari",        color: "var(--danger)" },
  { key: "d90_plus", label: ">90 hari",         color: "color-mix(in srgb, var(--danger) 60%, black)" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];

interface AgingRow {
  id: string; invoice_number: string; invoice_type: string;
  issued_date: string; due_date: string; total_amount: number; amount_due: number;
  status: string; days_past_due: number; bucket: BucketKey;
  project: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
}
interface AgingData {
  as_of: string; buckets: Record<BucketKey, number>;
  total_outstanding: number; invoice_count: number; rows: AgingRow[];
}
interface RetentionRow {
  project: { id: string; name: string; status: string; end_date: string | null };
  client: { id: string; name: string } | null;
  retention_pct: number | null; withheld: number; released: number; outstanding: number;
  on_retention_termins: { id: string; label: string; amount: number; status: string; due_days: number | null }[];
  estimated_release_due: string | null; is_due_estimate: boolean;
}
interface DpRow {
  project: { id: string; name: string; status: string; contract_value: number };
  client: { id: string; name: string } | null;
  dp_billed: number; dp_paid: number; recouped: number; remaining_to_recoup: number;
}

const fmt = formatRupiah;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const INVOICE_TYPE_LABEL: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", expense_billing: "Pengeluaran",
  commission_fee: "Fee Komisi", retention_release: "Pencairan Retensi",
};

export default function PiutangPage() {
  const [bucketFilter, setBucketFilter] = useState<BucketKey | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga endpoint independen — pola `procurement/hutang`. `forbidden` (403)
    diperiksa dari objek `Error` yang dikembalikan `useData`: `api.get`
    (axios) melempar `AxiosError` dengan `.response.status`, dan bentuk itu
    tetap utuh saat lewat `ambilData` karena `useData` meneruskan galat asli,
    bukan membungkusnya.
  */
  const { data: aging, memuat: memuatAging, galat: galatAging, muatUlang: muatUlangAging } =
    useData<AgingData>("/api/v1/finance/ar-aging");
  const { data: dataRetention, memuat: memuatRetention, muatUlang: muatUlangRetention } =
    useData<{ rows: RetentionRow[] }>("/api/v1/finance/retention-register");
  const { data: dataDp, memuat: memuatDp, muatUlang: muatUlangDp } =
    useData<{ rows: DpRow[] }>("/api/v1/finance/dp-register");

  const retention = dataRetention?.rows ?? null;
  const dp = dataDp?.rows ?? null;
  const loading = memuatAging || memuatRetention || memuatDp;
  const forbidden = (galatAging as unknown as { response?: { status?: number } } | null)?.response?.status === 403;

  const load = useCallback(() => {
    void Promise.all([muatUlangAging(), muatUlangRetention(), muatUlangDp()]);
  }, [muatUlangAging, muatUlangRetention, muatUlangDp]);

  const overdueTotal = useMemo(() => {
    if (!aging) return 0;
    return aging.buckets.d1_30 + aging.buckets.d31_60 + aging.buckets.d61_90 + aging.buckets.d90_plus;
  }, [aging]);

  const filteredRows = useMemo(() => {
    if (!aging) return [];
    return bucketFilter ? aging.rows.filter(r => r.bucket === bucketFilter) : aging.rows;
  }, [aging, bucketFilter]);

  const retentionOutstandingTotal = (retention ?? []).reduce((s, r) => s + r.outstanding, 0);
  const dpRemainingTotal = (dp ?? []).reduce((s, r) => s + r.remaining_to_recoup, 0);

  const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 };

  // `th`/`td` bersama sudah tak ada: padding, ukuran teks, dan garis antar
  // baris kini datang dari <Tabel>. Yang tersisa hanya gaya yang benar-benar
  // khas isi selnya — warna merah untuk umur lewat tempo, bar progres DP.

  const kolomInvoice: Array<Kolom<AgingRow>> = [
    {
      kunci: "invoice", judul: "Invoice", kepalaBaris: true,
      render: r => (
        <>
          <div style={{ fontWeight: 600 }}>{r.invoice_number}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{INVOICE_TYPE_LABEL[r.invoice_type] ?? r.invoice_type}</div>
        </>
      ),
    },
    { kunci: "proyek", judul: "Proyek", render: r => r.project?.name ?? "—" },
    { kunci: "klien", judul: "Klien", render: r => r.client?.name ?? "—" },
    { kunci: "jatuh_tempo", judul: "Jatuh Tempo", render: r => fmtDate(r.due_date) },
    {
      kunci: "umur", judul: "Umur", rata: "kanan",
      // Merah hanya bila sudah lewat tempo — warna dipakai saat angkanya
      // PUNYA arah buruk, bukan sebagai hiasan kolom.
      render: r => (
        <span style={{ color: r.days_past_due > 0 ? C.red : C.mid }}>
          {r.days_past_due > 0 ? `${r.days_past_due} hari` : "belum"}
        </span>
      ),
    },
    {
      kunci: "bucket", judul: "Bucket",
      render: r => {
        const b = BUCKETS.find(x => x.key === r.bucket)!;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 0, background: b.color }} />{b.label}
          </span>
        );
      },
    },
    {
      kunci: "sisa", judul: "Sisa Tagihan", rata: "kanan",
      render: r => <span style={{ fontWeight: 700 }}>{fmt(r.amount_due)}</span>,
    },
  ];

  const kolomRetensi: Array<Kolom<RetentionRow>> = [
    {
      kunci: "proyek", judul: "Proyek", kepalaBaris: true,
      render: r => (
        <>
          <div style={{ fontWeight: 600 }}>{r.project.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{r.client?.name ?? "—"}{r.retention_pct ? ` · retensi ${r.retention_pct}%` : ""}</div>
        </>
      ),
    },
    { kunci: "ditahan", judul: "Ditahan", rata: "kanan", render: r => fmt(r.withheld) },
    {
      kunci: "dicairkan", judul: "Dicairkan", rata: "kanan",
      render: r => <span style={{ color: C.green }}>{r.released > 0 ? fmt(r.released) : "—"}</span>,
    },
    {
      kunci: "sisa", judul: "Sisa", rata: "kanan",
      render: r => <span style={{ fontWeight: 700 }}>{fmt(r.outstanding)}</span>,
    },
    {
      kunci: "estimasi", judul: "Estimasi Cair",
      render: r => r.estimated_release_due ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: r.is_due_estimate ? C.red : C.mid, fontWeight: r.is_due_estimate ? 700 : 400 }}>
          {r.is_due_estimate && <AlertTriangle size={12} />}
          {fmtDate(r.estimated_release_due)}{r.is_due_estimate ? " — siap ditagih" : ""}
        </span>
      ) : <span style={{ fontSize: 12, color: C.muted }}>—</span>,
    },
  ];

  const kolomDp: Array<Kolom<DpRow>> = [
    {
      kunci: "proyek", judul: "Proyek", kepalaBaris: true,
      render: r => (
        <>
          <div style={{ fontWeight: 600 }}>{r.project.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{r.client?.name ?? "—"}</div>
        </>
      ),
    },
    { kunci: "dp_paid", judul: "DP Terbayar", rata: "kanan", render: r => fmt(r.dp_paid) },
    { kunci: "recouped", judul: "Sudah Dipotong", rata: "kanan", render: r => fmt(r.recouped) },
    {
      kunci: "progres", judul: "Progres Pemotongan", lebar: 160,
      render: r => {
        const pct = r.dp_paid > 0 ? Math.min((r.recouped / r.dp_paid) * 100, 100) : 0;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160 }}>
            <div style={{ flex: 1, height: 7, borderRadius: 6, background: "var(--surface-hover)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.green : C.navy, borderRadius: 6 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: r.remaining_to_recoup > 0 ? C.text : C.green, whiteSpace: "nowrap" }}>
              {r.remaining_to_recoup > 0 ? `sisa ${fmt(r.remaining_to_recoup)}` : "selesai"}
            </span>
          </div>
        );
      },
    },
  ];

  if (forbidden) {
    return (
      <div style={{ ...GAYA_KARTU, padding: 40, textAlign: "center", margin: 24 }}>
        <ShieldAlert size={28} style={{ color: C.muted, marginBottom: 10 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Butuh akses data finansial</div>
        <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>Halaman ini memerlukan permission finance:view:all. Hubungi admin untuk mendapat akses.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <KepalaHalaman judul="Register Piutang"         ikon={<Receipt size={19} />}
      /><div style={{ fontSize: 13, color: C.mid, marginTop: 3 }}>
            Umur tagihan, retensi tertahan, dan uang muka yang belum dipotong
            {aging && <> · per {fmtDate(aging.as_of)}</>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Piutang Berjalan</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: C.navy }}>{aging ? fmt(aging.total_outstanding) : "—"}</div>
          </div>
          <button aria-label="Muat ulang" onClick={load} disabled={loading} title="Muat ulang"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Muat ulang
          </button>
        </div>
      </div>

      {/* ── Spektrum Umur Piutang (signature) ── */}
      <div style={{ ...GAYA_KARTU, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={sectionTitle}><Receipt size={16} style={{ color: C.navy }} /> Spektrum Umur Piutang</div>
          {overdueTotal > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.red }}>
              <AlertTriangle size={13} /> {fmt(overdueTotal)} lewat jatuh tempo
            </div>
          )}
        </div>

        {aging && aging.total_outstanding > 0 ? (
          <>
            <div style={{ display: "flex", width: "100%", height: 34, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
              {BUCKETS.map(b => {
                const amount = aging.buckets[b.key];
                if (amount <= 0) return null;
                const pct = (amount / aging.total_outstanding) * 100;
                const active = bucketFilter === null || bucketFilter === b.key;
                return (
                  <button key={b.key}
                    onClick={() => setBucketFilter(bucketFilter === b.key ? null : b.key)}
                    title={`${b.label}: ${fmt(amount)}`}
                    style={{
                      width: `${pct}%`, minWidth: 14, border: "none", cursor: "pointer",
                      background: b.color, opacity: active ? 1 : 0.25,
                      transition: "opacity 0.15s",
                    }}
                    aria-label={`Filter bucket ${b.label}`}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {BUCKETS.map(b => {
                const amount = aging.buckets[b.key];
                const selected = bucketFilter === b.key;
                return (
                  <button key={b.key} onClick={() => setBucketFilter(selected ? null : b.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                      borderRadius: 6, cursor: "pointer", fontSize: 12,
                      border: selected ? `1.5px solid ${b.color}` : `1px solid ${C.border}`,
                      background: selected ? "var(--surface-hover)" : "var(--surface)",
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: 0, background: b.color, flexShrink: 0 }} />
                    <span style={{ color: C.mid }}>{b.label}</span>
                    <b style={{ color: amount > 0 ? C.text : C.muted, fontFamily: "var(--font-display)" }}>{fmt(amount)}</b>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: "22px 0", fontSize: 13, color: C.mid }}>
            {loading ? "Memuat data piutang…" : "Tidak ada piutang berjalan — semua invoice sudah lunas. Invoice baru akan muncul di sini begitu diterbitkan."}
          </div>
        )}
      </div>

      {/* ── Tabel invoice terbuka ── */}
      <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={sectionTitle}>
            Invoice Belum Lunas
            {bucketFilter && (
              <span style={{ fontSize: 12, fontWeight: 500, color: C.mid }}>
                — {BUCKETS.find(b => b.key === bucketFilter)?.label}
                <button onClick={() => setBucketFilter(null)} style={{ marginLeft: 8, border: "none", background: "none", color: C.blue, fontSize: 12, cursor: "pointer", padding: 0 }}>hapus filter</button>
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: C.muted }}>{filteredRows.length} invoice</span>
        </div>
        {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
            kolom pertama <th scope="row">, tabular-nums, dan pembungkus
            overflow-x sekarang dijamin komponen — empat hal yang tabel
            mentah harus ingat sendiri setiap kali kolom bertambah.

            Kepala baris = nomor invoice. Itu yang menamai baris bagi
            pembaca layar; "12 Agu 2026" tidak, karena beberapa invoice
            bisa jatuh tempo di hari yang sama dan namanya jadi tak
            membedakan apa pun.

            Baris "tidak ada invoice" berpindah dari <tbody> ke prop
            `kosong`: sebagai baris data, pesan itu dibacakan pembaca
            layar seolah invoice bernama "Tidak ada invoice terbuka".
            Ia hanya muncul setelah muat selesai — persis seperti
            sebelumnya, supaya pesan "kosong" tak menyalip data yang
            masih dalam perjalanan. */}
        <Tabel<AgingRow>
          caption="Invoice belum lunas, diurutkan dari yang paling tua. Kolom Umur dihitung dari jatuh tempo, bukan dari tanggal terbit."
          data={filteredRows}
          kunciBaris={r => r.id}
          kolom={kolomInvoice}
          kosong={loading ? undefined : (
            <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: C.mid }}>
              {bucketFilter ? "Tidak ada invoice di bucket ini." : "Tidak ada invoice terbuka."}
            </div>
          )}
        />
      </div>

      {/* ── Register Retensi + Register Uang Muka ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "var(--gap-bagian)" }}>
        {/* Retensi */}
        <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionTitle}><Landmark size={16} style={{ color: C.navy }} /> Register Retensi</div>
            <div style={{ fontSize: 12, color: C.mid }}>Tertahan: <b style={{ color: C.text }}>{fmt(retentionOutstandingTotal)}</b></div>
          </div>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
              kolom pertama <th scope="row">, tabular-nums, dan pembungkus
              overflow-x sekarang dijamin komponen.

              Kepala baris = nama proyek: retensi ditahan PER PROYEK, jadi
              itulah yang menamai barisnya.

              Baris pesan-kosong berpindah ke prop `kosong`, dan bersamanya
              hilang pula tambalan `whiteSpace: normal` + `maxWidth: 0`.
              Tambalan itu hanya perlu karena `td` bersama memakai `nowrap`
              demi kolom angka; di luar tabel kalimatnya membungkus
              sendiri tanpa melebarkan apa pun. */}
          <Tabel<RetentionRow>
              berpermukaan
            caption="Retensi per proyek: yang ditahan, yang sudah dicairkan, dan sisanya. Estimasi cair dihitung dari tanggal selesai proyek ditambah hari retensi termin."
            data={retention ?? []}
            kunciBaris={r => r.project.id}
            kolom={kolomRetensi}
            kosong={loading ? undefined : (
              <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: C.mid }}>
                Belum ada retensi tercatat. Retensi muncul saat invoice memakai potongan retensi.
              </div>
            )}
          />
          <div style={{ padding: "8px 20px 12px", fontSize: 11, color: C.muted }}>
            Estimasi cair = tanggal selesai proyek + hari retensi termin (bukan tanggal resmi — BAST formal belum dicatat sistem).
          </div>
        </div>

        {/* Uang Muka */}
        <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionTitle}><HandCoins size={16} style={{ color: C.navy }} /> Register Uang Muka (DP)</div>
            <div style={{ fontSize: 12, color: C.mid }}>Belum dipotong: <b style={{ color: C.text }}>{fmt(dpRemainingTotal)}</b></div>
          </div>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
              kolom pertama <th scope="row">, tabular-nums, dan pembungkus
              overflow-x sekarang dijamin komponen.

              Kepala baris = nama proyek, seperti Register Retensi di
              sebelahnya: DP dipotong per proyek, bukan per tanggal.

              Sama seperti tabel kembarnya, pesan-kosong pindah ke prop
              `kosong` dan tambalan `whiteSpace: normal` + `maxWidth: 0`
              ikut terhapus — di luar tabel tak ada `nowrap` yang perlu
              dilawan. */}
          <Tabel<DpRow>
              berpermukaan
            caption="Uang muka per proyek: yang sudah dibayar klien dan berapa yang sudah dipotong dari invoice termin berikutnya."
            data={dp ?? []}
            kunciBaris={r => r.project.id}
            kolom={kolomDp}
            kosong={loading ? undefined : (
              <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: C.mid }}>
                Belum ada uang muka tercatat. DP muncul saat termin on_sign ditagih, dan dipotong lewat form invoice termin.
              </div>
            )}
          />
          <div style={{ padding: "8px 20px 12px", fontSize: 11, color: C.muted }}>
            Sisa DP dipotong dari invoice termin berikutnya lewat form Buat Invoice di halaman Keuangan.
          </div>
        </div>
      </div>
    </div>
  );
}
