import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, listProjects, readProject, project, within, json, exists } from './core.js';
const types = { '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const referenceRoot = path.join(ROOT, 'runtime/profile/UMM/BroMaker_Storage/Bronobi');
export async function startPreview(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); res.end(); return; }
      const url = new URL(req.url, 'http://127.0.0.1'), parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
      let data, type = 'application/json';
      if (url.pathname === '/api/projects') data = JSON.stringify(await listProjects());
      else if (url.pathname === '/api/references') data = JSON.stringify({ name: 'Bronobi by Gorzontrok', credits: 'Reference only. See library/bros/bronobi/1.0.1/catalog.json and package credits.', config: await json(path.join(referenceRoot, 'Bronobi.json')), assets: ['avatar_Bronobi.png','Bronobi_Cutscene.png','Bronobi_anim.png','Bronobi_gun_anim.png','Bronobi_ammo.png'] });
      else if (parts[0] === 'api' && parts[1] === 'project' && parts.length === 3) {
        const info = await readProject(parts[2]), { dir } = await project(parts[2]);
        data = JSON.stringify({ ...info, build: await exists(path.join(dir, 'build/report.json')) ? await json(path.join(dir, 'build/report.json')) : null, animations: info.kind === 'bro' ? await json(path.join(dir, 'animations.json')) : null });
      } else if (parts[0] === 'api' && parts[1] === 'asset') {
        const { dir } = await project(parts[2]); const file = await within(path.join(dir, 'assets'), parts.slice(3).join('/'));
        if (!['.png','.wav'].includes(path.extname(file))) throw new Error('Only PNG/WAV assets are served');
        data = await fs.readFile(file); type = types[path.extname(file)];
      } else if (parts[0] === 'api' && parts[1] === 'reference') {
        const file = await within(referenceRoot, parts.slice(2).join('/'));
        if (path.extname(file) !== '.png') throw new Error('Only reference PNGs are served');
        data = await fs.readFile(file); type = 'image/png';
      } else {
        const file = await within(path.join(ROOT, 'web'), url.pathname === '/' ? 'index.html' : parts.join('/'));
        data = await fs.readFile(file); type = types[path.extname(file)] || 'text/plain';
      }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self'; frame-ancestors 'none'" }); res.end(data);
    } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
