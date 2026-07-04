// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default [
    {
        ignores: ['dist', 'eslint.config.js']
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            globals: {
                ...globals.node
            },
            sourceType: 'module',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            '@stylistic/indent': ['error', 4],
            '@stylistic/quotes': ['error', 'single', {avoidEscape: true, allowTemplateLiterals: false}],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/comma-dangle': ['error', 'never'],
            '@stylistic/object-curly-spacing': ['error', 'never'],
            '@stylistic/max-len': ['error', {code: 120, tabWidth: 4, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true}],
            '@stylistic/member-delimiter-style': ['error', {multiline: {delimiter: 'semi', requireLast: true}, singleline: {delimiter: 'comma', requireLast: false}}],
            'prefer-arrow-callback': 'error',
            'func-style': ['error', 'expression'],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'}],
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/consistent-type-imports': ['error', {prefer: 'type-imports'}],
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-argument': 'warn'
        }
    }
];
