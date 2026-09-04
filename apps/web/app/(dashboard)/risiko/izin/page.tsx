"use client";

/**
 * PERIZINAN PROYEK — IMB/PBG, izin lingkungan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN SENDIRI, BUKAN TAB DI /risiko
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026` §6a: tab = sudut pandang berbeda atas data yang SAMA;
 * halaman = entitas berbeda.
 *
 * Izin BUKAN sudut pandang lain atas risiko. Risiko adalah yang MUNGKIN
 * terjadi; izin adalah yang sudah pasti dibutuhkan dan punya nomor,
 * penerbit, serta masa berlaku. Menjadikannya tab akan memaksa keduanya
 * berbagi kartu ringkasan yang mengukur hal berbeda.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MEMBUAT HALAMAN INI BEDA DARI DAFTAR DOKUMEN BIASA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * PBG yang habis masa berlakunya sementara pekerjaan masih berjalan bukan
 * cacat administrasi: pekerjaannya bisa DISEGEL. Yang disegel proyeknya,
 * bukan berkasnya, dan berhentinya dihitung hari.
 *
 * Karena itu izin di sini dinilai terhadap RENTANG PROYEK, bukan terhadap
 * hari ini saja. Izin yang berlaku sampai Maret pada proyek yang selesai Juni
 * sudah bermasalah HARI INI — meski hari ini ia masih sah. Register yang
 * hanya menandai "sudah lewat" memberi tahu terlambat: pengurusan
 * perpanjangan PBG makan waktu berminggu-minggu.
 *
 * ── Kenapa jawaban "boleh jalan" bisa TIGA, bukan dua
 *
 *   ya      tak ada izin yang memblokir
 *   tidak   ada izin penghalang yang mati atau belum terbit
 *   —       BELUM ADA IZIN TERCATAT SAMA SEKALI
 *
 * Yang ketiga bukan "ya". Proyek tanpa satu pun izin tercatat bukan proyek
 * yang izinnya lengkap; ia proyek yang izinnya belum didata. Menjawab "boleh
 * jalan" untuk daftar kosong adalah kebohongan yang terlihat meyakinkan —
 * pelajaran yang sama dengan ITP kosong (G1e).
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk penghalang. Daftar izinnya sendiri tenang:
 * sebagian besar izin memang baik-baik saja, dan mewarnai semuanya membuat
 * yang mati tak terlihat.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Stamp, TriangleAlert, ShieldCheck, Clock, Plus, FileWarning, Ban,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Kosong, Rangka, Galat,
  Tombol, Lencana, Medan, gayaInput, type Kolom,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { Saklar } from "@/components/saklar";
import { Pilihan } from "@/components/pilihan";

type StatusMasa =
  | "belum_terbit" | "berlaku" | "akan_habis" | "kedaluwarsa" | "ditolak" | "dicabut";

interface Izin {
  id: string;
  jenis: string;
  nomor: string | null;
  penerbit: string | null;
  status: "rencana" | "diajukan" | "terbit" | "ditolak" | "dicabut";
  diajukan_pada: string | null;
  berlaku_dari: string | null;
  berlaku_sampai: string | null;
  biaya: string | number | null;
  menghalangi_mulai: boolean;
  masa: StatusMasa;
  sisa_hari: number | null;
  memblokir: boolean;
}

interface Muatan {
  proyek: { id: string; name: string; start_date: string | null; end_date: string | null; status: string };
  pada: string;
  izin: Izin[];
  kesiapan: {
    boleh_jalan: boolean | null;
    memblokir: Izin[];
    perlu_diurus: Izin[];
    total: number;
  };
}

interface Proyek { id: string; name: string }

/**
 * Enam keadaan, bukan dua — karena tindakannya berbeda.
 *
 * `dicabut` dipisahkan dari `ditolak` justru karena ia LEBIH berbahaya:
 * pekerjaan mungkin sudah berjalan atas dasar izin itu.
 */
