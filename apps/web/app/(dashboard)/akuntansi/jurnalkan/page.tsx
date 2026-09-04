"use client";

/**
 * JURNALKAN INVOICE — dari transaksi ke buku besar (R-012).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR YANG MENJAWAB "APA YANG BELUM MASUK PEMBUKUAN"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelum ini, invoice terbit dan buku besar tak tahu apa-apa. Yang
 * menjembataninya adalah pekerjaan manual — dan pekerjaan manual yang
 * berulang tiap invoice adalah tempat angka hilang tanpa ada yang tahu:
 * tak ada galat, tak ada baris merah, hanya laporan yang lebih kecil dari
 * kenyataan.
 *
 * ── Kenapa kolom "Status" punya TIGA keadaan, bukan dua
 *
 *   sudah dijurnalkan · bisa dijurnalkan · TIDAK bisa (peta akun kurang)
 *
 * Menggabungkan dua yang terakhir jadi "belum" akan menyembunyikan sebab.
 * Pengguna yang melihat tombol mati tanpa alasan akan menyimpulkan aplikasi
 * rusak; yang melihat "kurang: Retensi Ditahan" tahu apa yang harus dibuka.
 *
 * ── Kenapa jurnal yang dibuat berstatus draft, dan itu ditulis di layar
 *
 * Penjurnalan otomatis adalah tafsir, dan tafsir bisa salah. Draft berarti
 * belum masuk laporan mana pun. Kalau layar tak mengatakannya, orang akan
 * mengira pekerjaannya selesai di sini — lalu heran laporannya tak berubah.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk peta akun belum siap. Baris-barisnya sendiri
 * memakai lencana tenang: daftar yang seluruhnya berteriak tak menunjukkan
 * apa pun.
 */

import { useCallback, useMemo, useState } from "react";
import { BookUp, TriangleAlert, ExternalLink, Info } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, KartuAngka, type Kolom,
} from "@/components/dasar";

interface BarisInvoice {
  id: string;
  invoice_number: string;
  issued_date: string;
  base_amount: number | string | null;
  total_amount: number | string | null;
  status: string | null;
  projects: { id: string; name: string; tax_scheme: string | null } | null;
  jurnal: { id: string; entry_number: string; status: string } | null;
  bisa: boolean;
  alasan: string | null;
  kurang: string[];
}

interface Muatan {
  kesiapan: { siap: boolean | null; ditetapkan: string[]; kurang: string[] };
  invoice: BarisInvoice[];
}

const LABEL: Record<string, string> = {
  pendapatan_termin: "Pendapatan Termin",
  piutang_usaha: "Piutang Usaha",
  retensi_ditahan: "Retensi Ditahan",
  uang_muka_klien: "Uang Muka Klien",
  ppn_keluaran: "PPN Keluaran",
  pph_final: "Beban PPh Final",
  kas_bank: "Kas / Bank",
};

type Saring = "semua" | "belum" | "terhalang" | "sudah";

