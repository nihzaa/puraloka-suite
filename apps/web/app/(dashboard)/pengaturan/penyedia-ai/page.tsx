"use client";

/**
 * PENGATURAN → PENYEDIA AI
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA ADMIN KE HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "model apa yang dipakai" — itu pertanyaan turunan. Yang sebenarnya
 * dibawa: *berapa ini menghabiskan uang saya, dan bagaimana menahannya?*
 *
 * Karena itu pemakaian bulan berjalan ada DI ATAS, sebelum satu pun pilihan
 * model terlihat. Halaman yang menaruh biaya di bawah lipatan memaksa orang
 * memilih model dulu lalu mencari akibatnya — urutan yang terbalik dari cara
 * keputusan itu sebenarnya diambil.
 *
 * ── Kenapa perkiraan biaya menempel di tiap pilihan model
 *
 * "Opus 5" dan "Haiku 4.5" tidak memberi tahu apa pun tentang selisih 5x
 * biayanya. Angka Rupiah per panggilan membuat pilihannya bisa dinilai tanpa
 * pengetahuan tentang harga token per juta — pengetahuan yang tak wajar
 * dituntut dari orang yang sedang mengatur perusahaan konstruksi.
 *
 * ── Kenapa asisten yang belum dikonfigurasi tetap muncul
 *
 * Sama dengan pelajaran halaman Kredensial: kalau hanya yang tersimpan yang
 * ditampilkan, admin menyimpulkan asisten lain tidak ada — padahal ia berjalan
 * dengan bawaan, dan tetap menghabiskan uang.
 *
 * ── Warna
 *
 * `ARAH-VISUAL-2026.md` §3d: navy adalah SATU-SATUNYA aksen, satu aksen per
 * layar. Merah/oranye di sini hanya untuk keadaan biaya yang benar-benar
 * melewati batas — bukan untuk menghias kartu yang baik-baik saja.
 */

import { useCallback, useEffect, useState } from "react";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { api } from "@/lib/api";
import { Bot, Info, Loader2, Save, TrendingUp, Wallet } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { PanduanHalaman } from "@/components/panduan-halaman";
import { Saklar } from "@/components/saklar";
import { Pilihan } from "@/components/pilihan";



interface ModelTersedia {
  id: string;
  label: string;
  cocokUntuk: string;
  masukPerMTok: number;
  keluarPerMTok: number;
  perkiraanIdr: number;
}

interface Konfigurasi {
  asisten: string;
  penyedia: string;
  model: string;
  max_token: number;
  aktif: boolean;
  batas_bulanan_idr: number | null;
  mode_batas: "blokir" | "peringatkan";
  tersimpan: boolean;
  perkiraan_per_panggilan_idr: number;
}

interface Rincian {
  asisten: string;
  model: string;
  panggilan: number;
  idr: number;
  token: number;
}

interface PenyediaTersedia {
  id: string;
  label: string;
  keterangan: string;
  kunciKredensial: string;
  butuhBaseUrl: boolean;
}

interface Muatan {
  data: Konfigurasi[];
  model_tersedia: ModelTersedia[];
  penyedia_tersedia: PenyediaTersedia[];
  /**
   * Kurs datang DARI SERVER, tidak dipaku di sini.
   *
   * Memaku `16000` di komponen adalah persis yang TJS lakukan, dan yang
   * `audit-satu-sumber-harga` cegah di sisi API. Menyalinnya ke web hanya
   * memindahkan cacatnya ke tempat yang tak dijaga penjaga mana pun.
   */
  kurs_idr: number;
  pemakaian: { bulan: string; terpakai_idr: number; rincian: Rincian[] };
}

/**
 * Apa yang tiap asisten kerjakan, dalam kalimat.
 *
 * Nama teknis (`insight`, `staff`) tak berarti apa pun bagi orang yang membuka
 * halaman ini. Tanpa kalimat ini, memilih model untuk "staff" adalah tebakan.
 */
