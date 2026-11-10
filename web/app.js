const $ = id => document.getElementById(id);
let active, animations = [], generation = 0;
async function api(route) { const r = await fetch(route); const data = await r.json(); if (!r.ok) throw Error(data.error); return data; }
function text(tag, value, parent) { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; }
function clear() { generation++; animations = []; $('intro').hidden = true; $('content').hidden = false; $('assets').replaceChildren(); $('findings').replaceChildren(); }
async function list() { const data = await api('/api/projects'); $('projects').replaceChildren(); for (const p of data.projects) { const b = text('button', `${p.kind === 'campaign' ? '▥' : '★'} ${p.name}`, $('projects')); b.onclick = () => open(p.id); } }
async function open(id) {
  const p = await api('/api/project/' + encodeURIComponent(id)); clear(); active = p; location.hash = id;
  $('title').textContent = p.name; $('subtitle').textContent = p.kind === 'campaign' ? 'Scrollable design preview · schematic, not a game render. Cyan: start · gold: rescue · red: encounter · purple: trigger.' : 'Character assets and animation review. Gameplay behavior is verified in Broforce.';
  $('mapview').hidden = p.kind !== 'campaign'; $('controls').hidden = p.kind !== 'campaign';
  if (p.kind === 'campaign') { $('level').replaceChildren(); p.design.levels.forEach((_, i) => { const option = text('option', `Level ${i+1}`, $('level')); option.value = i; }); draw(); }
  else { const base = '/api/asset/' + encodeURIComponent(id) + '/'; for (const file of p.files.filter(x => x.startsWith('assets/') && x.endsWith('.png'))) await picture(file.slice(7), base + file.slice(7).split('/').map(encodeURIComponent).join('/')); for (const a of p.animations.animations || []) await animate(a, base + a.file.split('/').map(encodeURIComponent).join('/')); }
  if (p.build) { text('span', 'Built · runtime testing is separate', $('findings')).className = 'badge'; text('pre', JSON.stringify({ builtAt: p.build.builtAt, validation: p.build.details.validation, artifacts: p.build.artifacts, runtime: p.build.runtime }, null, 2), $('findings')); }
  else text('p', 'No build yet. Ask your agent to build this project.', $('findings'));
}
function draw() {
  if (active?.kind !== 'campaign') return;
  const level = active.design.levels[+$('level').value || 0], z = +$('zoom').value, canvas = $('map'); canvas.width = level.width*z; canvas.height = level.height*z; const c = canvas.getContext('2d'); c.fillStyle='#121b24'; c.fillRect(0,0,canvas.width,canvas.height);
  const y = row => (level.height-row-1)*z;
  for (const layer of ['background','foreground']) for (const r of level.terrain.filter(r=>r.layer===layer)) {
    c.fillStyle = r.type === 'Empty' || r.type === 0 ? '#121b24' : layer === 'background' ? '#34414c' : /Steel|Metal/.test(r.type) ? '#8c9da4' : /Rock/.test(r.type) ? '#6b5052' : '#89533b';
    c.fillRect(r.bounds[0]*z,y(r.bounds[3]),(r.bounds[2]-r.bounds[0]+1)*z,(r.bounds[3]-r.bounds[1]+1)*z);
  }
  if ($('triggers').checked) for (const t of level.triggers) { c.strokeStyle='#ce82f5'; c.lineWidth=2; c.strokeRect(t.bottomLeft[0]*z,y(t.upperRight[1]),(t.upperRight[0]-t.bottomLeft[0]+1)*z,(t.upperRight[1]-t.bottomLeft[1]+1)*z); }
  for (const d of level.doodads) { c.fillStyle=/Spawn/.test(d.type)?'#74e8ff':/Cage/.test(d.type)?'#ffdb78':'#fb7769'; const cage=/Cage/.test(d.type); c.fillRect(d.x*z+1,y(d.y)+1,Math.max((cage?2:1)*z-2,2),Math.max((cage?2:1)*z-2,2)); if (z>=16) { c.fillStyle='#fff'; c.font='9px system-ui';c.fillText(String(d.type).slice(0,10),d.x*z,y(d.y)-2); } }
}
async function picture(name, url) { const card = text('div','',$('assets')); card.className='asset'; text('h3',name,card); const image = new Image(); image.src=url; image.alt=name; card.append(image); }
async function animate(a,url) { const token = generation, image = new Image(); image.src=url; await image.decode(); if (token !== generation) return; const card=text('div','',$('assets'));card.className='asset';text('h3',a.name,card);const canvas=document.createElement('canvas');canvas.width=a.frames[0][2]*4;canvas.height=a.frames[0][3]*4;card.append(canvas);animations.push({ a, image, canvas }); }
function tick(time) { for (const {a,image,canvas} of animations) { const rect=a.frames[Math.floor(time/1000*a.fps)%a.frames.length], c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(image,...rect,0,0,canvas.width,canvas.height); } requestAnimationFrame(tick); } requestAnimationFrame(tick);
$('references').onclick=async()=>{ const r=await api('/api/references');clear();active=null;$('title').textContent=r.name;$('subtitle').textContent=r.credits;$('mapview').hidden=true;$('controls').hidden=true;for(const f of r.assets) await picture(f,'/api/reference/'+encodeURIComponent(f));const cut=r.config.cutscene, a=cut.spriteAnimRateFramesWidth;await animate({name:'Introduction animation reference',fps:1/a.FrameRate,frames:Array.from({length:a.TotalFrames},(_,i)=>[i*cut.spriteRect.width,0,cut.spriteRect.width,cut.spriteRect.height])},'/api/reference/'+encodeURIComponent(cut.spritePath));text('pre',JSON.stringify(cut,null,2),$('findings'));};
$('zoom').oninput=draw;$('level').onchange=draw;$('triggers').onchange=draw;$('refresh').onclick=()=>list().then(()=>active&&open(active.id)).catch(showError);
function showError(e){$('intro').hidden=false;$('intro').textContent=e.message;}
list().then(()=>location.hash&&open(decodeURIComponent(location.hash.slice(1)))).catch(showError);
