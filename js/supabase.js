import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config.js";

let clientPromise;

async function getClient() {
  if (!supabaseConfigured) {
    throw new Error("Supabase is not configured. Add your project URL and anon key in js/config.js.");
  }

  clientPromise ??= import("https://esm.sh/@supabase/supabase-js@2.57.4")
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    }));

  return clientPromise;
}

export async function getSession() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function signIn(email, password) {
  const client = await getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return data.session;
}

export async function signUp(email, password) {
  const client = await getClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
  return data.session;
}

export async function sendPasswordReset(email, redirectTo) {
  const client = await getClient();
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    throw error;
  }
}

export async function updatePassword(password) {
  const client = await getClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    throw error;
  }
}

export async function signOut() {
  const client = await getClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function onAuthStateChange(callback) {
  const client = await getClient();
  const { data } = client.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export async function getAccessToken() {
  const session = await getSession();
  if (!session?.access_token) {
    throw new Error("Your session has expired. Sign in again to continue.");
  }
  return session.access_token;
}

export async function uploadImage(image, userId) {
  const client = await getClient();
  const imageId = crypto.randomUUID();
  const storagePath = `${userId}/${imageId}/processed.png`;

  const { error: uploadError } = await client.storage
    .from("cutout-images")
    .upload(storagePath, image.blob, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data, error: insertError } = await client
    .from("images")
    .insert({
      user_id: userId,
      storage_path: storagePath,
      original_name: image.filename,
      mime_type: "image/png",
      file_size: image.blob.size,
    })
    .select("id, original_name, storage_path, mime_type, created_at")
    .single();

  if (insertError) {
    const { error: cleanupError } = await client.storage
      .from("cutout-images")
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Could not remove the unlisted uploaded image.", cleanupError);
    }
    throw insertError;
  }

  return data;
}

export async function getImages() {
  const client = await getClient();
  const { data, error } = await client
    .from("images")
    .select("id, original_name, storage_path, mime_type, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all(data.map(async (image) => {
    const { data: signed, error: signedError } = await client.storage
      .from("cutout-images")
      .createSignedUrl(image.storage_path, 60 * 10);
    if (signedError) {
      throw signedError;
    }
    return { ...image, preview_url: signed.signedUrl };
  }));
}

export async function downloadImage(image) {
  const client = await getClient();
  const { data, error } = await client.storage
    .from("cutout-images")
    .download(image.storage_path);
  if (error) {
    throw error;
  }
  return data;
}

export async function deleteImage(image) {
  const client = await getClient();
  const { error: storageError } = await client.storage
    .from("cutout-images")
    .remove([image.storage_path]);
  if (storageError) {
    throw storageError;
  }

  const { error: rowError } = await client
    .from("images")
    .delete()
    .eq("id", image.id);
  if (rowError) {
    throw new Error(`The file was removed, but its gallery record could not be deleted: ${rowError.message}`);
  }
}
