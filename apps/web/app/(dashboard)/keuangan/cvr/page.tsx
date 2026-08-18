"use client";

/**
 * CVR — Cost Value Reconciliation per scope borongan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN, BUKAN TAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §6a: *tab = sudut pandang berbeda atas data yang
 * sama; halaman = entitas berbeda*. Ujinya: "kalau saya kirim tautan ini ke
 * rekan, apa yang ia lihat?"
 *
 * CVR menjawab **"pekerjaan mana yang merugi"** — pertanyaan yang dikirim ke
 * orang lain ("lihat scope struktur Dago"), bukan sudut lain atas estimasi.
 * Jadi halaman, bersaudara dengan `/keuangan/profitabilitas`.
 *
 * ── Yang dijawab halaman ini
 *
 * "Pekerjaan mana yang biayanya sudah melampaui nilai yang terpasang?"
 *
 * Diukur pada data nyata 2026-08-08: "Renovasi Total" 70% selesai, nilai
 * terpasang Rp 98 juta, upah terpakai Rp 102 juta — **rugi Rp 4 juta**, dan
 * itu tenggelam di total proyek yang masih untung.
 *
 * ── Kenapa yang RUGI di atas
 *
 * Itu satu-satunya baris yang menuntut tindakan selagi pekerjaan berjalan.
 * Daftar yang mengurutkannya di bawah membuatnya tak pernah dibaca.
 *
 * ── Kenapa cakupannya dinyatakan besar-besar
 *
 * CVR ini **hanya upah borongan**. Material dan faktur supplier belum bisa
 * dipecah per pekerjaan (`work_scopes.rab_category_id` 0 dari 20). Pembaca
 * yang mengira ini mencakup seluruh biaya akan salah menyimpulkan, dan
 * salahnya di angka untung-rugi — tempat kesalahan paling mahal.
 */

import { useCallback, useState } from "react";
import { Scale, TriangleAlert, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type Keadaan = "untung" | "rugi" | "impas" | "tanpa_biaya" | "belum_mulai" | "tak_berlaku";

interface BarisCvr {
  scope_id: string;
  scope_name: string;
  /** Kategori RAB scope ini; `null` = biayanya belum bisa dipecah per pekerjaan. */
  rab_category_id: string | null;
  borongan: number;
  progress_pct: number;
  nilai_terpasang: number;
  terpakai: number;
  selisih: number;
  margin_pct: number | null;
  keadaan: Keadaan;
  jumlah_laporan: number;
}

interface HasilCvr {
  baris: BarisCvr[];
  total_nilai_terpasang: number;
  total_terpakai: number;
  total_selisih: number;
  /** Biaya scope HARIAN — tak bisa diadu dengan nilai terpasang. */
  terpakai_harian: number;
  jumlah_rugi: number;
  jumlah_tanpa_biaya: number;
  jumlah_tak_berlaku: number;
  /**
   * CAKUPAN KEDUA — biaya proyek yang TAK BISA dipecah per scope.
   *
   * Tak pernah dijumlahkan ke `total_terpakai`: nilai terpasang yang diadu
   * hanya nilai borongan UPAH, jadi mengadu biaya material dengannya
   * menghasilkan "rugi" yang cuma kesalahan aritmetika.
   *
   * Diukur 2026-08-19 — tiga proyek punya puluhan juta biaya `approved` dan
   * NOL upah borongan. Sebelum kartu ini ada, ketiganya tampil di layar ini
   * seolah tak punya biaya sama sekali.
   */
  biaya_luar_scope: {
    total: number;
    jumlah: number;
    per_kategori: { kategori: string; total: number; jumlah: number }[];
  };
  meta: { cakupan: string; keterbatasan?: string; jumlah_scope: number };
}

interface Proyek { id: string; name: string }

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);

/**
 * Arti tiap keadaan, dalam kalimat yang bisa ditampilkan apa adanya.
 *
 * Enam keadaan, bukan dua. `tanpa_biaya` dan `tak_berlaku` menuntut tindakan
 * yang sama sekali berbeda dari "untung", dan menyamakannya menyembunyikan
 * keduanya — yang pertama justru tanda bahaya.
 */
