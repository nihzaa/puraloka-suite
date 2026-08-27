"use client";

/**
 * ASISTEN — obrolan di rail, bukan halaman tersendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DI RAIL, DAN KENAPA ITU LEBIH BAIK DARIPADA HALAMAN KHUSUS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-10: *"obrolan dengan asisten itu harusnya di sini, ngga usah
 * halaman khusus, dan bisa diperbesar obrolannya"*.
 *
 * Halaman `/asisten` sempat dibangun lalu DIBATALKAN, dan alasannya bukan
 * selera. Asisten dipakai SAMBIL melihat data: orang membuka daftar invoice,
 * melihat angka yang aneh, lalu bertanya. Halaman khusus memaksa ia
 * meninggalkan angka itu — menyalin nomornya ke kepala, pindah halaman,
 * bertanya dari ingatan. Rail membiarkan pertanyaan dan datanya berdampingan.
 *
 * TJS memakai halaman terpisah (`/dashboard/settings/owner-ai`). Ini titik di
 * mana Puraloka sengaja TIDAK menirunya.
 *
 * ── Tiga ukuran, dan kenapa bukan dua
 *
 *   RINGKAS   satu tombol. Keadaan diam; tak memakan tinggi rail.
 *   OBROLAN   percakapan di dalam rail (~360px). Cukup untuk tanya-jawab
 *             pendek sambil tetap melihat halaman di sebelahnya.
 *   LEBAR     panel besar menutupi layar. Untuk jawaban panjang dan
 *             penelusuran sumber, saat halaman di belakangnya tak lagi
 *             dilihat.
 *
 * Dua ukuran akan memaksa memilih antara "terlalu sempit untuk dibaca" dan
 * "menutupi data yang sedang ditanyakan" — padahal keduanya dibutuhkan pada
 * saat yang berbeda dalam satu percakapan yang sama.
 *
 * ── Posisi TETAP DI BAWAH (arahan founder)
 *
 * Kartu ini duduk tepat di atas Pengingat, di dasar rail, dan TIDAK boleh
 * dipindahkan ke atas meski isinya bertambah panjang.
 *
 * ⚠️ Bagian ini pernah menjelaskan mekanismenya SALAH: ia menulis bahwa
 * Pengingat ber-`marginTop: auto` sudah cukup, "kartu ini karena itu duduk
 * tepat di atasnya". Tidak. `marginTop: auto` pada Pengingat hanya memaku
 * PENGINGAT; Asisten tetap mengalir bersama kartu konteks.
 *
 * Diukur 2026-08-12 (/mandor, layar 1200px): Asisten berakhir 692, Pengingat
 * mulai 1130 — **438px celah kosong** di antaranya. Founder menunjukkannya
 * lewat tangkapan layar.
 *
 * Yang membuatnya benar adalah `marginTop: auto` pada `<section>` DI BAWAH,
 * bukan pada Pengingat. Penjelasan yang keliru soal mekanisme lebih berbahaya
 * daripada tak ada penjelasan: ia membuat pembaca berikutnya yakin perilakunya
 * sudah dijamin, dan tak memeriksanya.
 *
 * ── Warna
 *
 * `ARAH-VISUAL-2026.md` §3d: satu aksen per layar. Navy hanya untuk gelembung
 * pesan pengguna dan tombol kirim — keduanya satu hal ("suara Anda").
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";


interface Sumber {
  tool_tersedia: string[];
  entitas_dibaca: string[];
  ada_galat_tool: boolean;
}

/**
 * Usulan pencatatan yang MENUNGGU konfirmasi manusia.
 *
 * Sampai 2026-08-16 asisten bisa menyiapkan catatan lewat `siapkan_tulis`,
 * dan `grep` atas seluruh apps/web menemukan NOL pemanggilan
 * `/api/v1/ai/tulis`. Ia berkata "tekan tombol konfirmasi" untuk tombol yang
 * tak pernah ada, lalu tokennya kedaluwarsa 15 menit kemudian.
 */
interface UsulTulis {
  jenis: string;
  argumen: Record<string, unknown>;
}

/**
 * Usulan PERSETUJUAN — `jenis` + `entity_id` yang SUDAH diresolusi backend.
 *
 * Nomor urut yang diketik model sengaja TIDAK sampai ke sini: meresolusinya
 * dua kali (sekali di tool, sekali di UI) berarti daftarnya bisa berubah di
 * antaranya, dan orang menyetujui dokumen yang bukan ia baca.
 */
