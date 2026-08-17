"use client";

/**
 * TAGIHAN PEKERJAAN TAMBAH — menagih change order yang ditagih TERSENDIRI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA JALUR INI HARUS ADA, DAN KENAPA IA BERBAHAYA KALAU SALAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `change_orders.billing_mode` punya tiga nilai, dan dua di antaranya
 * **sengaja TIDAK menaikkan `contract_value`** (`lib/penagihan-co.ts`):
 *
 *     include_termin   nilai kontrak naik → IPC menagihnya sesuai progres
 *     separate_co      nilai kontrak TIDAK naik → ditagih tersendiri
 *     final_account    nilai kontrak TIDAK naik → ditahan sampai akhir
 *
 * Alasannya menghindari tagihan ganda: kalau nilai kontrak naik DAN tagihan
 * terpisahnya terbit, pekerjaan yang sama tertagih dua kali lewat dua jalur
 * yang masing-masing terlihat benar.
 *
 * Tapi sampai 2026-08-16 **tagihan terpisahnya tak punya jalan sama sekali**.
 * Jadi pekerjaan tambah yang sudah disetujui tak tertagih lewat jalur mana
 * pun, dan yang terjadi berikutnya bisa ditebak: seseorang mengubah
 * `billing_mode` jadi `include_termin` belakangan supaya tertagih — dan
 * selisih waktu antara "sudah dikerjakan" dan "baru naik nilai kontraknya"
 * jadi sengketa.
 *
 * ── Nilainya TIDAK bisa diketik
 *
 * Angkanya diambil server dari `total_amount_delta` CO-nya. Yang
 * menandatangani persetujuan bukan yang menerbitkan tagihan, dan kotak isian
 * di sini akan jadi tempat kedua angka itu berpisah.
 *
 * ── Yang SUDAH ditagih tetap ditampilkan
 *
 * Bukan disaring habis. CO yang hilang dari daftar akan dicari orang, tak
 * ketemu, lalu ditagih lewat jalur lain — persis tagihan ganda yang seluruh
 * rancangan ini hindari.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  ModalDasar, TombolModal, KakiModal, gayaLabel, gayaInput, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";

type Proyek = { id: string; name: string };

export type CoSiapTagih = {
  id: string;
  co_number: string;
  title: string;
  total_amount_delta: number | string;
  billing_mode: string | null;
  approved_at: string | null;
  project_id: string;
  projects: Proyek | Proyek[] | null;
  tagihan: { id: string; invoice_number: string; status: string } | null;
};

const satu = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const rupiah = (n: number | string) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(Number(n));

const tanggal = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Arti tiap cara tagih — DISALIN dari `ARTI_CARA_TAGIH` di API.
 *
 * `apps/web` tak bergantung pada `apps/api` dan `packages/shared` kosong.
 * Kalau keduanya berpisah, yang terjadi adalah kalimat di layar berbeda dari
 * aturan yang ditegakkan server — dan yang dibaca orang saat memutuskan
 * adalah kalimat di layar.
 */
const ARTI: Record<string, string> = {
  separate_co: "ditagih tersendiri di luar termin",
  final_account: "ditahan sampai perhitungan akhir",
};