const ARTI: Record<Keadaan, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  rugi: {
    label: "Rugi", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Biaya sudah melampaui nilai yang terpasang. Sisa pekerjaannya dikerjakan dari kantong sendiri.",
  },
  tanpa_biaya: {
    label: "Tanpa biaya", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Pekerjaan berjalan tapi NOL upah tercatat. Selisihnya besar dan positif — dan itu justru mencurigakan: biayanya ada di suatu tempat yang tak terlihat laporan ini.",
  },
  impas: {
    label: "Impas", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Biaya persis sama dengan nilai terpasang. Pada pekerjaan yang belum selesai ini BUKAN kabar baik: sisanya dikerjakan tanpa cadangan sama sekali.",
  },
  untung: {
    label: "Untung", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Nilai terpasang masih di atas biaya.",
  },
  belum_mulai: {
    label: "Belum mulai", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Progres nol dan belum ada biaya.",
  },
  tak_berlaku: {
    label: "Harian", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Scope harian tanpa nilai borongan — nilai terpasangnya tak bisa diturunkan dari progres, jadi CVR tak berlaku.",
  },
};

interface KategoriRab { id: string; name: string }

/**
 * Kolom CVR.
 *
 * Fungsi, bukan konstanta, sejak kolom Kategori ditambahkan: ia memerlukan
 * daftar kategori dan penyimpannya. Tetap di LUAR komponen supaya definisinya
 * tak dibangun ulang tiap render.
 */
function kolomCvr(
  kategori: KategoriRab[],
  simpanKategori: (scopeId: string, kategoriId: string) => void,
  menyimpan: string | null,
): Array<Kolom<BarisCvr>> {
  return [
  {
    kunci: "scope", judul: "Pekerjaan", kepalaBaris: true,
    render: (b) => (
      <span style={{
        display: "block", paddingLeft: 9,
        borderLeft: b.keadaan === "rugi" || b.keadaan === "tanpa_biaya"
          ? `3px solid ${ARTI[b.keadaan].warna}`
          : "3px solid transparent",
      }}>
        {b.scope_name}
        <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2 }}>
          progres {b.progress_pct}%
          {b.jumlah_laporan > 0 && ` · ${b.jumlah_laporan} laporan upah`}
        </span>
      </span>
    ),
  },
  {
    kunci: "borongan", judul: "Nilai borongan", rata: "kanan",
    render: (b) => <span style={{ color: C.mid }}>{b.borongan > 0 ? rp(b.borongan) : "—"}</span>,
  },
  {
    kunci: "terpasang", judul: "Nilai terpasang", rata: "kanan",
    render: (b) => (
      <>
        {b.borongan > 0 ? rp(b.nilai_terpasang) : "—"}
        {b.borongan > 0 && (
          <span style={{ display: "block", fontSize: 10, color: C.muted }}>
            {b.progress_pct}% dari borongan
          </span>
        )}
      </>
    ),
  },
  {
    kunci: "terpakai", judul: "Biaya terpakai", rata: "kanan",
    render: (b) => <span>{rp(b.terpakai)}</span>,
  },
  {
    kunci: "selisih", judul: "Selisih", rata: "kanan",
    // NEGATIF dipertahankan dan diberi warna bahaya. Meratakannya ke nol
    // menghapus satu-satunya sinyal yang bisa ditindaklanjuti.
    render: (b) => (
      <span style={{ fontWeight: 700, color: b.selisih < 0 ? "var(--danger)" : C.text }}>
        {b.borongan > 0 ? rp(b.selisih) : "—"}
        {b.margin_pct !== null && (
          <span style={{
            display: "block", fontSize: 10, fontWeight: 600,
            color: b.margin_pct < 0 ? "var(--danger)" : C.muted,
          }}>
            {b.margin_pct.toFixed(1)}%
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "keadaan", judul: "Keadaan",
    render: (b) => {
      const m = ARTI[b.keadaan];
      // Keadaan sebagai KATA, bukan hanya warna — yang tak bisa membedakan
      // warna, dan pembaca layar, sama-sama butuh teksnya.
      return (
        <span title={m.arti} style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 20,
          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          color: m.warna, background: m.bg, border: `1px solid ${m.border}`,
        }}>{m.label}</span>
      );
    },
  },
  {
    kunci: "kategori", judul: "Kategori RAB",
    // ── Kenapa kolom ini ADA, dan bisa disunting di sini ──────────────────
    //
    // Diukur 2026-08-13: `work_scopes.rab_category_id` terisi 0 dari 20, dan
    // kolomnya bahkan tak ada di daftar yang boleh di-PATCH — jadi dua puluh
    // lingkup kerja tak punya satu pun jalan untuk diberi kategori.
    //
    // Itulah yang membatasi CVR ke upah borongan saja. Batas cakupan yang
    // sudah dinyatakan di atas halaman ini BUKAN sifat modul; ia keadaan data
    // yang bisa diperbaiki dari baris ini juga, tanpa berpindah layar.
    render: (b) => {
      const sedang = menyimpan === b.scope_id;
      return (
        <select
          aria-label={`Kategori RAB untuk ${b.scope_name}`}
          value={b.rab_category_id ?? ""}
          disabled={sedang || kategori.length === 0}
          onChange={(e) => e.target.value && simpanKategori(b.scope_id, e.target.value)}
          style={{
            padding: "4px 8px", borderRadius: 5, fontSize: 12, maxWidth: 200,
            border: `1px solid ${b.rab_category_id ? C.border : "var(--warning-border)"}`,
            background: b.rab_category_id ? "var(--surface)" : "var(--warning-bg)",
            color: C.text, opacity: sedang ? 0.5 : 1,
          }}
        >
          <option value="">{kategori.length === 0 ? "— tak ada kategori RAB —" : "— belum dipilih —"}</option>
          {kategori.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      );
    },
  },
  ];
}

