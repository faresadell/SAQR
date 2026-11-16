import "server-only";

/** The optional `image` form field as bytes (already shrunk by the browser); null when nothing was chosen. */
export async function pickedImage(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("image");
  return file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : null;
}
