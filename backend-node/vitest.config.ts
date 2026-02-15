import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        testTimeout: 30000,
        hookTimeout: 15000,
        include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    },
});
