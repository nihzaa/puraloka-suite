"use client";

/**
 * MARKUP & MARGIN — angka yang menentukan laba, diberi tempat (G6).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU ANGKA YANG DULU TAK PUNYA RUMAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `buk_fraction` menentukan seluruh keuntungan perusahaan dari sebuah
 * penawaran. Sampai migrasi 301 ia dikirim ulang tiap permintaan dan tak
 * tersimpan di mana pun: dua estimator bisa menawar proyek yang sama dengan
 * margin berbeda, dan tak ada satu pun tempat yang bisa ditanya "berapa
 * margin kita?".
 *
 * ── Kenapa overhead dan keuntungan DIPISAH
 *
 * BUK ditulis tradisional sebagai satu persentase. Menggabungkannya membuat
 * pertanyaan "berapa laba kita sebenarnya?" tak terjawab: 10% BUK bisa berarti
 * 10% laba dengan overhead nol, atau 2% laba dengan overhead 8%.
 *
 * ── Kenapa periode DITAMBAH, bukan disunting
 *
 * Estimasi yang sudah dibuat harus tetap bisa dijelaskan dengan angka yang
 * berlaku saat itu. Menimpa markup berarti penawaran tahun lalu tak bisa lagi
 * dihitung ulang — dan saat panitia lelang bertanya, jawabannya harus ditebak.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk "belum ditetapkan". Begitu markup ada, halaman
 * ini tenang.
 */

import { useCallback, useState } from "react";
import { Percent, TriangleAlert, Info, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, KartuAngka, gayaInput, type Kolom,
} from "@/components/dasar";

interface Periode {
  id: string;
  jenis_pekerjaan: string | null;
  berlaku_sejak: string;
  overhead_fraksi: string | number;
  keuntungan_fraksi: string | number;
  kontinjensi_fraksi: string | number;
  buk_fraksi: string | number;
  alasan: string | null;
  catatan: string | null;
}

interface Berlaku {
  periode_id: string;
  jenis_pekerjaan: string | null;
  berlaku_sejak: string;
  overhead: number;
  keuntungan: number;
  kontinjensi: number;
  buk: number;
  dari_umum: boolean;
}

interface Muatan {
  periode: Periode[];
  berlaku: Berlaku | null;
  berlaku_per_jenis: Array<{ jenis_pekerjaan: string; markup: Berlaku | null }>;
  pada: string;
}

