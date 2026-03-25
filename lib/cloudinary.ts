// lib/cloudinary.ts

const CLOUD_NAME = "dbcwwlbks";
const UPLOAD_PRESET = "subida_web";

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) throw new Error("Error al subir imagen a Cloudinary");

  const data = await res.json();
  return data.secure_url; // 👈 Esta es la URL que guardas en Firebase
}