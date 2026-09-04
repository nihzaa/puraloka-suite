"use client";

/**
 * KONTRAK SUBKONTRAKTOR — lingkup kerja borongan sebagai KONTRAK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA, PADAHAL /mandor/penugasan SUDAH MENAMPILKAN SCOPE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menu `kontrak-subkon` sudah AKTIF sejak migrasi 241 dan halamannya tak
 * pernah dibuat — yang mengkliknya terlempar ke `/dashboard`. Datanya
 * (`work_scopes`, `work_scope_items`) dan endpoint-nya
 * (`GET /api/v1/mandor/assignments`) sudah ada sepanjang waktu itu.
 *
 * Yang membedakannya dari `/mandor/penugasan` bukan tampilan, melainkan
 * PERTANYAAN — dan karena itu unit barisnya pun berbeda:
 *
 *   /mandor/penugasan   satu baris = satu MANDOR di satu proyek.
 *                       "siapa mengerjakan apa, dan berapa kasbonnya."
 *                       Sudut pandang SDM lapangan.
 *
 *   halaman ini         satu baris = satu LINGKUP BORONGAN.
 *                       "berapa nilai yang kita ikat ke pihak ketiga, dan
 *                       berapa yang sudah keluar terhadap kemajuannya."
 *                       Sudut pandang KONTRAK.
 *
 * Borongan adalah kontrak: ada nilai yang disepakati, ada prestasi, ada
 * pembayaran bertahap. Yang menandatanganinya kebetulan disebut "mandor" di
 * basis data — tapi yang ditanyakan orang dari menu Kontrak adalah komitmen
 * uangnya, bukan orangnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKA YANG PALING MUDAH MENIPU: UANG KELUAR vs KEMAJUAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua persentase berjalan berdampingan pada tiap borongan:
 *
 *   · kemajuan fisik   (`progress_pct_done`) — berapa yang sudah dikerjakan
 *   · uang tersalur    (kasbon + pembayaran prestasi) terhadap nilai kontrak
 *
 * Selama uang mengikuti kemajuan, tak ada yang perlu dilihat. Yang menuntut
 * tindakan adalah SELISIHNYA: borongan yang sudah menyerap 80% uang dengan
 * kemajuan 40% berarti kita sudah membayar pekerjaan yang belum ada — dan
 * pada saat itu ketahuan, daya tawar untuk menuntutnya sudah habis.
 *
 * Kolom "Selisih" itulah alasan halaman ini ada. Ia dihitung dari angka yang
 * SUDAH disediakan API (`financial_pct`, `paid_pct`, `progress_pct_done`),
 * bukan ditaksir ulang di peramban.
 *
 * ── Satu aksen (ARAH-VISUAL §3d)
 *
 * Yang menonjol HANYA borongan yang uangnya mendahului kemajuan. Nilai
 * kontrak, nama proyek, dan tanggal ditampilkan tenang — semuanya penting,
 * tapi tak satu pun menuntut tindakan hari ini.
 *
 * ── Selisih ditulis sebagai angka, bukan hanya batang berwarna (WCAG 1.4.1)
 */

import { useMemo, useState } from "react";
import { FileSignature, TriangleAlert, RefreshCw, HandCoins } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Saklar } from "@/components/saklar";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom, Galat, Rangka } from "@/components/dasar";

type Scope = {
  id: string;
  scope_name: string;
  payment_system: string | null;
  status: string;
  progress_pct_done: number | string | null;
  contract_value: number | string | null;
  total_kasbon: number | string | null;
  total_progress_paid: number | string | null;
  financial_pct: number | null;
  paid_pct: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Assignment = {
  id: string;
  status: string;
  assigned_at: string | null;
  project: { id: string; name: string; location: string | null } | null;
  mandor: { id: string; name: string; phone: string | null } | null;
  work_scopes: Scope[];
};

/** Satu borongan yang sudah membawa identitas proyek & pelaksananya. */
type BarisKontrak = Scope & {
  proyekNama: string;
  pelaksanaNama: string;
  nilai: number;
  kemajuan: number;
  tersalur: number;
  selisih: number;
};

const angka = (n: number | string | null | undefined): number => {
  const v = n == null ? 0 : Number(n);
  return Number.isFinite(v) ? v : 0;
};

const rupiah = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
};

