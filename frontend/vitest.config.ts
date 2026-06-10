import path from "path"
import { defineConfig } from "vitest/config"

// Standalone Vitest config — deliberately not reusing vite.config.ts, which
// carries the lucide/tailwind build plumbing the tests don't need. The only
// thing tests require is the `@/` source alias. The topology derivation is
// pure (no DOM), so no jsdom environment is configured.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
})