/** Fraksi → persen untuk tampilan. 0.0825 → "8,25%". */
const pct = (v: string | number | null | undefined) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(Math.round(n * 10000) / 100).toLocaleString("id-ID")}%`;
};

/** Contoh Rp 1 miliar — angka abstrak jadi konsekuensi yang terbaca. */
const CONTOH = 1_000_000_000;

export default function MarkupPage() {
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const [jenis, setJenis] = useState("");
  const [sejak, setSejak] = useState(() => new Date().toISOString().slice(0, 10));
  const [overhead, setOverhead] = useState("");
  const [untung, setUntung] = useState("");
  const [kontinjensi, setKontinjensi] = useState("");
  const [alasan, setAlasan] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController. Yang didapat:
    dedup permintaan, cache lintas navigasi, dan langganan invalidasi — halaman
    ini menyegarkan diri saat data yang dipakainya dibuang di tempat lain.

    `makeAbortController` tak lagi perlu: `useData` sudah menjaga agar jawaban
    yang datang sesudah komponen mati tidak menyentuh state.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>("/api/v1/markup");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI dipisah lalu digabung saat dipakai.
    Satu state untuk keduanya punya cacat halus: gagal menyimpan
    MENGHAPUS pesan gagal memuat, dan pengguna mengira datanya termuat.
  */
  const galat = galatAksi ?? (galatMuat ? "Gagal memuat markup" : null);



  const simpan = useCallback(async () => {
    setMenyimpan(true); setGalatAksi(null);
    try {
      await api.post("/api/v1/markup", {
        jenis_pekerjaan: jenis.trim() || null,
        berlaku_sejak: sejak,
        // Persen → fraksi di SATU tempat. Membaginya di beberapa tempat adalah
        // cara paling mudah kehilangan faktor 100.
        overhead_fraksi: overhead === "" ? "" : Number(overhead) / 100,
        keuntungan_fraksi: untung === "" ? "" : Number(untung) / 100,
        kontinjensi_fraksi: kontinjensi === "" ? "" : Number(kontinjensi) / 100,
        alasan: alasan.trim() || null,
      });
      setOverhead(""); setUntung(""); setKontinjensi(""); setAlasan(""); setJenis("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menyimpan markup");
    } finally { setMenyimpan(false); }
  }, [jenis, sejak, overhead, untung, kontinjensi, alasan, muat]);

  const hapus = useCallback(async (p: Periode) => {
    setGalatAksi(null);
    try {
      await api.delete(`/api/v1/markup/${p.id}`);
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menghapus periode");
    }
  }, [muat]);

  const b = data?.berlaku ?? null;

  const kolom: Array<Kolom<Periode>> = [
    {
      kunci: "berlaku", judul: "Berlaku sejak", kepalaBaris: true,
      render: (p) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 13, color: C.text }}>
            {formatTanggal(p.berlaku_sejak)}
          </strong>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {p.jenis_pekerjaan ?? "berlaku umum"}
          </span>
        </span>
      ),
    },
    {
      kunci: "overhead", judul: "Overhead", rata: "kanan",
      render: (p) => <span style={{ fontSize: 12.5, color: C.mid }}>{pct(p.overhead_fraksi)}</span>,
    },
    {
      kunci: "untung", judul: "Keuntungan", rata: "kanan",
      render: (p) => (
        <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>
          {pct(p.keuntungan_fraksi)}
        </span>
      ),
    },
    {
      kunci: "kontinjensi", judul: "Kontinjensi", rata: "kanan",
      render: (p) => <span style={{ fontSize: 12.5, color: C.mid }}>{pct(p.kontinjensi_fraksi)}</span>,
    },
    {
      kunci: "buk", judul: "BUK", rata: "kanan",
      render: (p) => (
        <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>
          {pct(p.buk_fraksi)}
        </span>
      ),
    },
    {
      kunci: "alasan", judul: "Alasan",
      render: (p) => (
        <span style={{ fontSize: 11.5, color: C.mid, display: "block", maxWidth: "34ch", lineHeight: 1.45 }}>
          {p.alasan ?? "—"}
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (p) => (
        <Tombol kecil jenis="hantu" ikon={<Trash2 size={12} aria-hidden="true" />}
          onClick={() => void hapus(p)}>
          Hapus
        </Tombol>
      ),
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Percent size={18} />}
        judul="Markup & Margin"
        keterangan={
          <>Overhead, keuntungan, dan cadangan risiko yang dipakai menyusun
          penawaran. Sebelum ini angkanya <strong>diketik ulang tiap
          estimasi</strong> dan tak tersimpan di mana pun — dua orang bisa
          menawar proyek yang sama dengan margin berbeda tanpa ada yang tahu.</>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {/* ── SATU aksen: belum ditetapkan (§3d) ────────────────────────────── */}
      {!memuat && !b && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TriangleAlert size={15} aria-hidden="true" />
            Markup belum ditetapkan — estimator mengetik angkanya sendiri
          </strong>
          <span style={{ display: "block", fontSize: 12.5 }}>
            Sampai diisi, kolom BUK di layar estimasi dibiarkan kosong. Itu
            disengaja: angka bawaan yang menghasilkan penawaran wajar tak
            pernah dipertanyakan siapa pun.
          </span>
        </div>
      )}

      {b && (
        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }}>
          {/* Yang ditampilkan TOTAL kenaikan, bukan BUK saja.
              Tangkapan layar pertama memasang "BUK berlaku 10%" di sebelah
              penawaran yang naik 12% — pembaca wajar menyimpulkan penawaran
              naik 10%, dan selisih 2% itu justru kontinjensi. Angka yang
              benar sendiri-sendiri tetap menyesatkan saat berdampingan. */}
          <KartuAngka
            label="Kenaikan total"
            nilai={pct(b.buk + b.kontinjensi)}
            sub={b.kontinjensi > 0
              ? `BUK ${pct(b.buk)} + kontinjensi ${pct(b.kontinjensi)}`
              : (b.dari_umum ? "dari markup umum" : `khusus ${b.jenis_pekerjaan}`)}
          />
          <KartuAngka label="Keuntungan" nilai={pct(b.keuntungan)}
            sub="bagian laba" />
          <KartuAngka label="Overhead" nilai={pct(b.overhead)}
            sub="biaya tak langsung" />
          {/* Margin ≠ markup. Ditampilkan berdampingan justru supaya bedanya
              terlihat: markup 10% di atas biaya adalah margin 9,09%. */}
          <KartuAngka
            label="Margin sesungguhnya"
            nilai={`${((b.buk + b.kontinjensi) / (1 + b.buk + b.kontinjensi) * 100)
              .toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}
            sub="dari nilai penawaran, bukan dari biaya"
          />
        </div>
      )}

      {b && (
        <Kartu pad="rapat">
          <JudulKartu sub={`biaya pokok ${formatRupiah(CONTOH)} sebagai contoh`}>
            Bentuknya pada satu penawaran
          </JudulKartu>
          <div style={{
            display: "grid", gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            fontSize: 12.5,
          }}>
            {[
              ["Biaya pokok", CONTOH],
              ["+ Overhead", CONTOH * b.overhead],
              ["+ Keuntungan", CONTOH * b.keuntungan],
              ["+ Kontinjensi", CONTOH * b.kontinjensi],
              ["Nilai penawaran", CONTOH * (1 + b.buk + b.kontinjensi)],
            ].map(([l, v], i, arr) => (
              <div key={l as string} style={{
                padding: "8px 10px", borderRadius: 8,
                background: i === arr.length - 1 ? "var(--surface-hover)" : "transparent",
                border: `1px solid ${i === arr.length - 1 ? C.border : "transparent"}`,
              }}>
                <span style={{ display: "block", fontSize: 11, color: C.muted }}>{l as string}</span>
                <strong style={{
                  display: "block", marginTop: 2, fontSize: 13,
                  color: C.text, fontVariantNumeric: "tabular-nums",
                }}>{formatRupiah(v as number)}</strong>
              </div>
            ))}
          </div>
        </Kartu>
      )}

      <Kartu pad="rapat">
        <JudulKartu sub="markup DITAMBAH sebagai periode baru, tidak menimpa — supaya estimasi lama tetap bisa dijelaskan">
          Tetapkan markup
        </JudulKartu>
        <div style={{
          display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}>
          <div>
            <label htmlFor="mk-jenis" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Jenis pekerjaan
            </label>
            <input id="mk-jenis" style={gayaInput} value={jenis}
              onChange={(e) => setJenis(e.target.value)}
              placeholder="kosongkan = berlaku umum" />
          </div>
          <div>
            <label htmlFor="mk-sejak" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Berlaku sejak
            </label>
            <input id="mk-sejak" type="date" style={gayaInput} value={sejak}
              onChange={(e) => setSejak(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mk-oh" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Overhead (%)
            </label>
            <input id="mk-oh" type="number" min="0" max="100" step="any" style={gayaInput}
              value={overhead} onChange={(e) => setOverhead(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mk-untung" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Keuntungan (%)
            </label>
            <input id="mk-untung" type="number" min="0" max="100" step="any" style={gayaInput}
              value={untung} onChange={(e) => setUntung(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mk-kont" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Kontinjensi (%)
            </label>
            <input id="mk-kont" type="number" min="0" max="100" step="any" style={gayaInput}
              value={kontinjensi} onChange={(e) => setKontinjensi(e.target.value)}
              placeholder="0" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label htmlFor="mk-alasan" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
            Alasan (opsional, tapi dicari orang berikutnya)
          </label>
          <input id="mk-alasan" style={gayaInput} value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="mis. persaingan ketat di segmen gedung 2026" />
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Tombol jenis="utama"
            disabled={menyimpan || overhead === "" || untung === ""}
            onClick={() => void simpan()}>
            {menyimpan ? "Menyimpan…" : "Tambah periode"}
          </Tombol>
          {overhead !== "" && untung !== "" && (
            <span style={{ fontSize: 12, color: C.mid }}>
              BUK{" "}
              <strong style={{ color: C.text }}>
                {(Number(overhead) + Number(untung)).toLocaleString("id-ID")}%
              </strong>
              {kontinjensi !== "" && ` + kontinjensi ${Number(kontinjensi).toLocaleString("id-ID")}%`}
            </span>
          )}
        </div>
      </Kartu>

      {memuat ? (
        <Rangka tinggi={56} jumlah={3} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu sub="terbaru di atas">Riwayat periode</JudulKartu>
          <Tabel
            kolom={kolom}
            data={data?.periode ?? []}
            kunciBaris={(p) => p.id}
            caption="Riwayat periode markup beserta komponen dan alasannya"
            kosong={
              <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0 }}>
                Belum ada periode markup. Tetapkan satu di atas — sampai itu,
                estimator mengetik angkanya sendiri tiap kali.
              </p>
            }
          />
        </Kartu>
      )}

      {(data?.berlaku_per_jenis?.length ?? 0) > 0 && (
        <Kartu pad="rapat">
          <JudulKartu sub="jenis yang punya angkanya sendiri">Markup khusus</JudulKartu>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data!.berlaku_per_jenis.map((x) => (
              <Lencana key={x.jenis_pekerjaan} nada={x.markup ? "info" : "netral"}>
                {x.jenis_pekerjaan}: {x.markup ? pct(x.markup.buk) : "—"}
              </Lencana>
            ))}
          </div>
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Kontinjensi <strong>dipisah</strong> dari keuntungan dengan sengaja.
          Menyembunyikan cadangan risiko di dalam margin membuat penawaran
          terlihat untung besar padahal sebagiannya dialokasikan untuk hal yang
          belum tentu terjadi — dan saat risikonya menyala, labanya menguap
          tanpa penjelasan.
        </span>
      </p>
    </Halaman>
  );
}
