"use client";

/**
 * PETA AKUN JURNAL — penjurnalan otomatis yang bisa dikonfigurasi (R-012).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HALAMAN YANG MENENTUKAN BENTUK SELURUH LAPORAN KEUANGAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang ditetapkan di sini menentukan ke akun mana tiap transaksi jatuh — dan
 * karena itu menentukan angka di neraca, laba rugi, dan SPT. Peta yang salah
 * menghasilkan laporan yang **salah dengan meyakinkan**: tak ada yang
 * membantah sampai auditor datang, dan saat itu jurnalnya sudah ribuan.
 *
 * Karena itu halaman ini:
 *
 *   · MENYATAKAN apa yang belum ditetapkan, bukan diam-diam memakai bawaan
 *   · menyebut ALASAN tiap pilihan (dasar PSAK-nya), bukan hanya nama akun
 *   · menolak akun yang tak aktif — jurnal ke akun mati tak terbaca laporan
 *
 * ── Kenapa usulan ditampilkan tetapi TIDAK diterapkan sendiri
 *
 * Tiap baris punya usulan beserta dasarnya (R-012). Usulan itu ditawarkan,
 * bukan diisi otomatis — founder tetap menekan simpan. Bawaan yang terisi
 * sendiri adalah bentuk paling berbahaya dari menebak: ia tak pernah
 * ditanyakan siapa pun karena hasilnya terlihat wajar.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk "belum ditetapkan". Begitu petanya lengkap,
 * halaman ini menjadi tenang — dan memang seharusnya: peta akun yang sudah
 * benar tak perlu menarik perhatian tiap kali dibuka.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, TriangleAlert, CircleCheck, Info } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, gayaInput, type Kolom,
} from "@/components/dasar";

type JenisPeta =
  | "pendapatan_termin" | "piutang_usaha" | "retensi_ditahan"
  | "uang_muka_klien" | "ppn_keluaran" | "pph_final" | "kas_bank";

interface Akun { id: string; code: string; name: string; type: string }

interface BarisPeta {
  id: string;
  jenis: JenisPeta;
  account_id: string;
  catatan: string | null;
  akun: Akun | null;
}

interface Muatan {
  peta: BarisPeta[];
  akun: Akun[];
  kesiapan: { siap: boolean | null; ditetapkan: JenisPeta[]; kurang: JenisPeta[] };
  label: Record<JenisPeta, string>;
  minimum: JenisPeta[];
}

/**
 * Usulan beserta DASARNYA (RATIFIKASI R-012).
 *
 * Alasan ditulis di sini, bukan di dokumen terpisah: yang menetapkan peta
 * akun sedang menatap layar ini, bukan sedang membaca RATIFIKASI.md.
 *
 * ── Kenapa dipecah `ringkas` / `rinci`
 *
 * Versi pertama menaruh seluruh dasar PSAK sebagai paragraf di tiap baris,
 * dan tabelnya berubah jadi dinding teks — saya melihatnya sendiri di
 * tangkapan layar. Dasar hukum perlu dibaca SEKALI saat memutuskan, lalu
 * tak pernah lagi; menaruhnya permanen membuat tujuh baris yang seharusnya
 * bisa dipindai jadi tujuh paragraf yang harus dibaca.
 *
 * `ringkas` menjawab "ini apa" (selalu terlihat), `rinci` menjawab "kenapa
 * akun ini dan bukan yang lain" (dibuka saat dibutuhkan).
 */
const USUL: Record<JenisPeta, { kode: string; ringkas: string; rinci: string }> = {
  pendapatan_termin: {
    kode: "4120",
    ringkas: "Pendapatan diakui saat invoice terbit — akrual, PSAK 72.",
    rinci: "Dasar yang sama dipakai laporan WIP yang sudah berjalan. Memilih basis kas membuat dua laporan bercerita berbeda tentang bulan yang sama.",
  },
  piutang_usaha: {
    kode: "1121",
    ringkas: "Hak tagih dari invoice; berkurang saat pembayaran diterima.",
    rinci: "Selisih antara nilai tagihan dan komponen lain (retensi, pajak, potongan uang muka) jatuh ke sini, sehingga jurnalnya selalu seimbang.",
  },
  retensi_ditahan: {
    kode: "1124",
    ringkas: "Retensi adalah ASET, bukan pengurang pendapatan.",
    rinci: "Pekerjaannya sudah selesai dan pendapatannya diakui penuh; yang belum adalah haknya menagih sampai masa pemeliharaan berakhir. Memakai akun pendapatan (4130) membuat laba periode ini turun padahal pekerjaannya selesai.",
  },
  uang_muka_klien: {
    kode: "2150",
    ringkas: "Uang muka adalah LIABILITAS kontrak, bukan pendapatan.",
    rinci: "PSAK 72: uang yang diterima sebelum pekerjaan dilakukan belum menjadi pendapatan. Mencatatnya langsung sebagai pendapatan membuat laba melonjak di bulan uang muka masuk, lalu rugi di bulan pekerjaannya dikerjakan.",
  },
  ppn_keluaran: {
    kode: "2131",
    ringkas: "PPN adalah titipan untuk negara — utang, bukan pendapatan.",
    rinci: "Dipisah dari 2130 Utang Pajak supaya rekonsiliasi SPT masa tak jadi pekerjaan manual tiap bulan.",
  },
  pph_final: {
    kode: "5950",
    ringkas: "PPh final adalah BEBAN perusahaan — ia mengurangi laba.",
    rinci: "Mencatatnya di 2130 Utang Pajak membuat laba terlihat LEBIH BESAR dari yang sebenarnya, karena beban yang dicatat sebagai utang tak pernah muncul di laba rugi.",
  },
  kas_bank: {
    kode: "1113",
    ringkas: "Akun kas bawaan untuk pembayaran tanpa rekening tersendiri.",
    rinci: "Dipakai hanya bila pembayaran tidak menyebutkan rekening kasnya sendiri.",
  },
};

