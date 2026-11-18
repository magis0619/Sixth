import { chromium } from 'playwright';
import fs from 'fs';
const [out, ...pairs] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1800, height: 1000 } });
const imgs = pairs.map(f => { const [label, path] = f.split('='); return `<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${fs.readFileSync(path).toString('base64')}"></figure>`; }).join('');
await p.setContent(`<style>body{margin:0;display:flex;gap:12px;padding:12px;background:#ddd;font:bold 22px sans-serif;width:max-content}figure{margin:0}img{width:430px;display:block}</style>${imgs}`);
await p.screenshot({ path: out, fullPage: true });
await b.close();
