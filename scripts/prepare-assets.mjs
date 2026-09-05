import fs from 'node:fs';
fs.mkdirSync('src/data', {recursive:true});
fs.mkdirSync('public', {recursive:true});
const data = JSON.parse(fs.readFileSync('/tmp/iloilo-osm.json', 'utf8'));
const project = ({lon,lat}) => [Math.round((lon-122.482)*12000*10)/10,Math.round((10.758-lat)*12200*10)/10];
const centers = [ ['Jaro',122.5583,10.7255],['La Paz',122.568,10.713],['Mandurriao',122.535,10.718],['Molo',122.5435,10.6968],['Arevalo',122.515,10.686],['City Proper',122.5738,10.6952],['Lapuz',122.584,10.706] ];
const districts = centers.map(([name,lon,lat])=>({name,point:project({lon,lat}),minor:'',major:'',lights:[]}));
const path = points => points.map((p,i)=>(i?'L':'M')+p.join(',')).join('');
for(const way of data.elements.filter(w=>w.tags.highway)){
 const pts=way.geometry.map(project); const mid=pts[Math.floor(pts.length/2)];
 const zone=districts.reduce((a,b)=>Math.hypot(a.point[0]-mid[0],a.point[1]-mid[1])<Math.hypot(b.point[0]-mid[0],b.point[1]-mid[1])?a:b);
 const major=/primary|secondary|tertiary|trunk/.test(way.tags.highway);
 zone[major?'major':'minor']+=path(pts);
 if(way.id%5===0 || major && way.id%2===0) for(let i=1;i<pts.length;i++){
  const [x,y]=pts[i]; if(x<0||x>1600||y<0||y>1000)continue;
  if(i%3===0||pts.length<4) zone.lights.push([x,y,(way.id+i)%17]);
 }
}
const coasts=data.elements.filter(w=>w.tags.natural==='coastline');
let chains=[];
while(coasts.length){let w=coasts.pop(), nodes=[...w.nodes], geo=[...w.geometry];let changed=true;while(changed){changed=false;for(let i=coasts.length-1;i>=0;i--){const q=coasts[i];if(q.nodes[0]===nodes.at(-1)){nodes.push(...q.nodes.slice(1));geo.push(...q.geometry.slice(1));coasts.splice(i,1);changed=true;}else if(q.nodes.at(-1)===nodes[0]){nodes.unshift(...q.nodes.slice(0,-1));geo.unshift(...q.geometry.slice(0,-1));coasts.splice(i,1);changed=true;}}}chains.push(geo);}
const mainland=chains.find(c=>c.some(p=>p.lon<122.48));
console.log('Coast chains',chains.map(c=>({length:c.length,start:c[0],end:c.at(-1)})));
const coast=mainland?path(mainland.map(project)):'';
const land=coast+'L2000,-1000L-2000,-1000Z';
const rivers=data.elements.filter(w=>w.tags.waterway).map(w=>({d:path(w.geometry.map(project)),wide:w.tags.name==='Iloilo River'}));
fs.writeFileSync('src/data/map.json',JSON.stringify({districts,coast,land,rivers,source:'© OpenStreetMap contributors, ODbL',retrieved:'2026-09-05'}));
// Original 32-second ambient instrumental. No third-party music or runtime dependencies.
const rate=22050, seconds=32, count=rate*seconds, wav=Buffer.alloc(44+count*2);
wav.write('RIFF');wav.writeUInt32LE(36+count*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
const chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,110,130.81],[98,123.47,146.83]];
for(let i=0;i<count;i++){const t=i/rate,b=t%0.625,c=chords[Math.floor(t/8)%4];let s=0;
for(const f of c)s+=0.052*Math.sin(2*Math.PI*f*t)*(0.6+0.4*Math.sin(t*0.8)**2);
s+=0.28*Math.sin(2*Math.PI*(48*b+5*(1-Math.exp(-b*25))))*Math.exp(-b*16);
const beat=Math.floor(t/0.3125),p=t%0.3125,f=c[beat%3]*4;
s+=0.09*(Math.sin(2*Math.PI*f*p)+0.25*Math.sin(2*Math.PI*f*2.002*p))*Math.exp(-p*13);
s*=Math.min(t/2,1,(seconds-t)/2);wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,s))*32767),44+i*2);}
fs.writeFileSync('public/after-hours.wav',wav);
console.log('Prepared map and original demo audio.');
