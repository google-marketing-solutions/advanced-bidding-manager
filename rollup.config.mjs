/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import typescript from 'rollup-plugin-typescript2';
import cleanup from 'rollup-plugin-cleanup';
import license from 'rollup-plugin-license';
import { fileURLToPath } from 'url';

/**
 * Rollup plugin to disable tree shaking entry points.
 *
 * Used for apps script code in combination with the stripExports
 * plugin. Apps Script doesn't support import/export statement.
 * While rollup + stripExports correctly removes them, the lack
 * of exported entry points results in an empty bundle. This
 * disables tree shaking on the entry point modules to preserve
 * the bundles.
 *
 * @return plugin
 */
const disableEntryPointTreeShaking = () => {
    return {
        name: 'no-treeshaking',
        async resolveId(source, importer, options) {
            if (!importer) {
                const resolution = await this.resolve(source, importer, { skipSelf: true, ...options });
                // let's not tree shake entry points, as we're not exporting anything in Apps Script files
                resolution.moduleSideEffects = 'no-treeshake';
                return resolution;
            }
            return null;
        },
        async renderChunk(code) {
            // Strip final export statement
            return code.replace(/\nexport\s+\{.*\};/g,'');
        }
    }
}

export default {
  input: 'src/index.ts',
  output: {
    // dir: 'dist',
    format: 'esm',
    file: 'dist/Code.gs',
  },
  plugins: [
    cleanup({ comments: 'none', extensions: ['.ts'] }),
    license({
      banner: {
        content: {
          file: fileURLToPath(new URL('license-header.txt', import.meta.url)),
        },
      },
    }),
    typescript(),
    disableEntryPointTreeShaking(),
  ],
  context: 'this',
};