interface UsulSetujui {
  jenis: string;
  entityId: string;
}

interface Balasan {
  percakapan_id: string;
  jawaban: string;
  ronde: number;
  sumber: Sumber;
  peringatan: string | null;
  usul_tulis?: UsulTulis[];
  usul_setujui?: UsulSetujui | null;
}

interface Pesan {
  peran: "user" | "assistant";
  teks: string;
  sumber?: Sumber;
  peringatan?: string | null;
  usul?: UsulTulis[];
  /** Sudah dikonfirmasi/ditolak — kartunya berhenti menawarkan tombol. */
  usulSelesai?: "tersimpan" | "dibatalkan";
  setujui?: UsulSetujui | null;
  /** Sudah diputuskan — kartunya berhenti menawarkan tombol. */
  setujuiSelesai?: "disetujui" | "dibatalkan";
}

/** Nama jenis dalam bahasa yang dipakai orang, bukan nama kolom. */
/*
  Label kartu konfirmasi — WAJIB memuat SEMUA jenis di `ENTITAS_TULIS`.

  Jenis yang tak terdaftar di sini tetap tampil, tapi dengan kunci mentahnya
  (`pembayaran_masuk`) — dan itu justru yang berbahaya: kartunya terlihat
  setengah jadi tepat di layar tempat orang memutuskan menyimpan uang.

  Dua jenis terbaru sempat tertinggal beberapa jam sesudah backend-nya hidup.
  Pola yang sama dengan tombol konfirmasi yang tak pernah ada: setengah rantai
  bekerja, setengah lagi tidak, dan nol galat di antaranya.
*/
const LABEL_JENIS: Record<string, string> = {
  catatan_progres: "Catatan progres",
  temuan_punch: "Temuan punch list",
  kasbon: "Kasbon",
  pengeluaran: "Pengeluaran",
  permintaan_material: "Permintaan material",
  pembayaran_masuk: "Pembayaran masuk",
  absensi: "Absensi harian",
};

/*
  Label jenis PERSETUJUAN — cermin `JENIS_DIDUKUNG` di `lib/ai-setujui.ts`.
  Jenis tanpa label tetap tampil dengan kunci mentahnya, dan itu terbaca
  setengah jadi tepat di layar keputusan uang.
*/
const LABEL_SETUJUI: Record<string, string> = {
  kasbon: "Kasbon",
  project_expense: "Pengeluaran proyek",
  change_order: "Change order",
  estimate_version: "Versi estimasi",
  lessons_learned: "Lessons learned",
};

type Ukuran = "ringkas" | "obrolan" | "lebar";

/**
 * Merender `**tebal**` — dan HANYA itu.
 *
 * Model menulis markdown tanpa diminta ("Ada **11 proyek**"), dan tanpa
 * perenderan bintangnya muncul mentah. Markdown PENUH sengaja tidak dipakai:
 * teks ini berasal dari model, dan model bisa dibujuk lewat data yang
 * dibacanya (§5.3). Tautan dan gambar mengubah "teks yang salah" jadi "teks
 * yang bisa mengirim orang ke tempat lain". Penebalan tak punya sisi itu.
 */