export function ModalTagihanCo({ onClose, onSukses }: {
  onClose: () => void; onSukses: () => void;
}) {
  const [daftar, setDaftar] = useState<CoSiapTagih[]>([]);
  const [pilih, setPilih] = useState("");
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [pajak, setPajak] = useState("");
  const [catatan, setCatatan] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback((signal?: AbortSignal) =>
    api.get<{ data: CoSiapTagih[] }>("/api/v1/change-orders/siap-tagih", { signal })
      .then((r) => setDaftar(r.data.data ?? []))
      .catch((e) => {
        if ((e as { name?: string })?.name === "CanceledError") return;
        setGalat(pesanGalat(e, "Gagal memuat change order siap tagih."));
      })
      .finally(() => setMemuat(false)),
    []);

  useEffect(() => {
    const ac = makeAbortController();
    void muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const belum = useMemo(() => daftar.filter((c) => !c.tagihan), [daftar]);
  const sudah = useMemo(() => daftar.filter((c) => c.tagihan), [daftar]);
  const terpilih = useMemo(() => belum.find((c) => c.id === pilih) ?? null, [belum, pilih]);

  const angkaPajak = pajak.trim() === "" ? 0 : Number(pajak);
  const pajakTakSah = !Number.isFinite(angkaPajak) || angkaPajak < 0;

  const halangan =
    belum.length === 0 ? null
    : !pilih ? "Pilih change order yang mau ditagih."
    : !jatuhTempo ? "Tanggal jatuh tempo wajib diisi."
    : pajakTakSah ? "Nilai pajak tak boleh negatif."
    : null;

  async function simpan() {
    if (halangan || !terpilih || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/finance/invoices", {
        project_id: terpilih.project_id,
        invoice_type: "change_order_billing",
        change_order_id: terpilih.id,
        // `base_amount` SENGAJA tak dikirim. Server mengambilnya dari
        // `total_amount_delta` CO-nya; mengirimkannya dari sini membuka
        // celah agar tagihan berbeda dari yang disetujui.
        tax_amount: angkaPajak || undefined,
        due_date: jatuhTempo,
        description: `Pekerjaan tambah ${terpilih.co_number} — ${terpilih.title}`,
        notes: catatan.trim() || undefined,
      });
      setPilih(""); setCatatan("");
      await muat();
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menerbitkan tagihan pekerjaan tambah."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-tagihan-co" judul="Tagihan pekerjaan tambah"
      lebar={640} onClose={onClose}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.mid, lineHeight: 1.55 }}>
        Change order yang <strong>sudah disetujui</strong> dan cara tagihnya
        tersendiri — jadi nilainya tidak ikut naik ke kontrak, dan IPC tidak
        menagihnya. Yang bercara tagih <em>include_termin</em> tak muncul di sini:
        ia sudah tertagih lewat IPC.
      </p>

      {memuat ? (
        <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Memuat…</p>
      ) : belum.length === 0 ? (
        <div style={{
          padding: "12px 14px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.55,
          background: "var(--surface-subtle)", border: `1px dashed ${C.border}`,
          color: C.mid,
        }}>
          <strong style={{ color: C.text }}>Tak ada yang menunggu ditagih.</strong>{" "}
          {sudah.length > 0
            ? `${sudah.length} pekerjaan tambah sudah punya tagihannya, terdaftar di bawah.`
            : "Change order baru muncul di sini setelah disetujui DAN cara tagihnya "
              + "disetel “tersendiri” atau “perhitungan akhir”."}
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="tc-co" style={gayaLabel}>Change order</label>
            <select id="tc-co" value={pilih} style={gayaInput}
              onChange={(e) => setPilih(e.target.value)}>
              <option value="">— pilih pekerjaan tambah —</option>
              {belum.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.co_number} — {c.title} · {rupiah(c.total_amount_delta)}
                </option>
              ))}
            </select>
          </div>

          {terpilih && (
            <div style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6,
              background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
              color: C.mid,
            }}>
              <div>
                Proyek <strong style={{ color: C.text }}>
                  {satu(terpilih.projects)?.name ?? "—"}
                </strong>
              </div>
              <div>
                Disetujui {tanggal(terpilih.approved_at)} ·{" "}
                {ARTI[terpilih.billing_mode ?? ""] ?? terpilih.billing_mode}
              </div>
              {/* Nilainya DIPAJANG, bukan bisa diketik. Yang menandatangani
                  persetujuan bukan yang menerbitkan tagihan, dan kotak isian
                  di sini akan jadi tempat kedua angka itu berpisah. */}
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, color: C.text }}>
                {rupiah(terpilih.total_amount_delta)}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                diambil dari nilai CO yang disetujui — tak bisa diubah di sini
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <div>
              <label htmlFor="tc-tempo" style={gayaLabel}>Jatuh tempo</label>
              <input id="tc-tempo" type="date" value={jatuhTempo} style={gayaInput}
                onChange={(e) => setJatuhTempo(e.target.value)} />
            </div>
            <div>
              <label htmlFor="tc-pajak" style={gayaLabel}>PPN (Rp)</label>
              <input id="tc-pajak" type="number" min="0" value={pajak} style={gayaInput}
                onChange={(e) => setPajak(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="tc-catatan" style={gayaLabel}>Catatan</label>
            <input id="tc-catatan" value={catatan} style={gayaInput}
              placeholder="mis. sesuai BA perubahan lingkup tanggal 12 Juni"
              onChange={(e) => setCatatan(e.target.value)} />
          </div>
        </>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        {halangan && (
          <span style={{
            fontSize: 11.5, color: C.mid, marginRight: "auto",
            maxWidth: "40ch", lineHeight: 1.45, alignSelf: "center",
          }}>{halangan}</span>
        )}
        <TombolModal onClick={onClose}>Tutup</TombolModal>
        {belum.length > 0 && (
          <TombolModal utama onClick={simpan} mati={!!halangan || kirim}>
            {kirim ? "Menerbitkan…" : "Terbitkan tagihan"}
          </TombolModal>
        )}
      </KakiModal>

      {sudah.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.mid, marginBottom: 6 }}>
            Sudah ditagih ({sudah.length})
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12, lineHeight: 1.7 }}>
            {sudah.map((c) => (
              <li key={c.id} style={{ color: C.mid }}>
                <strong style={{ color: C.text }}>{c.co_number}</strong> — {c.title}
                {" · "}{rupiah(c.total_amount_delta)}
                {" · "}
                <span style={{ fontFamily: "ui-monospace, monospace" }}>
                  {c.tagihan!.invoice_number}
                </span>
                {" "}<span style={{ color: C.muted }}>({c.tagihan!.status})</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Ditampilkan dengan sengaja. CO yang hilang dari daftar akan dicari orang,
            tak ketemu, lalu ditagih lewat jalur lain — persis tagihan ganda yang
            seluruh rancangan ini hindari.
          </p>
        </div>
      )}
    </ModalDasar>
  );
}
