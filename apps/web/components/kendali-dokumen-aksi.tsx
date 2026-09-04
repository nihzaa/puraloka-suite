"use client";

/**
 * AKSI KENDALI DOKUMEN — jalan menulis untuk `/dokumen/kendali`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Enam kemampuan tulis di API, nol jalan di layar
 * (`docs/execution/KEMATANGAN-MODUL.md`). Halamannya menghitung gambar yang
 * sudah usang, transmittal yang menggantung berbulan-bulan, dan tindakan
 * rapat yang lewat tenggat — lalu tak menyediakan satu pun cara menerbitkan
 * revisi, menandai terkirim, atau mencatat rapat berikutnya.
 *
 * ── Yang membuat modul ini berbeda dari modul aksi lain
 *
 * Tiga dari enam kemampuannya menghasilkan **bukti**, bukan catatan:
 * transmittal adalah bukti kirim, tanda tangan elektronik adalah bukti baca,
 * dan notulen adalah bukti kesepakatan. Ketiganya dipakai saat orang berselisih
 * — jadi form-nya menolak bentuk yang tak bisa dipertanggungjawabkan:
 * transmittal tanpa isi, tanda tangan tanpa objek, tindakan tanpa penanggung
 * jawab.
 */

import { useEffect, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Plus, Trash2 } from "lucide-react";
import {
  ModalDasar, TombolModal, KakiModal, gayaLabel, gayaInput, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";
import { Pilihan } from "@/components/pilihan";

type Proyek = { id: string; name: string };

function useProyek() {
  const [daftar, setDaftar] = useState<Proyek[]>([]);
  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setDaftar(r.data.projects ?? []))
      .catch(() => {});
    return () => ac.abort();
  }, []);
  return daftar;
}

