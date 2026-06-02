import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// lucide-react@1.6.0 ships a broken dist tree:
//   - direct imports use `.ts` extensions instead of `.js`
//   - aliased icons re-export from `../<name>.ts` even though the target
//     actually lives in the same folder (`./<name>.js`)
// This resolver fixes both for any import originating inside
// lucide-react/dist/esm. Removing this plugin breaks the build.
function lucideFixTsExtension(): Plugin {
  return {
    name: "lucide-fix-ts-extension",
    enforce: "pre",
    async resolveId(id, importer) {
      if (
        !importer ||
        !importer.includes("/lucide-react/dist/esm/") ||
        !id.endsWith(".ts")
      ) {
        return null
      }
      // First: swap the bogus `.ts` extension for `.js`.
      const candidates = [id.replace(/\.ts$/, ".js")]
      // Second: aliased icons re-export from `../<name>.ts` but the target
      // is in the same directory; try the same-dir variant as a fallback.
      if (id.startsWith("../")) {
        candidates.push("./" + id.slice(3).replace(/\.ts$/, ".js"))
      }
      for (const candidate of candidates) {
        const resolved = await this.resolve(candidate, importer, {
          skipSelf: true,
        })
        if (resolved) return resolved
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [lucideFixTsExtension(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      // icon-catalog.ts statically imports a curated set of lucide icons (for
      // synchronous, Suspense-free rendering) AND enumerates the whole icon
      // directory via import.meta.glob (for lazily loading the uncurated
      // long-tail). For the curated icons those two paths overlap, so Rollup
      // emits INEFFECTIVE_DYNAMIC_IMPORT — correctly noting the dynamic import
      // can't split them into their own chunk. That overlap is intentional
      // (curated icons belong in the main bundle), so silence only that code
      // for lucide icon modules and let every other warning through.
      onwarn(warning, defaultHandler) {
        if (
          warning.code === "INEFFECTIVE_DYNAMIC_IMPORT" &&
          warning.message.includes("lucide-react/dist/esm/icons/")
        ) {
          return
        }
        defaultHandler(warning)
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
})
