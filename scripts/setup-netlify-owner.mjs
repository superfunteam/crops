import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// Capture database credentials in memory; never print them or save them to disk.
try {
  const { siteId } = JSON.parse(readFileSync(".netlify/state.json", "utf8"));
  if (!siteId) throw new Error("Link the Netlify site first.");
  const output = execFileSync(
    "netlify",
    [
      "api",
      "getSiteDatabase",
      "--data",
      JSON.stringify({ site_id: siteId, role: "netlifydb_owner" }),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const status = JSON.parse(output.slice(output.indexOf("{")));
  const connectionString =
    status.connection_strings?.netlifydb_owner || status.connection_string;
  if (!connectionString)
    throw new Error("No production database connection is available.");
  if (new URL(connectionString).username !== "netlifydb_owner") {
    console.error(
      "Netlify returned a read-only database connection. Owner setup needs a writable owner URL: obtain it from the Netlify database dashboard, set NETLIFY_DB_URL privately, and run npm run setup:owner.",
    );
    process.exit(1);
  }
  const env = {
    ...process.env,
    NETLIFY_DB_URL: connectionString,
    CROPS_ALLOW_REGISTRATION: "false",
  };
  delete env.DATABASE_URL;
  const child = spawn(process.execPath, ["scripts/bootstrap-admin.mjs"], {
    env,
    stdio: "inherit",
  });
  child.once("error", () => {
    console.error("Could not start owner setup.");
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch {
  console.error(
    "Could not access the Netlify production database. Sign in with netlify login, link this site, and deploy its database migration first.",
  );
  process.exitCode = 1;
}
