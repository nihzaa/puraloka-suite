"use client";

/**
 * PERIODE AKUNTANSI & TUTUP BUKU.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HALAMAN YANG TINDAKANNYA SULIT DIBATALKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menutup periode berbeda dari hampir semua tombol lain di sistem ini:
 * sesudahnya laporan dicetak, dikirim ke bank, dan dipakai menghitung pajak.
 * Membuka kembali mungkin — tetapi berjejak permanen, dan periode yang dibuka
 * tiga kali menceritakan sesuatu tentang kualitas pembukuannya.
 *
 * Karena itu halaman ini **menunjukkan apa yang akan terkunci SEBELUM
 * menguncinya**, bukan sesudah. Kartu kesiapan menjawab pertanyaan yang
 * benar-benar menentukan:
 *
 *   · masih ada jurnal DRAFT yang tak akan masuk laporan?
 *   · ada periode SEBELUMNYA yang masih terbuka?  ← satu-satunya penghalang
 *   · periodenya kosong sama sekali?
 *
 * ── Kenapa hanya SATU yang jadi penghalang
 *
 * Draft bisa saja memang batal, dan memaksanya jadi penghalang akan membuat
 * orang MENGHAPUS draft asal periodenya bisa ditutup — persis kebalikan dari
 * yang diinginkan.
 *
 * Periode sebelumnya yang terbuka lain soal: saldo awal periode ini diambil
 * dari sana, dan angka yang masih bisa berubah membuat laporannya tak bisa
 * dijumlahkan. Itu bukan preferensi, itu aritmetika.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU AKSEN (§3d): LUBANG ANTAR-PERIODE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang menonjol di halaman ini bukan periode yang terbuka — itu keadaan
 * normal. Yang menonjol adalah **rentang tanggal yang tak tercakup periode
 * mana pun**: transaksi di sana tak akan pernah bisa dikunci, dan itu baru
 * ketahuan saat auditor bertanya "periode mana yang memuat Maret?".
 *
 * ── Kenapa "dibuka ulang" ditampilkan, bukan disembunyikan
 *
 * Angka itu tak nyaman, dan justru itu gunanya. Periode yang dibuka tiga kali
 * bukan aib yang perlu ditutupi — ia informasi yang harus terlihat sebelum
 * seseorang menandatangani laporannya.
 */

// `useEffect` tak lagi dipakai: pengambilan data pindah ke `useData`.
import { useCallback, useState } from "react";
import {
  Lock, LockOpen, CalendarRange, TriangleAlert, ScrollText, Plus,
  CircleAlert, History,
} from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, KartuAngka, BarisAngka,
  Tabel, Kosong, Rangka, Galat, Tombol, Lencana, Medan, gayaInput,
  type Kolom,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type StatusPeriode = "terbuka" | "tertutup";
type BeratMasalah = "penghalang" | "peringatan" | "catatan";

interface IsiPeriode {
  posted: number; draft: number;
  total_debit: number | string | null;
  total_kredit: number | string | null;
}

interface Periode {
  id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_akhir: string;
  status: StatusPeriode;
  ditutup_pada: string | null;
  catatan_tutup: string | null;
  dibuka_ulang: number;
  penutup: { id: string; name: string } | null;
  isi: IsiPeriode;
  selisih: number | null;
}

interface Muatan {
  periode: Periode[];
  ringkas: {
    total: number; terbuka: number; tertutup: number;
    pernah_dibuka_ulang: number;
    terbuka_terlama: { id: string; nama: string } | null;
    lubang: Array<{ dari: string; sampai: string }>;
  };
}

interface Kesiapan {
  periode: Periode;
  kesiapan: {
    boleh: boolean | null;
    masalah: Array<{ berat: BeratMasalah; pesan: string }>;
    isi: IsiPeriode;
  };
  selisih: number | null;
}

