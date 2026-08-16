"use client";

/**
 * KUNCI API — jalan masuk bagi sistem luar (G6c).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR YANG MENAMPILKAN RAHASIA TEPAT SEKALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelum ini, satu-satunya cara sistem luar masuk adalah memakai kredensial
 * LOGIN MANUSIA: kewenangannya penuh, tak bisa dicabut tanpa mengunci
 * orangnya, dan jejak di audit log tertulis sebagai perbuatan orang itu —
 * bukan mesin.
 *
 * ── Kenapa nilai kunci hanya muncul sekali, dan itu ditulis besar-besar
 *
 * Yang tersimpan hanya sidik jari satu arah. Kami sendiri tak bisa
 * memulihkannya. Layar yang tidak mengatakan ini dengan jelas akan
 * menghasilkan orang yang menutup dialog lalu kehilangan kunci — dan
 * menyalahkan aplikasinya, dengan alasan yang masuk akal.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya kotak "salin sekarang" saat kunci baru dibuat. Daftar
 * kuncinya sendiri tenang; kunci kedaluwarsa dan dicabut dibedakan lencana,
 * bukan warna latar — daftar yang seluruhnya berteriak tak menunjukkan apa
 * pun.
 */

import { useCallback, useState } from "react";
import { KeyRound, TriangleAlert, Info, Copy, Check, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { formatTanggal } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, gayaInput, type Kolom,
} from "@/components/dasar";

interface Kunci {
  id: string;
  nama: string;
  keperluan: string;
  awalan: string;
  izin: string[];
  kedaluwarsa_pada: string;
  dicabut_pada: string | null;
  alasan_cabut: string | null;
  dibuat_pada: string;
  dipakai_terakhir: string | null;
  jumlah_pakai: number;
  keadaan: "aktif" | "kedaluwarsa" | "dicabut";
}

