/**
 * Token motion bersama — durasi & easing dipakai konsisten lintas portal,
 * bukan angka ditulis ulang tiap komponen. Nilai dari skill ui-animation
 * (SKILL.md §Easing defaults), didasarkan pada riset motion design
 * (Material Design + praktik umum), BUKAN dikarang sendiri.
 */
export const DURASI_ENTER_MS = 250;
export const DURASI_MOVE_MS = 250;
export const EASING_ENTER = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASING_MOVE = "cubic-bezier(0.25, 1, 0.5, 1)";

/** Threshold drag (px) sebelum swipe dianggap disengaja, bukan tak sengaja. */
export const SWIPE_THRESHOLD_PX = 80;
