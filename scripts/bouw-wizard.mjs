// Bouwt de wizard tot één los HTML-bestand in dist/, zonder externe scripts.
// Zo werkt dezelfde pagina als proefpagina, op GitHub Pages en later in WordPress.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const uit = await build({
  entryPoints: ['wizard/main.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  outdir: 'dist',
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
});

const js = uit.outputFiles.find((f) => f.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
const css = uit.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const html = (await readFile('wizard/index.html', 'utf8'))
  .replace('<!--STIJL-->', () => `<style>${css}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>${js}</script>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`dist/index.html: ${Math.round(html.length / 1024)} kB`);
