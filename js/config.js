export const SUPABASE_URL = "https://dnrthqsfqubsleerjikf.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_GQF6UboLBUopPdkIVOESaQ_7DjoYjwd";
export const BACKGROUND_REMOVAL_API_URL = "http://127.0.0.1:8000";

export const supabaseConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  (SUPABASE_ANON_KEY.startsWith("sb_publishable_") ||
    SUPABASE_ANON_KEY.startsWith("eyJ"));
