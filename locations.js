(function(){
'use strict';
let dataPromise=null;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zа-яёӣӯқғҳҷ0-9]/gi,'');
function load(){if(!dataPromise)dataPromise=fetch('data/tajikistan_locations_full.json',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('locations '+r.status);return r.json()});return dataPromise}
function list(id){let d=document.getElementById(id);if(!d){d=document.createElement('datalist');d.id=id;document.body.appendChild(d)}return d}
function options(dl,items,limit=900){const seen=new Set();dl.innerHTML='';for(const item of items){const value=String(item||'').trim();const key=value.toLowerCase();if(!value||seen.has(key))continue;seen.add(key);const o=document.createElement('option');o.value=value;dl.appendChild(o);if(seen.size>=limit)break}}
function bindSet(cfg,d){const regionEl=document.getElementById(cfg.region),city=document.getElementById(cfg.city),jamoat=document.getElementById(cfg.jamoat),village=document.getElementById(cfg.village);if(!regionEl||!city||!jamoat||!village)return;
 const cityList=list(cfg.city+'List'),jamList=list(cfg.jamoat+'List'),villageList=list(cfg.village+'List');city.setAttribute('list',cityList.id);jamoat.setAttribute('list',jamList.id);village.setAttribute('list',villageList.id);
 const region=()=>d.regions.find(r=>norm(r.name)===norm(regionEl.value))||d.regions.find(r=>r.name.includes(regionEl.value)||regionEl.value.includes(r.name))||((regionEl.value.includes('тобеи'))?d.regions.find(r=>r.id==='RR'):null);
 function refresh(){const r=region();if(!r){options(cityList,[]);options(jamList,[]);options(villageList,[]);return}const settlements=d.settlements.filter(x=>x.region_id===r.id);const major=settlements.filter(x=>['PPLA','PPLA2','PPLA3','PPLC'].includes(x.type)||x.population>=5000).map(x=>x.name);options(cityList,[...r.districts.map(x=>x.name),...major]);const district=r.districts.find(x=>norm(x.name)===norm(city.value)||x.alternates?.some(a=>norm(a)===norm(city.value)));const jams=district?district.jamoats:r.districts.flatMap(x=>x.jamoats);options(jamList,jams.map(x=>x.name));options(villageList,settlements.map(x=>x.name),1200)}
 regionEl.addEventListener('change',refresh);city.addEventListener('input',()=>setTimeout(refresh,120));refresh();
}
async function init(){try{const d=await load();bindSet({region:'regRegion',city:'regCity',jamoat:'regJamoat',village:'regVillage'},d);bindSet({region:'editRegion',city:'editCity',jamoat:'editJamoat',village:'editVillage'},d);window.KKLocations={data:d,norm}}catch(e){console.warn('Locations unavailable',e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
