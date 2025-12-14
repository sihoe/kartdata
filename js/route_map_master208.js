// route_map_master206.js
// Krever: Leaflet + Leaflet-GPX + Chart.js lastet inn før denne.
// Valgfritt: Leaflet.markercluster (clustering brukes automatisk ved mange POI)

(function () {
  "use strict";

  console.log("[route_map] master206 loaded");

  // ====== JSON fetch cache (page-lifetime) ======
  const __jsonCache = new Map();
  async function fetchJsonCached(url) {
    if (!url) throw new Error("Missing URL");
    if (__jsonCache.has(url)) return __jsonCache.get(url);

    const p = fetch(url, { cache: "force-cache" }).then(async (r) => {
      if (!r.ok) throw new Error(`fetch failed ${r.status} for ${url}`);
      return r.json();
    });

    __jsonCache.set(url, p);
    return p;
  }

  // ====== POI policy ======
  const POI_THRESHOLD = 30;
  const ANCHOR_ZOOM = 11;
  const ANCHOR_TYPES = new Set(["attractions", "hotel", "cabin", "eat", "handlevogn", "kaffekop", "sleepover", "tent"]);

  // ====== Texts ======
  const infoTexts = {
    no: {
      title: "Nøkkelinformasjon:",
      length: "Lengde",
      ascent: "Stigning",
      descent: "Fall",
      highest: "Høyeste punkt",
      lowest: "Laveste punkt",
      unit: "moh",
      instruction: "Trykk på ikonene og se hva du kan oppleve på sykkelturen",
      surfaceLabel: "Underlag:",
      asphalt: "Asfalt",
      gravel: "Grus",
      trail: "Sti",
      unknown: "Ukjent",
      posTitle: "Din posisjon i forhold til ruta:",
      posNearest: "Nærmeste punkt",
      posStart: "Til start",
      posEnd: "Til mål",
      posOnRoute: "Du er på eller svært nær ruta.",
      posFar: "Du er et stykke unna ruta.",
    },
    en: {
      title: "Key info:",
      length: "Distance",
      ascent: "Ascent",
      descent: "Descent",
      highest: "Highest point",
      lowest: "Lowest point",
      unit: "m",
      instruction: "Tap the icons to see what you can experience on the bike tour",
      surfaceLabel: "Surface:",
      asphalt: "Asphalt",
      gravel: "Gravel",
      trail: "Trail",
      unknown: "Unknown",
      posTitle: "Your position relative to the route:",
      posNearest: "Nearest point",
      posStart: "To start",
      posEnd: "To finish",
      posOnRoute: "You are on or very near the route.",
      posFar: "You are quite far from the route.",
    },
    de: {
      title: "Schlüsselinfo:",
      length: "Länge",
      ascent: "Anstieg",
      descent: "Abfahrt",
      highest: "Höchster Punkt",
      lowest: "Tiefster Punkt",
      unit: "m",
      instruction: "Tippen Sie auf die Symbole, um zu sehen, was Sie auf der Radtour erleben können",
      surfaceLabel: "Untergrund:",
      asphalt: "Asphalt",
      gravel: "Schotter",
      trail: "Pfad",
      unknown: "Unbekannt",
      posTitle: "Ihre Position relativ zur Route:",
      posNearest: "Nächstgelegener Punkt",
      posStart: "Zum Start",
      posEnd: "Zum Ziel",
      posOnRoute: "Sie sind auf oder sehr nahe an der Route.",
      posFar: "Sie sind ziemlich weit von der Route entfernt.",
    },
  };

  function getLang() {
    try {
      if (typeof Weglot !== "undefined" && Weglot.getCurrentLang) return Weglot.getCurrentLang();
    } catch (_) {}
    return "no";
  }

  function safeNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtKm(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "–";
    return (n < 10 ? n.toFixed(1) : n.toFixed(0));
  }

  function initChartDefaultsOnce() {
    if (typeof Chart === "undefined") return;
    if (Chart.__svingom_defaults_set) return;
    Chart.__svingom_defaults_set = true;

    try {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    } catch (_) {}
    Chart.defaults.color = "#422426";
  }

  function normalizeSymbol(sym) {
    if (!sym) return null;
    return String(sym).trim().toLowerCase();
  }

  function symbolUrl(sym) {
    const s = normalizeSymbol(sym);
    if (!s) return null;
    if (s === "bathingspot") return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-bathingspot-blue.svg";
    return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-" + s + ".svg";
  }

  function getRouteStats(route) {
    const st = (route && route.stats) || {};
    return {
      distanceKm: safeNum(st.distanceKm, 0),
      climbM: safeNum(st.climbM, 0),
      descentM: safeNum(st.descentM, 0),
      maxElevationM: safeNum(st.maxElevationM, 0),
      minElevationM: safeNum(st.minElevationM, 0),
    };
  }

  function ensurePosBox(container) {
    if (!container) return null;
    let el = container.querySelector(".pos-box");
    if (el) return el;

    el = document.createElement("div");
    el.className = "pos-box";
    container.appendChild(el);
    return el;
  }

  function renderStats(container, route) {
    if (!container || !route) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;
    const s = getRouteStats(route);

    container.classList.remove("hidden");
    container.innerHTML = `
      <button class="route-close" aria-label="Close">&times;</button>
      <div class="stats-box">
        <p class="stats-title">${t.title}</p>
        <p><span class="icon">↔</span> ${t.length}: <strong>${s.distanceKm.toFixed(1)}</strong> km</p>
        <p><span class="icon">↗</span> ${t.ascent}: <strong>${s.climbM.toFixed(0)}</strong> m</p>
        <p><span class="icon">↘</span> ${t.descent}: <strong>${s.descentM.toFixed(0)}</strong> m</p>
        <p><span class="icon">▲</span> ${t.highest}: <strong>${s.maxElevationM.toFixed(0)}</strong> ${t.unit}</p>
        <p><span class="icon">▼</span> ${t.lowest}: <strong>${s.minElevationM.toFixed(0)}</strong> ${t.unit}</p>
        <p style="margin-top:16px;font-style:italic;">${t.instruction}</p>
      </div>
    `;

    ensurePosBox(container); // tomt felt som vi fyller når posisjon er aktiv

    const closeBtn = container.querySelector(".route-close");
    if (closeBtn && window.innerWidth <= 768) {
      closeBtn.addEventListener("click", function () {
        container.classList.add("hidden");
      });
    }
  }

  function renderSurfaceSummary(container, route, computedFromFile, unknownAsTrail) {
    if (!container || !route) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    const surface = route.surface || null;
    const categoryKm = surface && surface.categoryKm ? surface.categoryKm : null;

    let asphaltKm = computedFromFile?.asphaltKm;
    let gravelKm = computedFromFile?.gravelKm;
    let trailKm = computedFromFile?.trailKm;
    let unknownKm = computedFromFile?.unknownKm;
    let totalKm = computedFromFile?.totalKm;

    if (!Number.isFinite(Number(asphaltKm)) && categoryKm) asphaltKm = categoryKm.asphalt;
    if (!Number.isFinite(Number(gravelKm)) && categoryKm) gravelKm = categoryKm.gravel;
    if (!Number.isFinite(Number(trailKm)) && categoryKm) trailKm = categoryKm.trail;
    if (!Number.isFinite(Number(unknownKm)) && categoryKm) unknownKm = categoryKm.unknown;
    if (!Number.isFinite(Number(totalKm)) && surface) totalKm = surface.totalKm;

    const a0 = safeNum(asphaltKm, 0);
    const g0 = safeNum(gravelKm, 0);
    const tr0 = safeNum(trailKm, 0);
    const u0 = safeNum(unknownKm, 0);
    const tot0 = Number.isFinite(Number(totalKm)) ? Number(totalKm) : a0 + g0 + tr0 + u0;

    let a = a0, g = g0, tr = tr0, u = u0, tot = tot0;
    if (unknownAsTrail) {
      tr += u;
      u = 0;
    }

    if (tot <= 0.0001) {
      container.innerHTML = "";
      return;
    }

    const pct = (v) => (tot > 0 ? Math.round((v / tot) * 100) : 0);
    const showUnknown = !unknownAsTrail && u > 0.01;

    container.innerHTML = `
      <span class="surface-label">${t.surfaceLabel}</span>
      <span class="surface-legend-item"><span class="surface-swatch asphalt"></span>${t.asphalt} ${a.toFixed(1)} km (${pct(a)} %)</span>
      <span class="surface-legend-item"><span class="surface-swatch gravel"></span>${t.gravel} ${g.toFixed(1)} km (${pct(g)} %)</span>
      <span class="surface-legend-item"><span class="surface-swatch trail"></span>${t.trail} ${tr.toFixed(1)} km (${pct(tr)} %)</span>
      ${showUnknown ? `<span class="surface-legend-item"><span class="surface-swatch unknown"></span>${t.unknown} ${u.toFixed(1)} km (${pct(u)} %)</span>` : ""}
    `;
  }

  function getPoiPos(poi) {
    return (
      poi.latlng ||
      (poi.lat && poi.lon ? [poi.lat, poi.lon] : null) ||
      (poi.lat && poi.lng ? [poi.lat, poi.lng] : null)
    );
  }

  function addMarkerFromDb(mapOrLayer, poi, popupContainer, resetFn) {
    if (!mapOrLayer || !poi) return null;

    const pos = getPoiPos(poi);
    if (!pos) return null;

    const sym = poi.symbolType || poi.symbol || null;
    const iconUrl = symbolUrl(sym);

    const customIcon = L.divIcon({
      className: "custom-icon",
      html: iconUrl
        ? `<img src="${iconUrl}" style="width:30px;height:30px;">`
        : `<div style="width:30px;height:30px;background:#422426;border-radius:50%;"></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
    });

    const leafletMarker = L.marker(pos, { icon: customIcon });
    leafletMarker.addTo(mapOrLayer);

    leafletMarker.on("mouseover", function () {
      if (!popupContainer) return;

      popupContainer.classList.remove("hidden");

      const lang = getLang();
      const texts = poi.texts || {};
      const langBlock = texts[lang] || texts.no || {};

      const title = langBlock.title || poi.name || poi.title || "";
      const desc = langBlock.description || langBlock.desc || poi.description || "";
      const imgUrl = poi.imageUrl || poi.image || null;

      popupContainer.innerHTML = `
        <div class="poi-card">
          <div class="poi-card__top">
            <button class="popup-close" aria-label="Close">&times;</button>
          </div>
          <h3 class="poi-card__title">${title}</h3>
          ${imgUrl ? `<img class="poi-card__img" src="${imgUrl}" alt="">` : ""}
          <p class="poi-card__desc">${desc}</p>
        </div>
      `;

      const close = popupContainer.querySelector(".popup-close");
      if (close) {
        close.addEventListener("click", function () {
          if (typeof resetFn === "function") resetFn();
        });
      }
    });

    return leafletMarker;
  }

  function normalizeSurfaceCategory(raw, unknownAsTrail) {
    let cat = (raw || "").toString().toLowerCase().trim();
    if (!cat) cat = "unknown";
    if (cat !== "asphalt" && cat !== "gravel" && cat !== "trail" && cat !== "unknown") cat = "unknown";
    if (unknownAsTrail && cat === "unknown") return "trail";
    return cat;
  }

  function destroyExistingChart(canvas) {
    try {
      if (canvas && canvas.__chart) {
        canvas.__chart.destroy();
        canvas.__chart = null;
      }
    } catch (_) {}
  }

  // ====== Distance math ======
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function buildRouteIndex(elevPoints, unknownAsTrail) {
    const distances = [];
    const lats = [];
    const lons = [];
    const elevations = [];
    const cats = [];

    for (let i = 0; i < elevPoints.length; i++) {
      const p = elevPoints[i] || {};
      const d = safeNum(p.distance, i > 0 ? distances[i - 1] : 0);
      const e = safeNum(p.elevation, i > 0 ? elevations[i - 1] : 0);
      distances.push(d);
      elevations.push(e);
      lats.push(Number(p.lat));
      lons.push(Number(p.lon));
      const raw = p.surfaceCategory ?? p.surface ?? p.category ?? "unknown";
      cats.push(normalizeSurfaceCategory(raw, unknownAsTrail));
    }

    const totalKm = distances.length ? distances[distances.length - 1] : 0;
    return { distances, lats, lons, elevations, cats, totalKm };
  }

  function nearestOnRouteKm(routeIndex, lat, lon) {
    if (!routeIndex || !routeIndex.lats || !routeIndex.lats.length) return null;

    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < routeIndex.lats.length; i++) {
      const la = routeIndex.lats[i];
      const lo = routeIndex.lons[i];
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;

      const d = haversineKm(lat, lon, la, lo);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return null;

    const fromStartKm = routeIndex.distances[bestIdx];
    const toEndKm = Math.max(0, routeIndex.totalKm - fromStartKm);
    return { nearestKm: bestDist, fromStartKm, toEndKm, idx: bestIdx };
  }

  function renderPositionResult(popupContainer, routeIndex, lat, lon) {
    if (!popupContainer) return;
    const posBox = ensurePosBox(popupContainer);
    if (!posBox) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    const res = nearestOnRouteKm(routeIndex, lat, lon);
    if (!res) {
      posBox.innerHTML = "";
      return;
    }

    const near = res.nearestKm;
    const onRoute = near <= 0.2;
    const far = near >= 5;

    const hint = onRoute ? t.posOnRoute : (far ? t.posFar : "");

    posBox.innerHTML = `
      <div class="pos-box__inner">
        <p class="pos-title">${t.posTitle}</p>
        ${hint ? `<p class="pos-hint">${hint}</p>` : ""}
        <p class="pos-line">${t.posNearest}: <strong>${fmtKm(near)}</strong> km</p>
        <p class="pos-line">${t.posStart}: <strong>${fmtKm(res.fromStartKm)}</strong> km</p>
        <p class="pos-line">${t.posEnd}: <strong>${fmtKm(res.toEndKm)}</strong> km</p>
      </div>
    `;
  }

  function buildChart(canvas, elevPoints, movingMarker, surfaceSummaryEl, route, unknownAsTrail) {
    if (!canvas || !Array.isArray(elevPoints) || elevPoints.length === 0) return null;
    if (typeof Chart === "undefined") return null;

    initChartDefaultsOnce();
    destroyExistingChart(canvas);

    const idx = buildRouteIndex(elevPoints, unknownAsTrail);

    const distances = idx.distances;
    const elevations = idx.elevations;
    const cats = idx.cats;

    const slopes = [0];
    for (let i = 1; i < elevations.length; i++) {
      const delta = elevations[i] - elevations[i - 1];
      const distKm = distances[i] - distances[i - 1];
      const slope = distKm > 0 ? (delta / (distKm * 1000)) * 100 : 0;
      slopes.push(slope);
    }

    const asphaltPts = [];
    const gravelPts = [];
    const trailPts = [];
    const unknownPts = [];
    const linePts = [];

    let asphaltKm = 0, gravelKm = 0, trailKm = 0, unknownKm = 0;

    for (let i = 0; i < elevations.length; i++) {
      const x = distances[i];
      const y = elevations[i];
      const cat = cats[i];

      linePts.push({ x, y });
      asphaltPts.push({ x, y: cat === "asphalt" ? y : null });
      gravelPts.push({ x, y: cat === "gravel" ? y : null });
      trailPts.push({ x, y: cat === "trail" ? y : null });
      unknownPts.push({ x, y: cat === "unknown" ? y : null });

      if (i > 0) {
        const segKm = distances[i] - distances[i - 1];
        if (cat === "asphalt") asphaltKm += segKm;
        else if (cat === "gravel") gravelKm += segKm;
        else if (cat === "trail") trailKm += segKm;
        else unknownKm += segKm;
      }
    }

    renderSurfaceSummary(surfaceSummaryEl, route, {
      asphaltKm, gravelKm, trailKm, unknownKm, totalKm: idx.totalKm
    }, unknownAsTrail);

    const highest = Math.max.apply(null, elevations);
    const ctx = canvas.getContext("2d");

    const datasets = [
      { data: asphaltPts, backgroundColor: "#37394E", borderColor: "#37394E", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false },
      { data: gravelPts,  backgroundColor: "#A3886C", borderColor: "#A3886C", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false },
      { data: trailPts,   backgroundColor: "#5C7936", borderColor: "#5C7936", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false },
    ];

    if (!unknownAsTrail) {
      datasets.push({ data: unknownPts, backgroundColor: "#9AA0A6", borderColor: "#9AA0A6", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false });
    }

    datasets.push({
      data: linePts,
      borderColor: "#37394E",
      borderWidth: 4,
      pointRadius: 0,
      tension: 0.4,
      fill: false,
      spanGaps: false,
    });

    const lineDatasetIndex = datasets.length - 1;

    const chart = new Chart(ctx, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: true,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#37394E",
            displayColors: false,
            filter: (item) => item.datasetIndex === lineDatasetIndex,
            callbacks: {
              title: (items) => {
                const x = items?.[0]?.parsed?.x ?? 0;
                return `${Number(x).toFixed(1)} km`;
              },
              label: (c) => {
                const i = c.dataIndex;
                const elev = elevations[i];
                const slope = slopes[i] || 0;
                return `${elev.toFixed(0)} moh / ${slope.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: idx.totalKm,
            ticks: { color: "#37394E", callback: (v) => `${Number(v).toFixed(0)} km` },
            grid: { display: false },
          },
          y: {
            min: 0,
            max: Math.ceil(highest / 50) * 50,
            ticks: { stepSize: 50, color: "#37394E" },
            grid: { display: false },
          },
        },
      },
    });

    canvas.__chart = chart;

    function moveMarkerToIndex(i) {
      if (!movingMarker) return;
      const lat = idx.lats[i];
      const lon = idx.lons[i];
      if (Number.isFinite(lat) && Number.isFinite(lon)) movingMarker.setLatLng([lat, lon]);
    }

    canvas.addEventListener("mousemove", function (evt) {
      const points = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
      if (points.length) moveMarkerToIndex(points[0].index);
    });

    canvas.addEventListener("touchmove", function (e) {
      if (!e.touches || !e.touches.length) return;
      const touch = e.touches[0];
      const simulatedEvent = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
      canvas.dispatchEvent(simulatedEvent);
    }, { passive: true });

    return idx; // <-- viktig: gir oss lats/lons/distances for posisjon-funksjonen
  }

  // ====== MarkerCluster ======
  function hasMarkerCluster() {
    return typeof L !== "undefined" && typeof L.markerClusterGroup === "function";
  }

  function createClusterLayer(map) {
    if (!map || !hasMarkerCluster()) return null;
    try {
      const layer = L.markerClusterGroup();
      map.addLayer(layer);
      return layer;
    } catch (_) {
      return null;
    }
  }

  function enableLazyPoiRendering(map, poisForRoute, popupContainer, resetPopup) {
    const added = new Set();

    function shouldShowPoi(poi) {
      const pos = getPoiPos(poi);
      if (!pos) return false;

      const bounds = map.getBounds();
      if (!bounds || !bounds.contains(L.latLng(pos[0], pos[1]))) return false;

      const zoom = map.getZoom();
      if (zoom >= ANCHOR_ZOOM) return true;

      const t = normalizeSymbol(poi.symbolType || poi.symbol || "");
      return ANCHOR_TYPES.has(t);
    }

    function key(poi) {
      return (poi && poi.id) ? String(poi.id) : JSON.stringify(getPoiPos(poi) || []);
    }

    function render() {
      for (const poi of poisForRoute) {
        if (!shouldShowPoi(poi)) continue;
        const k = key(poi);
        if (added.has(k)) continue;
        added.add(k);
        addMarkerFromDb(map, poi, popupContainer, resetPopup);
      }
    }

    map.on("moveend zoomend", render);
    render();
  }

  // ====== Position control (my location + pick location) ======
  // ====== Position control (my location + pick location + nearest-to-route) ======