export default function ApiKeyPage() {
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [tersalin, setTersalin] = useState(false);

  /** Kunci yang BARU dibuat — satu-satunya saat nilainya ada di peramban. */
  const [baru, setBaru] = useState<{ nilai: string; nama: string } | null>(null);

  const [nama, setNama] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [hari, setHari] = useState("90");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController. Yang didapat:
    dedup permintaan, cache lintas navigasi, dan langganan invalidasi — halaman
    ini menyegarkan diri saat data yang dipakainya dibuang di tempat lain.

    `makeAbortController` tak lagi perlu: `useData` sudah menjaga agar jawaban
    yang datang sesudah komponen mati tidak menyentuh state.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ kunci: Kunci[] }>("/api/v1/api-key");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI dipisah lalu digabung saat dipakai.
    Satu state untuk keduanya punya cacat halus yang sudah ditemukan
    DUA KALI di batch sebelumnya: gagal menyimpan MENGHAPUS pesan gagal
    memuat, dan pengguna mengira datanya sudah termuat.
  */
  const galat = galatAksi ?? (galatMuat ? "Gagal memuat daftar kunci" : null);

  // Diturunkan, bukan disalin.
  const daftar = data?.kunci ?? [];


  const buat = useCallback(async () => {
    setMenyimpan(true); setGalatAksi(null); setTersalin(false);
    try {
      const r = await api.post<{ nilai: string; kunci: Kunci }>("/api/v1/api-key", {
        nama: nama.trim(),
        keperluan: keperluan.trim(),
        hari_berlaku: hari === "" ? "" : Number(hari),
        // Izin sengaja KOSONG saat dibuat: kunci yang lahir berwenang penuh
        // adalah cara paling cepat kehilangan kendali. Diberikan terpisah,
        // sadar, satu per satu.
        izin: [],
      });
      setBaru({ nilai: r.data.nilai, nama: r.data.kunci.nama });
      setNama(""); setKeperluan(""); setHari("90");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal membuat kunci");
    } finally { setMenyimpan(false); }
  }, [nama, keperluan, hari, muat]);

  const cabut = useCallback(async (k: Kunci) => {
    const alasan = window.prompt(
      `Cabut kunci "${k.nama}"?\n\nSebutkan alasannya — ini yang dicari saat `
      + `seseorang bertanya "kenapa integrasi kami mati?".`);
    if (alasan === null) return;
    setGalatAksi(null);
    try {
      await api.post(`/api/v1/api-key/${k.id}/cabut`, { alasan });
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal mencabut kunci");
    }
  }, [muat]);

  const salin = useCallback(async () => {
    if (!baru) return;
    try {
      await navigator.clipboard.writeText(baru.nilai);
      setTersalin(true);
    } catch {
      // Clipboard bisa ditolak peramban. Nilainya tetap terlihat di layar,
      // jadi kegagalan menyalin bukan kegagalan yang menghalangi.
      setTersalin(false);
    }
  }, [baru]);

  const kolom: Array<Kolom<Kunci>> = [
    {
      kunci: "nama", judul: "Kunci", kepalaBaris: true,
      render: (k) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>{k.nama}</strong>
          <span style={{
            display: "block", fontSize: 11.5, color: C.mid, marginTop: 1,
            maxWidth: "42ch", lineHeight: 1.45,
          }}>{k.keperluan}</span>
          <code style={{
            display: "inline-block", marginTop: 3, fontSize: 11,
            color: C.muted, fontFamily: "var(--font-mono, monospace)",
          }}>{k.awalan}…</code>
        </span>
      ),
    },
    {
      kunci: "izin", judul: "Izin",
      render: (k) => (
        k.izin?.length
          ? <span style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "28ch" }}>
              {k.izin.map((i) => <Lencana key={i} nada="info">{i}</Lencana>)}
            </span>
          // Kunci tanpa izin bukan cacat — itu bawaannya. Tapi ia juga tak
          // bisa apa-apa, dan layar harus mengatakannya.
          : <span style={{ fontSize: 11.5, color: C.muted }}>belum diberi izin</span>
      ),
    },
    {
      kunci: "pakai", judul: "Pemakaian", rata: "kanan",
      render: (k) => (
        <span style={{ display: "block", textAlign: "right" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>
            {Number(k.jumlah_pakai).toLocaleString("id-ID")}×
          </strong>
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
            {k.dipakai_terakhir
              ? formatTanggal(k.dipakai_terakhir)
              /* Kunci yang tak pernah dipakai adalah kunci yang lebih baik
                 dicabut — dan itu hanya bisa dilihat kalau dinyatakan. */
              : "belum pernah"}
          </span>
        </span>
      ),
    },
    {
      kunci: "berlaku", judul: "Berlaku sampai",
      render: (k) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>
          {formatTanggal(k.kedaluwarsa_pada)}
        </span>
      ),
    },
    {
      kunci: "keadaan", judul: "Keadaan",
      render: (k) => (
        <span style={{ display: "block" }}>
          <Lencana nada={
            k.keadaan === "aktif" ? "sukses"
              : k.keadaan === "kedaluwarsa" ? "peringatan" : "netral"
          }>
            {k.keadaan === "aktif" ? "Aktif"
              : k.keadaan === "kedaluwarsa" ? "Kedaluwarsa" : "Dicabut"}
          </Lencana>
          {k.alasan_cabut && (
            <span style={{
              display: "block", fontSize: 11, color: C.muted, marginTop: 3,
              maxWidth: "26ch", lineHeight: 1.4,
            }}>{k.alasan_cabut}</span>
          )}
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (k) => (
        k.keadaan === "dicabut"
          ? <span style={{ fontSize: 11.5, color: C.muted }}>—</span>
          : (
            <Tombol kecil jenis="bahaya" ikon={<Ban size={12} aria-hidden="true" />}
              onClick={() => void cabut(k)}>
              Cabut
            </Tombol>
          )
      ),
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<KeyRound size={18} />}
        judul="Kunci API"
        keterangan={
          <>Jalan masuk bagi sistem luar. Sebelum ini, satu-satunya cara adalah
          menaruh <strong>kredensial login seseorang</strong> di sistem lain —
          kewenangannya penuh, tak bisa dicabut tanpa mengunci orangnya, dan
          jejaknya tercatat sebagai perbuatan orang itu, bukan mesin.</>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {/* ── SATU aksen: kunci baru, terlihat sekali (§3d) ─────────────────── */}
      {baru && (
        <div role="alert" style={{
          padding: "14px 16px", borderRadius: 10,
          border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
          color: "var(--warning-teks)",
        }}>
          <strong style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 13,
          }}>
            <TriangleAlert size={15} aria-hidden="true" />
            Salin sekarang — nilai ini tidak akan ditampilkan lagi
          </strong>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.55 }}>
            Yang tersimpan di server hanya sidik jarinya, jadi <strong>kami pun
            tak bisa memulihkannya</strong>. Kunci yang hilang harus dicabut dan
            dibuat ulang.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{
              flex: "1 1 320px", padding: "8px 10px", borderRadius: 6,
              background: "var(--surface)", border: `1px solid ${C.border}`,
              fontSize: 12.5, fontFamily: "var(--font-mono, monospace)",
              color: C.text, wordBreak: "break-all",
            }}>{baru.nilai}</code>
            <Tombol jenis="utama" kecil
              ikon={tersalin
                ? <Check size={13} aria-hidden="true" />
                : <Copy size={13} aria-hidden="true" />}
              onClick={() => void salin()}>
              {tersalin ? "Tersalin" : "Salin"}
            </Tombol>
            <Tombol jenis="hantu" kecil onClick={() => { setBaru(null); setTersalin(false); }}>
              Saya sudah menyimpannya
            </Tombol>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11.5 }}>
            Kunci ini <strong>belum punya izin apa pun</strong> — ia tak bisa
            melakukan apa-apa sampai izinnya diberikan. Itu disengaja.
          </p>
        </div>
      )}

      <Kartu pad="rapat">
        <JudulKartu sub="kunci baru lahir tanpa izin — diberikan terpisah, sadar, satu per satu">
          Buat kunci baru
        </JudulKartu>
        <div style={{
          display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }}>
          <div>
            <label htmlFor="ak-nama" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Nama
            </label>
            <input id="ak-nama" style={gayaInput} value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="mis. Sinkron Accurate" />
          </div>
          <div>
            <label htmlFor="ak-hari" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Berlaku (hari)
            </label>
            <input id="ak-hari" type="number" min="1" max="730" style={gayaInput}
              value={hari} onChange={(e) => setHari(e.target.value)} />
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 3 }}>
              Maksimal 730 hari — kunci yang berlaku lebih lama tak pernah
              dipertanyakan lagi oleh siapa pun.
            </span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label htmlFor="ak-keperluan" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
            Keperluan — minimal 10 huruf
          </label>
          <input id="ak-keperluan" style={gayaInput} value={keperluan}
            onChange={(e) => setKeperluan(e.target.value)}
            placeholder="mis. menarik data invoice ke sistem akuntansi tiap malam" />
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>
            Kunci tanpa keterangan tak bisa dinilai saat audit — dan yang
            terjadi kemudian selalu sama: tak ada yang berani mencabutnya.
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Tombol jenis="utama"
            disabled={menyimpan || !nama.trim() || keperluan.trim().length < 10 || hari === ""}
            onClick={() => void buat()}>
            {menyimpan ? "Membuat…" : "Buat kunci"}
          </Tombol>
        </div>
      </Kartu>

      {memuat ? (
        <Rangka tinggi={62} jumlah={3} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu sub="terbaru di atas">Kunci yang ada</JudulKartu>
          <Tabel
            kolom={kolom}
            data={daftar}
            kunciBaris={(k) => k.id}
            caption="Daftar kunci API beserta izin, pemakaian, dan keadaannya"
            kosong={
              <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0 }}>
                Belum ada kunci API. Selama belum ada, sistem luar hanya bisa
                masuk dengan memakai kredensial login seseorang.
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
          Kunci dikirim lewat header <code>X-API-Key</code>, bukan{" "}
          <code>Authorization</code> — supaya tak tertukar dengan token sesi
          manusia. Kunci yang <strong>dicabut tak bisa dihidupkan lagi</strong>:
          pencabutan adalah pernyataan bahwa kunci itu bocor atau tak
          dipercaya, dan menghidupkannya kembali menghapus arti pernyataan itu.
        </span>
      </p>
    </Halaman>
  );
}
