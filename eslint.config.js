import js from "@eslint/js";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "out/**",
      "release/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "app.js",
      "revive-i18n.js",
      "revival-*.js",
      "style.css",
      "wechat-knowledge.js",
      "lanshi/**",
      "chrome-extension/**",
      "worker/**",
      "tests/*.js",
      "tests/*.cjs"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["*.config.{js,mjs}", "scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"]
      }
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/require-default-prop": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
