import { supabase } from "@/lib/supabase";

const BUCKET = "project-photos";

export async function uploadProgressPhoto(
  projectId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `projects/${projectId}/${timestamp}-${rand}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(`Upload gagal: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteStoragePhoto(photoUrl: string): Promise<void> {
  // Extract path from public URL: .../storage/v1/object/public/project-photos/<path>
  const marker = `/object/public/${BUCKET}/`;
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return;

  const path = photoUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Hapus foto gagal: ${error.message}`);
}