const MASA: Record<StatusMasa, { label: string; nada: "netral" | "sukses" | "peringatan" | "bahaya"; arti: string }> = {
  belum_terbit: {
    label: "Belum terbit", nada: "netral",
    arti: "Masih diurus — belum bisa dipakai sebagai dasar bekerja.",
  },
  berlaku: {
    label: "Berlaku", nada: "sukses",
    arti: "Sah pada tanggal yang diperiksa, dan masih sah sampai proyek selesai.",
  },
  akan_habis: {
    label: "Akan habis", nada: "peringatan",
    arti: "Masih sah hari ini, tetapi habis sebelum proyek selesai — atau tinggal dalam ambang peringatan. Pengurusan perpanjangan makan waktu berminggu-minggu.",
  },
  kedaluwarsa: {
    label: "Kedaluwarsa", nada: "bahaya",
    arti: "Sudah lewat. Pekerjaan yang berjalan atas izin ini bisa disegel.",
  },
  ditolak: {
    label: "Ditolak", nada: "bahaya",
    arti: "Permohonannya ditolak — izin ini tak akan pernah terbit dalam bentuk sekarang.",
  },
  dicabut: {
    label: "Dicabut", nada: "bahaya",
    arti: "Pernah terbit lalu dicabut. Paling berbahaya: pekerjaan mungkin sudah berjalan atas dasar izin ini.",
  },
};

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

const rupiah = (v: string | number | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
};

/** Jenis izin yang lazim di konstruksi Indonesia. Bukan daftar tertutup —
 *  medannya tetap teks bebas, karena tiap daerah punya sebutan sendiri. */
const USUL_JENIS = [
  "PBG (Persetujuan Bangunan Gedung)",
  "SLF (Sertifikat Laik Fungsi)",
  "Izin Lingkungan / UKL-UPL",
  "Izin Lokasi",
  "Izin Pemanfaatan Ruang",
  "Izin Pembuangan Air Limbah",
  "Izin Reklame",
  "Rekomendasi Damkar",
];

/**
 * `useSearchParams` memaksa render sisi klien, dan Next menuntut batas
 * Suspense untuk itu — tanpa ini `pnpm build` gagal saat prerender. Pola yang
 * sama dipakai `/jadwal`; ditemukan oleh build di sana, bukan oleh ingatan.
 */
export default function IzinProyekPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat perizinan…
      </div>
    }>
      <IsiIzin />
    </Suspense>
  );
}

/**
 * Proyek terpilih dibaca dari `?proyek=<id>` bila ada dan sah, kalau tidak
 * proyek pertama daftar.
 *
 * Bukan sekadar kenyamanan: tanpa ini halaman tak bisa DITAUTKAN. Detail
 * proyek yang hendak mengarahkan ke registernya harus bisa menyebut proyek
 * mana — dan tanpa parameter, tautannya selalu mendarat di proyek pertama
 * menurut abjad, yang hampir tak pernah proyek yang dimaksud.
 */