const URUTAN: JenisPeta[] = [
  "pendapatan_termin", "piutang_usaha", "kas_bank",
  "retensi_ditahan", "uang_muka_klien", "pph_final", "ppn_keluaran",
];

export default function PetaAkunPage() {
  const [data, setData] = useState<Muatan | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState<JenisPeta | null>(null);
  const [pilihan, setPilihan] = useState<Partial<Record<JenisPeta, string>>>({});

  const muat = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Muatan>("/api/v1/gl/peta-akun", { signal });
      setData(r.data);
      // Pilihan awal = yang sudah ditetapkan. Yang belum dibiarkan KOSONG —
      // bukan diisi usulan, supaya "belum ditetapkan" tetap terlihat.
      const p: Partial<Record<JenisPeta, string>> = {};
      for (const b of r.data.peta) p[b.jenis] = b.account_id;
      setPilihan(p);
    } catch (e) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat peta akun");
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const simpan = useCallback(async (jenis: JenisPeta, accountId: string) => {
    if (!accountId) return;
    setMenyimpan(jenis); setGalat(null);
    try {
      await api.put(`/api/v1/gl/peta-akun/${jenis}`, { account_id: accountId });
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menetapkan akun");
    } finally { setMenyimpan(null); }
  }, [muat]);

  const petaPer = new Map((data?.peta ?? []).map((b) => [b.jenis, b]));

  const baris = URUTAN.map((jenis) => ({
    jenis,
    label: data?.label[jenis] ?? jenis,
    wajib: (data?.minimum ?? []).includes(jenis),
    terpasang: petaPer.get(jenis) ?? null,
    usul: USUL[jenis],
  }));

  type Baris = (typeof baris)[number];

  const kolom: Array<Kolom<Baris>> = [
    {
      kunci: "jenis", judul: "Untuk apa", kepalaBaris: true,
      render: (b) => (
        <span style={{
          display: "block", paddingLeft: 9,
          // Pita kiri hanya untuk yang WAJIB dan BELUM ditetapkan — bukan
          // untuk semua yang kosong. Retensi yang tak dipakai perusahaan ini
          // bukan masalah.
          borderLeft: b.wajib && !b.terpasang
            ? "3px solid var(--danger)" : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13, color: C.text }}>{b.label}</strong>
            {b.wajib && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: ".03em" }}>
                WAJIB
              </span>
            )}
          </span>
          <span style={{
            display: "block", fontSize: 11.5, color: C.mid, marginTop: 2,
            maxWidth: "54ch", lineHeight: 1.5,
          }}>{b.usul.ringkas}</span>
          {/* Dasar lengkapnya DIBUKA saat dibutuhkan. `<details>` bukan
              komponen buatan sendiri: ia sudah bisa dibuka dengan papan tik
              dan diumumkan pembaca layar tanpa satu baris ARIA pun. */}
          <details style={{ marginTop: 3 }}>
            <summary style={{
              fontSize: 11, color: "var(--aksen)", cursor: "pointer",
              fontWeight: 600, width: "fit-content",
            }}>Dasar pemilihannya</summary>
            <span style={{
              display: "block", fontSize: 11.5, color: C.mid,
              marginTop: 4, maxWidth: "54ch", lineHeight: 1.55,
            }}>{b.usul.rinci}</span>
          </details>
        </span>
      ),
    },
    {
      kunci: "akun", judul: "Akun",
      render: (b) => {
        const kini = pilihan[b.jenis] ?? "";
        const usulAkun = (data?.akun ?? []).find((a) => a.code === b.usul.kode);
        return (
          <span style={{ display: "block", minWidth: 260 }}>
            <label htmlFor={`pa-${b.jenis}`} style={{
              position: "absolute", width: 1, height: 1, overflow: "hidden",
              clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
            }}>Akun untuk {b.label}</label>
            <select
              id={`pa-${b.jenis}`} value={kini}
              onChange={(e) => setPilihan((p) => ({ ...p, [b.jenis]: e.target.value }))}
              style={{ ...gayaInput, fontSize: 12.5 }}
              disabled={menyimpan === b.jenis}
            >
              <option value="">— belum ditetapkan —</option>
              {(data?.akun ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            {usulAkun && kini !== usulAkun.id && (
              // Usulan DITAWARKAN, tak diisi otomatis. Bawaan yang terisi
              // sendiri tak pernah ditanyakan siapa pun.
              <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 3 }}>
                Usulan: {usulAkun.code} — {usulAkun.name}{" "}
                <button
                  type="button"
                  onClick={() => setPilihan((p) => ({ ...p, [b.jenis]: usulAkun.id }))}
                  style={{
                    border: "none", background: "none", padding: 0,
                    color: "var(--aksen)", fontSize: 11, fontWeight: 600,
                    textDecoration: "underline", cursor: "pointer",
                  }}
                >pakai</button>
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "status", judul: "Status",
      // Yang BELUM ditetapkan sudah dinyatakan pita kiri, spanduk di atas,
      // dan pemilih yang berbunyi "— belum ditetapkan —". Menambahkan
      // lencana merah di sini adalah penanda KEEMPAT untuk satu pesan yang
      // sama — dan layar yang menandai segalanya tak menandai apa pun (§3d).
      // Yang tersisa: menyatakan apa yang TIDAK bisa dibaca dari tempat lain.
      render: (b) => (
        b.terpasang
          ? <Lencana nada="sukses" ikon={<CircleCheck size={11} aria-hidden="true" />}>
              Ditetapkan
            </Lencana>
          : <span style={{ fontSize: 11.5, color: C.muted }}>—</span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (b) => {
        const kini = pilihan[b.jenis] ?? "";
        const berubah = kini !== (b.terpasang?.account_id ?? "");
        return (
          <Tombol
            kecil
            jenis={berubah ? "utama" : "sekunder"}
            disabled={!kini || !berubah || menyimpan === b.jenis}
            onClick={() => void simpan(b.jenis, kini)}
          >
            {menyimpan === b.jenis ? "Menyimpan…" : "Simpan"}
          </Tombol>
        );
      },
    },
  ];

  const k = data?.kesiapan;

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Link2 size={18} />}
        judul="Peta Akun Jurnal"
        keterangan={
          <>Ke akun mana tiap transaksi jatuh saat dijurnalkan otomatis. Yang
          ditetapkan di sini <strong>menentukan angka di neraca, laba rugi, dan
          SPT</strong> — dan peta yang salah menghasilkan laporan yang salah
          dengan meyakinkan, tanpa ada yang membantah sampai auditor datang.</>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {/* ── SATU aksen: belum ditetapkan (§3d) ────────────────────────────── */}
      {k?.siap === null && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TriangleAlert size={15} aria-hidden="true" />
            Peta akun belum ditetapkan — penjurnalan otomatis tidak berjalan
          </strong>
          <span style={{ display: "block", fontSize: 12.5 }}>
            Sampai tiga baris bertanda WAJIB diisi, invoice tak bisa dijurnalkan.
            Itu disengaja: penjurnalan yang menebak akun menghasilkan laporan
            yang terlihat wajar tetapi salah.
          </span>
        </div>
      )}

      {k?.siap === false && (
        <div role="status" style={{
          padding: "11px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
          color: "var(--warning-teks)",
        }}>
          <strong>Masih ada yang wajib belum ditetapkan:</strong>{" "}
          {k.kurang.map((j) => data?.label[j] ?? j).join(", ")}.
        </div>
      )}

      {k?.siap === true && (
        <div role="status" style={{
          padding: "11px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          border: "1px solid var(--success-border)", background: "var(--success-bg)",
          color: "var(--success)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <CircleCheck size={15} aria-hidden="true" />
          <span>
            Peta akun lengkap — invoice sudah bisa dijurnalkan. Jurnal yang
            dihasilkan berstatus <strong>draft</strong> sampai Anda memeriksanya
            dan memostingnya.
          </span>
        </div>
      )}

      {memuat ? (
        <Rangka tinggi={72} jumlah={4} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub="tiga baris pertama wajib · sisanya hanya dipakai bila transaksinya memuatnya"
          >
            Pemetaan
          </JudulKartu>
          <Tabel
            kolom={kolom}
            data={baris}
            kunciBaris={(x) => x.jenis}
            caption="Pemetaan jenis transaksi ke akun buku besar beserta dasar pemilihannya"
            // Latar baris SENGAJA tidak dipakai. Tangkapan layar pertama
            // menunjukkan tiga baris berlatar merah di bawah spanduk merah:
            // dua pertiga tabel berteriak, dan mata tak lagi tahu ke mana
            // harus melihat. Pita kiri sudah menunjuk baris yang sama tanpa
            // membanjiri permukaannya.
          />
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Dasar tiap usulan tercatat di <strong>RATIFIKASI R-012</strong>.
          Yang <strong>tidak</strong> dijurnalkan otomatis dan tetap manual:
          penyusutan, koreksi audit, jurnal penutup, dan apa pun yang butuh
          pertimbangan — otomatisasi berhenti di tempat yang jawabannya tunggal.
        </span>
      </p>
    </Halaman>
  );
}