const persen = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`;

/**
 * Ambang selisih yang dianggap menuntut tindakan.
 *
 * 15 poin, bukan 0: borongan selalu punya selisih kecil karena kasbon
 * mendahului prestasi mingguan — itu cara kerjanya yang normal. Ambang nol
 * akan menyalakan hampir seluruh daftar, dan daftar yang selalu merah
 * berhenti dibaca.
 */
const AMBANG_SELISIH = 15;

/** Satu angka besar + penjelasannya. Lapis 1 pola ARAH-VISUAL §5b. */
function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string | number; keterangan?: string; warna?: string;
}) {
  return (
    <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{
        fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid,
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
        color: warna ?? C.text, fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      {keterangan && (
        <div style={{ fontSize: 12, color: C.mid, marginTop: 2, lineHeight: 1.4 }}>{keterangan}</div>
      )}
    </div>
  );
}

/**
 * Dua persentase yang harus dibaca BERSAMAAN.
 *
 * Ditumpuk, bukan bersebelahan di dua kolom: yang bermakna adalah jaraknya,
 * dan jarak paling mudah dibaca ketika dua batang berbagi sumbu yang sama.
 */
function BatangBanding({ kemajuan, tersalur }: { kemajuan: number; tersalur: number }) {
  const lebar = (v: number) => `${Math.min(100, Math.max(0, v))}%`;
  const mendahului = tersalur - kemajuan >= AMBANG_SELISIH;

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 120 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{
          flex: 1, height: 5, borderRadius: 3, background: "var(--surface-subtle)", overflow: "hidden",
        }}>
          <span style={{ display: "block", height: "100%", width: lebar(kemajuan), background: "var(--navy)" }} />
        </span>
        <span style={{ fontSize: "var(--t-kecil)", color: C.mid, fontVariantNumeric: "tabular-nums", minWidth: 34 }}>
          {persen(kemajuan)}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{
          flex: 1, height: 5, borderRadius: 3, background: "var(--surface-subtle)", overflow: "hidden",
        }}>
          <span style={{
            display: "block", height: "100%", width: lebar(tersalur),
            background: mendahului ? "var(--danger)" : "var(--success)",
          }} />
        </span>
        <span style={{
          fontSize: "var(--t-kecil)", fontVariantNumeric: "tabular-nums", minWidth: 34,
          color: mendahului ? "var(--danger)" : C.mid,
        }}>
          {persen(tersalur)}
        </span>
      </span>
      {/* Label ditulis, bukan diserahkan ke warna — dua batang abu-abu tanpa
          keterangan tak bisa dibedakan siapa pun. */}
      <span style={{ fontSize: "var(--t-mikro)", color: C.muted }}>fisik / uang</span>
    </span>
  );
}

export default function KontrakSubkonPage() {
  const [hanyaMendahului, setHanyaMendahului] = useState(false);

  /*
    Lapis cache bersama (`audit-halaman-pakai-cache.mjs`).

    Halaman ini hanya MEMBACA — pengikatan dan pembayaran borongan dilakukan
    dari modul mandor, tempat approval-nya berada. Karena tak ada aksi tulis,
    `galatMuat` dipakai apa adanya tanpa state kedua. Begitu aksi tulis
    ditambahkan, ia WAJIB punya state galat sendiri
    (`uji-galat-muat-terpisah.mjs`).
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ assignments: Assignment[] }>("/api/v1/mandor/assignments");

  const kontrak: BarisKontrak[] = useMemo(() => {
    const semua = (data?.assignments ?? []).flatMap((a) =>
      (a.work_scopes ?? []).map((s) => {
        const nilai = angka(s.contract_value);
        const kemajuan = angka(s.progress_pct_done);

        /*
          Uang tersalur = kasbon + pembayaran prestasi, terhadap nilai kontrak.

          API sudah menyediakan `financial_pct` (kasbon) dan `paid_pct`
          (prestasi) secara TERPISAH. Dijumlahkan di sini karena yang
          menentukan risiko adalah TOTAL yang sudah keluar — pihak ketiga tak
          membedakan uang muka dari termin saat pekerjaannya berhenti.

          Kalau nilai kontraknya nol (belum disepakati), persentase apa pun
          adalah pembagian dengan nol. Nilainya 0, bukan angka besar yang
          terlihat masuk akal.
        */
        const tersalur = nilai > 0
          ? Math.min(100, angka(s.financial_pct) + angka(s.paid_pct))
          : 0;

        return {
          ...s,
          proyekNama: a.project?.name ?? "—",
          pelaksanaNama: a.mandor?.name ?? "—",
          nilai,
          kemajuan,
          tersalur,
          selisih: tersalur - kemajuan,
        };
      }));

    // Yang selisihnya paling besar lebih dulu — daftar kontrak yang diurut
    // alfabet menuntut pembacanya memeriksa seluruhnya untuk menemukan yang
    // bermasalah.
    return semua.sort((x, y) => y.selisih - x.selisih);
  }, [data]);

  const terlihat = useMemo(
    () => (hanyaMendahului ? kontrak.filter((k) => k.selisih >= AMBANG_SELISIH) : kontrak),
    [kontrak, hanyaMendahului]);

  const ringkas = useMemo(() => {
    const aktif = kontrak.filter((k) => k.status === "active");
    const nilaiTotal = kontrak.reduce((s, k) => s + k.nilai, 0);
    const uangKeluar = kontrak.reduce(
      (s, k) => s + angka(k.total_kasbon) + angka(k.total_progress_paid), 0);
    const mendahului = kontrak.filter((k) => k.selisih >= AMBANG_SELISIH).length;
    return { jumlah: kontrak.length, aktif: aktif.length, nilaiTotal, uangKeluar, mendahului };
  }, [kontrak]);

  const kolom: Array<Kolom<BarisKontrak>> = useMemo(() => [
    {
      kunci: "lingkup", judul: "Lingkup borongan", kepalaBaris: true,
      render: (k) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{k.scope_name}</span>
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>
            {k.pelaksanaNama}
            {k.payment_system && ` · ${k.payment_system}`}
          </span>
        </span>
      ),
    },
    {
      kunci: "proyek", judul: "Proyek",
      render: (k) => <span style={{ fontSize: 12, color: C.mid }}>{k.proyekNama}</span>,
    },
    {
      kunci: "nilai", judul: "Nilai kontrak", rata: "kanan",
      render: (k) => (
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: k.nilai > 0 ? C.text : C.muted }}>
          {k.nilai > 0 ? rupiah(k.nilai) : "belum disepakati"}
        </span>
      ),
    },
    {
      kunci: "banding", judul: "Fisik vs uang",
      render: (k) => <BatangBanding kemajuan={k.kemajuan} tersalur={k.tersalur} />,
    },
    {
      kunci: "selisih", judul: "Selisih", rata: "kanan",
      render: (k) => {
        const mendahului = k.selisih >= AMBANG_SELISIH;
        if (k.nilai === 0) return <span style={{ fontSize: 12, color: C.muted }}>—</span>;
        return (
          <span style={{
            fontWeight: mendahului ? 700 : 500, fontVariantNumeric: "tabular-nums",
            color: mendahului ? "var(--danger)" : C.mid, whiteSpace: "nowrap",
          }}>
            {/* Tanda + ditulis eksplisit: "12" dan "+12" terbaca berbeda saat
                yang dicari adalah arah selisihnya. */}
            {k.selisih > 0 ? "+" : ""}{persen(k.selisih)}
            {mendahului && (
              <span style={{ display: "block", fontSize: "var(--t-mikro)", fontWeight: 500 }}>uang mendahului</span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "keluar", judul: "Sudah keluar", rata: "kanan",
      render: (k) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(angka(k.total_kasbon) + angka(k.total_progress_paid))}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (k) => (
        <span style={{
          padding: "2px 8px", borderRadius: 20, fontSize: "var(--t-kecil)", fontWeight: 600, whiteSpace: "nowrap",
          color: k.status === "active" ? "var(--success)" : "var(--text-secondary)",
          background: k.status === "active" ? "var(--success-bg)" : "var(--surface-subtle)",
        }}>
          {k.status === "active" ? "Aktif" : k.status}
        </span>
      ),
    },
  ], []);

  return (
    <div style={{
      // Pembungkus BAKU halaman dashboard — 111 dari 143 halaman memakainya.
      // Tanpa ini isinya menempel ke tepi layar ("mepet") dan melebar tanpa
      // batas di monitor lebar, sementara halaman sebelahnya tidak — dan
      // ketaksamaan itu yang paling terasa saat berpindah menu.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: "var(--gap-bagian)",
    }}>
      <KepalaHalaman
        judul="Kontrak Subkontraktor"
        ikon={<FileSignature size={19} />}
        keterangan="Lingkup borongan yang diikat ke pihak ketiga — dan apakah uangnya mendahului pekerjaannya."
        aksi={
          <button
            type="button"
            onClick={() => { void muatUlang(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Muat ulang
          </button>
        }
      />

      {galatMuat && (
        <Galat pesan="Gagal memuat kontrak subkontraktor." onCobaLagi={() => { void muatUlang(); }} />
      )}

      {/* LAPIS 1 — KEADAAN (ARAH-VISUAL §5b) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--gap-grid)" }}>
        <Kpi
          label="Uang mendahului"
          nilai={ringkas.mendahului}
          keterangan={`selisih ≥ ${AMBANG_SELISIH} poin di atas kemajuan fisik`}
          warna={ringkas.mendahului > 0 ? "var(--danger)" : undefined}
        />
        <Kpi
          label="Borongan aktif"
          nilai={ringkas.aktif}
          keterangan={`dari ${ringkas.jumlah} lingkup tercatat`}
        />
        <Kpi
          label="Nilai terikat"
          nilai={rupiah(ringkas.nilaiTotal)}
          keterangan="total komitmen ke pihak ketiga"
        />
        <Kpi
          label="Sudah keluar"
          nilai={rupiah(ringkas.uangKeluar)}
          keterangan="kasbon + pembayaran prestasi"
        />
      </div>

      {/* LAPIS 3 — DETAIL */}
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)" }}>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          marginBottom: "var(--gap-grid)",
        }}>
          {/*
            `<Saklar>`, bukan `<input type="checkbox">` mentah — sasaran
            sentuhnya 44px (WCAG 2.5.5) dan keadaannya terbaca pembaca layar
            lewat `role="switch"`. Checkbox mentah di sini hanya ~13px.
          */}
          <Saklar
            nyala={hanyaMendahului}
            onUbah={setHanyaMendahului}
            label="Hanya yang uangnya mendahului"
          />
          <span style={{ fontSize: 12, color: C.muted }}>
            {terlihat.length} dari {kontrak.length} borongan
          </span>
        </div>

        {memuat ? (
          <Rangka tinggi={48} jumlah={5} />
        ) : terlihat.length === 0 ? (
          <Kosong
            ikon={hanyaMendahului ? <HandCoins size={22} /> : <FileSignature size={22} />}
            judul={hanyaMendahului ? "Tak ada borongan yang uangnya mendahului" : "Belum ada kontrak subkontraktor"}
            sebab={
              hanyaMendahului
                ? "Seluruh borongan menyalurkan uang seiring kemajuan fisiknya."
                : "Lingkup borongan dibuat saat mandor ditugaskan ke proyek, dari modul Mandor."
            }
          />
        ) : (
          <Tabel
            kolom={kolom}
            data={terlihat}
            kunciBaris={(k) => k.id}
            caption="Kontrak borongan subkontraktor, diurut menurut selisih uang terhadap kemajuan"
            tandaiBaris={(k) => (k.selisih >= AMBANG_SELISIH ? "var(--danger-bg)" : undefined)}
          />
        )}
      </div>

      <p style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
        <TriangleAlert size={13} aria-hidden="true" />
        Selisih dihitung dari kasbon + pembayaran prestasi terhadap nilai kontrak. Borongan tanpa nilai
        yang disepakati tak bisa dinilai dan ditampilkan &ldquo;—&rdquo;.
      </p>
    </div>
  );
}
