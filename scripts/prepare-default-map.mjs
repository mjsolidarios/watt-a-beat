import fs from 'node:fs';
import {buildArea} from '../src/map-geometry.mjs';
const location={name:'Iloilo City',description:'Western Visayas, Philippines',lat:10.717,lon:122.55,country:'PH'};
const zones=[['Jaro',122.5583,10.7255],['La Paz',122.568,10.713],['Mandurriao',122.535,10.718],['Molo',122.5435,10.6968],['Arevalo',122.515,10.686],['City Proper',122.5738,10.6952],['Lapuz',122.584,10.706]].map(([name,lon,lat])=>({name,lat,lon}));
const map=buildArea(JSON.parse(fs.readFileSync('/tmp/iloilo-osm.json','utf8')),location,{lat:10.717,lon:122.55,widthKm:14},zones);map.id='iloilo-default';
fs.writeFileSync('src/data/default-map.json',JSON.stringify(map));console.log({roads:map.roadCount,zones:map.districts.map(d=>d.name)});
