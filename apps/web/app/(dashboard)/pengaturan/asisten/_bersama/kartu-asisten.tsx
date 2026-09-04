"use client";

/**
 * Isi halaman satu asisten — dipakai keempat sub-halaman.
 *
 * Dibuat sebagai komponen, bukan disalin empat kali: sebelum pemecahan,
 * keempat asisten dirender dari SATU `.map()`, jadi perilakunya dijamin sama.
 * Menyalin JSX-nya ke empat berkas akan membuang jaminan itu — dan cacat yang
 * lahir dari situ (satu halaman lupa `disabled`, satu lagi memakai label
 * berbeda) tak akan terlihat sampai seseorang membandingkannya berdampingan.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { PanduanHalaman } from "@/components/panduan-halaman";
import { PilihanKartu } from "@/components/pilihan-kartu";
import {
  PAKAI_TOOL,
  PERAN,
  SIFAT_BICARA,
  type Konfigurasi,
  type Muatan,
  type SifatBicara,
} from "./tipe";

export function KartuAsisten({ asisten }: { asisten: string }) {
  const bolehKelola = useIzin("settings:ai:manage");

  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [draf, setDraf] = useState<Partial<Konfigurasi>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [menyamakan, setMenyamakan] = useState(false);
  const [toast, setToast] = useState<{ tipe: "ok" | "salah"; pesan: string } | null>(null);

  const ambil = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const r = await api.get<Muatan>("/api/v1/ai/config");
      setMuatan(r.data);
    } catch {
      // Kegagalan muat DITAMPILKAN, bukan jadi halaman kosong: kartu kosong
      // tak bisa dibedakan dari "belum pernah diatur", dan orang akan mengira
      // pengaturannya hilang.
      setGalat("Konfigurasi asisten tidak bisa dimuat.");
    } finally {
      setMemuat(false);
    }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `ambil()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  useEffect(() => { queueMicrotask(() => { void ambil(); }); }, [ambil]);

  const asli = (muatan?.data ?? []).find((k) => k.asisten === asisten);
  const k = asli ? { ...asli, ...draf } : null;
  const berubah = Object.keys(draf).length > 0;
  const nama = PERAN[asisten] ?? asisten;
  const pakaiTool = PAKAI_TOOL.has(asisten);

  async function simpan() {
    if (!asli || !k) return;
    setMenyimpan(true);
    try {
      await api.put(`/api/v1/ai/config/${asisten}`, {
        prompt_sistem: k.prompt_sistem,
        sifat_bicara: k.sifat_bicara ?? [],
        maks_ronde: k.maks_ronde,
        tool_aktif: k.tool_aktif,
      });
      setDraf({});
      await ambil();
      setToast({ tipe: "ok", pesan: `Perilaku ${nama} tersimpan` });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "salah", pesan: p ?? "Gagal menyimpan" });
    } finally {
      setMenyimpan(false);
    }
  }

  /**
   * Menyamakan sifat SELURUH asisten dengan yang sedang tampil.
   *
   * Memakai nilai DRAF, bukan yang tersimpan: orang yang baru mengklik dua
   * sifat lalu menekan "terapkan ke semua" jelas bermaksud menyebarkan yang
   * baru ia pilih. Memakai nilai tersimpan akan menyebarkan yang LAMA —
   * benar secara harfiah, dan mengejutkan bagi siapa pun yang memakainya.
   */
  async function terapkanKeSemua() {
    if (!k) return;
    setMenyamakan(true);
    try {
      await api.put("/api/v1/ai/config/sifat/semua", {
        sifat_bicara: k.sifat_bicara ?? [],
      });
      /*
        Kunci dibuang lewat `delete` pada salinan, bukan lewat destructuring
        ber-variabel-buangan.

        Bentuk `const { sifat_bicara: _dibuang, ...sisa } = d` menyisakan
        variabel yang tak pernah dibaca, dan `@typescript-eslint/no-unused-vars`
        berambang NOL di repo ini — jadi ia memerahkan CI terlepas dari
        awalan garis bawahnya.
      */
      setDraf((d) => {
        const sisa = { ...d };
        delete sisa.sifat_bicara;
        return sisa;
      });
      await ambil();
      setToast({ tipe: "ok", pesan: "Sifat diterapkan ke semua asisten" });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "salah", pesan: p ?? "Gagal menyamakan sifat" });
    } finally {
      setMenyamakan(false);
    }
  }

  if (memuat) {
    return (
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat…
      </div>
    );
  }

  if (galat || !k) {
    return (
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", color: C.danger, fontSize: 13 }}>
        {galat ?? `Asisten "${asisten}" tidak ditemukan dalam konfigurasi.`}
      </div>
    );
  }

  // NULL = semua tool yang berizin. Ditampilkan tercentang semua supaya
  // keadaan "belum diatur" terlihat sebagaimana ia berlaku.
  const aktif = k.tool_aktif;
  const semuaAktif = aktif === null;

  const jmlTool = muatan?.tool_tersedia?.length ?? 0;
  const jmlAktif = semuaAktif ? jmlTool : (aktif?.length ?? 0);

  return (
    <>
      {/*
        Panduan mendahului kontrol.

        Sebelumnya halaman ini dibuka langsung dengan textarea "Instruksi
        tambahan" yang kosong — kontrol paling abstrak di seluruh halaman
        berdiri paling depan, tanpa satu kalimat pun yang menyatakan apa yang
        sedang diatur. Founder menyebutnya "menerka-nerka", dan itu tepat.
      */}
      <PanduanHalaman
        untuk={
          <>
            Halaman ini mengatur <strong>cara {nama} menjawab</strong>: gaya bahasanya, seberapa
            dalam ia boleh menggali data, dan data mana yang boleh ia baca.
            {pakaiTool
              ? " Modelnya sendiri (dan batas biayanya) diatur di halaman Penyedia AI."
              : " Asisten ini tidak memakai tool — ia hanya mengolah angka yang sudah dihitung sistem."}
          </>
        }
        langkah={
          pakaiTool
            ? [
                { teks: "Tulis instruksi tambahan bila ada gaya jawaban yang Anda inginkan — boleh dikosongkan", selesai: Boolean(k.prompt_sistem) },
                { teks: "Tentukan batas langkah: makin banyak, makin dalam galiannya, makin mahal tiap pertanyaan" },
                {
                  teks: `Centang data yang boleh dibaca — sekarang ${jmlAktif} dari ${jmlTool}`,
                  selesai: jmlAktif > 0,
                },
              ]
            : [
                { teks: "Tulis instruksi tambahan bila ada gaya jawaban yang Anda inginkan — boleh dikosongkan", selesai: Boolean(k.prompt_sistem) },
              ]
        }
        catatan={
          pakaiTool
            ? "Mencentang data di sini tidak memberi wewenang baru kepada siapa pun: penanya tetap hanya melihat yang memang boleh ia lihat. Yang tak dicentang tak akan dibaca asisten sama sekali."
            : undefined
        }
      />

    <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
      {/*
        Nama & keterangan asisten TIDAK diulang di sini — keduanya sudah jadi
        judul halaman (`layout.tsx` memilihnya dari rute). Versi pertama
        menampilkan keduanya, dan hasilnya "Asisten web" berikut kalimat yang
        sama persis muncul dua kali berjarak 40px. Pengulangan sedekat itu
        membuat pembaca mengira ia salah lihat, bukan memperjelas.
      */}
      {/*
        SIFAT — pilihan pertama di halaman, sebelum instruksi tambahan.

        Urutannya bukan selera: "asisten ini boleh berpendapat atau tidak"
        mengubah arti kotak instruksi di bawahnya. Menaruhnya sesudah membuat
        orang menulis instruksi gaya lebih dulu, lalu menemukan saklar yang
        membuat tulisannya mubazir.

        `ganda` — keduanya bisa menyala BERSAMAAN. Versi pertama memodelkannya
        saling meniadakan, dan founder langsung menemukan cacatnya: tak ada
        alasan asisten yang boleh menyarankan jadi tak boleh menyapa.
      */}
      <PilihanKartu
        nama="sifat_bicara"
        label="Sifat asisten"
        ganda
        opsi={SIFAT_BICARA}
        nilai={k.sifat_bicara ?? []}
        nonaktif={!bolehKelola}
        onUbah={(nilai) =>
          setDraf((d) => {
            const kini = new Set(d.sifat_bicara ?? k.sifat_bicara ?? []);
            if (kini.has(nilai as SifatBicara)) kini.delete(nilai as SifatBicara);
            else kini.add(nilai as SifatBicara);
            // Urutan disamakan dengan katalog, bukan urutan klik: nilai yang
            // sama dalam urutan berbeda akan terlihat sebagai perubahan dan
            // menyalakan tombol Simpan tanpa ada yang benar-benar berubah.
            return {
              ...d,
              sifat_bicara: SIFAT_BICARA.map((s) => s.nilai).filter((s) => kini.has(s)),
            };
          })
        }
        keterangan={
          <>
            Tak satu pun dipilih = asisten hanya menjawab dari data. Apa pun pilihannya, ia
            tetap dilarang mengarang angka dan wajib menyebut sumber tiap angka yang
            dipakainya — yang berubah hanya cara bicaranya.
          </>
        }
      />

      {bolehKelola ? (
        <div style={{ margin: "-4px 0 14px" }}>
          <button
            type="button"
            onClick={() => void terapkanKeSemua()}
            disabled={menyamakan}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "none", border: "none", padding: 0,
              fontSize: "var(--t-kecil)", fontWeight: 550,
              color: menyamakan ? C.muted : C.navy,
              cursor: menyamakan ? "default" : "pointer",
              textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            {menyamakan ? <Loader2 size={12} className="berputar" /> : <Copy size={12} />}
            Terapkan sifat ini ke semua asisten
          </button>
          <span style={{ fontSize: "var(--t-kecil)", color: C.muted, marginLeft: 8 }}>
            Menimpa sifat asisten lain — pengaturan lainnya tidak tersentuh.
          </span>
        </div>
      ) : null}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="prompt" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
          Instruksi tambahan
        </label>
        <textarea
          className="isian-fokus"
          id="prompt"
          aria-label={`Instruksi tambahan untuk ${nama}`}
          rows={3}
          maxLength={8000}
          placeholder="Mis. sebut nilai dalam jutaan rupiah, dan selalu urutkan dari yang paling mendesak."
          value={k.prompt_sistem ?? ""}
          disabled={!bolehKelola}
          onChange={(e) => setDraf((d) => ({ ...d, prompt_sistem: e.target.value || null }))}
          style={{ ...GAYA_ISIAN, resize: "vertical", lineHeight: 1.6 }}
        />
        <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
          Ditambahkan di bawah instruksi bawaan, tidak menggantikannya. Dikirim ulang tiap
          langkah — instruksi panjang menambah biaya tiap pertanyaan.
        </p>
      </div>

      {pakaiTool ? (
        <>
          {/*
            Isian dan penjelasnya BERDAMPINGAN, bukan bertumpuk dalam kolom
            200px.

            Bentuk sebelumnya membungkus label, input, DAN kalimat penjelas
            dalam satu kotak selebar 200px. Di halaman selebar `--w-page`,
            hasilnya terlihat di tangkapan layar: kalimat tiga baris sempit
            berdiri sendirian di kiri dengan pita kosong selebar layar di
            sampingnya — dan pita itu membuat "Batas langkah" tampak terputus
            dari "Data yang boleh dibaca" di bawahnya.

            Yang memang perlu sempit hanya kotak angkanya. Penjelasnya
            mengambil sisa ruang, dengan batas baca ~60ch supaya ia tak ikut
            memanjang melewati kenyamanan mata.
          */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ronde" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
              Batas langkah
            </label>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <input
                className="isian-fokus"
                id="ronde"
                aria-label={`Batas langkah untuk ${nama}`}
                type="number"
                min={1}
                max={12}
                value={k.maks_ronde}
                disabled={!bolehKelola}
                onChange={(e) => setDraf((d) => ({ ...d, maks_ronde: Number(e.target.value) }))}
                style={{ ...GAYA_ISIAN, width: 110, flexShrink: 0 }}
              />
              <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "8px 0 0", maxWidth: "60ch" }}>
                Berapa kali asisten boleh membaca data sebelum wajib menjawab. Tiap langkah
                ditagih.
              </p>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 550, color: C.mid, margin: "0 0 6px" }}>
              Data yang boleh dibaca
            </p>
            {/*
              Daftar 15 tool jadi DUA KOLOM di layar lebar.

              Satu kolom di halaman selebar `--w-page` berarti 15 baris
              menuntut gulir panjang sementara separuh layar kosong — dan
              memutuskan tool mana yang dimatikan justru menuntut melihat
              daftarnya sekaligus, bukan sepotong demi sepotong.

              `auto-fit` + `minmax(340px, 1fr)`: turun sendiri jadi satu kolom
              di layar sempit, tanpa media query. 340px adalah lebar terkecil
              yang masih memuat nama tool + keterangannya tanpa membungkus
              tiap dua kata.
            */}
            {/*
              Kartu bersama — sama bentuknya dengan "Sifat asisten" di atas.

              Sebelum 2026-08-15 blok ini checkbox telanjang sementara Sifat
              sudah berupa kartu: DUA bentuk berbeda untuk pekerjaan yang sama
              (memilih dari daftar) di SATU layar. Founder menyebutnya "bikin
              ga konsisten", dan itu tepat.

              `minLebar` 340 dipertahankan dari versi checkbox: di bawah itu
              nama tool + keterangannya mulai membungkus tiap dua kata.
            */}
            <PilihanKartu
              nama="tool_aktif"
              label=""
              ganda
              minLebar={340}
              nonaktif={!bolehKelola}
              nilai={(muatan?.tool_tersedia ?? [])
                .filter((t) => semuaAktif || (aktif?.includes(t.nama) ?? false))
                .map((t) => t.nama)}
              opsi={(muatan?.tool_tersedia ?? []).map((tool) => ({
                nilai: tool.nama,
                label: tool.label ?? tool.nama,
                detail: (
                  <>
                    {tool.keterangan}
                    {/*
                      Kunci teknis TIDAK dibuang — yang membaca audit log atau
                      dokumentasi API masih butuh jembatannya. TANPA `opacity`:
                      audit a11y runtime menolak versi ber-`opacity: 0.75`
                      (6 node gagal kontras WCAG AA di tiga halaman asisten).
                    */}
                    <code style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted, marginTop: 3 }}>
                      {tool.nama}
                    </code>
                  </>
                ),
              }))}
              onUbah={(nama) => {
                // Dari NULL, pencentangan pertama harus MEMBEKUKAN keadaan
                // "semua" jadi daftar nyata — kalau tidak, mematikan satu tool
                // terbaca sebagai mematikan semuanya.
                const dasar = semuaAktif
                  ? (muatan?.tool_tersedia ?? []).map((x) => x.nama)
                  : [...(aktif ?? [])];
                const baru = dasar.includes(nama)
                  ? dasar.filter((n) => n !== nama)
                  : [...new Set([...dasar, nama])];
                setDraf((d) => ({ ...d, tool_aktif: baru }));
              }}
            />
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
              Mematikan semuanya membuat asisten tetap menjawab, tetapi tanpa membaca data apa
              pun. Pengguna juga tetap butuh izinnya masing-masing — mencentang di sini tidak
              memberi akses baru.
            </p>
          </div>
        </>
      ) : (
        <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: 0 }}>
          Asisten ini tidak memakai tool — ia menulis dari angka yang sudah dihitung sistem,
          jadi batas langkah dan pilihan data tidak berlaku.
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 14 }}>
        {toast && (
          <span
            role="status"
            style={{ fontSize: 12, color: toast.tipe === "ok" ? C.green : C.danger }}
          >
            {toast.pesan}
          </span>
        )}
        <button
          type="button"
          onClick={simpan}
          disabled={!bolehKelola || !berubah || menyimpan}
          style={tombolSimpan(bolehKelola && berubah)}
        >
          {menyimpan ? <Loader2 size={14} className="berputar" /> : <Save size={14} />}
          Simpan
        </button>
      </div>
    </section>
    </>
  );
}

function tombolSimpan(hidup: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: "var(--radius-sm)",
    border: "none",
    background: hidup ? C.navy : "var(--surface-subtle)",
    color: hidup ? "#fff" : C.muted,
    fontSize: 13, fontWeight: 600,
    cursor: hidup ? "pointer" : "not-allowed",
    fontFamily: "inherit",
  };
}