/**
 * CAKUPAN KEDUA — "berapa besar yang TIDAK ikut dihitung".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KARTU INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Layar ini selalu jujur soal apa yang IA HITUNG (spanduk cakupan di atas),
 * tetapi tak pernah menyebut **berapa besar yang di luar jangkauannya** — dan
 * angka yang tak disebut dibaca sebagai nol.
 *
 * Diukur 2026-08-19, biaya `approved` pada proyek yang punya work_scope:
 *
 *   Pak Andi — Buah Batu    upah 126,6 jt   di luar hitungan  88,3 jt
 *   Dapur & KM Pak Hendra   upah      0     di luar hitungan  80,3 jt
 *   Gudang — Gedebage       upah      0     di luar hitungan  48,7 jt
 *   Bu Sari — Dago          upah      0     di luar hitungan  46,2 jt
 *
 * Tiga proyek terakhir tampil di layar ini seolah tak punya biaya sama
 * sekali. Cacatnya bukan angka yang kurang lengkap — melainkan angka yang
 * TERLIHAT lengkap.
 *
 * ── Kenapa BUKAN spanduk peringatan
 *
 * `ARAH-VISUAL-2026.md` §10g membuang spanduk dan menggantinya dengan kartu,
 * dengan alasan yang berlaku persis di sini: *"saat semuanya menonjol, tak
 * ada yang menonjol"*. Lagi pula ini bukan peringatan — ini ANGKA, dan angka
 * tempatnya di kartu bersama angka lain.
 *
 * Warnanya sengaja NETRAL, bukan merah. Biaya di luar hitungan bukan kabar
 * buruk; ia keterangan cakupan. Memerahkannya membuat pembaca mengira
 * proyeknya rugi, padahal yang dinyatakan justru bahwa untung-ruginya belum
 * bisa dihitung sampai ke sana.
 */
