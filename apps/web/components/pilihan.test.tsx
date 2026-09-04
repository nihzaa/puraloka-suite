import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pilihan } from "./pilihan";

// ───────────────────────────────────────────────────────────────────────────
// `Pilihan` menggantikan <select> di 418 tempat. Cacat apa pun di sini
// menyebar ke seluruh aplikasi sekaligus — dan sebagian di antaranya
// memilih PROYEK, KLIEN, dan AKUN KAS.
//
// Yang diuji BUKAN tampilannya, melainkan tiga hal yang diam kalau salah:
//   · pembacaan <option> dari .map() (bentuk paling umum di repo ini)
//   · label yang dirakit dari beberapa anak — String(array) menyisipkan koma
//   · nilai yang dikirim ke onChange saat dipilih
// ───────────────────────────────────────────────────────────────────────────

describe("Pilihan", () => {
  it("membaca <option> statis DAN hasil .map()", async () => {
    const daftar = [{ id: "a", nama: "Alfa" }, { id: "b", nama: "Beta" }];
    render(
      <Pilihan value="" onChange={() => {}} aria-label="Proyek">
        <option value="">— pilih —</option>
        {daftar.map((d) => (
          <option key={d.id} value={d.id}>{d.nama}</option>
        ))}
      </Pilihan>,
    );
    await userEvent.click(screen.getByRole("button", { name: /proyek/i }));
    expect(screen.getByText("Alfa")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("merakit label dari beberapa anak tanpa menyisipkan koma", async () => {
    // String(array) menghasilkan "Beta, (", "aktif", ")" — cacat yang hanya
    // terlihat kalau seseorang membaca labelnya di layar.
    const r = { id: "b", nama: "Beta", status: "aktif" };
    render(
      <Pilihan value="" onChange={() => {}} aria-label="RAP">
        <option value={r.id}>{r.nama} ({r.status})</option>
      </Pilihan>,
    );
    await userEvent.click(screen.getByRole("button", { name: /rap/i }));
    expect(screen.getByText("Beta (aktif)")).toBeTruthy();
  });

  it("mengirim value lewat onChange, bentuknya sama seperti <select>", async () => {
    const onChange = vi.fn();
    render(
      <Pilihan value="" onChange={onChange} aria-label="Status">
        <option value="">— pilih —</option>
        <option value="aktif">Aktif</option>
      </Pilihan>,
    );
    await userEvent.click(screen.getByRole("button", { name: /status/i }));
    await userEvent.click(screen.getByText("Aktif"));
    expect(onChange).toHaveBeenCalledWith({ target: { value: "aktif" } });
  });

  it("menyaring lewat kotak cari saat pilihannya banyak", async () => {
    const banyak = Array.from({ length: 12 }, (_, i) => ({ id: String(i), nama: "Item " + i }));
    render(
      <Pilihan value="" onChange={() => {}} aria-label="Material">
        {banyak.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
      </Pilihan>,
    );
    await userEvent.click(screen.getByRole("button", { name: /material/i }));
    await userEvent.type(screen.getByLabelText("Cari pilihan"), "Item 7");
    expect(screen.getByText("Item 7")).toBeTruthy();
    expect(screen.queryByText("Item 3")).toBeNull();
  });

  it("TIDAK menampilkan kotak cari untuk daftar pendek", async () => {
    // Memaksa kotak cari pada "Aktif / Nonaktif" menambah satu langkah tanpa
    // menolong siapa pun — dropdown yang lebih lambat dipakai adalah kemunduran.
    render(
      <Pilihan value="" onChange={() => {}} aria-label="Status">
        <option value="a">Aktif</option>
        <option value="n">Nonaktif</option>
      </Pilihan>,
    );
    await userEvent.click(screen.getByRole("button", { name: /status/i }));
    expect(screen.queryByLabelText("Cari pilihan")).toBeNull();
  });

  it("panah bawah + Enter memilih baris yang disorot", async () => {
    const onChange = vi.fn();
    render(
      <Pilihan value="" onChange={onChange} aria-label="Peran">
        <option value="x">Pertama</option>
        <option value="y">Kedua</option>
      </Pilihan>,
    );
    const tombol = screen.getByRole("button", { name: /peran/i });
    await userEvent.click(tombol);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith({ target: { value: "y" } });
  });
});
