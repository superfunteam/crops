import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { markdownToHtml } from "./web/src/markdown";

// Static blog pages: each HTML shell pulls its body from a Markdown file in docs/.
const POSTS: Record<string, string> = {
  "blog/the-harvest-has-gone-bad/index.html":
    "docs/marketing/the-harvest-has-gone-bad.md",
};

function posts(): Plugin {
  return {
    name: "crops-posts",
    transformIndexHtml: {
      order: "pre",
      handler(html, { filename }) {
        const page = Object.keys(POSTS).find((p) =>
          filename.endsWith(`web/${p}`),
        );
        if (!page) return html;
        const body = markdownToHtml(readFileSync(resolve(POSTS[page]), "utf8"));
        return html.replace("<!--post-->", () => body);
      },
    },
    handleHotUpdate({ file, server }) {
      if (Object.values(POSTS).some((md) => file.endsWith(md)))
        server.ws.send({ type: "full-reload" });
    },
  };
}

export default defineConfig({
  root: "web",
  plugins: [react(), posts()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve("web/index.html"),
        ...Object.fromEntries(
          Object.keys(POSTS).map((page) => [page, resolve("web", page)]),
        ),
      },
    },
  },
});
