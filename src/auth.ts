import { createClient } from "@supabase/supabase-js";
export const cloudMode = import.meta.env.VITE_DIALED_MODE === "cloud";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const authClient =
  cloudMode && url && key ? createClient(url, key) : null;
export async function authHeaders(): Promise<Record<string, string>> {
  if (!cloudMode) return {};
  if (!authClient) throw new Error("Cloud sign-in is not configured.");
  const { data, error } = await authClient.auth.getSession();
  if (error || !data.session) throw new Error("Please sign in again.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}