const PERAN: Record<string, { nama: string; kerja: string; butuhPenalaran: boolean }> = {
  insight: {
    nama: "Wawasan portofolio",
    kerja: "Menulis dua kalimat penilaian di beranda dari angka yang sudah dihitung sistem. Tugas ringan.",
    butuhPenalaran: false,
  },
  owner: {
    nama: "Asisten pemilik",
    kerja: "Menjawab pertanyaan lintas proyek dan menyiapkan tindakan untuk disetujui. Butuh penalaran.",
    butuhPenalaran: true,
  },
  staff: {
    nama: "Asisten staf",
    kerja: "Membantu pekerjaan harian di lingkup proyek yang boleh diakses penggunanya.",
    butuhPenalaran: true,
  },
  web: {
    nama: "Asisten web",
    kerja: "Percakapan di dalam aplikasi web.",
    butuhPenalaran: false,
  },
};

/**
 * Model yang terlalu ringan untuk asisten yang butuh penalaran.
 *
 * Bawaan seluruh asisten adalah Haiku — pilihan yang benar untuk `insight`
 * (dua kalimat dari angka jadi) tetapi salah untuk asisten yang memanggil tool
 * bertingkat. Tanpa penanda ini, kartu "Asisten pemilik" berkata *"Butuh
 * penalaran"* tepat di atas dropdown bertuliskan *"Tugas ringan: klasifikasi,
 * ringkasan pendek"* — dua kalimat yang saling membantah, dan tak satu pun
 * memberi tahu pembacanya bahwa ada yang perlu diubah.
 */
const MODEL_RINGAN = new Set(["claude-haiku-4-5"]);

/**
 * Rupiah tanpa desimal.
 *
 * Versi pertama menampilkan desimal untuk nilai di bawah seribu, dan hasilnya
 * satu kolom memuat "Rp 2.057" bersebelahan dengan "Rp 113,36" — dua gaya angka
 * dalam daftar yang dimaksudkan untuk dibandingkan sekilas. Mata harus berhenti
 * membaca tiap baris alih-alih memindainya.
 *
 * Presisi sen tetap tersimpan di basis (`numeric(14,2)`); yang dibuang hanya
 * tampilannya, dan keputusan yang diambil dari halaman ini tak pernah bergantung
 * pada 36 sen.
 */
const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;