function addPositionControl(map, popupContainer, routeElevPoints) {
  if (!map) return;

  const routePts = Array.isArray(routeElevPoints) ? routeElevPoints : [];
  const hasRoute = routePts.length > 5;

  let userMarker = null;
  let userCircle = null;
  let chosenMarker = null;
  let pickMode = false;

  function km(n) {
    if (!Number.isFinite(n)) return "–";
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function findNearestIdx(latlng) {
    let best = { idx: -1, dM: Infinity };
    for (let i = 0; i < routePts.length; i++) {
      const p = routePts[i];
      if (!p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) continue;
      const dM = map.distance(latlng, L.latLng(Number(p.lat), Number(p.lon)));
      if (dM < best.dM) best = { idx: i, dM };
    }
    return best;
  }

  function updateNearestText(latlng) {
    if (!popupContainer || !hasRoute) return;

    const totalKm = Number(routePts[routePts.length - 1]?.distance) || 0;
    const nearest = findNearestIdx(latlng);
    if (nearest.idx < 0) return;

    const p = routePts[nearest.idx];
    const fromStart = Number(p.distance) || 0;
    const toEnd = Math.max(0, totalKm - fromStart);
    const offRouteKm = (nearest.dM || 0) / 1000;

    const line = `Du er ca. <strong>${km(offRouteKm)}</strong> km fra nærmeste punkt på ruta og <strong>${km(fromStart)}</strong> km fra start og <strong>${km(toEnd)}</strong> km fra mål.`;

    let el = popupContainer.querySelector(".nearest-route-line");
    if (!el) {
      const statsBox = popupContainer.querySelector(".stats-box");
      if (!statsBox) return;

      el = document.createElement("p");
      el.className = "nearest-route-line";
      el.style.marginTop = "14px";
      el.style.fontStyle = "italic";
      statsBox.appendChild(el);
    }
    el.innerHTML = line;
  }

  function setPickMode(on) {
    pickMode = !!on;
    map.getContainer().style.cursor = pickMode ? "crosshair" : "";
  }

  const ctrl = L.control({ position: "topleft" });
  ctrl.onAdd = function () {
    const wrap = L.DomUtil.create("div", "leaflet-bar svingom-pos-wrap");

    const btnMe = L.DomUtil.create("button", "svingom-pos-btn", wrap);
    btnMe.type = "button";
    btnMe.title = "Vis min posisjon";
    btnMe.innerHTML = "◎";

    const btnPick = L.DomUtil.create("button", "svingom-pos-btn", wrap);
    btnPick.type = "button";
    btnPick.title = "Velg posisjon (klikk i kartet)";
    btnPick.innerHTML = "✚";

    L.DomEvent.disableClickPropagation(wrap);

    L.DomEvent.on(btnMe, "click", (e) => {
      L.DomEvent.stop(e);
      if (!navigator.geolocation) return alert("Geolocation støttes ikke i denne nettleseren.");

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const acc = pos.coords.accuracy || 0;
          const ll = L.latLng(lat, lon);

          if (!userMarker) userMarker = L.marker(ll).addTo(map);
          else userMarker.setLatLng(ll);

          if (!userCircle) userCircle = L.circle(ll, { radius: acc, weight: 1 }).addTo(map);
          else userCircle.setLatLng(ll).setRadius(acc);

          map.setView(ll, Math.max(map.getZoom(), 12));
          updateNearestText(ll);
        },
        (err) => alert("Klarte ikke hente posisjon: " + (err.message || err.code)),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });

    L.DomEvent.on(btnPick, "click", (e) => {
      L.DomEvent.stop(e);
      const next = !pickMode;
      setPickMode(next);
      btnPick.classList.toggle("active", next);
    });

    return wrap;
  };

  ctrl.addTo(map);

  map.on("click", (evt) => {
    if (!pickMode) return;

    const ll = evt.latlng;

    if (!chosenMarker) {
      chosenMarker = L.marker(ll, { draggable: true }).addTo(map);

      chosenMarker.on("drag", () => updateNearestText(chosenMarker.getLatLng()));
      chosenMarker.on("dragend", () => updateNearestText(chosenMarker.getLatLng()));
    } else {
      chosenMarker.setLatLng(ll);
    }

    updateNearestText(ll);

    setPickMode(false);
    const active = map.getContainer().querySelector(".svingom-pos-btn.active");
    if (active) active.classList.remove("active");
  });
}

  // ====== Fullscreen control ======
  function enterFullscreen(el) {
    if (!el) return;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn) fn.call(el);
  }
  function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (fn) fn.call(document);
  }
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }

  function addFullscreenControl(map, sectionEl) {
    if (!map || !sectionEl) return;

    const ctrl = L.control({ position: "topleft" });
    ctrl.onAdd = function () {
      const wrap = L.DomUtil.create("div", "leaflet-bar svingom-fs-wrap");
      const btn = L.DomUtil.create("button", "svingom-fs-btn", wrap);
      btn.type = "button";
      btn.title = "Fullskjerm";
      btn.innerHTML = "⤢";

      L.DomEvent.disableClickPropagation(wrap);

      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stop(e);
        if (isFullscreen()) exitFullscreen();
        else enterFullscreen(sectionEl);
        setTimeout(() => map.invalidateSize(), 250);
      });

      return wrap;
    };

    ctrl.addTo(map);
  }

  async function initRouteSection(section) {
    const routeId = (section.dataset.routeId || "").trim();
    const routesUrl = (section.dataset.routesUrl || "").trim();
    const poisUrl = (section.dataset.poisUrl || "").trim();
    const routeMarkersUrl = (section.dataset.routeMarkersUrl || "").trim();
    const unknownAsTrail = String(section.dataset.unknownAsTrail || "").trim() === "1";

    if (!routeId || !routesUrl || !poisUrl || !routeMarkersUrl) {
      console.error("[route_map] Mangler data-attributter:", { routeId, routesUrl, poisUrl, routeMarkersUrl });
      return;
    }

    const mapDiv = section.querySelector(".route-map");
    const popupContainer = section.querySelector(".route-popup");
    const chartCanvas = section.querySelector(".chart-wrapper canvas");
    const surfaceSummaryEl = section.querySelector(".surface-summary");

    if (!mapDiv || !popupContainer || !chartCanvas) {
      console.error("[route_map] Mangler nødvendige DOM-elementer for", routeId);
      return;
    }

    let routesJson;
    try {
      routesJson = await fetchJsonCached(routesUrl);
    } catch (e) {
      console.error("[route_map] Klarte ikke å laste routes.json:", routesUrl, e);
      return;
    }

    const route = Array.isArray(routesJson)
      ? routesJson.find((x) => x && x.id === routeId)
      : (routesJson && routesJson[routeId]) || null;

    if (!route) {
      console.error("[route_map] Fant ikke routeId i routes.json:", routeId);
      return;
    }

    const gpxUrl = (route.gpxUrl || "").trim();
    const elevUrl = (route.elevationSurfaceUrl || route.elevationUrl || "").trim();
    if (!gpxUrl || !elevUrl) {
      console.error("[route_map] Route mangler gpxUrl/elevationUrl:", routeId, route);
      return;
    }

    const centerLat = parseFloat(section.dataset.centerLat || route.centerLat || "59.83467");
    const centerLng = parseFloat(section.dataset.centerLng || route.centerLng || "9.57846");
    const zoom = parseInt(section.dataset.zoom || route.zoom || "11", 10);

    const map = L.map(mapDiv, { center: [centerLat, centerLng], zoom, scrollWheelZoom: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "Kartdata © OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    const movingMarker = L.circleMarker([centerLat, centerLng], {
      radius: 6,
      color: "#CA6B2A",
      fillColor: "#CA6B2A",
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    renderStats(popupContainer, route);
    function resetPopup() { renderStats(popupContainer, route); }

    let routeIndex = null;

    try {
      const elevJson = await fetchJsonCached(elevUrl);
      const pts = Array.isArray(elevJson.points) ? elevJson.points : elevJson;
      const cleaned = (pts || []).filter((p) => p && p.elevation != null);
      if (cleaned.length) {
        routeIndex = buildChart(chartCanvas, cleaned, movingMarker, surfaceSummaryEl, route, unknownAsTrail);
      } else {
        console.warn("[route_map] Elevation: ingen punkter i", elevUrl);
      }
    } catch (e) {
      console.error("[route_map] Elevation-feil:", routeId, elevUrl, e);
    }

   addPositionControl(map, popupContainer, () => routeIndex, revealPoisNear);
   addFullscreenControl(map, section);

    try {
      const [poisJson, routeMarkersJson] = await Promise.all([
        fetchJsonCached(poisUrl),
        fetchJsonCached(routeMarkersUrl),
      ]);

      const allPois = Array.isArray(poisJson) ? poisJson : Object.values(poisJson || {});
      const poisById = new Map();
      allPois.forEach((p) => { if (p && p.id) poisById.set(p.id, p); });

      const ids = routeMarkersJson[routeId] || [];
      const poisForRoute = ids.map((id) => poisById.get(id)).filter(Boolean);
// --- "Boost": vis alle POI nær valgt posisjon (uansett zoom/ankertyper) ---
const boosted = new Set(); // husker hvilke vi allerede har lagt til

function revealPoisNear(latlng, radiusMeters = 3000) {
  if (!latlng) return;
  const center = L.latLng(latlng.lat, latlng.lng);

  for (const p of poisForRoute) {
    const pos = getPoiPos(p);
    if (!pos) continue;
    const ll = L.latLng(pos[0], pos[1]);
    if (center.distanceTo(ll) <= radiusMeters) {
      const k = (p && p.id) ? String(p.id) : JSON.stringify(pos);
      if (boosted.has(k)) continue;
      boosted.add(k);
      addMarkerFromDb(map, p, popupContainer, resetPopup);
    }
  }
}

      if (poisForRoute.length <= POI_THRESHOLD) {
        poisForRoute.forEach((p) => addMarkerFromDb(map, p, popupContainer, resetPopup));
      } else {
        const clusterLayer = createClusterLayer(map);
        if (clusterLayer) poisForRoute.forEach((p) => addMarkerFromDb(clusterLayer, p, popupContainer, resetPopup));
        else enableLazyPoiRendering(map, poisForRoute, popupContainer, resetPopup);
      }
    } catch (e) {
      console.error("[route_map] POI-feil:", routeId, e);
    }

    try {
      new L.GPX(gpxUrl, {
        async: true,
        polyline_options: { color: "#37394E", weight: 5, opacity: 0.9 },
        marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null, wptIconUrls: {} },
      })
        .on("loaded", function (e) {
          map.fitBounds(e.target.getBounds(), { padding: [50, 50] });
        })
        .addTo(map);
    } catch (e) {
      console.error("[route_map] GPX-feil:", routeId, gpxUrl, e);
    }
  }

  function initAll() {
    initChartDefaultsOnce();
    const sections = document.querySelectorAll(".map-section[data-route-id]");
    console.log("[route_map] initAll sections:", sections.length);
    sections.forEach((section) => initRouteSection(section));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
  else initAll();
})();
