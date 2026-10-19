import { BACKGROUND_REMOVAL_API_URL } from "./config.js";
import { getAccessToken } from "./supabase.js";

export async function removeBackground(blob, filename) {
  const token = await getAccessToken();
  const form = new FormData();
  form.append("image", blob, filename);

  let response;
  try {
    response = await fetch(`${BACKGROUND_REMOVAL_API_URL}/api/images/remove-background`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (error) {
    console.error("Could not reach the background-removal service.", error);
    throw new Error("The background-removal service is unavailable. Check that the Python API is running.");
  }

  if (!response.ok) {
    let detail = "Background removal failed.";
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch (error) {
      console.warn("The image service returned a non-JSON error response.", error);
    }
    throw new Error(detail);
  }

  const processed = await response.blob();
  if (processed.type !== "image/png") {
    throw new Error("The image service returned an unexpected file type.");
  }
  return processed;
}
