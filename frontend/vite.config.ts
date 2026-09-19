import fs from "fs"
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

// Excalidraw loads its hand-drawn fonts at runtime rather than bundling them.
// Given no window.EXCALIDRAW_ASSET_PATH it resolves them against its own CDN,
// and when that path is set it still keeps the CDN as a *fallback* candidate —
// so a wrong path degrades into a silent internet dependency rather than a
// visible error. This platform is deployed where there is no internet, so the
// fonts are served from our own origin instead.
//
// Served out of node_modules rather than committed to public/: the font tree
// is ~13 MB (Xiaolai, the CJK family, is all but 0.5 MB of it) and none of it
// belongs in git. Nothing here enters the JS bundle — these are static files
// fetched on demand, and only for a font actually used on a canvas.
//
// See EXCALIDRAW_ASSET_PATH in main.tsx, which must agree with the base below.
const EXCALIDRAW_ASSET_BASE = "/excalidraw-assets/"

function excalidrawAssets(): Plugin {
  const fontsDir = path.resolve(
    __dirname,
    "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  )

  return {
    name: "excalidraw-assets",

    // Dev server: map the same public path onto the package directory, so
    // development and production resolve fonts identically.
    configureServer(server) {
      server.middlewares.use(EXCALIDRAW_ASSET_BASE, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0])
        // Serve only from inside the font tree — reject any traversal.
        const target = path.resolve(fontsDir, "." + rel.replace(/^\/fonts/, ""))
        if (!target.startsWith(fontsDir) || !fs.existsSync(target)) {
          next()
          return
        }
        res.setHeader("Content-Type", "font/woff2")
        fs.createReadStream(target).pipe(res)
      })
    },

    // Build: copy the tree into the output so the deployed origin serves it.
    async writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dirname, "dist")
      const dest = path.join(outDir, EXCALIDRAW_ASSET_BASE.replace(/^\//, ""), "fonts")
      await fs.promises.cp(fontsDir, dest, { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [
    lucideFixTsExtension(),
    excalidrawAssets(),
    react(),
    tailwindcss(),
  ],
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
