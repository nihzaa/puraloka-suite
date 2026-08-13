/**
 * LIGHTBOX — backdrop menutup, gambar TIDAK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Backdrop lightbox sempat berupa `<div onClick={onClose}>` yang MEMBUNGKUS
 * gambarnya. Bentuk itu bekerja hanya karena gambar memasang
 * `onClick={e => e.stopPropagation()}` — handler yang tak melakukan apa pun
 * kecuali menahan klik induknya.
 *
 * Ia diganti struktur SAUDARA: backdrop `<button>` penuh-layar di belakang,
 * gambar di depannya. Tiga cacat hilang sekaligus (elemen statis yang bisa
 * diklik, gambar non-interaktif yang diberi handler, dan pengumuman pembaca
 * layar yang menganggap seluruh lightbox satu benda).
 *
 * Tapi perubahan itu punya cara gagal yang senyap: kalau `zIndex` gambar
 * hilang, backdrop naik ke atasnya dan **mengklik gambar akan menutup
 * lightbox** — persis kebalikan dari yang diinginkan, dan tak ada satu pun
 * galat yang muncul. Data dev tak punya foto, jadi jalur ini tak bisa
 * diperiksa lewat UI; test inilah satu-satunya yang menjaganya.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { ProgressLogList } from "./progress-log-list";

afterEach(cleanup);

/**
 * Satu entri progres berisi satu foto — cukup untuk memunculkan lightbox.
 * Bentuknya mengikuti `ProgressLog` di `lib/api.ts`, bukan dikarang: percobaan
 * pertama memakai nama medan Indonesia (`foto`, `catatan`) dan komponennya
 * merender NOL gambar — test merah karena datanya salah, bukan kodenya.
 */
const LOG = [
  {
    id: "log-1",
    pct_overall: 40,
    weather: "cerah",
    worker_count: 8,
    notes: "Pengecoran kolom lantai 2",
    logged_at: "2026-08-01T02:00:00.000Z",
    created_at: "2026-08-01T02:00:00.000Z",
    reporter: { id: "u1", name: "Budi", role: "mandor" },
    photos: [
      { id: "f1", url: "https://contoh.test/foto-1.jpg", caption: null, taken_at: null },
    ],
  },
];

describe("Lightbox progres", () => {
  it("backdrop punya nama yang bisa dibaca DAN tak menambah perhentian Tab", async () => {
    render(<ProgressLogList logs={LOG} projectId="p-1" />);

    const thumb = screen.getAllByRole("img")[0];
    await userEvent.click(thumb);

    const penuh = await screen.findByAltText("Foto lapangan");
    expect(penuh).toBeTruthy();

    // Backdrop = tombol ber-`aria-hidden` + `tabIndex={-1}`.
    //
    // Keduanya disengaja: klik-latar adalah kenyamanan TETIKUS, sementara
    // papan tik sudah punya Esc dan tombol X. Menjadikannya perhentian Tab
    // justru memperpanjang jalan menuju tombol yang sebenarnya — memenuhi
    // linter dengan cara yang membuat navigasi lebih buruk.
    const backdrop = document.querySelector('button[aria-hidden="true"]');
    expect(backdrop, "backdrop harus ada sebagai <button>").toBeTruthy();
    expect(backdrop?.getAttribute("tabindex")).toBe("-1");
  });

  it("gambar penuh TIDAK punya handler klik sendiri", async () => {
    render(<ProgressLogList logs={LOG} projectId="p-1" />);
    await userEvent.click(screen.getAllByRole("img")[0]);
    const penuh = await screen.findByAltText("Foto lapangan");

    // Bukti bahwa `stopPropagation` benar-benar tak diperlukan lagi: klik
    // pada gambar tak boleh menggelembung ke backdrop, karena backdrop
    // BUKAN leluhurnya. Kalau suatu saat seseorang mengembalikan struktur
    // bersarang, klik gambar akan menutup lightbox dan test ini merah.
    await userEvent.click(penuh);
    expect(screen.queryByAltText("Foto lapangan"), "klik gambar TIDAK boleh menutup").toBeTruthy();
  });

  it("klik backdrop menutup lightbox", async () => {
    render(<ProgressLogList logs={LOG} projectId="p-1" />);
    await userEvent.click(screen.getAllByRole("img")[0]);
    await screen.findByAltText("Foto lapangan");

    const backdrop = document.querySelector('button[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);
    expect(screen.queryByAltText("Foto lapangan")).toBeNull();
  });
});