interface Riwayat {
  id: string;
  tindakan: "dibuat" | "ditutup" | "dibuka_ulang";
  alasan: string | null;
  pada: string;
  jurnal_posted: number | null;
  pelaku: { id: string; name: string } | null;
}

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

const rupiah = (v: number | string | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
};

const TINDAKAN: Record<Riwayat["tindakan"], { label: string; nada: "netral" | "info" | "peringatan" }> = {
  dibuat: { label: "Dibuat", nada: "netral" },
  ditutup: { label: "Ditutup", nada: "info" },
  dibuka_ulang: { label: "Dibuka kembali", nada: "peringatan" },
};

export default function PeriodeAkuntansiPage() {
  /*
    `useData` menggantikan trio useState(data/memuat/galat) + useEffect +
    AbortController. Selain dedup dan cache lintas navigasi, ia juga
    berlangganan invalidasi: bila modul lain membuang cache periode, halaman
    ini menyegarkan diri tanpa perlu tahu siapa yang mengubah.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>("/api/v1/gl/periode");
  const galat = galatMuat ? "Gagal memuat periode akuntansi" : null;

  const [tambah, setTambah] = useState(false);
  const [fNama, setFNama] = useState("");
  const [fMulai, setFMulai] = useState("");
  const [fAkhir, setFAkhir] = useState("");

  const [tutupBaris, setTutupBaris] = useState<Periode | null>(null);
  const [kesiapan, setKesiapan] = useState<Kesiapan | null>(null);
  const [tCatatan, setTCatatan] = useState("");

  const [bukaBaris, setBukaBaris] = useState<Periode | null>(null);
  const [bAlasan, setBAlasan] = useState("");

  const [riwayatUntuk, setRiwayatUntuk] = useState<Periode | null>(null);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Halaman ini memanggil `muat()` di TIGA tempat sesudah menulis (tutup
    periode, buka periode, simpan). `muatUlang()` menggantikannya dengan
    `paksa: true`, jadi jawaban lama di cache dilewati — menyegarkan setelah
    menulis harus melihat hasil tulisannya, bukan salinan lima menit lalu.
  */
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  const bukaDialogTutup = useCallback(async (p: Periode) => {
    setTutupBaris(p); setKesiapan(null); setTCatatan(""); setGalatModal(null);
    try {
      const r = await api.get<Kesiapan>(`/api/v1/gl/periode/${p.id}/kesiapan`);
      setKesiapan(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal memeriksa kesiapan periode");
    }
  }, []);

  const simpanPeriode = useCallback(async () => {
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post("/api/v1/gl/periode", {
        nama: fNama.trim(), tanggal_mulai: fMulai, tanggal_akhir: fAkhir,
      });
      setTambah(false); setFNama(""); setFMulai(""); setFAkhir("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal membuat periode");
    } finally { setMenyimpan(false); }
  }, [fNama, fMulai, fAkhir, muat]);

  const simpanTutup = useCallback(async () => {
    if (!tutupBaris) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/gl/periode/${tutupBaris.id}/tutup`, {
        catatan: tCatatan.trim() || null,
      });
      setTutupBaris(null); setKesiapan(null); setTCatatan("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menutup periode");
    } finally { setMenyimpan(false); }
  }, [tutupBaris, tCatatan, muat]);

  const simpanBuka = useCallback(async () => {
    if (!bukaBaris) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/gl/periode/${bukaBaris.id}/buka`, { alasan: bAlasan.trim() });
      setBukaBaris(null); setBAlasan("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal membuka periode");
    } finally { setMenyimpan(false); }
  }, [bukaBaris, bAlasan, muat]);

  const bukaRiwayat = useCallback(async (p: Periode) => {
    setRiwayatUntuk(p); setRiwayat([]);
    try {
      const r = await api.get<{ riwayat: Riwayat[] }>(`/api/v1/gl/periode/${p.id}/riwayat`);
      setRiwayat(r.data.riwayat ?? []);
    } catch {
      setRiwayat([]);
    }
  }, []);

  const kolom: Array<Kolom<Periode>> = [
    {
      kunci: "periode", judul: "Periode", kepalaBaris: true,
      render: (p) => (
        <span style={{
          display: "block", paddingLeft: 9,
          // Pita kiri untuk yang PERNAH DIBUKA ULANG — bukan untuk yang
          // terbuka. Periode terbuka adalah keadaan normal; periode yang
          // dibuka ulang adalah keadaan yang perlu diketahui sebelum
          // seseorang menandatangani laporannya.
          borderLeft: p.dibuka_ulang > 0
            ? "3px solid var(--warning-border)" : "3px solid transparent",
        }}>
          <strong style={{ fontSize: 13, color: C.text }}>{p.nama}</strong>
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.mid, marginTop: 1 }}>
            {tanggal(p.tanggal_mulai)} – {tanggal(p.tanggal_akhir)}
          </span>
          {p.dibuka_ulang > 0 && (
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: "var(--warning-teks)", marginTop: 2 }}>
              pernah dibuka kembali {p.dibuka_ulang}×
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "isi", judul: "Jurnal", rata: "kanan",
      render: (p) => (
        <span style={{ display: "block", fontVariantNumeric: "tabular-nums" }}>
          <strong style={{ fontSize: 14, color: C.text }}>{p.isi.posted}</strong>
          {/* Kata "terkunci" HANYA untuk periode yang memang terkunci.
              *
              * Terlihat di layar: versi pertama menulis "terkunci" di bawah
              * angka jurnal SEMUA periode — termasuk yang statusnya Terbuka
              * dua kolom di sebelahnya. Maksudnya "yang akan terkunci",
              * tetapi yang terbaca adalah status. Pada halaman yang seluruh
              * gunanya membedakan terkunci dari tidak, itu bukan salah kata —
              * itu berbohong tentang hal yang justru sedang ditanyakan. */}
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted, marginTop: 1 }}>
            {[
              p.status === "tertutup" ? "terkunci" : "posted",
              // Draft dinyatakan di sini juga, bukan hanya saat menutup —
              // supaya terlihat sebelum orang membuka dialognya.
              p.isi.draft > 0 ? `${p.isi.draft} draft belum masuk` : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
      ),
    },
    {
      kunci: "nilai", judul: "Debit / Kredit", rata: "kanan",
      render: (p) => (
        <span style={{ display: "block", fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(p.isi.total_debit)}
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted }}>
            {p.selisih === null
              // `null` berarti angkanya TAK TERBACA — dan itu tak boleh
              // disamarkan jadi "seimbang".
              ? "selisih tak bisa dihitung"
              : p.selisih === 0 ? "seimbang" : `selisih ${rupiah(p.selisih)}`}
          </span>
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (p) => (
        <span style={{ display: "block" }}>
          <Lencana
            nada={p.status === "tertutup" ? "sukses" : "netral"}
            ikon={p.status === "tertutup"
              ? <Lock size={11} aria-hidden="true" />
              : <LockOpen size={11} aria-hidden="true" />}
          >{p.status === "tertutup" ? "Terkunci" : "Terbuka"}</Lencana>
          {p.ditutup_pada && (
            <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted, marginTop: 2 }}>
              {tanggal(p.ditutup_pada)}{p.penutup ? ` · ${p.penutup.name}` : ""}
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (p) => (
        <span style={{ display: "inline-flex", gap: 6 }}>
          <Tombol kecil ikon={<History size={12} />} onClick={() => void bukaRiwayat(p)}>
            Riwayat
          </Tombol>
          {p.status === "terbuka" ? (
            <Tombol kecil ikon={<Lock size={12} />} onClick={() => void bukaDialogTutup(p)}>
              Tutup
            </Tombol>
          ) : (
            <Tombol kecil ikon={<LockOpen size={12} />}
              onClick={() => { setBukaBaris(p); setBAlasan(""); setGalatModal(null); }}>
              Buka kembali
            </Tombol>
          )}
        </span>
      ),
    },
  ];

  const r = data?.ringkas;
  const lubang = r?.lubang ?? [];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<CalendarRange size={18} />}
        judul="Periode Akuntansi"
        keterangan={
          <>Mengunci periode agar angka lampau tak berubah. Penguncian
          ditegakkan <strong>basis data</strong>, bukan halaman ini — skrip
          impor dan perbaikan manual pun ditolak. Membuka kembali mungkin,
          tetapi berjejak permanen.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambah(true); setGalatModal(null); }}>
            Buat periode
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {/* ── SATU aksen: lubang antar-periode (§3d) ────────────────────────── */}
      {lubang.length > 0 && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TriangleAlert size={15} aria-hidden="true" />
            {lubang.length === 1
              ? "1 rentang tanggal tak tercakup periode mana pun"
              : `${lubang.length} rentang tanggal tak tercakup periode mana pun`}
          </strong>
          {lubang.map((l) => (
            <span key={l.dari} style={{ display: "block", fontSize: 12.5 }}>
              {tanggal(l.dari)} – {tanggal(l.sampai)}
            </span>
          ))}
          <span style={{ display: "block", fontSize: 12.5, marginTop: 4 }}>
            Transaksi di rentang itu tak akan pernah bisa dikunci — dan itu baru
            ketahuan saat auditor bertanya periode mana yang memuatnya.
          </span>
        </div>
      )}

      {r && r.total > 0 && (
        <BarisAngka>
          <KartuAngka
            label="Periode terbuka"
            nilai={r.terbuka}
            ikon={<LockOpen size={15} />}
            sub={r.terbuka_terlama
              ? `terlama: ${r.terbuka_terlama.nama}`
              : "seluruhnya sudah terkunci"}
          />
          <KartuAngka
            label="Terkunci"
            nilai={r.tertutup}
            ikon={<Lock size={15} />}
            sub="angka di dalamnya tak bisa berubah"
          />
          <KartuAngka
            label="Pernah dibuka kembali"
            nilai={r.pernah_dibuka_ulang}
            ikon={<CircleAlert size={15} />}
            // Angka yang tak nyaman, dan justru itu gunanya.
            warna={r.pernah_dibuka_ulang > 0 ? "var(--warning-teks)" : undefined}
            sub={r.pernah_dibuka_ulang > 0
              ? "setiap pembukaan tercatat permanen beserta alasannya"
              : "belum ada periode yang dibuka ulang"}
          />
          <KartuAngka
            label="Rentang tak tercakup"
            nilai={lubang.length}
            ikon={<TriangleAlert size={15} />}
            sorot={lubang.length > 0}
            sub={lubang.length > 0
              ? "transaksi di sana tak bisa dikunci"
              : "seluruh tanggal tercakup periode"}
          />
        </BarisAngka>
      )}

      {memuat ? (
        <Rangka tinggi={64} jumlah={3} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub={r ? `${r.total} periode · terbaru di atas` : undefined}
          >
            Periode
          </JudulKartu>
          <Tabel
            kolom={kolom}
            data={data?.periode ?? []}
            kunciBaris={(x) => x.id}
            caption="Periode akuntansi beserta status penguncian dan jumlah jurnal di dalamnya"
            tandaiBaris={(x) => (x.dibuka_ulang > 0 ? "peringatan" : undefined)}
            kosong={
              <Kosong
                ikon={<CalendarRange size={28} />}
                judul="Belum ada periode akuntansi"
                sebab="Tanpa periode, tak ada yang bisa dikunci — dan angka lampau bisa berubah kapan saja tanpa ada yang tahu. Mulai dari bulan berjalan."
              />
            }
          />
        </Kartu>
      )}

      {/* ── Buat periode ──────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambah}
        judul="Buat periode akuntansi"
        keterangan="Rentangnya tak boleh tumpang tindih dengan periode lain — satu tanggal harus jatuh di tepat satu periode, kalau tidak “apakah tanggal ini terkunci?” punya dua jawaban."
        onTutup={() => setTambah(false)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTambah(false)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanPeriode()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Buat periode"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}
        <Medan id="pr-nama" label="Nama periode" wajib
          keterangan="Mis. “Januari 2026” atau “Triwulan I 2026”."
          anak={
            <input id="pr-nama" value={fNama}
              onChange={(e) => setFNama(e.target.value)} style={gayaInput} />
          }
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="pr-mulai" label="Tanggal mulai" wajib
              anak={
                <input id="pr-mulai" type="date" value={fMulai}
                  onChange={(e) => setFMulai(e.target.value)} style={gayaInput} />
              }
            />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="pr-akhir" label="Tanggal akhir" wajib
              anak={
                <input id="pr-akhir" type="date" value={fAkhir}
                  onChange={(e) => setFAkhir(e.target.value)} style={gayaInput} />
              }
            />
          </div>
        </div>
      </DialogBersama>

      {/* ── Tutup periode ─────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tutupBaris != null}
        judul="Tutup periode"
        keterangan="Sesudah ditutup, jurnal bertanggal di dalamnya tak bisa diposting maupun diubah — ditegakkan basis data, bukan halaman ini."
        onTutup={() => { setTutupBaris(null); setKesiapan(null); }}
        kaki={
          <>
            <Tombol jenis="hantu"
              onClick={() => { setTutupBaris(null); setKesiapan(null); }}
              disabled={menyimpan}>Batal</Tombol>
            <Tombol jenis="utama" onClick={() => void simpanTutup()}
              disabled={menyimpan || kesiapan?.kesiapan.boleh === false}>
              {menyimpan ? "Menutup…" : "Tutup periode"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}

        {tutupBaris && (
          <p style={{ fontSize: 12.5, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{tutupBaris.nama}</strong>
            {" — "}{tanggal(tutupBaris.tanggal_mulai)} sampai {tanggal(tutupBaris.tanggal_akhir)}.
          </p>
        )}

        {kesiapan === null ? (
          <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>
            Memeriksa kesiapan…
          </p>
        ) : (
          <>
            {/* Apa yang akan terkunci — DITUNJUKKAN sebelum menguncinya. */}
            <div style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 12,
              border: `1px solid ${C.border}`, background: "var(--surface-2)",
            }}>
              <span style={{ display: "block", fontSize: 12.5, color: C.text, fontWeight: 600 }}>
                Yang akan terkunci
              </span>
              <span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 3, lineHeight: 1.6 }}>
                {kesiapan.kesiapan.isi.posted} jurnal sudah diposting ·{" "}
                {rupiah(kesiapan.kesiapan.isi.total_debit)} debit ·{" "}
                {kesiapan.selisih === null
                  ? "selisih tak bisa dihitung"
                  : kesiapan.selisih === 0
                    ? "debit dan kredit seimbang"
                    : `SELISIH ${rupiah(kesiapan.selisih)}`}
              </span>
            </div>

            {kesiapan.kesiapan.masalah.map((m, i) => (
              <div
                key={i}
                role={m.berat === "penghalang" ? "alert" : "status"}
                style={{
                  marginBottom: 10, padding: "9px 12px", borderRadius: 8,
                  fontSize: 12.5, lineHeight: 1.5,
                  border: `1px solid ${
                    m.berat === "penghalang" ? "var(--danger-border)"
                      : m.berat === "peringatan" ? "var(--warning-border)" : C.border}`,
                  background:
                    m.berat === "penghalang" ? "var(--danger-bg)"
                      : m.berat === "peringatan" ? "var(--warning-bg)" : "var(--surface-2)",
                  color:
                    m.berat === "penghalang" ? "var(--danger)"
                      : m.berat === "peringatan" ? "var(--warning-teks)" : C.mid,
                }}
              >
                {/* Beratnya disebut, bukan hanya diwarnai — WCAG 1.4.1
                    melarang bergantung warna saja. */}
                <strong style={{ display: "block", fontSize: "var(--t-kecil)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 2 }}>
                  {m.berat === "penghalang" ? "Penghalang"
                    : m.berat === "peringatan" ? "Peringatan" : "Catatan"}
                </strong>
                {m.pesan}
              </div>
            ))}

            <Medan id="tp-catatan" label="Catatan penutupan"
              keterangan="Boleh dikosongkan. Yang ditulis di sini ikut tercatat di riwayat permanen."
              anak={
                <textarea id="tp-catatan" value={tCatatan} rows={2}
                  onChange={(e) => setTCatatan(e.target.value)}
                  style={{ ...gayaInput, resize: "vertical" }} />
              }
            />
          </>
        )}
      </DialogBersama>

      {/* ── Buka kembali ──────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={bukaBaris != null}
        judul="Buka kembali periode"
        keterangan="Ini mengubah angka yang mungkin sudah dilaporkan. Alasannya tercatat permanen dan tak bisa dihapus."
        onTutup={() => setBukaBaris(null)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setBukaBaris(null)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="bahaya" onClick={() => void simpanBuka()} disabled={menyimpan}>
              {menyimpan ? "Membuka…" : "Buka kembali"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}

        {bukaBaris && (
          <p style={{ fontSize: 12.5, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{bukaBaris.nama}</strong> ditutup{" "}
            {tanggal(bukaBaris.ditutup_pada)}
            {bukaBaris.penutup ? ` oleh ${bukaBaris.penutup.name}` : ""}
            {bukaBaris.dibuka_ulang > 0
              ? ` · sudah pernah dibuka ${bukaBaris.dibuka_ulang}×`
              : ""}.
          </p>
        )}

        <Medan id="bk-alasan" label="Alasan membuka kembali" wajib
          keterangan="Minimal 20 huruf. Yang membacanya setahun lagi tak ada di ruangan saat keputusan ini diambil — “koreksi” tak menjelaskan apa pun baginya."
          anak={
            <textarea id="bk-alasan" value={bAlasan} rows={3}
              onChange={(e) => setBAlasan(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
        <p style={{
          fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5,
          display: "flex", gap: 6, alignItems: "flex-start",
        }}>
          <ScrollText size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          Sesudah dibuka, jurnal di periode ini bisa diposting dan diubah lagi.
          Tutup kembali setelah koreksinya selesai.
        </p>
      </DialogBersama>

      {/* ── Riwayat ───────────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={riwayatUntuk != null}
        judul={`Riwayat — ${riwayatUntuk?.nama ?? ""}`}
        keterangan="Append-only: tak bisa diubah maupun dihapus, bahkan oleh admin."
        onTutup={() => setRiwayatUntuk(null)}
        lebar={640}
        kaki={
          <Tombol jenis="sekunder" onClick={() => setRiwayatUntuk(null)}>Tutup</Tombol>
        }
      >
        {riwayat.length === 0 ? (
          <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>
            Belum ada riwayat tercatat — riwayat terisi sendiri begitu periode pertama ditutup.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {riwayat.map((h) => (
              <li key={h.id} style={{
                padding: "9px 12px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: "var(--surface-2)",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Lencana nada={TINDAKAN[h.tindakan].nada}>
                    {TINDAKAN[h.tindakan].label}
                  </Lencana>
                  <span style={{ fontSize: "var(--t-kecil)", color: C.mid }}>
                    {tanggal(h.pada)}
                    {h.pelaku ? ` · ${h.pelaku.name}` : ""}
                    {h.jurnal_posted != null ? ` · ${h.jurnal_posted} jurnal posted` : ""}
                  </span>
                </span>
                {h.alasan && (
                  <span style={{
                    display: "block", fontSize: 12, color: C.text,
                    marginTop: 4, lineHeight: 1.5,
                  }}>{h.alasan}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogBersama>
    </Halaman>
  );
}