function TeksJawaban({ teks }: { teks: string }) {
  const potongan = teks.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {potongan.map((p, i) =>
        i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

const CONTOH = [
  "Berapa proyek yang sedang berjalan?",
  "Berapa nilai invoice yang lewat tempo?",
  "Permintaan material apa yang menunggu?",
];

function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

export function RailAsisten() {
  const [ukuran, setUkuran] = useState<Ukuran>("ringkas");
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [draf, setDraf] = useState("");
  const [menunggu, setMenunggu] = useState(false);
  const [percakapanId, setPercakapanId] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [bolehChat, setBolehChat] = useState(false);
  const akhirRef = useRef<HTMLDivElement | null>(null);

  // Permission dibaca sesudah mount: `localStorage` tak ada saat render server,
  // dan membacanya langsung menghasilkan ketidakcocokan hidrasi.
  useEffect(() => { setBolehChat(hasPerm("ai:chat")); }, []);

  useEffect(() => {
    if (ukuran !== "ringkas") akhirRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pesan, menunggu, ukuran]);

  /*
   * Esc TIDAK ditangani di sini lagi.
   *
   * Sejak mode lebar memakai `DialogPolos` (`<dialog>` + `showModal()`),
   * Esc datang dari browser dan diteruskan lewat `onTutup`. Handler window
   * yang tersisa akan berjalan BERBARENGAN dengan penanganan bawaan — dua
   * jalur untuk satu tombol, dan yang kedua tak pernah diuji.
   *
   * Menghapus kode yang "kelihatannya tak berbahaya" seperti ini adalah
   * bagian dari pindah ke `<dialog>`, bukan sesudahnya: listener global yang
   * tertinggal justru penyebab Esc terasa berperilaku aneh di halaman lain.
   */

  /**
   * Konfirmasi usulan pencatatan — DUA langkah, dan itu inti pengamanannya.
   *
   *   1. `POST /ai/siapkan-tulis`  menerbitkan token, tak menulis apa pun
   *   2. `POST /ai/tulis`          memakai token, MENULIS satu baris
   *
   * Keduanya dipicu klik ini. Injeksi lewat dokumen bisa membuat model
   * mengusulkan apa pun; ia tak bisa menekan tombol, dan token yang tak
   * diklaim kedaluwarsa 15 menit kemudian tanpa mengubah apa pun.
   *
   * Kenapa dua panggilan, bukan satu: rutenya memang dirancang begitu
   * (migrasi 269), dan menggabungkannya di sini berarti membangun jalur tulis
   * KEDUA yang tak melewati gerbang token — persis yang `audit-tool-ai-read-only`
   * ada untuk mencegah.
   */
  const konfirmasiTulis = useCallback(
    async (indeks: number, usul: UsulTulis, setuju: boolean) => {
      if (!setuju) {
        setPesan((p) =>
          p.map((m, i) => (i === indeks ? { ...m, usulSelesai: "dibatalkan" as const } : m)),
        );
        return;
      }

      try {
        const siap = await api.post<{ token: string }>("/api/v1/ai/siapkan-tulis", {
          jenis: usul.jenis,
          ...usul.argumen,
        });
        await api.post("/api/v1/ai/tulis", { token: siap.data.token });

        setPesan((p) =>
          p.map((m, i) => (i === indeks ? { ...m, usulSelesai: "tersimpan" as const } : m)),
        );
      } catch (e) {
        // Kegagalan DITAMPILKAN di gelembungnya sendiri, bukan ditelan:
        // orang yang menekan Simpan lalu tak melihat apa-apa akan menekannya
        // lagi, dan token kedua menulis baris kedua.
        const pesanGalat =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menyimpan catatan.";
        setPesan((p) => [...p, { peran: "assistant", teks: pesanGalat }]);
      }
    },
    [],
  );

  /**
   * Menyetujui lewat DUA panggilan — persis seperti jalur tulis.
   *
   *   1. `POST /ai/preview-setujui`  menghitung dampaknya, menerbitkan token
   *   2. `POST /ai/setujui`          memakai token, MENYETUJUI
   *
   * Dipisah supaya token lahir dari KLIK, bukan dari kalimat model. Injeksi
   * lewat dokumen bisa membuat model memanggil `siapkan_setujui`; ia tak bisa
   * membuat manusia menekan tombol.
   *
   * Yang diteruskan `entityId` dari backend — bukan nomor urut. Lihat catatan
   * di `UsulSetujui`.
   */
  const konfirmasiSetujui = useCallback(
    async (indeks: number, usul: UsulSetujui, setuju: boolean) => {
      if (!setuju) {
        setPesan((p) =>
          p.map((m, i) => (i === indeks ? { ...m, setujuiSelesai: "dibatalkan" as const } : m)),
        );
        return;
      }

      try {
        const siap = await api.post<{ token: string }>("/api/v1/ai/preview-setujui", {
          jenis: usul.jenis,
          entity_id: usul.entityId,
        });
        await api.post("/api/v1/ai/setujui", { token: siap.data.token });

        setPesan((p) =>
          p.map((m, i) => (i === indeks ? { ...m, setujuiSelesai: "disetujui" as const } : m)),
        );
      } catch (e) {
        // Kegagalan DITAMPILKAN, bukan ditelan: orang yang menekan Setujui lalu
        // tak melihat apa-apa akan menekannya lagi — dan approval ganda pada
        // rantai bertingkat menaikkan level tanpa ada yang bermaksud.
        const pesanGalat =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menyetujui.";
        setPesan((p) => [...p, { peran: "assistant", teks: pesanGalat }]);
      }
    },
    [],
  );

  const kirim = useCallback(
    async (teks: string) => {
      const isi = teks.trim();
      if (!isi || menunggu) return;

      setGalat(null);
      setPesan((p) => [...p, { peran: "user", teks: isi }]);
      setDraf("");
      setMenunggu(true);
      if (ukuran === "ringkas") setUkuran("obrolan");

      try {
        const r = await api.post<Balasan>("/api/v1/ai/chat", {
          pesan: isi,
          ...(percakapanId ? { percakapan_id: percakapanId } : {}),
        });
        setPercakapanId(r.data.percakapan_id);
        setPesan((p) => [
          ...p,
          {
            peran: "assistant",
            teks: r.data.jawaban,
            sumber: r.data.sumber,
            peringatan: r.data.peringatan,
            usul: r.data.usul_tulis ?? [],
            setujui: r.data.usul_setujui ?? null,
          },
        ]);
      } catch (e) {
        // Pesan server ditampilkan apa adanya — ia sudah ditulis untuk dibaca
        // manusia ("Batas biaya AI bulan ini sudah tercapai"), dan
        // menggantinya dengan "terjadi kesalahan" membuang satu-satunya
        // petunjuk yang berguna.
        setGalat(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Asisten tidak bisa dihubungi. Coba lagi sebentar lagi.",
        );
        // Pertanyaannya DIKEMBALIKAN ke kotak isian. Mengetik ulang karena
        // kuota habis adalah hukuman untuk kesalahan yang bukan miliknya.
        setDraf(isi);
        setPesan((p) => p.slice(0, -1));
      } finally {
        setMenunggu(false);
      }
    },
    [menunggu, percakapanId, ukuran],
  );

  const lebar = ukuran === "lebar";

  const panel = (
    <section
      aria-labelledby="rail-asisten-judul"
      style={{
        // ── `marginTop: auto` ADA DI SINI, bukan hanya di Pengingat
        //
        // Kepala berkas ini sudah lama mengklaim kartu Asisten "duduk tepat di
        // atas Pengingat, di dasar rail" — dan klaim itu SALAH. Yang dipaku ke
        // bawah hanya `RailPengingat`; Asisten ikut mengalir bersama kartu
        // konteks di atasnya.
        //
        // Diukur di peramban 2026-08-12 (halaman /mandor, layar 1200px):
        //     Asisten   berakhir 692
        //     Pengingat mulai   1130      ← celah kosong 438px
        //
        // Founder menunjukkannya lewat tangkapan layar. Dengan `auto` di sini,
        // Asisten yang menyerap sisa ruang, jadi ia + Pengingat menempel jadi
        // satu blok di dasar rail — berapa pun kartu konteks di atasnya.
        //
        // HANYA kartu ini yang boleh `auto`. Diuji: memberi `auto` pada
        // KEDUANYA membuat flexbox MEMBAGI sisa ruang rata (210px + 210px),
        // dan celahnya justru bertahan. `RailPengingat` karena itu sengaja
        // TIDAK punya `marginTop` — catatannya ada di sana.
        marginTop: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        ...(lebar
          ? { width: "min(760px, 92vw)", height: "min(78vh, 720px)", boxShadow: "var(--naik-3, 0 20px 60px rgba(0,0,0,.28))" }
          : {}),
      }}
    >
      <header
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "var(--pad-kartu)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "grid", placeItems: "center", flexShrink: 0,
            width: 26, height: 26, borderRadius: "var(--rad-sedang)",
            background: "var(--navy-light)", color: "var(--navy)",
          }}
        >
          <Bot size={14} />
        </span>
        <h2
          id="rail-asisten-judul"
          style={{
            margin: 0, fontSize: "var(--t-kecil)", fontWeight: 700,
            letterSpacing: ".04em", textTransform: "uppercase", color: C.mid,
            flex: 1,
          }}
        >
          Asisten
        </h2>

        {ukuran !== "ringkas" && (
          <>
            <button
              type="button"
              onClick={() => setUkuran(lebar ? "obrolan" : "lebar")}
              aria-label={lebar ? "Perkecil obrolan" : "Perbesar obrolan"}
              style={tombolIkon}
            >
              {lebar ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setUkuran("ringkas")}
              aria-label="Tutup obrolan"
              style={tombolIkon}
            >
              <X size={13} />
            </button>
          </>
        )}
      </header>

      {ukuran === "ringkas" ? (
        <div style={{ padding: "var(--pad-kartu)" }}>
          <p style={{ margin: 0, fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.5 }}>
            Tanyakan apa saja tentang proyek, keuangan, dan gudang Anda.
            Asisten hanya <strong style={{ color: C.text, fontWeight: 600 }}>membaca</strong>.
          </p>
          <button
            type="button"
            onClick={() => setUkuran("obrolan")}
            disabled={!bolehChat}
            style={{
              // `flex` + `width: fit-content`, BUKAN `inline-flex` — pembungkusnya
              // blok biasa, dan di rail 275px `inline-flex` membuat tombol
              // berbagi baris dengan apa pun di bawahnya lalu bertabrakan.
              display: "flex", width: "fit-content",
              alignItems: "center", gap: 6, marginTop: 10,
              padding: "6px 10px", borderRadius: "var(--rad-sedang)",
              border: "1px solid var(--border)", background: "var(--surface-subtle)",
              fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
              cursor: bolehChat ? "pointer" : "not-allowed",
              opacity: bolehChat ? 1 : 0.6,
            }}
          >
            <Sparkles size={13} aria-hidden="true" />
            Mulai bertanya
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--pad-kartu)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              // Rail sempit: tinggi tetap supaya kartu tak mendorong Pengingat
              // keluar layar. Mode lebar memakai `flex: 1` dari panelnya.
              ...(lebar ? {} : { maxHeight: 360 }),
            }}
          >
            {pesan.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {CONTOH.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => kirim(c)}
                    disabled={!bolehChat || menunggu}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: "var(--rad-sedang)",
                      border: "1px solid var(--border)",
                      background: "var(--surface-subtle)",
                      color: C.text,
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      fontFamily: "inherit",
                      cursor: bolehChat && !menunggu ? "pointer" : "not-allowed",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {pesan.map((p, i) => (
              <Gelembung
                key={i}
                pesan={p}
                lebar={lebar}
                indeks={i}
                onKonfirmasi={konfirmasiTulis}
                onSetujui={konfirmasiSetujui}
              />
            ))}

            {menunggu && (
              <div style={{ fontSize: 12, color: C.muted, padding: "2px 0" }}>Membaca data…</div>
            )}

            {galat && (
              <div
                role="alert"
                style={{
                  padding: "8px 10px", borderRadius: "var(--rad-sedang)",
                  background: "var(--danger-bg)", border: "1px solid var(--danger)",
                  fontSize: 12, color: C.text, lineHeight: 1.55,
                }}
              >
                {galat}
              </div>
            )}

            <div ref={akhirRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); kirim(draf); }}
            style={{
              display: "flex", gap: 6, alignItems: "flex-end",
              padding: "var(--pad-kartu)",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <label htmlFor="rail-pesan" style={sembunyi}>Pertanyaan untuk asisten</label>
            <textarea
              id="rail-pesan"
              value={draf}
              onChange={(e) => setDraf(e.target.value)}
              onKeyDown={(e) => {
                // Enter mengirim, Shift+Enter baris baru — kebiasaan yang sudah
                // dibawa dari aplikasi pesan mana pun.
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); kirim(draf); }
              }}
              placeholder="Tanyakan sesuatu…"
              rows={lebar ? 2 : 1}
              disabled={!bolehChat || menunggu}
              maxLength={4000}
              style={{
                flex: 1, padding: "7px 9px",
                border: `1px solid ${C.border}`, borderRadius: "var(--rad-sedang)",
                fontSize: 12.5, lineHeight: 1.55, outline: "none",
                background: "var(--surface)", color: C.text,
                fontFamily: "inherit", resize: "none", boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={!bolehChat || menunggu || !draf.trim()}
              aria-label="Kirim pertanyaan"
              style={{
                display: "grid", placeItems: "center",
                width: 32, height: 32, flexShrink: 0,
                borderRadius: "var(--rad-sedang)", border: "1px solid transparent",
                background: bolehChat && draf.trim() && !menunggu ? "var(--navy)" : "var(--surface-subtle)",
                color: bolehChat && draf.trim() && !menunggu ? "#fff" : C.muted,
                cursor: bolehChat && draf.trim() && !menunggu ? "pointer" : "not-allowed",
              }}
            >
              <Send size={14} />
            </button>
          </form>
        </>
      )}
    </section>
  );

  if (!lebar) return panel;

  /*
   * Mode lebar: panel diangkat ke atas layar — lewat `DialogBersama`, BUKAN
   * `<div position:fixed inset:0>` yang ditulis tangan.
   *
   * Versi pertama memakai div. Ia punya `role="dialog"` dan `aria-modal`, dan
   * dari luar tampak setara — tapi tiga hal yang paling sering salah tak
   * datang dari atribut, melainkan dari elemennya:
   *
   *   · fokus TIDAK terkunci — Tab keluar dari panel ke sidebar di belakangnya
   *   · Esc tak menutup apa pun kecuali kita menulis handler sendiri
   *   · z-index 80 harus menang melawan setiap lapisan lain, selamanya
   *
   * `<dialog>` + `showModal()` memberi ketiganya dari browser. Penjaga
   * `audit-modal-dialog` menghitung overlay tangan sebagai hutang, dan hutang
   * ini SAYA yang membuatnya (37 → 38) di commit sebelumnya sesi ini.
   *
   * ── Kenapa BUKAN `DialogBersama`
   *
   * Sempat memakainya, lalu dibatalkan setelah membaca CSS-nya:
   * `DialogBersama` membawa KEPALA sendiri (judul + tombol X) dan
   * border/background sendiri. `panel` sudah punya keduanya — hasilnya dua
   * kepala bertumpuk dan dua bingkai. Komponen itu untuk form; ini permukaan
   * yang sudah utuh.
   *
   * `DialogPolos` di bawah memberi tiga hal yang sesungguhnya dibutuhkan —
   * fokus terkunci, Esc, lapisan teratas — tanpa hiasan yang bertabrakan.
   * Ketiganya datang dari `<dialog>` + `showModal()`, bukan dari kode sendiri.
   */
  return (
    <>
      {/* Tempat kartu di rail tetap terisi supaya Pengingat tak melompat naik
          saat panel diangkat keluar alirannya. */}
      <div aria-hidden style={{ height: 96, flexShrink: 0 }} />
      <DialogPolos onTutup={() => setUkuran("obrolan")}>{panel}</DialogPolos>
    </>
  );
}