function PilihProyek({ id, nilai, onUbah, daftar }: {
  id: string; nilai: string; onUbah: (v: string) => void; daftar: Proyek[];
}) {
  return (
    <div>
      <label htmlFor={id} style={gayaLabel}>Proyek</label>
      <Pilihan id={id} value={nilai} style={gayaInput} onChange={(e) => onUbah(e.target.value)}>
        <option value="">— pilih proyek —</option>
        {daftar.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Pilihan>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAMBAR / DOKUMEN TEKNIS
// ═══════════════════════════════════════════════════════════════════════════

const DISIPLIN = ["arsitektur", "struktur", "mekanikal", "elektrikal", "plumbing", "sipil", "lainnya"];
const TAHAP = ["konsep", "tender", "konstruksi", "as_built"];

/**
 * ── Revisi diketik, bukan dinaikkan otomatis
 *
 * Godaannya adalah menghitung `revisiTertinggi + 1` sendiri. Itu salah untuk
 * modul ini: nomor revisi datang dari perencana dan tercetak di kop gambarnya
 * — kalau layar menaikkannya sendiri, catatan di sistem berbeda dari kertas
 * yang dipegang orang di lapangan, dan yang dipercaya orang adalah kertasnya.
 */
export function ModalGambarBaru({ onClose, onSukses }: {
  onClose: () => void; onSukses: () => void;
}) {
  const proyek = useProyek();
  const [proyekId, setProyekId] = useState("");
  const [nomor, setNomor] = useState("");
  const [judul, setJudul] = useState("");
  const [disiplin, setDisiplin] = useState("arsitektur");
  const [revisi, setRevisi] = useState("0");
  const [tahap, setTahap] = useState("konstruksi");
  const [fileUrl, setFileUrl] = useState("");
  const [terbit, setTerbit] = useState(() => new Date().toISOString().slice(0, 10));
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const lengkap = Boolean(proyekId) && nomor.trim() !== "" && judul.trim() !== "";

  async function simpan() {
    if (!lengkap || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kendali-dokumen/gambar", {
        project_id: proyekId,
        nomor: nomor.trim(),
        judul: judul.trim(),
        disiplin,
        revisi: Number(revisi) || 0,
        tahap,
        file_url: fileUrl.trim() || undefined,
        tanggal_terbit: terbit || undefined,
        catatan: catatan.trim() || undefined,
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal mendaftarkan gambar."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-gambar" judul="Daftarkan Gambar / Dokumen Teknis" lebar={560} onClose={onClose}>
      <PilihProyek id="gb-proyek" nilai={proyekId} onUbah={setProyekId} daftar={proyek} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="gb-nomor" style={gayaLabel}>Nomor gambar</label>
          <input id="gb-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)}
            placeholder="ARS-101" style={gayaInput} />
        </div>
        <div>
          <label htmlFor="gb-revisi" style={gayaLabel}>Revisi</label>
          <input id="gb-revisi" type="number" min={0} step="1" value={revisi}
            onChange={(e) => setRevisi(e.target.value)} style={gayaInput} />
          <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Diketik sesuai kop gambarnya, <strong>bukan</strong> dinaikkan otomatis —
            yang dipercaya orang di lapangan adalah kertas yang dipegangnya.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="gb-judul" style={gayaLabel}>Judul</label>
        <input id="gb-judul" value={judul} onChange={(e) => setJudul(e.target.value)}
          placeholder="Denah lantai 2 — zona B" style={gayaInput} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="gb-disiplin" style={gayaLabel}>Disiplin</label>
          <Pilihan id="gb-disiplin" value={disiplin} style={gayaInput}
            onChange={(e) => setDisiplin(e.target.value)}>
            {DISIPLIN.map((d) => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </Pilihan>
        </div>
        <div>
          <label htmlFor="gb-tahap" style={gayaLabel}>Tahap</label>
          <Pilihan id="gb-tahap" value={tahap} style={gayaInput}
            onChange={(e) => setTahap(e.target.value)}>
            {TAHAP.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </Pilihan>
        </div>
        <div>
          <label htmlFor="gb-terbit" style={gayaLabel}>Tanggal terbit</label>
          <input id="gb-terbit" type="date" value={terbit}
            onChange={(e) => setTerbit(e.target.value)} style={gayaInput} />
        </div>
      </div>

      <div>
        <label htmlFor="gb-file" style={gayaLabel}>Tautan berkas</label>
        <input id="gb-file" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)}
          placeholder="https://…" style={gayaInput} />
      </div>

      <div>
        <label htmlFor="gb-catatan" style={gayaLabel}>Catatan</label>
        <textarea id="gb-catatan" rows={2} value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          style={{ ...gayaInput, resize: "vertical" }} />
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!lengkap || kirim}>
          {kirim ? "Menyimpan…" : "Daftarkan"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSMITTAL
// ═══════════════════════════════════════════════════════════════════════════

type BarisKiriman = { uraian: string; lembar: string };

/**
 * ── Transmittal tanpa isi adalah "bukti kirim atas ketiadaan"
 *
 * Kalimat itu milik API-nya sendiri, dan form ini menegakkannya di depan:
 * minimal satu item, dan tiap item wajib beruraian. Transmittal dipakai saat
 * pihak lain menyangkal pernah menerima gambar — daftar isinya persis yang
 * dibaca di saat itu, dan baris kosong membuat seluruh dokumen tak berguna.
 */
export function ModalTransmittalBaru({ onClose, onSukses }: {
  onClose: () => void; onSukses: () => void;
}) {
  const proyek = useProyek();
  const [proyekId, setProyekId] = useState("");
  const [nomor, setNomor] = useState("");
  const [perihal, setPerihal] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [organisasi, setOrganisasi] = useState("");
  const [maksud, setMaksud] = useState("untuk_persetujuan");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<BarisKiriman[]>([{ uraian: "", lembar: "1" }]);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const barisBelumLengkap = items.filter((i) => i.uraian.trim() === "").length;
  const lengkap = Boolean(proyekId) && nomor.trim() !== "" && perihal.trim() !== ""
    && tujuan.trim() !== "" && items.length > 0 && barisBelumLengkap === 0;

  async function simpan() {
    if (!lengkap || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kendali-dokumen/transmittal", {
        project_id: proyekId,
        nomor: nomor.trim(),
        perihal: perihal.trim(),
        tujuan_nama: tujuan.trim(),
        tujuan_organisasi: organisasi.trim() || undefined,
        maksud,
        catatan: catatan.trim() || undefined,
        items: items.map((i) => ({
          uraian: i.uraian.trim(),
          jumlah_lembar: Number(i.lembar) || 1,
        })),
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal membuat transmittal."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-transmittal" judul="Transmittal Baru" lebar={620} onClose={onClose}>
      <PilihProyek id="tm-proyek" nilai={proyekId} onUbah={setProyekId} daftar={proyek} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="tm-nomor" style={gayaLabel}>Nomor</label>
          <input id="tm-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)}
            placeholder="TRM/2026/08/021" style={gayaInput} />
        </div>
        <div>
          <label htmlFor="tm-maksud" style={gayaLabel}>Maksud</label>
          <Pilihan id="tm-maksud" value={maksud} style={gayaInput}
            onChange={(e) => setMaksud(e.target.value)}>
            <option value="untuk_persetujuan">Untuk persetujuan</option>
            <option value="untuk_pelaksanaan">Untuk pelaksanaan</option>
            <option value="untuk_informasi">Untuk informasi</option>
            <option value="untuk_tinjauan">Untuk tinjauan</option>
          </Pilihan>
        </div>
      </div>

      <div>
        <label htmlFor="tm-perihal" style={gayaLabel}>Perihal</label>
        <input id="tm-perihal" value={perihal} onChange={(e) => setPerihal(e.target.value)}
          placeholder="Penyerahan gambar struktur revisi 3" style={gayaInput} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="tm-tujuan" style={gayaLabel}>Kepada (nama)</label>
          <input id="tm-tujuan" value={tujuan} onChange={(e) => setTujuan(e.target.value)}
            style={gayaInput} />
        </div>
        <div>
          <label htmlFor="tm-org" style={gayaLabel}>Organisasi</label>
          <input id="tm-org" value={organisasi} onChange={(e) => setOrganisasi(e.target.value)}
            placeholder="PT Konsultan Pengawas" style={gayaInput} />
        </div>
      </div>

      <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", margin: 0 }}>
        <legend style={{ ...gayaLabel, marginBottom: 0, padding: "0 4px" }}>Isi kiriman</legend>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr) 32px",
            gap: 6, marginTop: 8, alignItems: "end",
          }}>
            <div>
              <label htmlFor={`tm-item-${i}`} style={{ ...gayaLabel, fontSize: 11 }}>Uraian</label>
              <input id={`tm-item-${i}`} value={it.uraian}
                onChange={(e) => setItems((p) => p.map((x, n) => n === i ? { ...x, uraian: e.target.value } : x))}
                placeholder="Gambar STR-201 rev.3" style={gayaInput} />
            </div>
            <div>
              <label htmlFor={`tm-lembar-${i}`} style={{ ...gayaLabel, fontSize: 11 }}>Lembar</label>
              <input id={`tm-lembar-${i}`} type="number" min={1} step="1" value={it.lembar}
                onChange={(e) => setItems((p) => p.map((x, n) => n === i ? { ...x, lembar: e.target.value } : x))}
                style={gayaInput} />
            </div>
            <button type="button" aria-label={`Hapus isi ${i + 1}`}
              disabled={items.length === 1}
              onClick={() => setItems((p) => p.filter((_, n) => n !== i))}
              style={{
                height: 34, borderRadius: 6, border: `1px solid ${C.border}`,
                background: "var(--surface)",
                color: items.length === 1 ? C.muted : "var(--danger)",
                cursor: items.length === 1 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((p) => [...p, { uraian: "", lembar: "1" }])}
          style={{
            marginTop: 10, padding: "5px 10px", borderRadius: 6, fontSize: 12,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.mid, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
          }}>
          <Plus size={12} aria-hidden="true" /> Tambah isi
        </button>
        {barisBelumLengkap > 0 && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--warning)", lineHeight: 1.5 }}>
            {barisBelumLengkap} baris tanpa uraian — transmittal tanpa isi adalah bukti
            kirim atas ketiadaan.
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="tm-catatan" style={gayaLabel}>Catatan</label>
        <textarea id="tm-catatan" rows={2} value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          style={{ ...gayaInput, resize: "vertical" }} />
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!lengkap || kirim}>
          {kirim ? "Menyimpan…" : "Buat transmittal"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

export type TransmittalRingkas = {
  id: string; nomor: string; status: string;
  perihal?: string | null; tujuan_nama?: string | null;
};

/**
 * Tandai transmittal terkirim / diterima.
 *
 * Satu modal untuk dua langkah berurutan — yang muncul mengikuti status, sama
 * seperti nota kredit di `/procurement/lanjutan`. Basis menolak "diterima"
 * atas transmittal yang belum pernah dikirim (23514), jadi urutannya
 * ditegakkan dua kali dan layar tak pernah menawarkan langkah yang mustahil.
 */
export function ModalStatusTransmittal({ transmittal, onClose, onSukses }: {
  transmittal: TransmittalRingkas; onClose: () => void; onSukses: () => void;
}) {
  const terima = transmittal.status === "dikirim";
  const [oleh, setOleh] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function jalankan() {
    if (kirim) return;
    setKirim(true); setGalat(null);
    try {
      if (terima) {
        await api.patch(`/api/v1/kendali-dokumen/transmittal/${transmittal.id}/terima`,
          { diterima_oleh: oleh.trim() || undefined });
      } else {
        await api.patch(`/api/v1/kendali-dokumen/transmittal/${transmittal.id}/kirim`, {});
      }
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal memperbarui transmittal."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-tm-status"
      judul={terima ? `Tandai ${transmittal.nomor} diterima` : `Tandai ${transmittal.nomor} terkirim`}
      lebar={460} onClose={onClose}>
      <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
        {transmittal.perihal}
        {transmittal.tujuan_nama && <> · kepada <strong style={{ color: C.text }}>{transmittal.tujuan_nama}</strong></>}
      </p>

      {terima ? (
        <div>
          <label htmlFor="tm-diterima-oleh" style={gayaLabel}>Diterima oleh</label>
          <input id="tm-diterima-oleh" value={oleh} onChange={(e) => setOleh(e.target.value)}
            placeholder="Nama penerima di pihak tujuan" style={gayaInput} />
          <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Boleh dikosongkan, tapi nama penerima itulah yang ditanya saat pihak lain
            menyangkal pernah menerimanya.
          </p>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          Waktu kirim dicatat server. Sesudah ini transmittal bisa ditandai diterima —
          urutannya tak bisa dibalik.
        </p>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={jalankan} mati={kirim}>
          {kirim ? "Menyimpan…" : terima ? "Tandai diterima" : "Tandai terkirim"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTULEN RAPAT
// ═══════════════════════════════════════════════════════════════════════════

type BarisTindakan = { uraian: string; pj: string; tenggat: string };

/**
 * ── Tindakan tanpa penanggung jawab adalah tindakan yang tak dikerjakan
 *
 * Halaman induk menghitung tindakan yang lewat tenggat sebagai angka
 * tersendiri — dan angka itu hanya berarti kalau tiap tindakan punya nama di
 * belakangnya. Notulen boleh saja tak punya tindakan sama sekali (rapat
 * informatif), tapi tindakan yang DITULIS wajib bernama dan bertenggat.
 */
export function ModalNotulenBaru({ onClose, onSukses }: {
  onClose: () => void; onSukses: () => void;
}) {
  const proyek = useProyek();
  const [proyekId, setProyekId] = useState("");
  const [nomor, setNomor] = useState("");
  const [judul, setJudul] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [jenis, setJenis] = useState("mingguan");
  const [tempat, setTempat] = useState("");
  const [hadir, setHadir] = useState("");
  const [pembahasan, setPembahasan] = useState("");
  const [tindakan, setTindakan] = useState<BarisTindakan[]>([]);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const tindakanBelumLengkap = tindakan.filter(
    (t) => t.uraian.trim() === "" || t.pj.trim() === "" || t.tenggat === "").length;
  const lengkap = Boolean(proyekId) && nomor.trim() !== "" && judul.trim() !== ""
    && tindakanBelumLengkap === 0;

  async function simpan() {
    if (!lengkap || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kendali-dokumen/notulen", {
        project_id: proyekId,
        nomor: nomor.trim(),
        judul: judul.trim(),
        tanggal: tanggal || undefined,
        jenis,
        tempat: tempat.trim() || undefined,
        hadir: hadir.trim() || undefined,
        pembahasan: pembahasan.trim() || undefined,
        tindakan: tindakan.map((t) => ({
          uraian: t.uraian.trim(), pj_nama: t.pj.trim(), tenggat: t.tenggat,
        })),
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menyimpan notulen."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-notulen" judul="Notulen Rapat Baru" lebar={620} onClose={onClose}>
      <PilihProyek id="nt-proyek" nilai={proyekId} onUbah={setProyekId} daftar={proyek} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="nt-nomor" style={gayaLabel}>Nomor</label>
          <input id="nt-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)}
            placeholder="MOM/2026/08/012" style={gayaInput} />
        </div>
        <div>
          <label htmlFor="nt-tanggal" style={gayaLabel}>Tanggal</label>
          <input id="nt-tanggal" type="date" value={tanggal}
            onChange={(e) => setTanggal(e.target.value)} style={gayaInput} />
        </div>
        <div>
          <label htmlFor="nt-jenis" style={gayaLabel}>Jenis</label>
          <Pilihan id="nt-jenis" value={jenis} style={gayaInput}
            onChange={(e) => setJenis(e.target.value)}>
            <option value="mingguan">Mingguan</option>
            <option value="bulanan">Bulanan</option>
            <option value="koordinasi">Koordinasi</option>
            <option value="teknis">Teknis</option>
            <option value="khusus">Khusus</option>
          </Pilihan>
        </div>
      </div>

      <div>
        <label htmlFor="nt-judul" style={gayaLabel}>Judul</label>
        <input id="nt-judul" value={judul} onChange={(e) => setJudul(e.target.value)}
          placeholder="Rapat koordinasi mingguan minggu ke-33" style={gayaInput} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="nt-tempat" style={gayaLabel}>Tempat</label>
          <input id="nt-tempat" value={tempat} onChange={(e) => setTempat(e.target.value)}
            style={gayaInput} />
        </div>
        <div>
          <label htmlFor="nt-hadir" style={gayaLabel}>Hadir</label>
          <input id="nt-hadir" value={hadir} onChange={(e) => setHadir(e.target.value)}
            placeholder="Nama, dipisah koma" style={gayaInput} />
        </div>
      </div>

      <div>
        <label htmlFor="nt-pembahasan" style={gayaLabel}>Pembahasan</label>
        <textarea id="nt-pembahasan" rows={3} value={pembahasan}
          onChange={(e) => setPembahasan(e.target.value)}
          style={{ ...gayaInput, resize: "vertical" }} />
      </div>

      <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", margin: 0 }}>
        <legend style={{ ...gayaLabel, marginBottom: 0, padding: "0 4px" }}>
          Tindakan yang disepakati
        </legend>
        {tindakan.length === 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Boleh kosong untuk rapat informatif. Tindakan yang <strong>ditulis</strong>{" "}
            wajib punya nama dan tenggat — tanpa keduanya ia tak pernah dikerjakan,
            dan hitungan &ldquo;lewat tenggat&rdquo; di halaman ini jadi bohong.
          </p>
        )}
        {tindakan.map((t, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "minmax(0,2.4fr) minmax(0,1.2fr) minmax(0,1.2fr) 32px",
            gap: 6, marginTop: 8, alignItems: "end",
          }}>
            <div>
              <label htmlFor={`nt-t-${i}-uraian`} style={{ ...gayaLabel, fontSize: 11 }}>Tindakan</label>
              <input id={`nt-t-${i}-uraian`} value={t.uraian}
                onChange={(e) => setTindakan((p) => p.map((x, n) => n === i ? { ...x, uraian: e.target.value } : x))}
                style={gayaInput} />
            </div>
            <div>
              <label htmlFor={`nt-t-${i}-pj`} style={{ ...gayaLabel, fontSize: 11 }}>Penanggung jawab</label>
              <input id={`nt-t-${i}-pj`} value={t.pj}
                onChange={(e) => setTindakan((p) => p.map((x, n) => n === i ? { ...x, pj: e.target.value } : x))}
                style={gayaInput} />
            </div>
            <div>
              <label htmlFor={`nt-t-${i}-tenggat`} style={{ ...gayaLabel, fontSize: 11 }}>Tenggat</label>
              <input id={`nt-t-${i}-tenggat`} type="date" value={t.tenggat}
                onChange={(e) => setTindakan((p) => p.map((x, n) => n === i ? { ...x, tenggat: e.target.value } : x))}
                style={gayaInput} />
            </div>
            <button type="button" aria-label={`Hapus tindakan ${i + 1}`}
              onClick={() => setTindakan((p) => p.filter((_, n) => n !== i))}
              style={{
                height: 34, borderRadius: 6, border: `1px solid ${C.border}`,
                background: "var(--surface)", color: "var(--danger)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button"
          onClick={() => setTindakan((p) => [...p, { uraian: "", pj: "", tenggat: "" }])}
          style={{
            marginTop: 10, padding: "5px 10px", borderRadius: 6, fontSize: 12,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.mid, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
          }}>
          <Plus size={12} aria-hidden="true" /> Tambah tindakan
        </button>
        {tindakanBelumLengkap > 0 && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--warning)", lineHeight: 1.5 }}>
            {tindakanBelumLengkap} tindakan belum punya uraian, penanggung jawab, atau
            tenggat.
          </p>
        )}
      </fieldset>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!lengkap || kirim}>
          {kirim ? "Menyimpan…" : "Simpan notulen"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TANDA TANGAN ELEKTRONIK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ── Sidik dihitung SERVER dari isi yang dikirim
 *
 * API menuliskannya sendiri: kalau klien yang mengirim hash-nya, ia bisa
 * mengirim hash dokumen lain — "dan tanda tangannya jadi bukti atas sesuatu
 * yang tak pernah dibaca penandatangannya".
 *
 * Layar ini karena itu mengirim ISI, bukan ringkasannya, dan menampilkan isi
 * itu apa adanya sebelum ditandatangani. Yang ditandatangani harus yang
 * terbaca — bukan judul dokumennya, bukan nomornya.
 */
export function ModalTandaTangan({ jenisObjek, objekId, isi, judul, onClose, onSukses }: {
  jenisObjek: string; objekId: string; isi: string; judul: string;
  onClose: () => void; onSukses: () => void;
}) {
  const [peran, setPeran] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function tandaTangani() {
    if (kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kendali-dokumen/tanda-tangan", {
        jenis_objek: jenisObjek,
        objek_id: objekId,
        isi,
        peran_penanda: peran.trim() || undefined,
        alasan: alasan.trim() || undefined,
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menandatangani."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-ttd" judul={`Tanda tangani ${judul}`} lebar={520} onClose={onClose}>
      <div>
        <div style={{ ...gayaLabel, marginBottom: 6 }}>Yang Anda tandatangani</div>
        {/* Isi ditampilkan UTUH, bukan diringkas. Sidiknya dihitung dari teks
            persis ini — meringkasnya di layar berarti orang menandatangani
            sesuatu yang berbeda dari yang ia baca. */}
        <div style={{
          fontSize: 12, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap",
          padding: "10px 12px", borderRadius: 6, maxHeight: 220, overflowY: "auto",
          background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
        }}>{isi}</div>
        <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          Sidik digital dihitung server dari teks ini persis. Kalau isinya berubah
          kemudian, tanda tangan ini tak lagi cocok — dan ketidakcocokan itulah
          buktinya.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="ttd-peran" style={gayaLabel}>Peran Anda</label>
          <input id="ttd-peran" value={peran} onChange={(e) => setPeran(e.target.value)}
            placeholder="Project Manager · QA/QC" style={gayaInput} />
        </div>
        <div>
          <label htmlFor="ttd-alasan" style={gayaLabel}>Alasan</label>
          <input id="ttd-alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)}
            placeholder="Menyetujui · menyaksikan" style={gayaInput} />
        </div>
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={tandaTangani} mati={kirim}>
          {kirim ? "Menandatangani…" : "Tanda tangani"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}
