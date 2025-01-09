import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";


/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,vue}"] },
  { languageOptions: { globals: globals.browser } },
  {
    ...pluginJs.configs.recommended,
    rules: {
      ...pluginJs.configs.recommended.rules,
      'semi': ['error'],
      'comma-dangle': [
        'error',
        'always-multiline',
      ],
      'prefer-template': ['error'],
      'eqeqeq': ['error'],
      'curly': ['error'],
    },
  },
  ...pluginVue.configs["flat/essential"],
];