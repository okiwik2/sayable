// Checks the vocabulary source files for mistakes without building anything.
// Run with: npm run data:validate   (add --strict to also require every symbol image to be downloaded)
import { compile } from './lib/compile.mjs';

const strict = process.argv.includes('--strict');
const { dataset, errors, warnings } = compile({ requireAssets: strict });
for (const w of warnings) console.warn('warning:', w);
for (const e of errors) console.error('error:', e);
console.log(`${dataset.items.length} items checked: ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
