import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/HTML5BlueprintEventGraph/",
  test: {
    environment: "jsdom",
    globals: true
  }
});
