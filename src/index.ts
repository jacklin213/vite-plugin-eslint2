import { createFilter, normalizePath } from '@rollup/pluginutils';
import type Vite from 'vite';
import type ESLint from 'eslint';
import type { FilterPattern } from '@rollup/pluginutils';
import path from 'path';

export interface Options extends ESLint.ESLint.Options {
  cache?: boolean;
  cacheLocation?: string;
  include?: FilterPattern;
  exclude?: FilterPattern;
  eslintPath?: string;
  formatter?: string;
  /** @deprecated Recommend to use `emitError` */
  throwOnError?: boolean;
  /** @deprecated Recommend to use `emitWarning` */
  throwOnWarning?: boolean;
  emitError?: boolean;
  emitWarning?: boolean;
}

export default function ESLintPlugin(options: Options = {}): Vite.Plugin {
  const cache = options?.cache ?? true;
  const cacheLocation =
    options?.cacheLocation ?? path.join('node_modules', '.vite', 'vite-plugin-eslint');
  const include = options?.include ?? [/.*\.(vue|js|jsx|ts|tsx)$/];
  let exclude = options?.exclude ?? [/node_modules/];
  const eslintPath = options?.eslintPath ?? 'eslint';
  const defaultFormatter = 'stylish';
  const formatter = options?.formatter ?? defaultFormatter;
  let loadedFormatter: ESLint.ESLint.Formatter;
  const emitError = options?.emitError ?? options?.throwOnError ?? true;
  const emitWarning = options?.emitWarning ?? options?.throwOnWarning ?? true;

  let filter: (id: string | unknown) => boolean;
  let eslint: ESLint.ESLint;

  return {
    name: 'vite:eslint',
    configResolved(config) {
      // convert exclude to array
      // push config.build.outDir into exclude
      if (Array.isArray(exclude)) {
        exclude.push(config.build.outDir);
      } else {
        exclude = [exclude as string | RegExp, config.build.outDir].filter((item) => !!item);
      }
      filter = createFilter(include, exclude);
    },
    async transform(_, id) {
      if (!filter(id)) {
        return null;
      }

      const file = normalizePath(id).split('?')[0];

      // initial
      if (!loadedFormatter || !eslint) {
        await import(eslintPath)
          .then(async (module) => {
            eslint = new module.ESLint({
              ...options,
              cache,
              cacheLocation,
            });
            loadedFormatter = await eslint.loadFormatter(formatter);
          })
          .catch(() => {
            this.error(`Failed to import ESLint. Have you installed and configured correctly?`);
          });
      }

      await eslint
        .lintFiles(file)
        // catch config error
        .catch((error) => {
          this.error(`${error?.message ?? error}`);
        })
        // lint results
        .then(async (lintResults: ESLint.ESLint.LintResult[]) => {
          if (lintResults.some((item) => item.errorCount > 0) && emitError) {
            const formatResult = await loadedFormatter.format(
              lintResults.filter((item) => item.errorCount > 0),
            );
            this.error(formatResult);
          }
          if (lintResults.some((item) => item.warningCount > 0) && emitWarning) {
            const formatResult = await loadedFormatter.format(
              lintResults.filter((item) => item.warningCount > 0),
            );
            this.warn(formatResult);
          }
        });

      return null;
    },
  };
}
