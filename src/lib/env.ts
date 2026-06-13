import { readFileSync } from "node:fs";

const optional = (name: string) => process.env[name]?.trim();

export function requireEnv(name: string) {
  const value = optional(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getServerConfig() {
  const serviceAccountPath = optional("GOOGLE_SERVICE_ACCOUNT_JSON_PATH");
  const serviceAccount = serviceAccountPath
    ? (JSON.parse(readFileSync(serviceAccountPath, "utf8")) as {
        client_email?: string;
        private_key?: string;
      })
    : null;
  const supabasePublishableKey =
    optional("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? optional("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  return {
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey:
      optional("SUPABASE_SERVICE_ROLE_KEY") ?? supabasePublishableKey ?? requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    googleClientEmail: optional("GOOGLE_CLIENT_EMAIL") ?? serviceAccount?.client_email ?? requireEnv("GOOGLE_CLIENT_EMAIL"),
    googlePrivateKey:
      (optional("GOOGLE_PRIVATE_KEY") ?? serviceAccount?.private_key ?? requireEnv("GOOGLE_PRIVATE_KEY")).replace(
        /\\n/g,
        "\n",
      ),
    googleSharedDriveId: optional("GOOGLE_SHARED_DRIVE_ID"),
    googleDriveFolderId: optional("GOOGLE_DRIVE_FOLDER_ID"),
  };
}