export default function JurnalkanPage() {
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kerja, setKerja] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("belum");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController. Yang didapat:
    dedup permintaan, cache lintas navigasi, dan langganan invalidasi — halaman
    ini menyegarkan diri saat data yang dipakainya dibuang di tempat lain.

    `makeAbortController` tak lagi perlu: `useData` sudah menjaga agar jawaban
    yang datang sesudah komponen mati tidak menyentuh state.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>("/api/v1/gl/jurnalkan/invoice");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI dipisah lalu digabung saat dipakai.
    Satu state untuk keduanya punya cacat halus yang sudah ditemukan
    DUA KALI di batch sebelumnya: gagal menyimpan MENGHAPUS pesan gagal
    memuat, dan pengguna mengira datanya sudah termuat.
  */
  const galat = galatAksi ?? (galatMuat ? "Gagal memuat daftar invoice" : null);


  const jurnalkan = useCallback(async (inv: BarisInvoice) => {
    setKerja(inv.id); setGalatAksi(null); setKabar(null);
    try {
      const r = await api.post<{ jurnal: { entry_number: string } }>(
        `/api/v1/gl/jurnalkan/invoice/${inv.id}`, {});
      setKabar(
        `${r.data.jurnal.entry_number} dibuat sebagai draft. Angkanya belum `
        + `masuk laporan sampai Anda memeriksanya dan memostingnya.`);
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menjurnalkan invoice");
    } finally { setKerja(null); }
  }, [muat]);

  const semua = useMemo(() => data?.invoice ?? [], [data]);

  const hitung = useMemo(() => ({
    sudah: semua.filter((i) => i.jurnal).length,
    belum: semua.filter((i) => !i.jurnal && i.bisa).length,
    terhalang: semua.filter((i) => !i.jurnal && !i.bisa).length,
  }), [semua]);

  const tampil = useMemo(() => semua.filter((i) => {
    if (saring === "sudah") return !!i.jurnal;
    if (saring === "belum") return !i.jurnal && i.bisa;
    if (saring === "terhalang") return !i.jurnal && !i.bisa;
    return true;
  }), [semua, saring]);

  const kolom: Array<Kolom<BarisInvoice>> = [
    {
      kunci: "invoice", judul: "Invoice", kepalaBaris: true,
      render: (i) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 13, color: C.text }}>{i.invoice_number}</strong>
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.mid, marginTop: 1 }}>
            {i.projects?.name ?? "—"}
          </span>
        </span>
      ),
    },
    {
      kunci: "tanggal", judul: "Tanggal terbit",
      render: (i) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>
          {formatTanggal(i.issued_date)}
        </span>
      ),
    },
    {
      kunci: "nilai", judul: "Nilai tagihan", rata: "kanan",
      render: (i) => (
        <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>
          {formatRupiah(i.total_amount)}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Pembukuan",
      render: (i) => {
        if (i.jurnal) {
          return (
            <span style={{ display: "block" }}>
              <Lencana nada={i.jurnal.status === "posted" ? "sukses" : "netral"}>
                {i.jurnal.status === "posted" ? "Sudah diposting" : "Draft"}
              </Lencana>
              <Link
                href={`/akuntansi?jurnal=${i.jurnal.id}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: "var(--t-kecil)", color: "var(--aksen)", marginTop: 3,
                  textDecoration: "underline",
                }}
              >
                {i.jurnal.entry_number}
                <ExternalLink size={10} aria-hidden="true" />
              </Link>
            </span>
          );
        }
        if (!i.bisa) {
          return (
            <span style={{ display: "block" }}>
              <Lencana nada="peringatan">Terhalang</Lencana>
              <span style={{
                display: "block", fontSize: "var(--t-kecil)", color: C.mid,
                marginTop: 3, maxWidth: "38ch", lineHeight: 1.45,
              }}>
                {/* Sebab disebut, bukan hanya tombol yang mati. Tombol mati
                    tanpa alasan dibaca sebagai aplikasi rusak. */}
                Peta akun kurang:{" "}
                {i.kurang.length
                  ? i.kurang.map((k) => LABEL[k] ?? k).join(", ")
                  : (i.alasan ?? "belum diketahui")}
              </span>
            </span>
          );
        }
        return <Lencana nada="netral">Belum dijurnalkan</Lencana>;
      },
    },
    {
      kunci: "aksi", judul: "",
      // SEKUNDER, bukan utama — meski inilah aksi halaman ini.
      //
      // Versi pertama memakai `jenis="utama"`, dan tangkapan layar
      // menunjukkan 26 tombol navy sederajat menuruni layar. Aturan "satu
      // aksen per layar" (§3d) bukan soal selera di sini: 26 penekanan yang
      // sama kuat menghapus arti penekanan, dan mata tak lagi bisa memakai
      // warna untuk menemukan apa pun.
      render: (i) => (
        i.jurnal
          ? <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>—</span>
          : (
            <Tombol
              kecil jenis="sekunder"
              disabled={!i.bisa || kerja === i.id}
              onClick={() => void jurnalkan(i)}
            >
              {kerja === i.id ? "Menjurnalkan…" : "Jurnalkan"}
            </Tombol>
          )
      ),
    },
  ];

  const k = data?.kesiapan;

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<BookUp size={18} />}
        judul="Jurnalkan Invoice"
        keterangan={
          <>Invoice yang sudah terbit tetapi belum masuk buku besar. Jurnal yang
          dibuat di sini berstatus <strong>draft</strong> — angkanya belum masuk
          laporan mana pun sampai diperiksa dan diposting.</>
        }
        aksi={
          <Tombol jenis="sekunder" href="/akuntansi/peta-akun">
            Peta akun jurnal
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {kabar && (
        <div role="status" style={{
          padding: "11px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          border: "1px solid var(--success-border)", background: "var(--success-bg)",
          color: "var(--success)",
        }}>{kabar}</div>
      )}

      {/* ── SATU aksen: peta akun belum siap (§3d) ────────────────────────── */}
      {k && k.siap !== true && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TriangleAlert size={15} aria-hidden="true" />
            Peta akun belum lengkap — penjurnalan tidak bisa dijalankan
          </strong>
          <span style={{ display: "block", fontSize: 12.5 }}>
            Belum ditetapkan: {k.kurang.map((x) => LABEL[x] ?? x).join(", ") || "—"}.{" "}
            <Link href="/akuntansi/peta-akun" style={{
              color: "inherit", fontWeight: 700, textDecoration: "underline",
            }}>Buka peta akun jurnal</Link> untuk menetapkannya.
          </span>
        </div>
      )}

      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      }}>
        <KartuAngka label="Belum dijurnalkan" nilai={String(hitung.belum)}
          sub="siap diproses" />
        <KartuAngka label="Terhalang peta akun" nilai={String(hitung.terhalang)}
          sub="butuh pemetaan dulu" />
        <KartuAngka label="Sudah masuk buku besar" nilai={String(hitung.sudah)}
          sub="draft maupun posted" />
      </div>

      {memuat ? (
        <Rangka tinggi={64} jumlah={5} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub="300 invoice terbaru"
            aksi={
              <div role="group" aria-label="Saring daftar invoice"
                style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  ["belum", `Belum (${hitung.belum})`],
                  ["terhalang", `Terhalang (${hitung.terhalang})`],
                  ["sudah", `Sudah (${hitung.sudah})`],
                  ["semua", `Semua (${semua.length})`],
                ] as Array<[Saring, string]>).map(([nilai, teks]) => (
                  <button
                    key={nilai} type="button"
                    aria-pressed={saring === nilai}
                    onClick={() => setSaring(nilai)}
                    style={{
                      padding: "4px 10px", borderRadius: 999, fontSize: "var(--t-kecil)",
                      fontWeight: 600, cursor: "pointer",
                      // `--aksen`/`--on-aksen`, BUKAN `--navy` + `#fff`.
                      //
                      // `--navy` bernilai sama di kedua mode; menaruh teks
                      // putih di atasnya lolos di mode terang lalu GAGAL
                      // kontras di mode gelap — ditangkap axe, bukan oleh
                      // mata saya. Pasangan aksen sudah punya nilai untuk
                      // masing-masing mode, termasuk teks di atasnya.
                      border: `1px solid ${saring === nilai ? "var(--aksen)" : C.border}`,
                      background: saring === nilai ? "var(--aksen)" : "transparent",
                      color: saring === nilai ? "var(--on-aksen)" : C.mid,
                    }}
                  >{teks}</button>
                ))}
              </div>
            }
          >
            Invoice
          </JudulKartu>
          <Tabel
              berpermukaan            kolom={kolom}
            data={tampil}
            kunciBaris={(i) => i.id}
            caption="Daftar invoice beserta status pembukuannya di buku besar"
            // `tandaiBaris` mengembalikan WARNA, bukan nama nada — nilai
            // "peringatan" akan diam-diam jadi latar tak sah dan barisnya
            // terlihat biasa saja.
            tandaiBaris={(i) => (!i.jurnal && !i.bisa ? C.yellowBg : undefined)}
            kosong={
              <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0 }}>
                {saring === "belum"
                  ? "Tidak ada invoice yang menunggu dijurnalkan — semua yang bisa sudah masuk buku besar."
                  : saring === "terhalang"
                    ? "Tidak ada invoice yang terhalang peta akun."
                    : saring === "sudah"
                      ? "Belum ada invoice yang dijurnalkan."
                      : "Belum ada invoice."}
              </p>
            }
          />
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Satu invoice hanya bisa dijurnalkan sekali — dijaga basis, bukan oleh
          layar ini. Jurnal ganda tetap seimbang debit-kreditnya, jadi tak ada
          invariant pembukuan yang menangkapnya; yang menangkapnya hanya
          penjaga rujukan tunggal.
        </span>
      </p>
    </Halaman>
  );
}
