/* SvingOm sentrumskart v1 – selvstendig Leaflet-komponent.
   Datakilder: pois602.final.json, center_map_markers.json og GPX fra kartdata.
   Flere kart på samme side støttes via .svingom-center-map.
*/
(() => {
  'use strict';
  const ROOT_SELECTOR = '.svingom-center-map';
  const DATA_BASE = 'https://cdn.jsdelivr.net/gh/sihoe/kartdata@main/';
  const SYMBOL_BASE = 'https://cdn.jsdelivr.net/gh/sihoe/symbols@main/';
  const COLORS = { brown:'#422426', muted:'#9b7b71', panel:'#EEE9E0', route:'#D38262' };
  const CENTERS = {
    veggli: { name:'Veggli', position:[60.0425,9.1548], zoom:14, radiusKm:5.2 },
    rollag: { name:'Rollag sentrum', position:[59.9844,9.2942], zoom:14, radiusKm:5.2 }
  };
  const WALK_DEFS = [
    {id:'gladheimvegen-rundt', title:'Gladheimvegen rundt', center:'veggli', path:'gpx/gladheimvegen-rundt.gpx'},
    {id:'veggli-kirke-rundt', title:'Veggli kirke rundt', center:'veggli', path:'gpx/veggli-kirke-rundt.gpx'},
    {id:'badedammen-veggli-rundt', title:'Badedammen Veggli rundt', center:'veggli', path:'gpx/badedammen-veggli-rundt.gpx'}
  ];
  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kmDistance = (a,b) => {
    const rad=Math.PI/180, dLat=(b[0]-a[0])*rad, dLon=(b[1]-a[1])*rad;
    const h=Math.sin(dLat/2)**2 + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2;
    return 12742*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  };
  async function getText(url) { const r=await fetch(url,{cache:'no-store'}); if(!r.ok)throw Error(`${r.status} ved henting av ${url}`); return r.text(); }
  async function getJSON(url) { return JSON.parse(await getText(url)); }
  function init(root) {
    if(root.dataset.initialized==='1') return;
    root.dataset.initialized='1';
    const mapEl=root.querySelector('.scm-map'), panel=root.querySelector('.scm-detail'), notice=root.querySelector('.scm-status');
    if(!mapEl || !panel || !window.L) { if(notice) notice.textContent='Leaflet eller kartfelt mangler.'; return; }
    const config={...CENTERS};
    let centerId='veggli', showWalks=false, selectedWalk=null, selectedPoi=null;
    let allPois=[], visiblePois=[], walks=[];
    const map=L.map(mapEl,{scrollWheelZoom:true}).setView(config.veggli.position,config.veggli.zoom);
    // Fullskjerm gjelder hele sentrumskartet, inkludert stedsvalg og høyrepanel.
    const fullscreenButton=root.querySelector('.scm-fullscreen');
    let fullscreenFallback=false;
    function updateFullscreenButton(){
      if(!fullscreenButton)return;
      const active=document.fullscreenElement===root || fullscreenFallback;
      fullscreenButton.textContent=active?'Avslutt fullskjerm':'Fullskjerm';
      fullscreenButton.setAttribute('aria-pressed',String(active));
      fullscreenButton.setAttribute('aria-label',active?'Avslutt fullskjerm':'Vis kartet i fullskjerm');
      setTimeout(()=>map.invalidateSize(),90);
    }
    async function toggleFullscreen(){
      if(document.fullscreenElement===root){
        try{await document.exitFullscreen();}catch(e){console.warn(e);}
      }else if(fullscreenFallback){
        fullscreenFallback=false;
        root.classList.remove('scm-fullscreen-fallback');
        document.body.classList.remove('scm-body-fullscreen');
      }else if(root.requestFullscreen){
        try{await root.requestFullscreen();}
        catch(e){
          // Fallback ved blokkert Fullscreen API, f.eks. enkelte Squarespace-oppsett.
          fullscreenFallback=true;
          root.classList.add('scm-fullscreen-fallback');
          document.body.classList.add('scm-body-fullscreen');
        }
      }else{
        fullscreenFallback=true;
        root.classList.add('scm-fullscreen-fallback');
        document.body.classList.add('scm-body-fullscreen');
      }
      updateFullscreenButton();
    }
    fullscreenButton?.addEventListener('click',toggleFullscreen);
    document.addEventListener('fullscreenchange',updateFullscreenButton);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && fullscreenFallback){
        fullscreenFallback=false;
        root.classList.remove('scm-fullscreen-fallback');
        document.body.classList.remove('scm-body-fullscreen');
        updateFullscreenButton();
      }
    });

    // Kartverkets offisielle Norgeskart WMTS (Web Mercator / Leaflet).
    const backgrounds={
      'Norgeskart – turkart':L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png',{maxZoom:19,maxNativeZoom:17,attribution:'© Kartverket'}),
      'Norgeskart – fargekart':L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',{maxZoom:19,maxNativeZoom:18,attribution:'© Kartverket'})
    };
    backgrounds['Norgeskart – turkart'].addTo(map);
    L.control.layers(backgrounds,null,{position:'bottomleft'}).addTo(map);
    const poiLayer=L.layerGroup().addTo(map), walkLayer=L.layerGroup().addTo(map), walkPins=L.layerGroup().addTo(map);
    function status(message,isError=false){notice.textContent=message||'';notice.classList.toggle('is-error',isError);}
    function getTitle(p){return p?.texts?.no?.title || p?.title || p?.name || 'Uten navn';}
    function isSmallPoi(p){return /(?:benk|sittegruppe)/i.test(getTitle(p)) || /^(?:secureparking|sykkelparkering|bikeparking)$/i.test(p.symbolType||'');}
    function isBench(p){return /(?:benk|sittegruppe)/i.test(getTitle(p));}
    function poiIcon(p){
      const type = isBench(p) ? 'benk' : String(p.symbolType||p.symbol||'marker').toLowerCase();
      const small=isSmallPoi(p);
      const size=small?18:30;
      return L.icon({iconUrl:`${SYMBOL_BASE}symbols-${encodeURIComponent(type)}.svg`,iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-size/2],className:'scm-poi-icon'});
    }
    function renderDefault(){
      panel.innerHTML=`<div class="scm-welcome"><h3>${escapeHTML(config[centerId].name)}</h3><p>Utforsk tilbud, opplevelser og tjenester i sentrum. Velg et symbol i kartet for å lese mer.</p><p>${showWalks?'Velg en tur i kartet eller i listen under for å se detaljer.':'Velg «Vis småturer» for å se korte turforslag.'}</p></div>`;
      if(showWalks) renderWalkList();
    }
    function setPoi(p){
      selectedWalk=null; selectedPoi=p;
      updateWalkStyle();
      const title=getTitle(p),desc=p?.texts?.no?.description||'';
      panel.innerHTML=`<article class="scm-info">${p.imageUrl?`<img class="scm-cover" src="${escapeHTML(p.imageUrl)}" alt="" onerror="this.style.display='none'">`:''}<div class="scm-info-inner"><h3>${escapeHTML(title)}</h3>${desc?`<p>${escapeHTML(desc)}</p>`:''}<button class="scm-back" type="button">← Tilbake til oversikten</button></div></article>`;
      panel.querySelector('.scm-back').onclick=()=>{selectedPoi=null;renderDefault();};
    }
    function renderPois(){
      poiLayer.clearLayers();
      visiblePois=allPois.filter(p=> Array.isArray(p.latlng)&&p.latlng.length===2&&p.latlng.every(Number.isFinite)&&kmDistance(p.latlng,config[centerId].position)<=config[centerId].radiusKm);
      for(const p of visiblePois){
        const marker=L.marker(p.latlng,{icon:poiIcon(p),zIndexOffset:isSmallPoi(p)?-200:0,alt:getTitle(p)});
        // Benker og sykkelparkering på lite format, vises fra zoom 14.
        if(!isSmallPoi(p)||map.getZoom()>=14)marker.addTo(poiLayer);
        marker.on('click',()=>setPoi(p));
        marker.on('error',()=>{});
        // Tilbakestill til diskret standardpinne dersom SVG mangler.
        marker.on('add',()=>{const img=marker.getElement()?.querySelector('img');if(img) img.onerror=()=>{img.onerror=null;img.src='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#422426"/><circle cx="15" cy="15" r="4" fill="white"/></svg>');};});
      }
    }
    function parseGPX(xml){
      const doc=new DOMParser().parseFromString(xml,'application/xml');
      if(doc.querySelector('parsererror'))throw Error('Ugyldig GPX-fil');
      let segEls=[...doc.getElementsByTagNameNS('*','trkseg')];
      let parts=segEls.map(seg=>[...seg.getElementsByTagNameNS('*','trkpt')].map(p=>({lat:Number(p.getAttribute('lat')),lon:Number(p.getAttribute('lon')),ele:Number(p.getElementsByTagNameNS('*','ele')[0]?.textContent)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon))).filter(p=>p.length>=2);
      if(!parts.length){const routeNodes=[...doc.getElementsByTagNameNS('*','rte')]; parts=routeNodes.map(r=>[...r.getElementsByTagNameNS('*','rtept')].map(p=>({lat:Number(p.getAttribute('lat')),lon:Number(p.getAttribute('lon')),ele:Number(p.getElementsByTagNameNS('*','ele')[0]?.textContent)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon))).filter(p=>p.length>=2);}
      if(!parts.length)throw Error('GPX inneholder ingen spor');
      let length=0;
      for(const part of parts)for(let i=1;i<part.length;i++)length+=kmDistance([part[i-1].lat,part[i-1].lon],[part[i].lat,part[i].lon]);
      // Høydemeter: lett glatting og terskel for GPS-støy. Estimat, ikke offisielt tall.
      let gain=0;
      for(const part of parts){
        if(part.length<2||part.some(p=>!Number.isFinite(p.ele)))continue;
        const smooth=part.map((p,i)=>{const a=Math.max(0,i-3),b=Math.min(part.length,i+4);return part.slice(a,b).reduce((s,t)=>s+t.ele,0)/(b-a);});
        let base=smooth[0],high=base,low=base,dir=0;
        for(let i=1;i<smooth.length;i++){
          let h=smooth[i];
          if(dir>=0){high=Math.max(high,h);if(high-h>=2.5){gain+=Math.max(0,high-base);base=high;low=h;dir=-1;}}
          else {low=Math.min(low,h);if(h-low>=2.5){base=low;high=h;dir=1;}}
        }
        if(dir>=0)gain+=Math.max(0,high-base);
      }
      return {parts,length,climb:Math.round(gain)};
    }
    function routeAvailable(w){return w.center===centerId&&!!w.parts;}
    function updateWalkStyle(){
      for(const w of walks){if(!w.lines)continue;
        const active=selectedWalk===w.id;
        w.lines.forEach(l=>l.setStyle({color:active?COLORS.brown:COLORS.route,weight:active?6:4,opacity:(selectedWalk && !active) ? 0.35 : 0.88}));
      }
    }
    function setWalk(w,zoom=true){
      selectedWalk=w.id;selectedPoi=null;updateWalkStyle();
      if(zoom&&w.lines?.length){const fg=L.featureGroup(w.lines);map.fitBounds(fg.getBounds(),{padding:[35,35],maxZoom:15});}
      const img=w.imageUrl||'';
      panel.innerHTML=`<article class="scm-info">${img?`<img class="scm-cover" src="${escapeHTML(img)}" alt="" onerror="this.style.display='none'">`:''}<div class="scm-info-inner"><h3>${escapeHTML(w.title)}</h3><div class="scm-stats"><span><strong>${w.length.toLocaleString('nb-NO',{minimumFractionDigits:1,maximumFractionDigits:1})} km</strong> distanse</span><span><strong>${w.climb} m</strong> stigning (estimat)</span></div><p>En kort tur med utgangspunkt i ${escapeHTML(config[w.center].name)}. Mer informasjon kommer.</p><button class="scm-back" type="button">← Tilbake til oversikten</button></div></article>`;
      panel.querySelector('.scm-back').onclick=()=>{selectedWalk=null;updateWalkStyle();renderDefault();};
    }
    function renderWalkList(){
      const available=walks.filter(w=>routeAvailable(w));
      if(!available.length){panel.insertAdjacentHTML('beforeend','<p>Ingen turer er lastet inn for dette stedet ennå.</p>');return;}
      const list=document.createElement('div'); list.className='scm-walk-list';
      list.innerHTML='<h4>Småturer</h4>';
      for(const w of available){const b=document.createElement('button');b.type='button';b.className='scm-walk-row';b.innerHTML=`<span>${escapeHTML(w.title)}</span><small>${w.length.toFixed(1).replace('.',',')} km · ${w.climb} hm</small>`;b.onclick=()=>setWalk(w);list.appendChild(b);}
      panel.appendChild(list);
    }
    function drawWalks(){
      walkLayer.clearLayers();walkPins.clearLayers();
      if(!showWalks)return;
      for(const w of walks.filter(w=>routeAvailable(w))){
        w.lines=[];
        for(const pts of w.parts){const line=L.polyline(pts.map(p=>[p.lat,p.lon]),{color:COLORS.route,weight:4,opacity:.88,smoothFactor:1}).addTo(walkLayer);
          line.on('mouseover',()=>line.setStyle({color:COLORS.brown,weight:6,opacity:1}));
          line.on('mouseout',()=>updateWalkStyle());
          line.on('click',()=>setWalk(w,false));w.lines.push(line);
        }
        // Startpunkt viser turvalg uten ekstra kategorisymboler.
        const first=w.parts[0][0];
        const pin=L.circleMarker([first.lat,first.lon],{radius:6,color:'#ffffff',weight:2,fillColor:COLORS.route,fillOpacity:1}).addTo(walkPins);
        pin.bindTooltip(w.title,{direction:'top'});pin.on('click',()=>setWalk(w,false));
      }
      updateWalkStyle();
    }
    function selectCenter(id){
      if(!config[id])return;
      centerId=id;selectedWalk=null;selectedPoi=null;
      root.querySelectorAll('[data-center]').forEach(b=>{const on=b.dataset.center===id;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});
      map.flyTo(config[id].position,config[id].zoom,{duration:.6});
      renderPois();drawWalks();renderDefault();
    }
    root.querySelectorAll('[data-center]').forEach(b=>b.addEventListener('click',()=>selectCenter(b.dataset.center)));
    const toggle=root.querySelector('.scm-walk-toggle');
    toggle.addEventListener('click',()=>{showWalks=!showWalks;toggle.classList.toggle('is-active',showWalks);toggle.setAttribute('aria-pressed',String(showWalks));selectedWalk=null;drawWalks();renderDefault();});
    map.on('zoomend',renderPois);
    renderDefault();status('Henter kartdata …');
    const poiURL=root.dataset.poisUrl||`${DATA_BASE}poi/pois602.final.json`;
    const markersURL=root.dataset.markersUrl||`${DATA_BASE}routes/center_map_markers.json`;
    Promise.all([getJSON(poiURL),getJSON(markersURL)]).then(([poiData,groups])=>{
      const list=Array.isArray(poiData)?poiData:poiData.pois||[];
      const key=root.dataset.markerGroup||'rollag-sentrumskart';
      const group=groups[key] ?? groups.rollag ?? [];
      const ids=Array.isArray(group)?group:(Array.isArray(group.markers)?group.markers:[]);
      if(!Array.isArray(group) && !Array.isArray(group.markers))console.warn('Ugyldig markørgruppe:',key);
      const byId=new Map(list.map(p=>[p.id,p]));allPois=[...new Set(ids)].map(id=>byId.get(id)).filter(Boolean);
      const missing=ids.filter(id=>!byId.has(id));if(missing.length)console.warn('Sentrumskart: ukjente POI-ID-er:',missing);
      renderPois();status(`${allPois.length} av ${new Set(ids).size} markører lest inn${missing.length?` (${missing.length} ID-er mangler i POI-filen)`:''}.`);
    }).catch(e=>{console.error(e);status(`Kunne ikke lese POI: ${e.message}`,true);});
    const defs=Array.isArray(window.SVINGOM_CENTER_WALKS)?window.SVINGOM_CENTER_WALKS:WALK_DEFS;
    Promise.all(defs.map(async w=>{
      const url=w.url||`${DATA_BASE}${w.path}`;
      try{const gps=parseGPX(await getText(url));return {...w,...gps};}
      catch(e){console.warn('GPX ikke tilgjengelig:',url,e);return {...w,error:e.message};}
    })).then(items=>{walks=items;drawWalks();if(showWalks)renderDefault();const failures=walks.filter(w=>w.error);if(failures.length)status(`${failures.length} GPX-filer mangler. Kontroller at de ligger i gpx/ på GitHub.`,true);});
    setTimeout(()=>map.invalidateSize(),200);
  }
  function start(){document.querySelectorAll(ROOT_SELECTOR).forEach(init);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