function IsiIzin() {
  const params = useSearchParams();
  const dariUrl = params.get("proyek") ?? "";
  const [proyekId, setProyekId] = useState("");

  const [tambah, setTambah] = useState(false);
  const [fJenis, setFJenis] = useState("");
  const [fStatus, setFStatus] = useState("rencana");
  const [fNomor, setFNomor] = useState("");
  const [fPenerbit, setFPenerbit] = useState("");
  const [fDari, setFDari] = useState("");
  const [fSampai, setFSampai] = useState("");
  const [fBiaya, setFBiaya] = useState("");
  const [fMenghalangi, setFMenghalangi] = useState(true);

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData`: daftar proyek, lalu perizinan yang bergantung `proyekId`.
    Galat AKSI (simpan izin) sudah dipisah lewat `galatModal` yang sudah ada
    sejak awal — tinggal galat MUAT yang kini datang dari `useData`.
  */
  const { data: dataProyek, galat: galatMuatProyek } = useData<{ projects: Proyek[] }>(
    "/api/v1/projects",
  );
  // `useMemo`: masuk dependensi `useEffect` di bawah, dan array baru tiap
  // render membuat efek itu berjalan tanpa henti.
  const proyekList = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  // Yang dari URL menang, TAPI hanya kalau id-nya benar-benar ada di daftar:
  // id ngawur dari tautan lama harus mendarat di sesuatu yang nyata, bukan
  // di layar kosong yang tak bisa dijelaskan.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProyekId((s) =>
      s || (dariUrl && proyekList.some((p) => p.id === dariUrl) ? dariUrl : "") || proyekList[0]?.id || "");
  }, [proyekList, dariUrl]);

  const { data, memuat, galat: galatMuatIzin, muatUlang } = useData<Muatan>(
    proyekId ? `/api/v1/proyek/${proyekId}/izin` : null,
  );
  const galat = galatMuatProyek
    ? "Gagal memuat daftar proyek"
    : galatMuatIzin ? "Gagal memuat perizinan proyek" : null;

  const simpan = useCallback(async () => {
    if (!proyekId) return;
    if (!fJenis.trim()) { setGalatModal("Jenis izin wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/proyek/${proyekId}/izin`, {
        jenis: fJenis.trim(),
        status: fStatus,
        nomor: fNomor.trim() || null,
        penerbit: fPenerbit.trim() || null,
        berlaku_dari: fDari || null,
        berlaku_sampai: fSampai || null,
        biaya: fBiaya || null,
        menghalangi_mulai: fMenghalangi,
      });
      setTambah(false);
      setFJenis(""); setFNomor(""); setFPenerbit(""); setFDari(""); setFSampai(""); setFBiaya("");
      await muatUlang();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah izin");
    } finally { setMenyimpan(false); }
  }, [proyekId, fJenis, fStatus, fNomor, fPenerbit, fDari, fSampai, fBiaya, fMenghalangi, muatUlang]);

  const kolom: Array<Kolom<Izin>> = [
    {
      kunci: "izin", judul: "Izin", kepalaBaris: true,
      render: (i) => (
        <span style={{
          display: "block", paddingLeft: 9,
          // Pita kiri HANYA untuk yang memblokir — bukan untuk semua yang
          // bermasalah. Izin reklame kedaluwarsa tak menghentikan pekerjaan.
          borderLeft: i.memblokir ? "3px solid var(--danger)" : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13, color: C.text }}>{i.jenis}</strong>
            {i.menghalangi_mulai && (
              <span
                title="Pekerjaan tak boleh dimulai tanpa izin ini."
                style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: ".03em" }}
              >PENGHALANG</span>
            )}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {i.nomor ? i.nomor : "belum bernomor"}
            {i.penerbit ? ` · ${i.penerbit}` : ""}
          </span>
        </span>
      ),
    },
    {
      kunci: "masa", judul: "Masa berlaku",
      render: (i) => (
        <span style={{ display: "block", fontSize: 12, color: C.mid }}>
          {i.berlaku_sampai == null ? (
            // Dinyatakan eksplisit — strip kosong terbaca "datanya belum diisi".
            <span style={{ color: C.text }}>
              {i.status === "terbit" ? "Tanpa batas waktu" : "—"}
            </span>
          ) : (
            <>
              <span style={{ color: C.text }}>{tanggal(i.berlaku_sampai)}</span>
              {i.sisa_hari !== null && (
                <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                  {i.sisa_hari < 0
                    ? `lewat ${Math.abs(i.sisa_hari)} hari`
                    : `${i.sisa_hari} hari lagi`}
                </span>
              )}
            </>
          )}
        </span>
      ),
    },
    {
      kunci: "biaya", judul: "Biaya", rata: "kanan",
      render: (i) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(i.biaya)}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Keadaan",
      render: (i) => {
        const m = MASA[i.masa];
        return (
          <span title={m.arti}>
            <Lencana
              nada={m.nada}
              ikon={
                i.masa === "berlaku" ? <ShieldCheck size={11} aria-hidden="true" />
                  : i.masa === "akan_habis" ? <Clock size={11} aria-hidden="true" />
                  : i.masa === "belum_terbit" ? <FileWarning size={11} aria-hidden="true" />
                  : i.masa === "dicabut" ? <Ban size={11} aria-hidden="true" />
                  : <TriangleAlert size={11} aria-hidden="true" />
              }
            >{m.label}</Lencana>
          </span>
        );
      },
    },
  ];

  const k = data?.kesiapan;

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Stamp size={18} />}
        judul="Perizinan Proyek"
        keterangan={
          <>IMB/PBG, izin lingkungan, dan masa berlakunya. Izin dinilai terhadap{" "}
          <strong>rentang proyek</strong>, bukan hari ini saja — izin yang habis
          sebelum proyek selesai sudah bermasalah sekarang, karena pengurusan
          perpanjangan makan waktu berminggu-minggu.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambah(true); setGalatModal(null); }}
            disabled={!proyekId}>
            Catat izin
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muatUlang()} />}

      <Kartu pad="sedang">
        <label htmlFor="iz-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <Pilihan
          id="iz-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
          style={{ ...gayaInput, maxWidth: 420 }}
        >
          <option value="">— pilih proyek —</option>
          {proyekList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Pilihan>
      </Kartu>

      {/* ── Spanduk kesiapan — SATU-SATUNYA aksen halaman ini (§3d) ─────── */}
      {k && (
        k.boleh_jalan === null ? (
          <div role="status" style={{
            padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
            border: `1px solid ${C.border}`, background: "var(--surface-2)", color: C.mid,
          }}>
            <strong style={{ color: C.text }}>Belum ada izin tercatat.</strong>{" "}
            Itu bukan berarti izinnya lengkap — hanya berarti belum didata. Halaman
            ini tak bisa menjawab boleh-tidaknya pekerjaan dimulai sampai izinnya
            dimasukkan.
          </div>
        ) : k.boleh_jalan === false ? (
          <div role="alert" style={{
            padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)",
          }}>
            <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <TriangleAlert size={15} aria-hidden="true" />
              {k.memblokir.length === 1
                ? "1 izin penghalang bermasalah — pekerjaan tak boleh berjalan"
                : `${k.memblokir.length} izin penghalang bermasalah — pekerjaan tak boleh berjalan`}
            </strong>
            {/* Yang mana, disebut namanya. Spanduk yang hanya berkata "ada
                masalah" memaksa orang mencari sendiri di tabel. */}
            {k.memblokir.map((i) => (
              <span key={i.id} style={{ display: "block", fontSize: 12.5 }}>
                {i.jenis} — {MASA[i.masa].label.toLowerCase()}
                {i.sisa_hari !== null && i.sisa_hari < 0
                  ? ` ${Math.abs(i.sisa_hari)} hari lalu` : ""}
              </span>
            ))}
          </div>
        ) : (
          <div role="status" style={{
            padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
            border: "1px solid var(--success-border)", background: "var(--success-bg)",
            color: "var(--success)",
          }}>
            <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={15} aria-hidden="true" />
              Tak ada izin penghalang yang bermasalah
            </strong>
            {k.perlu_diurus.length > 0 && (
              <span style={{ display: "block", fontSize: 12.5, marginTop: 3, color: C.mid }}>
                {k.perlu_diurus.length} izin perlu diurus sebelum jatuh tempo:{" "}
                {k.perlu_diurus.map((i) => i.jenis).join(", ")}
              </span>
            )}
          </div>
        )
      )}

      {!proyekId ? (
        <Kosong
          ikon={<Stamp size={28} />}
          judul="Pilih proyek dulu"
          sebab="Izin bangunan melekat pada proyeknya — PBG diterbitkan untuk satu bangunan di satu lokasi, bukan untuk perusahaan."
        />
      ) : memuat ? (
        <Rangka tinggi={56} jumlah={4} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub={data?.proyek.end_date
              ? `dinilai terhadap tanggal selesai proyek: ${tanggal(data.proyek.end_date)}`
              : "proyek belum punya tanggal selesai — izin dinilai terhadap ambang 60 hari"}
          >
            Izin proyek
          </JudulKartu>
          <Tabel
            kolom={kolom}
            data={data?.izin ?? []}
            kunciBaris={(x) => x.id}
            caption="Izin proyek beserta masa berlaku dan pengaruhnya terhadap boleh-tidaknya pekerjaan berjalan"
            tandaiBaris={(x) => (x.memblokir ? "bahaya" : undefined)}
            kosong={
              <Kosong
                ikon={<Stamp size={28} />}
                judul="Belum ada izin tercatat"
                sebab="Catat PBG lebih dulu — itu yang paling sering diperiksa, dan yang ketiadaannya bisa menyegel pekerjaan."
              />
            }
          />
        </Kartu>
      )}

      <DialogBersama
        terbuka={tambah}
        judul="Catat izin proyek"
        keterangan="Izin berstatus TERBIT wajib punya nomor dan tanggal mulai berlaku — izin tanpa nomor tak bisa ditunjukkan saat pengawas datang."
        onTutup={() => setTambah(false)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTambah(false)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpan()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan izin"}
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

        <Medan id="iz-jenis" label="Jenis izin" wajib
          keterangan="Teks bebas — tiap daerah punya sebutan sendiri. Daftar di bawahnya hanya usulan."
          anak={
            <>
              <input id="iz-jenis" value={fJenis} list="iz-usul"
                onChange={(e) => setFJenis(e.target.value)} style={gayaInput} />
              <datalist id="iz-usul">
                {USUL_JENIS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </>
          }
        />
        <Medan id="iz-status" label="Status"
          anak={
            <Pilihan id="iz-status" value={fStatus}
              onChange={(e) => setFStatus(e.target.value)} style={gayaInput}>
              <option value="rencana">Rencana</option>
              <option value="diajukan">Diajukan</option>
              <option value="terbit">Terbit</option>
              <option value="ditolak">Ditolak</option>
              <option value="dicabut">Dicabut</option>
            </Pilihan>
          }
        />
        <Medan id="iz-nomor" label="Nomor izin"
          keterangan={fStatus === "terbit" ? "Wajib karena statusnya TERBIT." : "Diisi setelah izinnya terbit."}
          wajib={fStatus === "terbit"}
          anak={
            <input id="iz-nomor" value={fNomor}
              onChange={(e) => setFNomor(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="iz-penerbit" label="Penerbit"
          keterangan="Dinas atau lembaga yang menerbitkan."
          anak={
            <input id="iz-penerbit" value={fPenerbit}
              onChange={(e) => setFPenerbit(e.target.value)} style={gayaInput} />
          }
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="iz-dari" label="Berlaku dari"
              wajib={fStatus === "terbit"}
              anak={
                <input id="iz-dari" type="date" value={fDari}
                  onChange={(e) => setFDari(e.target.value)} style={gayaInput} />
              }
            />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <Medan id="iz-sampai" label="Berlaku sampai"
              keterangan="Kosongkan bila izinnya tanpa batas waktu."
              anak={
                <input id="iz-sampai" type="date" value={fSampai}
                  onChange={(e) => setFSampai(e.target.value)} style={gayaInput} />
              }
            />
          </div>
        </div>
        <Medan id="iz-biaya" label="Biaya pengurusan"
          anak={
            <input id="iz-biaya" type="number" min="0" value={fBiaya}
              onChange={(e) => setFBiaya(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="iz-halang" label="Menghalangi pekerjaan dimulai?"
          keterangan="Centang untuk izin yang tanpanya pekerjaan tak boleh berjalan (PBG). Jangan dicentang untuk yang akibatnya terbatas (izin reklame menunda papan nama, bukan pekerjaannya)."
          anak={
            <Saklar
              id="iz-halang"
              nyala={fMenghalangi}
              onUbah={setFMenghalangi}
              label="Ya, tanpa izin ini pekerjaan tak boleh dimulai"
            />
          }
        />
      </DialogBersama>
    </Halaman>
  );
}
