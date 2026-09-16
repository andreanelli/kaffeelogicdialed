import { loadEnv } from "vite";
import { execFileSync } from "node:child_process";
const env = { ...loadEnv("cloud", process.cwd(), "VITE_"), ...process.env };
if (
  env.VITE_DIALED_MODE !== "cloud" ||
  !/^https:\/\/[^/]+\.supabase\.co$/.test(env.VITE_SUPABASE_URL || "") ||
  !env.VITE_SUPABASE_ANON_KEY ||
  /YOUR_/.test(env.VITE_SUPABASE_ANON_KEY)
)
  throw new Error(
    "Set the public Supabase configuration in .env.cloud.local before building.",
  );
execFileSync("npx", ["tsc", "-b"], { stdio: "inherit", env });
execFileSync("npx", ["vite", "build", "--mode", "cloud"], {
  stdio: "inherit",
  env,
});