export default function PenyediaAiPage() {
  const bolehKelola = useIzin("settings:ai:manage");

  /*
    Lapis cache bersama (F4-2). `draf` tetap state lokal — ia isian yang
    sedang disunting, dan menimpanya dari cache akan menghapus ketikan orang.
  */
  const sumber = useData<Muatan>("/api/v1/ai/config");
  const muatan = sumber.data;
  const memuat = sumber.memuat;

  /*
    Galat MUAT punya barisnya sendiri, TIDAK numpang `toast`.

    Toast menghilang sendiri setelah 5 detik dan dipakai untuk hasil aksi;
    galat muat harus BERTAHAN selama datanya memang tak ada, karena ia
    menjelaskan kenapa halamannya kosong. Dijaga uji-galat-muat-terpisah.mjs.
  */
  const galatMuat = sumber.galat ? "Gagal memuat konfigurasi AI" : null;
  const [draf, setDraf] = useState<Record<string, Partial<Konfigurasi>>>({});
  const [sedangSimpan, setSedangSimpan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  /*
    Hanya untuk MUAT ULANG sesudah simpan — pengambilan pertama dikerjakan
    `useData`. `setDraf({})` dipertahankan: sesudah tersimpan, isian yang
    belum dikirim memang harus dikosongkan agar tak menutupi nilai server.
  */
  const muat = useCallback(async () => {
    await sumber.muatUlang();
    setDraf({});
  }, [sumber]);

  /*
    Effect pemuatan awal DIHAPUS — `useData` yang mengambil datanya.
    Menyisakannya membuat permintaan GANDA tiap halaman dibuka.
  */

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function ubah(asisten: string, tambalan: Partial<Konfigurasi>) {
    setDraf((d) => ({ ...d, [asisten]: { ...d[asisten], ...tambalan } }));
  }

  function gabung(k: Konfigurasi): Konfigurasi {
    return { ...k, ...draf[k.asisten] };
  }

  async function simpan(k: Konfigurasi) {
    const nilai = gabung(k);
    setSedangSimpan(k.asisten);
    try {
      await api.put(`/api/v1/ai/config/${k.asisten}`, {
        penyedia: nilai.penyedia,
        model: nilai.model,
        max_token: Number(nilai.max_token),
        aktif: nilai.aktif,
        batas_bulanan_idr: nilai.batas_bulanan_idr,
        mode_batas: nilai.mode_batas,
      });
      setToast({ tipe: "ok", pesan: `Konfigurasi ${PERAN[k.asisten]?.nama ?? k.asisten} tersimpan` });
      await muat();
    } catch (e) {
      const pesan =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Gagal menyimpan konfigurasi";
      setToast({ tipe: "err", pesan });
    } finally {
      setSedangSimpan(null);
    }
  }

  const terpakai = muatan?.pemakaian.terpakai_idr ?? 0;
  const rincian = muatan?.pemakaian.rincian ?? [];
  // Jatuhan hanya untuk render sebelum muatan tiba; angka sesungguhnya selalu
  // dari server. Nol akan membuat semua perkiraan tampil Rp 0 dan menyesatkan.
  const kurs = muatan?.kurs_idr ?? 16_000;

  /*
   * Batas & mode ditampilkan sebagai SATU nilai meski basisnya menyimpan
   * per-asisten.
   *
   * Kolomnya per-baris karena `ai_provider_config` memang satu baris per
   * (tenant, asisten) — tapi `periksaGerbangAi` menjumlah SELURUH
   * `ai_biaya_token` milik tenant, jadi batas yang berlaku sebenarnya satu.
   * Menampilkan empat isian untuk satu perilaku adalah antarmuka yang
   * membohongi bentuknya sendiri.
   *
   * Yang ditampilkan: nilai TERKECIL bukan-null. Kalau baris-barisnya kadung
   * berbeda (mis. disetel lewat API), yang terkecillah yang benar-benar
   * menggigit lebih dulu — jadi itu yang jujur ditampilkan.
   */
  const semua = (muatan?.data ?? []).map((k) => ({ ...k, ...draf[k.asisten] }));
  const batasTerpasang = semua
    .map((k) => k.batas_bulanan_idr)
    .filter((b): b is number => b !== null && b !== undefined);
  const batasGlobal = batasTerpasang.length ? Math.min(...batasTerpasang) : null;
  // `blokir` menang: kalau satu saja asisten disetel memblokir, perilaku yang
  // terlihat pengguna adalah pemblokiran.
  const modeGlobal: "blokir" | "peringatkan" = semua.some((k) => k.mode_batas === "blokir")
    ? "blokir"
    : "peringatkan";
  const lewatBatas = batasGlobal !== null && terpakai >= batasGlobal;

  /** Menulis batas ke SEMUA asisten sekaligus — satu kontrol, satu arti. */
  function ubahBatasSemua(nilai: number | null) {
    setDraf((d) => {
      const baru = { ...d };
      for (const k of muatan?.data ?? []) {
        baru[k.asisten] = { ...baru[k.asisten], batas_bulanan_idr: nilai };
      }
      return baru;
    });
  }

  function ubahModeSemua(nilai: "blokir" | "peringatkan") {
    setDraf((d) => {
      const baru = { ...d };
      for (const k of muatan?.data ?? []) {
        baru[k.asisten] = { ...baru[k.asisten], mode_batas: nilai };
      }
      return baru;
    });
  }

  /** Ada draf yang menyentuh batas/mode — dipisah dari draf model/token. */
  const batasBerubah = Object.values(draf).some(
    (d) => d?.batas_bulanan_idr !== undefined || d?.mode_batas !== undefined,
  );

  /**
   * Menyimpan batas ke SELURUH asisten, satu per satu.
   *
   * Berurutan, bukan `Promise.all`: kalau salah satu gagal, yang berikutnya
   * tak ikut terkirim dan keadaannya tidak jadi separuh-berubah tanpa ada yang
   * tahu berhenti di mana. Empat permintaan cukup cepat untuk tak perlu paralel.
   */
  async function simpanBatas() {
    setSedangSimpan("__batas__");
    try {
      // SATU permintaan, bukan empat. Sampai migrasi 382 plafon disimpan di
      // tiap baris asisten, jadi "satu batas" hanya benar selama keempat
      // tulisan berhasil — gagal di tengah meninggalkan tenant dengan dua
      // plafon berbeda dan tak ada yang tahu berhenti di mana.
      //
      // Sekarang plafonnya memang satu baris milik tenant, dan bentuk
      // penyimpanannya akhirnya sama dengan yang selama ini dijanjikan layar.
      // Hanya mengirim yang memang diubah halaman ini. `ai_aktif` dan
      // `retensi_hari` milik halaman Lapisan AI; menyertakannya dari sini
      // berarti menyimpan batas biaya diam-diam menimpa saklar yang tak
      // pernah disentuh siapa pun di layar ini.
      await api.put("/api/v1/ai/pengaturan", {
        batas_bulanan_idr: batasGlobal,
        mode_batas: modeGlobal,
      });
      setToast({ tipe: "ok", pesan: "Batas biaya tersimpan" });
      await muat();
    } catch (e) {
      const pesan =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Gagal menyimpan batas biaya";
      setToast({ tipe: "err", pesan });
    } finally {
      setSedangSimpan(null);
    }
  }

  return (
    /*
      `--w-page`, BUKAN `--w-form`.
      ─────────────────────────────────────────────────────────────────────
      Catatan lama di sini berkata halaman ini "satu kolom kartu yang tiap
      barisnya memuat kalimat penjelas", jadi 900px menjaga panjang baris.
      Itu benar untuk PROSA, dan halaman ini bukan prosa: tiap kartu asisten
      adalah grid TIGA KOLOM (penyedia · model · batas token), dan di bawahnya
      ada tabel pemakaian.

      Diukur di layar 2560px sebelum diperbaiki:

          tersedia 2340 · isi 900  →  1440px KOSONG (62%)

      Persis gejala yang `ARAH-VISUAL-2026` §4a catat untuk `/proyek`
      ("kanan kirinya ada jarak yg lumayan banyak") — perbaikannya sudah
      ditetapkan di sana, hanya belum sampai ke halaman pengaturan.

      Yang TETAP dijaga sempit adalah tempat yang memang prosa: `PanduanHalaman`
      membatasi dirinya sendiri ke ~68ch, jadi melebarkan halaman tidak
      memanjangkan satu pun kalimat melewati batas baca.
    */
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 60,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13,
            background: toast.tipe === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.tipe === "ok" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${toast.tipe === "ok" ? "var(--success)" : "var(--danger)"}`,
          }}
        >
          {toast.pesan}
        </div>
      )}

      <div style={{ marginBottom: "var(--gap-bagian)", display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Penyedia AI"
          keterangan="Model, batas token, dan batas biaya bulanan per asisten. Kunci API-nya ada di halaman Kredensial."
          ikon={<Bot size={19} />}
        />
      </div>

      {/*
        Halaman ini sebelumnya dibuka langsung dengan angka biaya bulan
        berjalan lalu tiga kartu asisten berisi dropdown model. Yang hilang:
        pernyataan bahwa halaman ini soal BIAYA & MESIN, sementara "cara
        menjawab" ada di halaman Asisten. Tanpa itu, dua halaman terlihat
        mengatur hal yang sama dengan kata yang berbeda.
      */}
      <PanduanHalaman
        untuk={
          <>
            Halaman ini menentukan <strong>mesin dan biaya</strong>: model mana yang dipakai tiap
            asisten, seberapa panjang jawabannya, dan berapa batas biaya per bulan. Gaya jawaban
            dan data yang boleh dibaca diatur di halaman <strong>Asisten</strong>.
          </>
        }
        langkah={[
          { teks: "Pasang kunci API penyedia di halaman Kredensial — tanpa itu, asisten tak bisa menjawab sama sekali" },
          { teks: "Pilih model per asisten: yang ringan untuk pertanyaan sederhana, yang kuat untuk penalaran" },
          { teks: "Tetapkan batas biaya per bulan supaya pemakaian tak melewati yang Anda rencanakan" },
        ]}
        catatan="Batas biaya berlaku untuk seluruh asisten digabung. Saat batas tercapai, asisten berhenti menjawab sampai bulan berikutnya — tak ada tagihan yang lewat diam-diam."
      />

      {!bolehKelola && (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat konfigurasi dan biaya AI, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:ai:manage</code>.
          </div>
        </div>
      )}

      {/*
        GALAT MUAT: barisnya sendiri, bertahan selama datanya tak ada.
        Toast di atas menghilang setelah 5 detik — cocok untuk hasil aksi,
        salah untuk menjelaskan kenapa halaman ini kosong.
      */}
      {galatMuat && (
        <p role="status" style={{ marginBottom: 12, fontSize: 12.5, color: "var(--danger)" }}>
          {galatMuat}
        </p>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : (
        <>
          {/* ── Pemakaian bulan ini — pertanyaan pertama, jawaban pertama ── */}
          <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Wallet size={16} style={{ color: C.mid }} />
              <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: 0 }}>
                Pemakaian {muatan?.pemakaian.bulan ?? ""}
              </h2>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: rincian.length ? 16 : 0 }}>
              <span style={{ fontSize: 30, fontWeight: 650, color: C.text, letterSpacing: "-0.02em" }}>
                {rupiah(terpakai)}
              </span>
              <span style={{ fontSize: 13, color: C.muted }}>
                {rincian.reduce((a, r) => a + r.panggilan, 0).toLocaleString("id-ID")} panggilan
              </span>
            </div>

            {/*
              Batas biaya hidup DI SINI, sekali — bukan di tiap kartu asisten.
              Nilainya memang satu untuk seluruh tenant (`periksaGerbangAi`
              menjumlah seluruh `ai_biaya_token`), dan versi pertama halaman ini
              mengulangnya di empat kartu dengan catatan kecil "dihitung dari
              seluruh asisten". Catatan kecil tak mengalahkan bentuk: empat
              kolom isian yang terlihat terpisah akan dibaca sebagai empat jatah.
            */}
            <div
              style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12, paddingTop: 14, marginTop: 14, borderTop: `1px solid ${C.border}`,
              }}
            >
              <div>
                <label htmlFor="batas-global" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                  Batas biaya per bulan
                </label>
                <input className="isian-fokus"
                  id="batas-global"
                  aria-label="Batas biaya AI per bulan untuk seluruh asisten"
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="Tanpa batas"
                  value={batasGlobal ?? ""}
                  disabled={!bolehKelola}
                  onChange={(e) => ubahBatasSemua(e.target.value === "" ? null : Number(e.target.value))}
                  style={GAYA_ISIAN}
                />
                <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                  Berlaku untuk seluruh asisten digabung.
                </p>
              </div>

              <div>
                <label htmlFor="mode-global" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                  Saat batas tercapai
                </label>
                <Pilihan className="isian-fokus"
                  id="mode-global"
                  aria-label="Tindakan saat batas biaya AI tercapai"
                  value={modeGlobal}
                  disabled={!bolehKelola || batasGlobal === null}
                  onChange={(e) => ubahModeSemua(e.target.value as "blokir" | "peringatkan")}
                  style={{ ...GAYA_ISIAN,
                    cursor: bolehKelola && batasGlobal !== null ? "pointer" : "not-allowed",
                    opacity: batasGlobal === null ? 0.6 : 1,
                  }}
                >
                  <option value="peringatkan">Tetap jalan, beri peringatan</option>
                  <option value="blokir">Hentikan panggilan AI</option>
                </Pilihan>
                <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                  {modeGlobal === "blokir"
                    ? "Asisten berhenti menjawab sampai bulan berikutnya."
                    : "Asisten tetap berjalan; biayanya bisa melewati batas."}
                </p>
              </div>

              {/*
                Tombolnya sendiri, bukan menumpang tombol Simpan tiap kartu.
                Mengubah batas menyentuh keempat baris config sekaligus; kalau
                penyimpanannya menumpang kartu, admin harus menekan Simpan empat
                kali untuk satu perubahan yang ia anggap satu.
              */}
              {/*
                `paddingTop` menyamai tinggi <label> + jaraknya (12px baris + 5px
                margin), bukan `align-items: flex-end`. Perataan-bawah membuat
                tombol turun mengikuti tinggi teks penjelas yang panjangnya
                berbeda-beda — di tangkapan layar sebelumnya ia melayang di
                tengah kalimat, tak sejajar dengan kotak isian mana pun.
              */}
              <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 22 }}>
                <button
                  type="button"
                  onClick={simpanBatas}
                  disabled={!bolehKelola || !batasBerubah || sedangSimpan === "__batas__"}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
                    fontWeight: 550, cursor: bolehKelola && batasBerubah ? "pointer" : "not-allowed",
                    border: "1px solid transparent",
                    background: batasBerubah && bolehKelola ? C.aksen : "var(--surface-subtle)",
                    color: batasBerubah && bolehKelola ? "#fff" : C.muted,
                    fontFamily: "inherit",
                  }}
                >
                  {sedangSimpan === "__batas__" ? <Loader2 size={14} className="berputar" /> : <Save size={14} />}
                  Simpan batas
                </button>
              </div>
            </div>

            {lewatBatas && (
              <div
                style={{
                  marginTop: 14, padding: "var(--pad-kartu)", borderRadius: 8,
                  display: "flex", gap: 10, alignItems: "flex-start",
                  background: modeGlobal === "blokir" ? "var(--danger-bg)" : "var(--warning-bg)",
                  border: `1px solid ${modeGlobal === "blokir" ? "var(--danger)" : "var(--warning)"}`,
                }}
              >
                <TrendingUp
                  size={16}
                  style={{
                    color: modeGlobal === "blokir" ? "var(--danger)" : "var(--warning)",
                    flexShrink: 0, marginTop: 1,
                  }}
                />
                <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
                  Pemakaian bulan ini ({rupiah(terpakai)}) sudah mencapai batas{" "}
                  {rupiah(batasGlobal ?? 0)}.{" "}
                  {modeGlobal === "blokir"
                    ? "Panggilan AI sedang dihentikan."
                    : "Panggilan tetap berjalan karena mode-nya peringatan."}
                </div>
              </div>
            )}

            {rincian.length === 0 ? (
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
                Belum ada panggilan AI bulan ini. Angka di sini dihitung dari biaya yang
                benar-benar tercatat per ronde, bukan dari perkiraan.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rincian.map((r) => (
                  <div
                    key={`${r.asisten}-${r.model}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, fontSize: 12.5,
                      padding: "var(--pad-baris)", borderRadius: 6,
                      background: "var(--surface-subtle)",
                    }}
                  >
                    <span style={{ color: C.text, fontWeight: 550, minWidth: 130 }}>
                      {PERAN[r.asisten]?.nama ?? r.asisten}
                    </span>
                    <span style={{ color: C.muted, flex: 1, fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}>
                      {r.model}
                    </span>
                    <span style={{ color: C.muted, whiteSpace: "nowrap" }}>
                      {r.panggilan.toLocaleString("id-ID")}×
                    </span>
                    <span style={{ color: C.text, fontWeight: 600, whiteSpace: "nowrap", minWidth: 84, textAlign: "right" }}>
                      {rupiah(r.idr)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/*
            ── Satu kartu per asisten, BERDAMPINGAN ──

            Sebelumnya `flexDirection: column` — empat kartu bertumpuk, dan di
            layar 2560px hasilnya kolom 900px dengan 1440px kosong di
            sampingnya. Empat kartu yang isinya SETARA (penyedia · model ·
            token) justru paling mudah dibandingkan saat berjajar: mata
            memindai satu baris "Model" melintasi keempatnya, alih-alih
            menggulir dan mengingat.

            `auto-fit` + `minmax`, bukan jumlah kolom yang dipaku: di layar
            sempit ia turun sendiri jadi satu kolom tanpa media query. 460px
            adalah lebar terkecil yang masih memuat grid tiga kolom di
            dalamnya tanpa memaksa label membungkus.
          */}
          <div
            style={{
              display: "grid",
              /*
                DUA kolom, bukan `auto-fit`.

                `auto-fit minmax(460px, 1fr)` memberi TIGA kolom di layar
                lebar — dan asistennya ada EMPAT, jadi yang keempat turun
                sendirian ke baris kedua dengan dua slot kosong di sampingnya.
                Terlihat di tangkapan layar founder: barisan tak simetris yang
                justru menarik mata ke ruang kosongnya.

                Empat kartu setara paling tenang dibaca sebagai 2×2. Angkanya
                tetap (`repeat(2, …)`) karena JUMLAH asistennya tetap empat —
                membiarkan browser menebak kolom untuk himpunan yang jumlahnya
                sudah diketahui hanya memindahkan keputusan ke lebar layar.
              */
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "var(--gap-grid)",
              /*
                `stretch`, bukan `start`: kartu dalam satu baris jadi
                setinggi baris itu. Dengan `start`, tinggi tiap kartu
                mengikuti panjang keterangannya sendiri — dan di gambar
                founder ketiganya berakhir di garis bawah yang berbeda-beda,
                dengan tombol Simpan melayang di tiga ketinggian.
              */
              alignItems: "stretch",
            }}
          >
            {(muatan?.data ?? []).map((asli) => {
              const k = gabung(asli);
              // HANYA model/token. Batas & mode punya tombolnya sendiri di
              // kartu Pemakaian; tanpa pemisahan ini, mengubah batas global
              // menyalakan tombol Simpan di keempat kartu dan menyiratkan
              // empat perubahan berbeda yang harus dikonfirmasi satu per satu.
              const d = draf[k.asisten];
              const berubah = Boolean(d && (d.model !== undefined || d.max_token !== undefined || d.aktif !== undefined || d.penyedia !== undefined));
              const peran = PERAN[k.asisten] ?? { nama: k.asisten, kerja: "" };
              const idPenyedia = `penyedia-${k.asisten}`;
              const idModel = `model-${k.asisten}`;
              const metaPenyedia = muatan?.penyedia_tersedia.find((p) => p.id === k.penyedia);
              const idToken = `token-${k.asisten}`;

              const modelDipilih = muatan?.model_tersedia.find((m) => m.id === k.model);
              // Peringatan, bukan larangan: Haiku untuk asisten pemilik bisa saja
              // pilihan sadar demi biaya. Yang tak boleh terjadi adalah pilihan
              // itu terlihat seperti tak ada masalah.
              const terlaluRingan = peran.butuhPenalaran && MODEL_RINGAN.has(k.model);
              // Perkiraan dihitung ulang di klien dari angka yang dikirim server,
              // supaya slider max_token memberi umpan balik SEBELUM disimpan —
              // angka yang baru muncul setelah menyimpan tak membantu memilih.
              const perkiraan = modelDipilih
                ? Math.round(
                    ((1500 / 1_000_000) * modelDipilih.masukPerMTok +
                      (Number(k.max_token) / 1_000_000) * modelDipilih.keluarPerMTok) *
                      kurs,
                  )
                : k.perkiraan_per_panggilan_idr;

              return (
                /*
                  Kartu adalah KOLOM setinggi penuh.

                  `alignItems: stretch` di grid membuat KOTAKNYA setinggi
                  baris, tetapi isinya tetap menumpuk dari atas — jadi
                  keterangan yang lebih pendek menyisakan lubang di bawah dan
                  tombol Simpan berhenti di ketinggian yang berbeda-beda antar
                  kartu (terlihat jelas di tangkapan layar founder).

                  Dengan `flex column` + `height: 100%`, baris terakhir bisa
                  didorong ke dasar lewat `marginTop: auto` — keempat tombol
                  Simpan sejajar, dan mata punya garis dasar yang sama untuk
                  membandingkan.
                */
                <section
                  key={k.asisten}
                  style={{
                    ...GAYA_KARTU,
                    padding: "var(--pad-kartu-lega)",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                      {peran.nama}
                    </h3>
                    {!k.tersimpan && (
                      <span
                        style={{
                          fontSize: 11, padding: "var(--pad-lencana)", borderRadius: 999,
                          whiteSpace: "nowrap", color: C.muted,
                          background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
                        }}
                      >
                        Pakai bawaan
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.6, margin: "0 0 14px" }}>
                    {peran.kerja}
                  </p>

                  {/*
                    DUA kolom, bukan `auto-fit`. `auto-fit` dengan empat kontrol
                    menghasilkan tiga di baris atas dan satu yatim di bawah —
                    terlihat di tangkapan layar pertama, dan bacaannya patah.
                    Sekarang isinya memang dua: model & batas token. Batas biaya
                    pindah ke kartu Pemakaian karena nilainya SATU untuk seluruh
                    tenant, dan mengulanginya di tiap kartu membuat orang mengira
                    tiap asisten punya jatah sendiri.
                  */}
                  {/*
                    Tiga isian SELALU satu baris di dalam kartu.

                    `auto-fit minmax(240px)` membuat jumlah kolomnya bergantung
                    lebar kartu — dan sesudah kartunya sendiri jadi 2 kolom,
                    hasilnya berbeda-beda antar kartu: satu memuat tiga isian
                    sebaris, satu lagi dua-lalu-satu. Empat kartu yang isinya
                    identik jadi tampak punya bentuk berbeda-beda, dan mata
                    kehilangan pasangan label↔isian antar kartu.

                    `minmax(0, 1fr)` — bukan `auto` — supaya `<Pilihan>` yang
                    isinya panjang tak memaksa kolomnya melebar melewati
                    sepertiga kartu.
                  */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    <div>
                      <label htmlFor={idPenyedia} style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                        Penyedia
                      </label>
                      <Pilihan className="isian-fokus"
                        id={idPenyedia}
                        aria-label={`Penyedia AI untuk ${peran.nama}`}
                        value={k.penyedia}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { penyedia: e.target.value })}
                        style={{ ...GAYA_ISIAN, cursor: bolehKelola ? "pointer" : "not-allowed" }}
                      >
                        {(muatan?.penyedia_tersedia ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </Pilihan>
                      {metaPenyedia && (
                        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                          Kunci <code>{metaPenyedia.kunciKredensial}</code> dipasang di{" "}
                          {/*
                            Bergaris bawah, BUKAN hanya berwarna. Tautan di
                            tengah kalimat yang hanya dibedakan warna tak
                            terlihat sebagai tautan bagi pengguna buta warna —
                            axe menandainya `link-in-text-block` (WCAG 1.4.1),
                            dan itu benar: warnanya satu-satunya penanda.
                          */}
                          <a href="/pengaturan/kredensial" style={{ color: C.aksen, textDecoration: "underline" }}>
                            halaman Kredensial
                          </a>
                          .
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor={idModel} style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                        Model
                      </label>
                      <Pilihan
                        className="isian-fokus"
                        id={idModel}
                        // `aria-label` eksplisit meski `<label htmlFor>` sudah
                        // ada: halaman ini punya EMPAT kartu dengan kontrol
                        // bernama sama, jadi "Model" saja tak memberi tahu
                        // pembaca layar model milik asisten yang mana.
                        aria-label={`Model AI untuk ${peran.nama}`}
                        value={k.model}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { model: e.target.value })}
                        style={{ ...GAYA_ISIAN, cursor: bolehKelola ? "pointer" : "not-allowed" }}
                      >
                        {(muatan?.model_tersedia ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </Pilihan>
                      {modelDipilih && (
                        <p
                          style={{
                            fontSize: 11.5, lineHeight: 1.55, margin: "6px 0 0",
                            color: terlaluRingan ? "var(--warning)" : C.muted,
                          }}
                        >
                          {terlaluRingan
                            ? `Terlalu ringan untuk ${peran.nama.toLowerCase()} — tugas ini butuh penalaran bertingkat. Pertimbangkan Sonnet atau Opus.`
                            : modelDipilih.cocokUntuk}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor={idToken} style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                        Batas token jawaban
                      </label>
                      <input className="isian-fokus"
                        id={idToken}
                        aria-label={`Batas token jawaban untuk ${peran.nama}`}
                        type="number"
                        min={1}
                        max={64000}
                        step={256}
                        value={k.max_token}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { max_token: Number(e.target.value) })}
                        style={GAYA_ISIAN}
                      />
                      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                        Perkiraan {rupiah(perkiraan)} per panggilan.
                      </p>
                    </div>

                  </div>

                  {/*
                    `marginTop: auto` mendorong baris ini ke DASAR kartu.

                    Inilah yang membuat keempat tombol Simpan sejajar meski
                    keterangan tiap asisten berbeda panjangnya. Tanpa ini,
                    `stretch` hanya meninggikan kotaknya dan menyisakan lubang
                    di bawah isi — kartu jadi tinggi tanpa alasan yang
                    terlihat.
                  */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", paddingTop: 14 }}>
                    <Saklar
                      nyala={k.aktif}
                      nonaktif={!bolehKelola}
                      onUbah={(v) => ubah(k.asisten, { aktif: v })}
                      label="Asisten aktif"
                    />

                    <div style={{ flex: 1 }} />

                    <button
                      type="button"
                      onClick={() => simpan(asli)}
                      disabled={!bolehKelola || !berubah || sedangSimpan === k.asisten}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
                        fontWeight: 550, cursor: bolehKelola && berubah ? "pointer" : "not-allowed",
                        border: "1px solid transparent",
                        background: berubah && bolehKelola ? C.aksen : "var(--surface-subtle)",
                        color: berubah && bolehKelola ? "#fff" : C.muted,
                        fontFamily: "inherit",
                      }}
                    >
                      {sedangSimpan === k.asisten ? (
                        <Loader2 size={14} className="berputar" />
                      ) : (
                        <Save size={14} />
                      )}
                      Simpan
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
