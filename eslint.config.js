import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // TypeScript already resolves identifiers; no-undef is redundant and
      // misfires on Node globals (setInterval, Buffer, NodeJS, ...).
      "no-undef": "off",
    },
  },
  prettier,
  {
    ignores: ["dist/", "node_modules/", "*.config.ts", "*.config.js"],
  },
];
