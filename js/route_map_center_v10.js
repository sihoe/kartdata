/* SvingOm sentrumskart v5 – selvstendig Leaflet-komponent.
   Datakilder: pois602.final.json, center_map_markers.json og GPX fra kartdata.
   Flere kart på samme side støttes via .svingom-center-map.
*/
(() => {
  'use strict';
  const ROOT_SELECTOR = '.svingom-center-map';
  const DATA_BASE = 'https://cdn.jsdelivr.net/gh/sihoe/kartdata@main/';
  const CENTER_MAP_VERSION = 'v10-20261013';
  const SYMBOL_BASE = 'https://cdn.jsdelivr.net/gh/sihoe/symbols@main/';
  const COLORS = { brown:'#422426', muted:'#9b7b71', panel:'#EEE9E0', route:'#254D39' };
  const CENTERS = {
    veggli: { name:'Veggli', position:[60.0425,9.1548], zoom:14, radiusKm:5.2 },
    rollag: { name:'Rollag sentrum', position:[59.9844,9.2942], zoom:14, radiusKm:5.2 }
  };
  const ROUTES_URL = `${DATA_BASE}routes/center_map_walks.json`;
  const WALK_DEFS = []; // Lastes fra felles rutefil i GitHub
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
    let centerId='veggli', showWalks=false, selectedWalk=null, hoveredWalk=null, selectedPoi=null, poiLocked=false, poiPreviewTimer=null, previewWalk=null, welcomeDismissed=false;
    let allPois=[], visiblePois=[], walks=[];
    const map=L.map(mapEl,{scrollWheelZoom:true}).setView(config.veggli.position,config.veggli.zoom);
    console.info('SvingOm sentrumskart lastet:', CENTER_MAP_VERSION);
    // Fullskjerm gjelder hele sentrumskartet, inkludert stedsvalg og høyrepanel.
    const fullscreenButton=root.querySelector('.scm-fullscreen');
    let fullscreenFallback=false;
    function updateFullscreenButton(){
      if(!fullscreenButton)return;
      const active=document.fullscreenElement===root || fullscreenFallback;
      fullscreenButton.innerHTML=active?'<span aria-hidden="true">↙</span>':'<span aria-hidden="true">⤢</span>';fullscreenButton.title=active?'Avslutt fullskjerm':'Fullskjerm';
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
    const poiLayer=L.layerGroup().addTo(map), poiMarkers=[], walkLayer=L.layerGroup().addTo(map), previewLayer=L.layerGroup().addTo(map), walkPins=L.layerGroup().addTo(map);
    function status(message,isError=false){notice.textContent=message||'';notice.classList.toggle('is-error',isError);}
    function currentLang(){
      const fromWeglot=window.Weglot?.getCurrentLang?.();
      const lang=String(fromWeglot||document.documentElement.lang||'no').toLowerCase().split('-')[0];
      return ['en','de'].includes(lang)?lang:'no';
    }
    function translated(fields){return fields?.[currentLang()]||fields?.no||fields?.en||fields?.de||'';}
    function getTitle(p){return translated(Object.fromEntries(['no','en','de'].map(l=>[l,p?.texts?.[l]?.title]))) || p?.title || p?.name || 'Uten navn';}
    // Identifiser benker ved ID/name også; enkelte title-felt er tekniske plassholdere.
    function isBench(p){return /(?:hvilebenk|benker|benk|sittegruppe)/i.test([p?.id,p?.name,p?.title,p?.texts?.no?.title].filter(Boolean).join(' '));}
    function isSmallPoi(p){return isBench(p) || /^(?:secureparking|sykkelparkering|bikeparking)$/i.test(p.symbolType||'');}
    function poiIcon(p){
      const type = isBench(p) ? 'benk' : String(p.symbolType||p.symbol||'marker').toLowerCase();
      const small=isSmallPoi(p);
      const size=small?18:30;
      return L.icon({iconUrl:`${SYMBOL_BASE}symbols-${encodeURIComponent(type)}.svg`,iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-size/2],className:'scm-poi-icon'});
    }
    function clearPoiPreviewTimer(){if(poiPreviewTimer){clearTimeout(poiPreviewTimer);poiPreviewTimer=null;}}
    function welcomeHTML(){
      if(centerId==='veggli'&&!welcomeDismissed){
        const paragraphs={
          no:['Sjekk ut tilbudene i Veggli! Her finner du et godt utvalg av butikker, spisesteder og overnatting.','Velg mellom tre korte turer for å strekke på beina eller lufte hunden.','Ta med barna til den flotte fritidsparken med stor lekeplass, eller prøv en tur med dresin langs Numedalsbanen.','Utforsk tilbudene i kartet!'],
          en:['Explore what Veggli has to offer! Discover shops, places to eat and accommodation.','Choose from three short walks to stretch your legs or walk your dog.','Take the children to the recreation park with its large playground, or try a rail-bike ride along the Numedal Railway.','Explore the places on the map!'],
          de:['Entdecken Sie, was Veggli zu bieten hat! Hier finden Sie Geschäfte, Restaurants und Übernachtungsmöglichkeiten.','Wählen Sie zwischen drei kurzen Spaziergängen, um sich die Beine zu vertreten oder mit dem Hund Gassi zu gehen.','Besuchen Sie mit den Kindern den Freizeitpark mit seinem großen Spielplatz oder unternehmen Sie eine Draisinentour auf der Numedalsbahn.','Entdecken Sie die Angebote auf der Karte!']
        };
        const p=paragraphs[currentLang()]||paragraphs.no;
        return `<div class="scm-welcome"><h3>Veggli</h3>${p.map((t,i)=>`<p>${i===3?'<strong>':''}${escapeHTML(t)}${i===3?'</strong>':''}</p>`).join('')}</div>`;
      }
      return `<div class="scm-panel-heading">${escapeHTML(config[centerId].name)}</div>`;
    }
    function renderDefault(){
      panel.innerHTML=showWalks?'':welcomeHTML();
      if(showWalks)renderWalkList();
    }
    function statsHtml(w){
      const km=Number.isFinite(w.length)?w.length:Number(w.stats?.distanceKm)||0;
      const climb=Number.isFinite(w.stats?.climbM)?w.stats.climbM:w.climb;
      const mins=Number.isFinite(w.durationMinutes)?w.durationMinutes:Math.round(km/4*60);
      const glyph=(type)=>{
        if(type==='length')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>';
        if(type==='climb')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19h4l4-8 4 4 5-10h3"/></svg>';
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>';
      };
      return `<div class="scm-walk-stats"><span>${glyph('length')}${km.toLocaleString('nb-NO',{minimumFractionDigits:1,maximumFractionDigits:1})} km</span><span>${glyph('climb')}${Number.isFinite(climb)?Math.round(climb)+' hm':'– hm'}</span><span title="Anslått gangtid (4 km/t)">${glyph('time')}${Math.floor(mins/60)?Math.floor(mins/60)+' t ':''}${mins%60?mins%60+' min':(!Math.floor(mins/60)?'0 min':'')}</span></div>`;
    }
    function closePoi(){
      clearPoiPreviewTimer();selectedPoi=null;poiLocked=false;welcomeDismissed=true;
      renderDefault();updatePoiEmphasis();
    }
    function setPoi(p,lock=false){
      clearPoiPreviewTimer();
      if(poiLocked&&!lock)return;
      selectedPoi=p;poiLocked=!!lock;welcomeDismissed=true;
      if(lock){selectedWalk=null;hoveredWalk=null;previewWalk=null;previewLayer.clearLayers();updateWalkStyle();}
      const title=getTitle(p),desc=translated(Object.fromEntries(['no','en','de'].map(l=>[l,p?.texts?.[l]?.description])))||'';
      panel.innerHTML=`<article class="scm-info"><button class="scm-close-poi" type="button" aria-label="Lukk informasjon" title="Lukk">×</button>${p.imageUrl?`<img class="scm-cover" src="${escapeHTML(p.imageUrl)}" alt="" onerror="this.style.display='none'">`:''}<div class="scm-info-inner"><h3>${escapeHTML(title)}</h3>${desc?`<p>${escapeHTML(desc)}</p>`:''}</div></article>`;
      panel.querySelector('.scm-close-poi').onclick=closePoi;
    }
    function previewPoi(p){
      if(poiLocked||showWalks&&selectedWalk)return;
      clearPoiPreviewTimer();
      poiPreviewTimer=setTimeout(()=>{poiPreviewTimer=null;if(!poiLocked)setPoi(p,false);},180);
    }
    function renderPois(){
      poiLayer.clearLayers();poiMarkers.length=0;
      visiblePois=allPois.filter(p=> Array.isArray(p.latlng)&&p.latlng.length===2&&p.latlng.every(Number.isFinite)&&kmDistance(p.latlng,config[centerId].position)<=config[centerId].radiusKm);
      for(const p of visiblePois){
        const marker=L.marker(p.latlng,{icon:poiIcon(p),zIndexOffset:isSmallPoi(p)?-200:0,alt:getTitle(p)});poiMarkers.push(marker);
        marker.on('mouseover',()=>{marker.setOpacity(1);previewPoi(p);});
        marker.on('mouseout',()=>{clearPoiPreviewTimer();marker.setOpacity(selectedWalk?0.5:1);});
        // Benker og sykkelparkering på lite format, vises fra zoom 14.
        if(!isSmallPoi(p)||map.getZoom()>=14)marker.addTo(poiLayer);
        marker.on('click',()=>setPoi(p,true));
        marker.on('error',()=>{});
        // Tilbakestill til diskret standardpinne dersom SVG mangler.
        marker.on('add',()=>{const img=marker.getElement()?.querySelector('img');if(img) img.onerror=()=>{img.onerror=null;img.src='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#422426"/><circle cx="15" cy="15" r="4" fill="white"/></svg>');};});
      }
      updatePoiEmphasis();
    }
    function updatePoiEmphasis(){
      for(const m of poiMarkers)m.setOpacity(selectedWalk?0.5:1);
      root.classList.toggle('scm-route-focused',!!selectedWalk);
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
      const focus=hoveredWalk || selectedWalk;
      for(const w of walks){
        if(!w.lines)continue;
        const highlighted=focus===w.id;
        w.lines.forEach(l=>{
          l.setStyle({color:highlighted?COLORS.brown:COLORS.route,weight:highlighted?9:6,opacity:focus&&!highlighted?0.65:1});
          if(highlighted)l.bringToFront();
        });
      }
      updatePoiEmphasis();
      panel.querySelectorAll('.scm-walk-card').forEach(card=>{
        const id=card.dataset.walkId;
        card.classList.toggle('is-hovered',!!hoveredWalk&&hoveredWalk===id);
        card.classList.toggle('is-selected',!!selectedWalk&&selectedWalk===id);
      });
    }
    function showWalkPreview(w){
      if(showWalks || poiLocked)return;
      clearPoiPreviewTimer();
      previewWalk=w.id;previewLayer.clearLayers();
      for(const pts of w.parts){
        L.polyline(pts.map(p=>[p.lat,p.lon]),{color:COLORS.route,weight:8,opacity:0.95,interactive:false}).addTo(previewLayer);
      }
      hoveredWalk=w.id;
      renderWalkPreview(w);
    }
    function renderWalkPreview(w){
      const title=escapeHTML(translated(w.name)||w.title||w.id);
      const desc=escapeHTML(translated(w.description)||'');
      const photo=w.imageUrl?`<img class="scm-cover" src="${escapeHTML(w.imageUrl)}" alt="" onerror="this.style.display='none'">`:'';
      panel.innerHTML=`<article class="scm-info scm-walk-preview"><button class="scm-close-poi" type="button" aria-label="Lukk forhåndsvisning" title="Lukk">×</button>${photo}<div class="scm-info-inner"><h3>${title}</h3>${statsHtml(w)}${desc?`<p>${desc}</p>`:''}<button class="scm-preview-open" type="button">${currentLang()==='de'?'Tour anzeigen':currentLang()==='en'?'Show walk':'Vis turen'}</button></div></article>`;
      panel.querySelector('.scm-close-poi').onclick=()=>{hideWalkPreview();welcomeDismissed=true;renderDefault();};
      panel.querySelector('.scm-preview-open').onclick=()=>activateWalkFromPin(w);
    }
    function hideWalkPreview(){
      if(!previewWalk)return;
      previewWalk=null;hoveredWalk=null;previewLayer.clearLayers();
      if(!showWalks&&!poiLocked){welcomeDismissed=true;renderDefault();}
    }
    function activateWalkFromPin(w){
      previewWalk=null;previewLayer.clearLayers();poiLocked=false;selectedPoi=null;welcomeDismissed=true;
      if(!showWalks){showWalks=true;toggle.classList.add('is-active');toggle.setAttribute('aria-pressed','true');drawWalks();}
      selectedWalk=w.id;hoveredWalk=null;renderDefault();updateWalkStyle();panel.scrollTop=0;
    }
    function setHoveredWalk(id){hoveredWalk=id;updateWalkStyle();}
    function setWalk(w,zoom=true){
      selectedWalk=selectedWalk===w.id?null:w.id;selectedPoi=null;poiLocked=false;welcomeDismissed=true;previewWalk=null;previewLayer.clearLayers();
      if(selectedWalk&&zoom&&w.lines?.length){map.fitBounds(L.featureGroup(w.lines).getBounds(),{padding:[35,35],maxZoom:15});}
      renderDefault();updateWalkStyle();
      if(selectedWalk)panel.scrollTop=0;
    }
    function renderWalkList(){
      const available=walks.filter(w=>routeAvailable(w));
      if(!available.length){panel.insertAdjacentHTML('beforeend','<p class="scm-walk-empty">Ingen turer er lastet inn for dette stedet ennå.</p>');return;}
      const list=document.createElement('div');list.className='scm-walk-list';
      list.innerHTML='<h4>Småturer</h4>';
      for(const w of available){
        const expanded=selectedWalk===w.id;
        const article=document.createElement('article');article.className='scm-walk-card'+(expanded?' is-expanded is-selected':'');article.dataset.walkId=w.id;
        const description=translated(w.description)||'Kort tur fra sentrum.';
        const photo=w.imageUrl ? `<img class="scm-walk-photo" src="${escapeHTML(w.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="scm-walk-photo-placeholder">Bilde kommer</div>';
        const name=escapeHTML(translated(w.name)||w.title||w.id);
        const walkingIcon=`<img class="scm-walk-icon" src="${SYMBOL_BASE}symbols-walking.svg" alt="" aria-hidden="true">`;
        const chevron=`<svg class="scm-walk-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 8 6 6 6-6 M6 13l6 6 6-6"/></svg>`;
        article.innerHTML=`<button type="button" class="scm-walk-main" aria-expanded="${expanded}" aria-label="${expanded?'Lukk':'Åpne'} ${name}"><span class="scm-walk-heading">${walkingIcon}<span class="scm-walk-title">${name}</span>${chevron}</span>${!selectedWalk||expanded?statsHtml(w):''}</button>${expanded?`<div class="scm-walk-expanded">${photo}<p>${escapeHTML(description)}</p></div>`:''}`;
        article.addEventListener('mouseenter',()=>setHoveredWalk(w.id));
        article.addEventListener('mouseleave',()=>setHoveredWalk(null));
        article.addEventListener('focusin',()=>setHoveredWalk(w.id));
        article.addEventListener('focusout',event=>{if(!article.contains(event.relatedTarget))setHoveredWalk(null);});
        article.querySelector('.scm-walk-main').onclick=()=>setWalk(w,true);
        list.appendChild(article);
      }
      panel.appendChild(list);
      updateWalkStyle();
    }
    function drawWalks(){
      walkLayer.clearLayers();walkPins.clearLayers();previewLayer.clearLayers();
      for(const w of walks.filter(w=>routeAvailable(w))){
        w.lines=[];
        if(showWalks)for(const pts of w.parts){const line=L.polyline(pts.map(p=>[p.lat,p.lon]),{color:COLORS.route,weight:6,opacity:1,smoothFactor:1}).addTo(walkLayer);
          line.on('mouseover',()=>setHoveredWalk(w.id));
          line.on('mouseout',()=>setHoveredWalk(null));
          line.on('click',()=>setWalk(w,false));w.lines.push(line);
        }
        // Startpunkt viser turvalg uten ekstra kategorisymboler.
        const first=w.parts[0][0];
        const walkIcon=L.icon({iconUrl:`${SYMBOL_BASE}symbols-walking.svg`,iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-14],className:'scm-walk-map-icon'});
        const pin=L.marker([first.lat,first.lon],{icon:walkIcon,zIndexOffset:600,alt:w.title}).addTo(walkPins);
        pin.bindTooltip(translated(w.name)||w.title,{direction:'top'});pin.on('mouseover',()=>{if(showWalks)setHoveredWalk(w.id);else showWalkPreview(w);});pin.on('mouseout',()=>{if(showWalks)setHoveredWalk(null);else {previewLayer.clearLayers();hoveredWalk=null;}});pin.on('click',()=>{if(showWalks)setWalk(w,false);else activateWalkFromPin(w);});
      }
      updateWalkStyle();
    }
    function selectCenter(id){
      if(!config[id])return;
      centerId=id;selectedWalk=null;hoveredWalk=null;selectedPoi=null;poiLocked=false;previewWalk=null;welcomeDismissed=true;clearPoiPreviewTimer();previewLayer.clearLayers();
      root.querySelectorAll('[data-center]').forEach(b=>{const on=b.dataset.center===id;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});
      map.flyTo(config[id].position,config[id].zoom,{duration:.6});
      renderPois();drawWalks();renderDefault();
    }
    root.querySelectorAll('[data-center]').forEach(b=>b.addEventListener('click',()=>selectCenter(b.dataset.center)));
    const helpButton=root.querySelector('.scm-help');
    helpButton?.addEventListener('click',()=>{const open=helpButton.getAttribute('aria-expanded')!=='true';helpButton.setAttribute('aria-expanded',String(open));const help=root.querySelector('.scm-help-popover');if(help)help.hidden=!open;});
    const toggle=root.querySelector('.scm-walk-toggle');
    toggle.addEventListener('click',()=>{showWalks=!showWalks;toggle.classList.toggle('is-active',showWalks);toggle.setAttribute('aria-pressed',String(showWalks));selectedWalk=null;hoveredWalk=null;selectedPoi=null;poiLocked=false;previewWalk=null;welcomeDismissed=true;clearPoiPreviewTimer();previewLayer.clearLayers();drawWalks();renderDefault();updatePoiEmphasis();});
    // Oppdater tekst som legges inn dynamisk når Weglot skifter språk.
    try { window.Weglot?.on?.('languageChanged',()=>{if(selectedPoi)setPoi(selectedPoi,poiLocked);else if(previewWalk){const w=walks.find(w=>w.id===previewWalk);if(w)renderWalkPreview(w);}else renderDefault();}); } catch(e){console.warn('Weglot språkbytte:',e);}
    map.on('zoomend',renderPois);
    map.on('dragstart zoomstart',()=>{if(!welcomeDismissed){welcomeDismissed=true;if(!selectedPoi&&!showWalks)renderDefault();}});
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
    const routesURL=root.dataset.routesUrl||ROUTES_URL;
    getJSON(routesURL).then(routeData=>{
      const defs=Array.isArray(routeData)?routeData:Object.values(routeData);
      return Promise.all(defs.map(async w=>{
        const url=w.gpxUrl||(w.path?`${DATA_BASE}${w.path}`:'');
        try {if(!url)throw Error('Mangler gpxUrl');const gps=parseGPX(await getText(url));return {...w,title:w.name?.no||w.title||w.id,...gps};}
        catch(e){console.warn('GPX ikke tilgjengelig:',url,e);return {...w,error:e.message};}
      }));
    }).then(items=>{
      walks=items;drawWalks();if(showWalks)renderDefault();
      const failures=walks.filter(w=>w.error);
      if(failures.length)status(`${failures.length} GPX-filer kunne ikke lastes. Se nettleserkonsollen.`,true);
    }).catch(e=>{console.error(e);status(`Kunne ikke hente fotruter: ${e.message}`,true);});
    setTimeout(()=>map.invalidateSize(),200);
  }
  function start(){document.querySelectorAll(ROOT_SELECTOR).forEach(init);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