const tombolIkon: React.CSSProperties = {
  display: "grid", placeItems: "center",
  width: 24, height: 24, flexShrink: 0,
  borderRadius: "var(--rad-sedang)",
  border: "1px solid var(--border)",
  background: "var(--surface-subtle)",
  color: C.mid,
  cursor: "pointer",
};

const sembunyi: React.CSSProperties = {
  position: "absolute", width: 1, height: 1,
  overflow: "hidden", clip: "rect(0 0 0 0)",
};

function Gelembung({
  pesan,
  lebar,
  indeks,
  onKonfirmasi,
  onSetujui,
}: {
  pesan: Pesan;
  lebar: boolean;
  indeks: number;
  onKonfirmasi?: (indeks: number, usul: UsulTulis, setuju: boolean) => void;
  onSetujui?: (indeks: number, usul: UsulSetujui, setuju: boolean) => void;
}) {
  const [bukaSumber, setBukaSumber] = useState(false);
  const dariUser = pesan.peran === "user";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: dariUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: lebar ? "82%" : "94%",
          padding: "8px 10px",
          borderRadius: "var(--rad-sedang)",
          // Navy HANYA di sini dan di tombol kirim — ARAH-VISUAL §3d.
          background: dariUser ? "var(--navy)" : "var(--surface-subtle)",
          color: dariUser ? "#fff" : C.text,
          border: dariUser ? "1px solid transparent" : `1px solid ${C.border}`,
          fontSize: 12.5,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {dariUser ? pesan.teks : <TeksJawaban teks={pesan.teks} />}
      </div>

      {/*
        KARTU KONFIRMASI TULIS.

        Ditaruh tepat di bawah jawabannya, bukan sebagai toast atau dialog:
        yang dikonfirmasi adalah ISI kalimat di atasnya, dan memindahkannya ke
        lapisan lain memaksa orang mengingat angka sambil membaca tombol.

        Tombolnya SATU-SATUNYA jalan pencatatan lewat asisten. Injeksi lewat
        dokumen bisa membuat model mengusulkan apa pun; ia tak bisa menekan
        tombol ini.
      */}
      {!dariUser && (pesan.usul?.length ?? 0) > 0 && onKonfirmasi && (
        <div
          style={{
            marginTop: 6, maxWidth: lebar ? "82%" : "94%",
            padding: "10px 12px", borderRadius: "var(--rad-sedang)",
            border: `1px solid ${pesan.usulSelesai === "tersimpan" ? "var(--success)" : C.navy}`,
            background: pesan.usulSelesai === "tersimpan"
              ? "var(--success-bg)"
              : pesan.usulSelesai === "dibatalkan"
                ? "var(--surface-subtle)"
                : C.navyLight,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, marginBottom: 2 }}>
            {LABEL_JENIS[pesan.usul![0].jenis] ?? pesan.usul![0].jenis}
          </div>

          {pesan.usulSelesai === "tersimpan" ? (
            <div style={{ fontSize: 11.5, color: "var(--success)" }}>
              Tersimpan. Asisten tidak bisa mengubahnya lagi.
            </div>
          ) : pesan.usulSelesai === "dibatalkan" ? (
            <div style={{ fontSize: 11.5, color: C.muted }}>
              Dibatalkan — tidak ada yang tersimpan.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: C.mid, lineHeight: 1.55, marginBottom: 8 }}>
                Belum tersimpan. Periksa isinya di jawaban di atas, lalu
                konfirmasi kalau sudah benar.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onKonfirmasi(indeks, pesan.usul![0], true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", borderRadius: "var(--rad-sedang)",
                    border: "none", background: "var(--grad-aksen)", color: C.onNavy,
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Check size={12} /> Simpan
                </button>
                <button
                  type="button"
                  onClick={() => onKonfirmasi(indeks, pesan.usul![0], false)}
                  style={{
                    padding: "6px 12px", borderRadius: "var(--rad-sedang)",
                    border: `1px solid ${C.border}`, background: "var(--surface)",
                    color: C.mid, fontSize: 11.5, cursor: "pointer",
                  }}
                >
                  Batal
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/*
        KARTU PERSETUJUAN.

        Sengaja dibedakan dari kartu tulis lewat WARNA PERINGATAN, bukan navy:
        menyimpan catatan bisa dikoreksi, menyetujui menggerakkan rantai
        approval yang menyentuh uang dan tak selalu bisa dibatalkan.

        Tombolnya SATU-SATUNYA jalan persetujuan lewat asisten. Model bisa
        menyiapkan; ia tak bisa menekan.
      */}
      {!dariUser && pesan.setujui && onSetujui && (
        <div
          style={{
            marginTop: 6, maxWidth: lebar ? "82%" : "94%",
            padding: "10px 12px", borderRadius: "var(--rad-sedang)",
            border: `1px solid ${
              pesan.setujuiSelesai === "disetujui" ? "var(--success)" : "var(--warning)"
            }`,
            background:
              pesan.setujuiSelesai === "disetujui"
                ? "var(--success-bg)"
                : pesan.setujuiSelesai === "dibatalkan"
                  ? "var(--surface-subtle)"
                  : "var(--warning-bg)",
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, marginBottom: 2 }}>
            Persetujuan — {LABEL_SETUJUI[pesan.setujui.jenis] ?? pesan.setujui.jenis}
          </div>

          {pesan.setujuiSelesai === "disetujui" ? (
            <div style={{ fontSize: 11.5, color: "var(--success)" }}>
              Disetujui. Rantai approval berjalan seperti dari halaman biasa.
            </div>
          ) : pesan.setujuiSelesai === "dibatalkan" ? (
            <div style={{ fontSize: 11.5, color: C.muted }}>
              Dibatalkan — tidak ada yang disetujui.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: C.mid, lineHeight: 1.55, marginBottom: 8 }}>
                Belum disetujui. Periksa rinciannya di jawaban di atas — persetujuan
                menggerakkan rantai approval dan tak selalu bisa dibatalkan.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onSetujui(indeks, pesan.setujui!, true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", borderRadius: "var(--rad-sedang)",
                    border: "none", background: "var(--grad-aksen)", color: C.onNavy,
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Check size={12} /> Setujui
                </button>
                <button
                  type="button"
                  onClick={() => onSetujui(indeks, pesan.setujui!, false)}
                  style={{
                    padding: "6px 12px", borderRadius: "var(--rad-sedang)",
                    border: `1px solid ${C.border}`, background: "var(--surface)",
                    color: C.mid, fontSize: 11.5, cursor: "pointer",
                  }}
                >
                  Batal
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* I-4: peringatan MENEMPEL pada jawabannya, bukan toast yang hilang.
          Pembaca yang menyalin angkanya harus melihatnya di layar yang sama. */}
      {pesan.peringatan && (
        <div
          style={{
            marginTop: 4, maxWidth: lebar ? "82%" : "94%",
            padding: "6px 8px", borderRadius: "var(--rad-sedang)",
            display: "flex", gap: 6, alignItems: "flex-start",
            background: "var(--warning-bg)", border: "1px solid var(--warning)",
            fontSize: 11.5, lineHeight: 1.55, color: C.text,
          }}
        >
          <AlertTriangle size={12} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <span>{pesan.peringatan}</span>
        </div>
      )}

      {/* C2 explainability: sumber bisa dibuka tanpa meninggalkan obrolan.
          Angka yang tak bisa ditelusuri tak layak dipercaya untuk keputusan. */}
      {pesan.sumber && (
        <div style={{ marginTop: 4, maxWidth: lebar ? "82%" : "94%" }}>
          <button
            type="button"
            onClick={() => setBukaSumber((v) => !v)}
            aria-expanded={bukaSumber}
            data-uji="sumber-jawaban"
            style={{
              background: "none", border: "none", padding: "1px 0",
              fontSize: 11, color: C.muted, cursor: "pointer",
              fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            {bukaSumber ? "Sembunyikan sumber" : `Sumber — ${pesan.sumber.entitas_dibaca.length} data`}
          </button>

          {bukaSumber && (
            <div
              style={{
                marginTop: 4, padding: "8px 10px",
                borderRadius: "var(--rad-sedang)",
                background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
                fontSize: 11, lineHeight: 1.6, color: C.mid,
              }}
            >
              {pesan.sumber.ada_galat_tool && (
                <p style={{ margin: "0 0 6px", color: "var(--warning)" }}>
                  Sebagian pembacaan gagal — jawaban mungkin tak lengkap.
                </p>
              )}
              {pesan.sumber.entitas_dibaca.length === 0 ? (
                <p style={{ margin: 0 }}>Tidak ada data dibaca — jawaban ini tak bersumber dari basis.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 14 }}>
                  {pesan.sumber.entitas_dibaca.slice(0, lebar ? 15 : 6).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {pesan.sumber.entitas_dibaca.length > (lebar ? 15 : 6) && (
                    <li style={{ listStyle: "none", marginLeft: -14, marginTop: 3, color: C.muted }}>
                      …dan {pesan.sumber.entitas_dibaca.length - (lebar ? 15 : 6)} lainnya
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * `<dialog>` TANPA hiasan — hanya perilakunya.
 *
 * Tiga hal yang diberikan browser dan hampir selalu salah kalau ditulis
 * tangan: fokus terkunci di dalam, Esc menutup, dan lapisan teratas tanpa
 * perang z-index. Isinya dibiarkan menentukan bentuknya sendiri.
 *
 * `showModal()` lewat ref, bukan atribut `open`: hanya yang pertama memberi
 * ketiga hal itu. `open` merender dialog sebagai elemen biasa dalam aliran
 * halaman — terlihat mirip, berperilaku sama sekali berbeda.
 */
function DialogPolos({
  onTutup,
  children,
}: {
  onTutup: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog-polos"
      aria-label="Asisten"
      // Esc menutup lewat jalur bawaan browser — `onClose` yang
      // menyelaraskannya kembali ke state React. Tanpa ini, dialognya tertutup
      // sementara `ukuran` masih "lebar", dan membukanya lagi tak bekerja.
      onClose={onTutup}
      onClick={(e) => {
        // Klik backdrop menutup. Benar HANYA saat targetnya dialog itu
        // sendiri — isinya punya elemen sendiri yang menyerap kliknya.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      {children}
    </dialog>
  );
}