function BiayaLuar({ data }: { data: HasilCvr["biaya_luar_scope"] }) {
  // Nol rupiah TIDAK disembunyikan kalau barisnya ada — "Rp 0 dari 3 catatan"
  // adalah keterangan; yang disembunyikan hanya keadaan benar-benar kosong,
  // karena kartu nol-dari-nol cuma menambah bacaan tanpa menambah tahu.
  if (data.jumlah === 0) return null;

  return (
    <div
      className="rise rise-3"
      style={{ ...GAYA_KARTU, padding: "14px 16px", marginTop: 16 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{
          fontSize: 11, fontWeight: 700, color: C.muted, margin: 0,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          Biaya di luar hitungan
        </h2>
        <strong style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, lineHeight: 1.1, color: C.text }}>
          {rp(data.total)}
        </strong>
        <span style={{ fontSize: 11.5, color: C.muted }}>
          {data.jumlah} catatan belanja
        </span>
      </div>

      <p style={{ fontSize: 12, color: C.mid, margin: "8px 0 0", lineHeight: 1.55 }}>
        Biaya proyek yang <strong>tidak</strong> bisa dipecah per pekerjaan, jadi tak
        ikut ke angka untung-rugi di atas. Menjumlahkannya ke sana berarti mengadu
        biaya material dengan nilai upah — dan selisihnya bukan rugi, melainkan salah
        hitung.
      </p>

      {data.per_kategori.length > 0 && (
        <ul style={{
          listStyle: "none", margin: "10px 0 0", padding: 0,
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6,
        }}>
          {data.per_kategori.map((k) => (
            <li key={k.kategori} style={{
              display: "flex", justifyContent: "space-between", gap: 10,
              fontSize: 12.5, color: C.text,
              padding: "5px 0", borderTop: `1px solid ${C.border}`,
            }}>
              <span style={{ color: C.mid }}>{k.kategori}</span>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{rp(k.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CvrPage() {
  const [projectId, setProjectId] = useState("");

  // ── Kategori RAB: dimuat per proyek, disimpan per baris ─────────────────
  const [menyimpan, setMenyimpan] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga permintaan lama (daftar proyek, cvr per proyek, kategori RAB per
    proyek) jadi tiga `useData`. Dua yang terakhir memakai URL DINAMIS
    bergantung `projectId` — dibungkus `null` selama proyek belum dipilih,
    jadi tak ada permintaan terkirim untuk proyek kosong (menggantikan
    `if (!pid) { setHasil(null); return; }` lama).
  */
  const { data: dataProyek, galat: galatMuatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const { data: hasil, memuat, galat: galatMuatHasil, muatUlang: muatUlangHasil } =
    useData<HasilCvr>(projectId ? `/api/v1/projects/${projectId}/cvr` : null);

  const { data: dataRab } = useData<{ data?: Array<{ id: string; name: string; level: string }> }>(
    projectId ? `/api/v1/projects/${projectId}/rab` : null,
  );
  // Kunci balasannya `data`, bukan `items` — diperiksa ke `rab.ts:441`, bukan
  // ditebak dari nama yang terdengar wajar.
  const kategori: KategoriRab[] = (dataRab?.data ?? [])
    .filter((i) => i.level === "category")
    .map((i) => ({ id: i.id, name: i.name }));

  const muat = useCallback(async () => { await muatUlangHasil(); }, [muatUlangHasil]);

  /*
    Galat MUAT dan galat AKSI (simpan kategori) sengaja dipisah — satu state
    untuk keduanya membuat gagal menyimpan menghapus pesan gagal memuat.
    Ditemukan berpola di halaman lain F4-2.
  */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const galat = galatAksi ?? (
    (galatMuatProyek || (projectId && galatMuatHasil)) ? "Gagal memuat rekonsiliasi biaya" : null
  );

  /**
   * Memasang kategori RAB pada sebuah scope.
   *
   * Sesudah tersimpan, seluruh CVR dimuat ulang — bukan hanya barisnya.
   * Kategori mengubah cara biaya dikelompokkan, jadi angka baris LAIN pun
   * bisa berubah; memperbarui satu baris saja akan menampilkan campuran dua
   * keadaan yang tak pernah ada bersamaan.
   */
  const simpanKategori = useCallback(async (scopeId: string, kategoriId: string) => {
    setMenyimpan(scopeId); setGalatAksi(null);
    try {
      await api.patch(`/api/v1/mandor/work-scopes/${scopeId}`, { rab_category_id: kategoriId });
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menyimpan kategori RAB");
    } finally {
      setMenyimpan(null);
    }
  }, [muat]);


  return (
    <div>
      <p style={{ fontSize: 13, color: C.mid, margin: "0 0 18px", maxWidth: "70ch", lineHeight: 1.55 }}>
        Biaya yang sudah keluar diadu dengan <strong>nilai yang sudah terpasang</strong> —
        bagian pekerjaan yang benar-benar jadi hak, bukan nilai kontrak penuh.
        Selisih negatif berarti pekerjaan itu sedang merugi <em>sekarang</em>,
        selagi masih bisa ditangani.
      </p>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          {galat}
        </div>
      )}

      <div className="rise" style={{ ...GAYA_KARTU, padding: "12px 16px", marginBottom: 16, maxWidth: 420 }}>
        <label htmlFor="cvr-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <select
          id="cvr-proyek" value={projectId} onChange={(e) => setProjectId(e.target.value)}
          style={{
            padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
          }}
        >
          <option value="">— pilih proyek —</option>
          {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!projectId ? (
        <Kosong
          ikon={<Scale size={28} />}
          judul="Pilih proyek dulu"
          sebab="Rekonsiliasi dihitung per proyek — tiap scope borongannya diadu dengan upah yang sudah terbayar."
        />
      ) : memuat ? (
        <div style={{ ...GAYA_KARTU, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : hasil ? (
        <>
          {/* Cakupan dinyatakan SEBELUM angkanya, bukan sesudah.
              Pembaca yang mengira ini seluruh biaya proyek akan salah
              menyimpulkan, dan salahnya di angka untung-rugi. */}
          <div className="rise rise-2" style={{
            display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
            background: "var(--info-bg)", border: "1px solid var(--info-border)",
            borderRadius: 8, fontSize: 12.5, color: "var(--info)",
            marginBottom: 14, lineHeight: 1.55,
          }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <span>
              Cakupan: <strong>{hasil.meta.cakupan}</strong>.
              {hasil.meta.keterbatasan && <> {hasil.meta.keterbatasan}</>}
            </span>
          </div>

          {hasil.baris.length === 0 ? (
            <>
              <Kosong
                ikon={<Scale size={28} />}
                judul="Belum ada scope borongan di proyek ini"
                sebab="Rekonsiliasi ini membandingkan nilai borongan dengan upah terbayar. Proyek yang seluruh mandornya bersistem harian belum bisa dinilai begini."
              />
              {/* Kartu biaya-di-luar tetap tampil di sini, dan justru DI SINI
                  ia paling menentukan.

                  Diukur 2026-08-19: tiga proyek punya biaya `approved`
                  puluhan juta (Rp 80,3 jt · Rp 48,7 jt · Rp 46,2 jt) dengan
                  NOL upah borongan. Sebelum ini, layarnya cuma berbunyi
                  "belum ada scope" — dan pembaca menyimpulkan belum ada
                  apa-apa, padahal uangnya sudah keluar. */}
              <BiayaLuar data={hasil.biaya_luar_scope} />
            </>
          ) : (
            <>
              {/* Yang menuntut tindakan lebih dulu — bukan total yang menenangkan. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8, marginBottom: 16 }}>
                <div style={{ ...GAYA_KARTU, padding: "12px 14px",
                  borderColor: hasil.jumlah_rugi > 0 ? "var(--danger-border)" : C.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em", display: "flex",
                    alignItems: "center", gap: 5 }}>
                    {hasil.jumlah_rugi > 0 && (
                      <TriangleAlert size={12} style={{ color: "var(--danger)" }} aria-hidden="true" />
                    )}
                    Pekerjaan merugi
                  </div>
                  <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
                    color: hasil.jumlah_rugi > 0 ? "var(--danger)" : C.text }}>
                    {hasil.jumlah_rugi}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    dari {hasil.meta.jumlah_scope} scope
                  </div>
                </div>

                <div style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>Nilai terpasang</div>
                  <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text }}>
                    {rp(hasil.total_nilai_terpasang)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    bagian yang sudah jadi hak
                  </div>
                </div>

                <div style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>Biaya terpakai</div>
                  <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text }}>
                    {rp(hasil.total_terpakai)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {/* Biaya harian DINYATAKAN, bukan dibuang diam-diam.
                        Tanpa ini, total biaya di layar ini berbeda dari
                        `/estimasi` untuk proyek yang sama, dan tak ada yang
                        bisa menjelaskan selisihnya. */}
                    upah borongan terbayar
                    {hasil.terpakai_harian > 0 && (
                      <> · <strong>{rp(hasil.terpakai_harian)}</strong> lagi di scope harian,
                      di luar hitungan ini</>
                    )}
                  </div>
                </div>

                <div style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>Selisih</div>
                  <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
                    color: hasil.total_selisih < 0 ? "var(--danger)" : C.text }}>
                    {rp(hasil.total_selisih)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {/* Kalimat ini pernah BERBOHONG.
                    
                        Terlihat 2026-08-08: layar menampilkan "Selisih
                        −Rp 2.600.100" berwarna merah di sebelah keterangan
                        "seluruh pekerjaan di atas biayanya" — dua pernyataan
                        yang saling membantah.
                        
                        Sebabnya total mencampur scope harian (Rp 46,6 juta
                        biaya tanpa nilai terpasang) ke dalam selisih. Sudah
                        diperbaiki di `lib/cvr.ts`; kalimatnya pun kini
                        diturunkan dari ANGKANYA, bukan dari `jumlah_rugi`
                        saja. */}
                    {hasil.jumlah_rugi > 0
                      ? `${hasil.jumlah_rugi} pekerjaan merugi`
                      : hasil.total_selisih < 0
                        ? "total di bawah biaya meski tak ada satu pun pekerjaan merugi"
                        : "seluruh pekerjaan borongan di atas biayanya"}
                  </div>
                </div>
              </div>

              {hasil.jumlah_tanpa_biaya > 0 && (
                <div role="status" style={{
                  display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
                  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                  borderRadius: 8, fontSize: 12.5, color: "var(--warning-teks)",
                  marginBottom: 14, lineHeight: 1.55,
                }}>
                  <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  <span>
                    <strong>{hasil.jumlah_tanpa_biaya} pekerjaan berjalan tanpa satu pun upah tercatat.</strong>{" "}
                    Selisihnya terlihat besar dan positif — dan itu justru yang mencurigakan:
                    biayanya ada di suatu tempat yang tak terbaca laporan ini.
                  </span>
                </div>
              )}

              <div className="rise rise-3" style={{ ...GAYA_KARTU, overflow: "hidden" }}>
                <Tabel<BarisCvr>
                  caption="Rekonsiliasi biaya per scope borongan: nilai borongan, nilai terpasang, biaya terpakai, dan selisihnya."
                  data={hasil.baris}
                  kunciBaris={(b) => b.scope_id}
                  kolom={kolomCvr(kategori, simpanKategori, menyimpan)}
                />
                <p style={{ margin: 0, padding: "10px 14px", fontSize: 11.5, color: C.mid,
                  borderTop: `1px solid ${C.border}`, lineHeight: 1.55 }}>
                  Nilai terpasang = nilai borongan × progres. Membandingkan biaya
                  sampai hari ini dengan nilai kontrak PENUH membuat setiap pekerjaan
                  terlihat untung besar sampai hampir selesai — lalu tiba-tiba rugi
                  di akhir, saat sudah terlambat berbuat apa pun.
                  {hasil.jumlah_tak_berlaku > 0 && (
                    <> {hasil.jumlah_tak_berlaku} scope harian ditampilkan tanpa
                    perhitungan: nilai terpasangnya tak bisa diturunkan dari progres.</>
                  )}
                </p>
              </div>

              {/* SESUDAH tabel, bukan sebelum: ia keterangan cakupan, bukan
                  temuan. Menaruhnya di atas membuat pembaca menghitungnya
                  bersama angka margin — persis yang kartunya bilang jangan. */}
              <BiayaLuar data={hasil.biaya_luar_scope} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
