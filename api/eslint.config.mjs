// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // Segunda red además de scripts/check-no-raw-sql.mjs (CLI-36): las
      // variantes *Unsafe de Prisma reciben SQL crudo como string, no
      // parametrizan. $queryRaw/$executeRaw (tagged templates) sí parametrizan
      // y quedan permitidos.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name=/^\\$(query|execute)RawUnsafe$/]",
          message:
            'No uses $queryRawUnsafe/$executeRawUnsafe (SQL crudo, sin parametrizar). Usá $queryRaw/$executeRaw (tagged template).',
        },
      ],
    },
  },
);
