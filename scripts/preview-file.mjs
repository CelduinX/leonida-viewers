// Standalone design artifact for visual QA when local ports are unavailable.
import fs from 'node:fs/promises';
let html=await fs.readFile('public/index.html','utf8');
const css=await fs.readFile('public/style.css','utf8');
let client=await fs.readFile('dist/client/client.js','utf8');
let demo=await fs.readFile('dist/client/demo.js','utf8');
demo=demo.replace('export function demoData','function demoData');
client=client.replace("let preview = new URLSearchParams(location.search).get('preview') === '1';","let preview = true;")
  .replace(/const \{ demoData \} = await import\('\/assets\/demo.js'\);/,'')
  .replace(/history.replaceState\(null, '', url\);/,'');
html=html.replace('<link rel="stylesheet" href="/assets/style.css">',`<style>${css}</style>`)
  .replace('<script src="/assets/client.js" type="module"></script>','')
  .replace('</body>',`<script>${demo}\n${client.replace(/export \{\};?/g,'')}</script></body>`);
await fs.writeFile('dist/design-preview.html',html);
console.log('Standalone preview: dist/design-preview.html (fixed sample data only)');
