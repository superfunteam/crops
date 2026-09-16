# Third-party notices

Crops uses open-source software. Exact JavaScript dependency versions and their transitive dependencies are recorded in `package-lock.json`; native build tooling is pinned in the Android Gradle files and Swift package manifest.

| Component | Purpose | License / source |
| --- | --- | --- |
| React / React DOM | Web interface | MIT — https://github.com/facebook/react |
| Vite | Web build and development | MIT — https://github.com/vitejs/vite |
| TypeScript | Web type checking | Apache-2.0 — https://github.com/microsoft/TypeScript |
| Lucide | Web icons | ISC — https://github.com/lucide-icons/lucide |
| node-postgres (`pg`) | Production PostgreSQL transport | MIT — https://github.com/brianc/node-postgres |
| Netlify Database | Branch-aware hosted database connection | MIT — https://github.com/netlify/primitives |
| PGlite | Local PostgreSQL engine | Apache-2.0 / PostgreSQL dependencies — https://github.com/electric-sql/pglite |
| Inter / Fontsource | Self-hosted web font | SIL Open Font License 1.1 — https://github.com/rsms/inter |

macOS runtime: SwiftUI, AppKit, Foundation and Security provided by Apple. Android runtime: Android platform APIs and Java; no third-party runtime dependencies. Android build tooling uses Gradle and the Android Gradle Plugin under their respective licenses.

The supplied Harvest screenshots are reference material, not shipped UI assets. Crops has its own implementation and branding.
