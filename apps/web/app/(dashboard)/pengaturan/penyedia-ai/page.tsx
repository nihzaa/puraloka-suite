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

import { useCallback, useEffect, useReducer, useState } from "react";
import { api } from "@/lib/api";
import { Bot, Info, Loader2, Save, TrendingUp, Wallet } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--naik-1)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--pad-baris)",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  background: "var(--surface)",
  color: C.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

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

function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

export default function PenyediaAiPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const bolehKelola = hasPerm("settings:ai:manage");

  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [draf, setDraf] = useState<Record<string, Partial<Konfigurasi>>>({});
  const [sedangSimpan, setSedangSimpan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<Muatan>("/api/v1/ai/config");
      setMuatan(r.data);
      setDraf({});
    } catch {
      setToast({ tipe: "err", pesan: "Gagal memuat konfigurasi AI" });
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

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
      for (const asli of muatan?.data ?? []) {
        const nilai = { ...asli, ...draf[asli.asisten] };
        await api.put(`/api/v1/ai/config/${asli.asisten}`, {
          penyedia: nilai.penyedia,
          model: nilai.model,
          max_token: Number(nilai.max_token),
          aktif: nilai.aktif,
          batas_bulanan_idr: nilai.batas_bulanan_idr,
          mode_batas: nilai.mode_batas,
        });
      }
      setToast({ tipe: "ok", pesan: "Batas biaya tersimpan untuk seluruh asisten" });
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
    // `--w-form`, sama seperti halaman Kredensial: satu kolom kartu yang tiap
    // barisnya memuat kalimat penjelas. Lebar penuh membuat kalimatnya
    // memanjang melewati ~75 karakter dan melelahkan dibaca.
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-form)",
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

      {!bolehKelola && (
        <div style={{ ...card, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat konfigurasi dan biaya AI, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:ai:manage</code>.
          </div>
        </div>
      )}

      {memuat ? (
        <div style={{ ...card, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : (
        <>
          {/* ── Pemakaian bulan ini — pertanyaan pertama, jawaban pertama ── */}
          <section style={{ ...card, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
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
                <input
                  id="batas-global"
                  aria-label="Batas biaya AI per bulan untuk seluruh asisten"
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="Tanpa batas"
                  value={batasGlobal ?? ""}
                  disabled={!bolehKelola}
                  onChange={(e) => ubahBatasSemua(e.target.value === "" ? null : Number(e.target.value))}
                  style={inputStyle}
                />
                <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                  Berlaku untuk seluruh asisten digabung.
                </p>
              </div>

              <div>
                <label htmlFor="mode-global" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                  Saat batas tercapai
                </label>
                <select
                  id="mode-global"
                  aria-label="Tindakan saat batas biaya AI tercapai"
                  value={modeGlobal}
                  disabled={!bolehKelola || batasGlobal === null}
                  onChange={(e) => ubahModeSemua(e.target.value as "blokir" | "peringatkan")}
                  style={{
                    ...inputStyle,
                    cursor: bolehKelola && batasGlobal !== null ? "pointer" : "not-allowed",
                    opacity: batasGlobal === null ? 0.6 : 1,
                  }}
                >
                  <option value="peringatkan">Tetap jalan, beri peringatan</option>
                  <option value="blokir">Hentikan panggilan AI</option>
                </select>
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

          {/* ── Satu kartu per asisten ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

              const lewatBatas =
                k.batas_bulanan_idr !== null && terpakai >= k.batas_bulanan_idr;

              return (
                <section key={k.asisten} style={{ ...card, padding: "var(--pad-kartu-lega)" }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                    <div>
                      <label htmlFor={idPenyedia} style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                        Penyedia
                      </label>
                      <select
                        id={idPenyedia}
                        aria-label={`Penyedia AI untuk ${peran.nama}`}
                        value={k.penyedia}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { penyedia: e.target.value })}
                        style={{ ...inputStyle, cursor: bolehKelola ? "pointer" : "not-allowed" }}
                      >
                        {(muatan?.penyedia_tersedia ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      {metaPenyedia && (
                        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                          Kunci <code>{metaPenyedia.kunciKredensial}</code> dipasang di{" "}
                          <a href="/pengaturan/kredensial" style={{ color: C.aksen, textDecoration: "none" }}>
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
                      <select
                        id={idModel}
                        // `aria-label` eksplisit meski `<label htmlFor>` sudah
                        // ada: halaman ini punya EMPAT kartu dengan kontrol
                        // bernama sama, jadi "Model" saja tak memberi tahu
                        // pembaca layar model milik asisten yang mana.
                        aria-label={`Model AI untuk ${peran.nama}`}
                        value={k.model}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { model: e.target.value })}
                        style={{ ...inputStyle, cursor: bolehKelola ? "pointer" : "not-allowed" }}
                      >
                        {(muatan?.model_tersedia ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
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
                      <input
                        id={idToken}
                        aria-label={`Batas token jawaban untuk ${peran.nama}`}
                        type="number"
                        min={1}
                        max={64000}
                        step={256}
                        value={k.max_token}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { max_token: Number(e.target.value) })}
                        style={inputStyle}
                      />
                      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                        Perkiraan {rupiah(perkiraan)} per panggilan.
                      </p>
                    </div>

                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.mid, cursor: bolehKelola ? "pointer" : "default" }}>
                      <input
                        type="checkbox"
                        checked={k.aktif}
                        disabled={!bolehKelola}
                        onChange={(e) => ubah(k.asisten, { aktif: e.target.checked })}
                        style={{ cursor: bolehKelola ? "pointer" : "default" }}
                      />
                      Asisten aktif
                    </label>

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
