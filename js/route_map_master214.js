// route_map_master212.js
// Krever: Leaflet + Leaflet-GPX + Chart.js lastet inn før denne.
// Valgfritt: Leaflet.markercluster (clustering brukes automatisk ved mange POI)

(function () {
  "use strict";

  console.log("[route_map] master212 loaded");

  // ======================
  // JSON fetch cache (page-lifetime)
  // ======================
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

  // ======================
  // Config
  // ======================
  const POI_THRESHOLD = 30;
  const ANCHOR_ZOOM = 11;
  const ANCHOR_TYPES = new Set([
    "attractions",
    "hotel",
    "cabin",
    "eat",
    "handlevogn",
    "kaffekop",
    "sleepover",
    "tent",
  ]);

  const POS_NEAR_KM = 0.2; // "på eller svært nær ruta"
  const POS_FAR_KM = 5.0;

  const NEARBY_RADIUS_M = 5000; // vis "i nærheten" innen 5 km
  const NEARBY_LIMIT = 8;

  // ======================
  // Texts
  // ======================
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

      nearbyTitle: "I nærheten:",
      nearbyEmpty: "Ingen registrerte opplevelser/tilbud i nærheten.",

      btnMeTitle: "Vis min posisjon",
      btnPickTitle: "Plasser nål (klikk i kartet)",
      pickHint: "Trykk 📍 og klikk i kartet for å plassere nålen. Dra den for å justere.",
      backToInfo: "Tilbake til nøkkelinformasjon",
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

      nearbyTitle: "Nearby:",
      nearbyEmpty: "No registered experiences/services nearby.",

      btnMeTitle: "Show my location",
      btnPickTitle: "Place pin (click map)",
      pickHint: "Press 📍 and click the map to place the pin. Drag to adjust.",
      backToInfo: "Back to key info",
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

      nearbyTitle: "In der Nähe:",
      nearbyEmpty: "Keine registrierten Angebote/Erlebnisse in der Nähe.",

      btnMeTitle: "Meinen Standort zeigen",
      btnPickTitle: "Nadel setzen (Karte klicken)",
      pickHint: "Drücken Sie 📍 und klicken Sie in die Karte, um die Nadel zu setzen. Ziehen zum Anpassen.",
      backToInfo: "Zurück zur Schlüsselinfo",
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
    return n < 10 ? n.toFixed(1) : n.toFixed(0);
  }

  // ======================
  // Chart defaults
  // ======================
  function initChartDefaultsOnce() {
    if (typeof Chart === "undefined") return;
    if (Chart.__svingom_defaults_set) return;
    Chart.__svingom_defaults_set = true;

    try {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    } catch (_) {}
    Chart.defaults.color = "#422426";
  }

  function destroyExistingChart(canvas) {
    try {
      if (canvas && canvas.__chart) {
        canvas.__chart.destroy();
        canvas.__chart = null;
      }
    } catch (_) {}
  }

  // ======================
  // Symbols
  // ======================
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

  // ======================
  // Route stats
  // ======================
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
    el.style.marginTop = "14px";
    container.appendChild(el);
    return el;
  }

  function ensureNearbyBox(popupContainer) {
    if (!popupContainer) return null;
    const statsBox = popupContainer.querySelector(".stats-box");
    if (!statsBox) return null;

    let el = popupContainer.querySelector(".nearby-box");
    if (el) return el;

    el = document.createElement("div");
    el.className = "nearby-box";
    el.style.marginTop = "14px";
    statsBox.appendChild(el);
    return el;
  }

  function renderStats(popupContainer, route) {
    if (!popupContainer || !route) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;
    const s = getRouteStats(route);

    popupContainer.classList.remove("hidden");
    popupContainer.innerHTML = `
      <div class="poi-or-info">
        <div class="stats-box">
          <p class="stats-title">${t.title}</p>
          <p><span class="icon">↔</span> ${t.length}: <strong>${s.distanceKm.toFixed(1)}</strong> km</p>
          <p><span class="icon">↗</span> ${t.ascent}: <strong>${s.climbM.toFixed(0)}</strong> m</p>
          <p><span class="icon">↘</span> ${t.descent}: <strong>${s.descentM.toFixed(0)}</strong> m</p>
          <p><span class="icon">▲</span> ${t.highest}: <strong>${s.maxElevationM.toFixed(0)}</strong> ${t.unit}</p>
          <p><span class="icon">▼</span> ${t.lowest}: <strong>${s.minElevationM.toFixed(0)}</strong> ${t.unit}</p>
          <p style="margin-top:16px;font-style:italic;">${t.instruction}</p>
        </div>
      </div>
    `;

    ensurePosBox(popupContainer);
    ensureNearbyBox(popupContainer);
  }

  function showPoiCard(popupContainer, poi, resetFn) {
    if (!popupContainer || !poi) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

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
        <button class="poi-back" type="button" style="margin-top:12px;border:none;background:#CA6B2A;color:#EEE9E0;padding:10px 12px;border-radius:10px;cursor:pointer;">
          ${t.backToInfo}
        </button>
      </div>
    `;

    const close = popupContainer.querySelector(".popup-close");
    const back = popupContainer.querySelector(".poi-back");
    const goBack = () => (typeof resetFn === "function" ? resetFn() : null);

    if (close) close.addEventListener("click", goBack);
    if (back) back.addEventListener("click", goBack);
  }

  // ======================
  // Surface summary
  // ======================
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

  // ======================
  // POI markers
  // ======================
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
      showPoiCard(popupContainer, poi, resetFn);
    });

    leafletMarker.on("click", function () {
      showPoiCard(popupContainer, poi, resetFn);
    });

    return leafletMarker;
  }

  // ======================
  // Surface category normalization
  // ======================
  function normalizeSurfaceCategory(raw, unknownAsTrail) {
    let cat = (raw || "").toString().toLowerCase().trim();
    if (!cat) cat = "unknown";
    if (cat !== "asphalt" && cat !== "gravel" && cat !== "trail" && cat !== "unknown") cat = "unknown";
    if (unknownAsTrail && cat === "unknown") return "trail";
    return cat;
  }

  // ======================
  // Build route index from elevation points
  // points must have: lat, lon, distance (km), elevation, surfaceCategory
  // ======================
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
    const statsBox = popupContainer.querySelector(".stats-box");
    if (!statsBox) return;

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
    const onRoute = near <= POS_NEAR_KM;
    const far = near >= POS_FAR_KM;

    const hint = onRoute ? t.posOnRoute : far ? t.posFar : "";

    posBox.innerHTML = `
      <div class="pos-box__inner">
        <p class="pos-title" style="font-weight:700;margin:10px 0 8px;">${t.posTitle}</p>
        ${hint ? `<p class="pos-hint" style="margin:0 0 8px;font-style:italic;">${hint}</p>` : ""}
        <p class="pos-line" style="margin:6px 0;">${t.posNearest}: <strong>${fmtKm(near)}</strong> km</p>
        <p class="pos-line" style="margin:6px 0;">${t.posStart}: <strong>${fmtKm(res.fromStartKm)}</strong> km</p>
        <p class="pos-line" style="margin:6px 0;">${t.posEnd}: <strong>${fmtKm(res.toEndKm)}</strong> km</p>
      </div>
    `;
  }

  function getNearbyPoisSorted(pois, latlng, radiusMeters = NEARBY_RADIUS_M, limit = NEARBY_LIMIT) {
    if (!Array.isArray(pois) || !pois.length || !latlng) return [];
    const center = L.latLng(latlng.lat, latlng.lng);

    const res = [];
    for (const p of pois) {
      const pos = getPoiPos(p);
      if (!pos) continue;
      const ll = L.latLng(pos[0], pos[1]);
      const d = center.distanceTo(ll);
      if (d <= radiusMeters) res.push({ poi: p, distM: d });
    }

    res.sort((a, b) => a.distM - b.distM);
    return res.slice(0, limit);
  }

  function renderNearbyPoisBox(popupContainer, nearby, resetFn) {
    if (!popupContainer) return;
    const statsBox = popupContainer.querySelector(".stats-box");
    if (!statsBox) return;

    const box = ensureNearbyBox(popupContainer);
    if (!box) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    if (!nearby || !nearby.length) {
      box.innerHTML = `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(66,36,38,0.15);">
          <p style="font-weight:700;margin:0 0 8px;">${t.nearbyTitle}</p>
          <p style="margin:0;font-style:italic;">${t.nearbyEmpty}</p>
        </div>
      `;
      return;
    }

    box.innerHTML = `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(66,36,38,0.15);">
        <p style="font-weight:700;margin:0 0 8px;">${t.nearbyTitle}</p>
        <div class="nearby-list" style="display:flex;flex-direction:column;gap:6px;"></div>
      </div>
    `;

    const list = box.querySelector(".nearby-list");
    nearby.forEach(({ poi, distM }) => {
      const texts = poi.texts || {};
      const langBlock = texts[lang] || texts.no || {};
      const name = langBlock.title || poi.name || poi.title || "POI";
      const km = distM / 1000;
      const label = `${name} (${km < 10 ? km.toFixed(1) : km.toFixed(0)} km)`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.textAlign = "left";
      btn.style.border = "none";
      btn.style.background = "transparent";
      btn.style.padding = "6px 8px";
      btn.style.borderRadius = "10px";
      btn.style.cursor = "pointer";
      btn.style.color = "#422426";

      btn.addEventListener("mouseenter", () => showPoiCard(popupContainer, poi, resetFn));
      btn.addEventListener("click", () => showPoiCard(popupContainer, poi, resetFn));

      list.appendChild(btn);
    });
  }

  // ======================
  // Chart builder (returns routeIndex)
  // ======================
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

    renderSurfaceSummary(
      surfaceSummaryEl,
      route,
      { asphaltKm, gravelKm, trailKm, unknownKm, totalKm: idx.totalKm },
      unknownAsTrail
    );

    const highest = Math.max.apply(null, elevations);
    const ctx = canvas.getContext("2d");

    const datasets = [
      { data: asphaltPts, backgroundColor: "#37394E", borderColor: "#37394E", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false },
      { data: gravelPts, backgroundColor: "#A3886C", borderColor: "#A3886C", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false },
      { data: trailPts, backgroundColor: "#5C7936", borderColor: "#5C7936", fill: true, pointRadius: 0, tension: 0.4, spanGaps: false },
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

    // Kritisk fix: sett rød prikk på ruta med én gang
    for (let i = 0; i < idx.lats.length; i++) {
      const lat = idx.lats[i], lon = idx.lons[i];
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        moveMarkerToIndex(i);
        break;
      }
    }

    canvas.addEventListener("mousemove", function (evt) {
      const points = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
      if (points.length) moveMarkerToIndex(points[0].index);
    });

    canvas.addEventListener(
      "touchmove",
      function (e) {
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
      },
      { passive: true }
    );

    return idx;
  }

  // ======================
  // MarkerCluster
  // ======================
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
      return poi && poi.id ? String(poi.id) : JSON.stringify(getPoiPos(poi) || []);
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

  // ======================
  // Fullscreen control
  // ======================
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

  // ======================
  // Position control (my location + place pin)
  // ======================
  function addPositionControl(map, popupContainer, getRouteIndex, poisForRoute, revealPoisNear, resetPopup) {
    if (!map) return;

    let userMarker = null;
    let userCircle = null;
    let chosenMarker = null;
    let pickMode = false;

    function t() {
      const lang = getLang();
      return infoTexts[lang] || infoTexts.no;
    }

    function setPickMode(on) {
      pickMode = !!on;
      map.getContainer().style.cursor = pickMode ? "crosshair" : "";
    }

    function updatePanels(latlng) {
      const idx = typeof getRouteIndex === "function" ? getRouteIndex() : null;
      if (!idx) return; // elevation ikke lastet ennå

      renderPositionResult(popupContainer, idx, latlng.lat, latlng.lng);

      const nearby = getNearbyPoisSorted(poisForRoute, latlng, NEARBY_RADIUS_M, NEARBY_LIMIT);
      renderNearbyPoisBox(popupContainer, nearby, resetPopup);
    }

    function showPickHintOnce() {
      const text = t().pickHint;
      const box = L.control({ position: "topleft" });
      box.onAdd = function () {
        const el = L.DomUtil.create("div", "svingom-pick-hint");
        el.style.background = "#EEE9E0";
        el.style.color = "#422426";
        el.style.padding = "8px 10px";
        el.style.borderRadius = "10px";
        el.style.boxShadow = "0 1px 8px rgba(0,0,0,0.12)";
        el.style.marginTop = "6px";
        el.style.maxWidth = "220px";
        el.style.fontSize = "13px";
        el.innerHTML = text;
        return el;
      };
      box.addTo(map);
      setTimeout(() => {
        try { map.removeControl(box); } catch (_) {}
      }, 4500);
    }

    const ctrl = L.control({ position: "topleft" });
    ctrl.onAdd = function () {
      const wrap = L.DomUtil.create("div", "leaflet-bar svingom-pos-wrap");

      const btnMe = L.DomUtil.create("button", "svingom-pos-btn", wrap);
      btnMe.type = "button";
      btnMe.title = t().btnMeTitle;
      btnMe.innerHTML = "◎";

      const btnPick = L.DomUtil.create("button", "svingom-pos-btn", wrap);
      btnPick.type = "button";
      btnPick.title = t().btnPickTitle;
      btnPick.innerHTML = "📍";

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

            if (typeof resetPopup === "function") resetPopup();
            updatePanels(ll);

            if (typeof revealPoisNear === "function") {
              try { revealPoisNear(ll, 3000); } catch (_) {}
            }
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
        if (next) showPickHintOnce();
      });

      return wrap;
    };

    ctrl.addTo(map);

    map.on("click", (evt) => {
      if (!pickMode) return;

      const ll = evt.latlng;

      if (!chosenMarker) {
        chosenMarker = L.marker(ll, { draggable: true }).addTo(map);

        const onMove = () => {
          const p = chosenMarker.getLatLng();
          updatePanels(p);
          if (typeof revealPoisNear === "function") {
            try { revealPoisNear(p, 3000); } catch (_) {}
          }
        };

        chosenMarker.on("drag", onMove);
        chosenMarker.on("dragend", onMove);
      } else {
        chosenMarker.setLatLng(ll);
      }

      if (typeof resetPopup === "function") resetPopup();
      updatePanels(ll);

      if (typeof revealPoisNear === "function") {
        try { revealPoisNear(ll, 3000); } catch (_) {}
      }

      setPickMode(false);
      const active = map.getContainer().querySelector(".svingom-pos-btn.active");
      if (active) active.classList.remove("active");
    });
  }

  // ======================
  // Core init per section
  // ======================
  async function initRouteSection(section) {
    try {
      const routeId = (section.dataset.routeId || "").trim();
      const routesUrl = (section.dataset.routesUrl || "").trim();
      const poisUrl = (section.dataset.poisUrl || "").trim();
      const routeMarkersUrl = (section.dataset.routeMarkersUrl || "").trim();
      const unknownAsTrail = String(section.dataset.unknownAsTrail || "").trim() === "1";

      if (!routeId || !routesUrl || !poisUrl || !routeMarkersUrl) {
        console.error("[route_map] Missing data attributes:", { routeId, routesUrl, poisUrl, routeMarkersUrl });
        return;
      }

      const mapDiv = section.querySelector(".route-map");
      const popupContainer = section.querySelector(".route-popup");
      const chartCanvas = section.querySelector(".chart-wrapper canvas");
      const surfaceSummaryEl = section.querySelector(".surface-summary");

      if (!mapDiv || !popupContainer || !chartCanvas) {
        console.error("[route_map] Missing DOM elements for", routeId);
        return;
      }

      if (typeof L === "undefined") {
        console.error("[route_map] Leaflet (L) is undefined");
        return;
      }

      if (section.__routeMapInitialized) return;
      section.__routeMapInitialized = true;

      const routesJson = await fetchJsonCached(routesUrl);
      const route = Array.isArray(routesJson)
        ? routesJson.find((x) => x && x.id === routeId)
        : (routesJson && routesJson[routeId]) || null;

      if (!route) {
        console.error("[route_map] routeId not found in routes.json:", routeId);
        return;
      }

      const gpxUrl = (route.gpxUrl || "").trim();
      const elevUrl = (route.elevationSurfaceUrl || route.elevationUrl || "").trim();
      if (!gpxUrl || !elevUrl) {
        console.error("[route_map] Route missing gpxUrl/elevationUrl:", routeId, route);
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
      function resetPopup() {
        renderStats(popupContainer, route);
      }

      let routeIndex = null;
      try {
        const elevJson = await fetchJsonCached(elevUrl);
        const pts = Array.isArray(elevJson.points) ? elevJson.points : elevJson;
        const cleaned = (pts || []).filter((p) => p && p.elevation != null && p.lat != null && p.lon != null && p.distance != null);
        if (cleaned.length) {
          routeIndex = buildChart(chartCanvas, cleaned, movingMarker, surfaceSummaryEl, route, unknownAsTrail);
        } else {
          console.warn("[route_map] Elevation: no usable points in", elevUrl);
        }
      } catch (e) {
        console.error("[route_map] Elevation error:", routeId, elevUrl, e);
      }

      let poisForRoute = [];
      try {
        const [poisJson, routeMarkersJson] = await Promise.all([fetchJsonCached(poisUrl), fetchJsonCached(routeMarkersUrl)]);
        const allPois = Array.isArray(poisJson) ? poisJson : Object.values(poisJson || {});
        const poisById = new Map();
        allPois.forEach((p) => {
          if (p && p.id) poisById.set(p.id, p);
        });

        const ids = (routeMarkersJson && routeMarkersJson[routeId]) ? routeMarkersJson[routeId] : [];
        poisForRoute = ids.map((id) => poisById.get(id)).filter(Boolean);

        if (poisForRoute.length <= POI_THRESHOLD) {
          poisForRoute.forEach((p) => addMarkerFromDb(map, p, popupContainer, resetPopup));
        } else {
          const clusterLayer = createClusterLayer(map);
          if (clusterLayer) poisForRoute.forEach((p) => addMarkerFromDb(clusterLayer, p, popupContainer, resetPopup));
          else enableLazyPoiRendering(map, poisForRoute, popupContainer, resetPopup);
        }
      } catch (e) {
        console.error("[route_map] POI error:", routeId, e);
      }

      const boosted = new Set();
      function revealPoisNear(latlng, radiusMeters = 3000) {
        if (!latlng || !Array.isArray(poisForRoute) || !poisForRoute.length) return;
        const center = L.latLng(latlng.lat, latlng.lng);

        for (const p of poisForRoute) {
          const pos = getPoiPos(p);
          if (!pos) continue;
          const ll = L.latLng(pos[0], pos[1]);
          if (center.distanceTo(ll) <= radiusMeters) {
            const k = p && p.id ? String(p.id) : JSON.stringify(pos);
            if (boosted.has(k)) continue;
            boosted.add(k);
            addMarkerFromDb(map, p, popupContainer, resetPopup);
          }
        }
      }

      const enableFullscreen = String(section.dataset.enableFullscreen || "1") === "1";
      const enablePosition = String(section.dataset.enablePosition || "1") === "1";

      if (enablePosition) {
        addPositionControl(
          map,
          popupContainer,
          () => routeIndex,
          poisForRoute,
          revealPoisNear,
          () => resetPopup()
        );
      }
      if (enableFullscreen) addFullscreenControl(map, section);

      try {
        new L.GPX(gpxUrl, {
          async: true,
          polyline_options: { color: "#37394E", weight: 5, opacity: 0.9 },
          marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null, wptIconUrls: {} },
        })
          .on("loaded", function (e) {
            map.fitBounds(e.target.getBounds(), { padding: [50, 50] });
            setTimeout(() => map.invalidateSize(), 60);
          })
          .addTo(map);
      } catch (e) {
        console.error("[route_map] GPX error:", routeId, gpxUrl, e);
      }
    } catch (e) {
      console.error("[route_map] initRouteSection fatal:", e);
    }
  }

  // ======================
  // Robust init for Squarespace
  // ======================
  function initAllOnce() {
    initChartDefaultsOnce();
    const sections = document.querySelectorAll(".map-section.map-master[data-route-id]");
    console.log("[route_map] initAll sections:", sections.length);
    sections.forEach((section) => initRouteSection(section));
  }

  function startRobustInit() {
    let tries = 0;
    const maxTries = 60;

    const tick = () => {
      tries++;
      initAllOnce();
      const any = document.querySelector(".map-section.map-master[data-route-id]");
      if (any || tries >= maxTries) return;
      setTimeout(tick, 250);
    };

    tick();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(initAllOnce, 0));
    } else {
      setTimeout(initAllOnce, 0);
    }

    try {
      const obs = new MutationObserver(() => initAllOnce());
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        try { obs.disconnect(); } catch (_) {}
      }, 30000);
    } catch (_) {}
  }

  startRobustInit();
})();
