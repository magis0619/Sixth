import { writeFileSync } from 'node:fs';
import { art } from '../src/art.ts';
const ids = process.argv.slice(3);
const html = `<body style="margin:0;background:#fff8e7;display:flex;gap:16px;padding:16px">${ids.map((id) => `<div style="font-size:160px;background:#f0dfb8;border-radius:16px;padding:8px">${art(id as never)}</div><div style="font-size:32px;align-self:center">${art(id as never)}</div>`).join('')}</body>`;
writeFileSync(process.argv[2], html);
