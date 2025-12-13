// route_map_v3.js – felles logikk for alle rutekart (stats + markers + elevation + surface)
// Forutsetter: Leaflet, Leaflet-GPX og Chart.js er lastet inn før denne.

(function () {
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
      surfaceLabel: "Underlag:"
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
      surfaceLabel: "Surface:"
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
      surfaceLabel: "Untergrund:"
    }
  };

  function getLang() {
    try {
      if (typeof Weglot !== "undefined" && Weglot.getCurrentLang) return Weglot.getCurrentLang();
    } catch (e) {}
    return "no";
  }

  function safeNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeSymbol(sym) {
    if (!sym) return null;
    // Filene dine i symbols-repoet er "symbols-${type}.svg" med type som regel lowercase
    return String(sym).trim().toLowerCase();
  }

  function symbolUrl(sym) {
    const s = normalizeSymbol(sym);
    if (!s) return null;

    // Spesialregel: du har et bathingspot-blue ikon som skal erstatte standard bathingspot
    if (s === "bathingspot") {
      return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-bathingspot-blue.svg";
    }
    return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-" + s + ".svg";
  }

  function renderStats(container, stats) {
    if (!container || !stats) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    const distanceKm = safeNum(stats.distanceKm, 0);
    const climbM = safeNum(stats.climbM, 0);
    const descentM = safeNum(stats.descentM, 0);
    const maxElevationM = safeNum(stats.maxElevationM, 0);
    const minElevationM = safeNum(stats.minElevationM, 0);

    container.classList.remove("hidden");
    container.innerHTML = `
      <button class="route-close" aria-label="Close">&times;</button>
      <div class="stats-box">
        <p class="stats-title">${t.title}</p>
        <p><span class="icon">↔</span> ${t.length}: <strong>${distanceKm.toFixed(1)}</strong> km</p>
        <p><span class="icon">↗</span> ${t.ascent}: <strong>${climbM.toFixed(0)}</strong> m</p>
        <p><span class="icon">↘</span> ${t.descent}: <strong>${descentM.toFixed(0)}</strong> m</p>
        <p><span class="icon">▲</span> ${t.highest}: <strong>${maxElevationM.toFixed(0)}</strong> ${t.unit}</p>
        <p><span class="icon">▼</span> ${t.lowest}: <strong>${minElevationM.toFixed(0)}</strong> ${t.unit}</p>
        <p style="margin-top:16px;font-style:italic;">${t.instruction}</p>
      </div>
    `;

    const closeBtn = container.querySelector(".route-close");
    if (closeBtn && window.innerWidth <= 768) {
      closeBtn.addEventListener("click", function () {
        container.classList.add("hidden");
      });
    }
  }

  function renderSurfaceSummary(container, stats, computedFromFile) {
    if (!container) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    // Vi kan enten bruke stats.surface (hvis du har det), eller beregne fra elevationfilen.
    const s = stats && stats.surface ? stats.surface : null;
    const summary = computedFromFile || null;

    const asphaltKm = summary?.asphaltKm ?? s?.categoryKm?.asphalt ?? null;
    const gravelKm  = summary?.gravelKm  ?? s?.categoryKm?.gravel  ?? null;
    const trailKm   = summary?.trailKm   ?? s?.categoryKm?.trail   ?? null;
    const totalKm   = summary?.totalKm   ?? s?.totalKm             ?? null;

    if (![asphaltKm, gravelKm, trailKm, totalKm].every(v => Number.isFinite(Number(v)))) {
      container.innerHTML = ""; // Ingen surface tilgjengelig
      return;
    }

    const a = Number(asphaltKm), g = Number(gravelKm), tr = Number(trailKm), tot = Number(totalKm);
    const aPct = tot > 0 ? (a / tot) * 100 : 0;
    const gPct = tot > 0 ? (g / tot) * 100 : 0;
    const tPct = tot > 0 ? (tr / tot) * 100 : 0;

    container.innerHTML = `
      <span style="margin-right:10px;">${t.surfaceLabel}</span>
      <span class="surface-legend-item">
        <span class="surface-legend-color asphalt"></span>
        Asfalt ${a.toFixed(1)} km (${aPct.toFixed(0)} %)
      </span>
      <span class="surface-legend-item">
        <span class="surface-legend-color gravel"></span>
        Grus ${g.toFixed(1)} km (${gPct.toFixed(0)} %)
      </span>
      <span class="surface-legend-item">
        <span class="surface-legend-color trail"></span>
        Sti ${tr.toFixed(1)} km (${tPct.toFixed(0)} %)
      </span>
    `;
  }

  function addMarkerFromDb(map, marker, popupContainer, resetFn) {
    if (!map || !marker) return;

    const pos =
      marker.latlng ||
      (marker.lat && marker.lon ? [marker.lat, marker.lon] : null) ||
      (marker.lat && marker.lng ? [marker.lat, marker.lng] : null);

    if (!pos) return;

    const sym = marker.symbolType || marker.symbol || null;
    const iconUrl = symbolUrl(sym);

    const customIcon = L.divIcon({
      className: "custom-icon",
      html: iconUrl
        ? `<img src="${iconUrl}" style="width:30px;height:30px;">`
        : `<div style="width:30px;height:30px;background:#422426;border-radius:50%;"></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });

    const leafletMarker = L.marker(pos, { icon: customIcon }).addTo(map);

    leafletMarker.on("mouseover", function () {
      if (!popupContainer) return;

      popupContainer.classList.remove("hidden");

      const lang = getLang();
      const texts = marker.texts || {};
      const langBlock = texts[lang] || texts.no || {};

      const title = langBlock.title || marker.name || marker.title || "";
      const desc  = langBlock.description || langBlock.desc || marker.description || "";
      const imgUrl = marker.imageUrl || marker.image || null;

      popupContainer.innerHTML = `
        <div style="background:white;padding:15px;border-radius:6px;">
          <div style="text-align:right;">
            <button class="popup-close"
              style="background:none;border:none;font-size:22px;font-weight:bold;color:#422426;cursor:pointer;line-height:1;margin-bottom:5px;">
              &times;
            </button>
          </div>
          <h3 style="margin-top:0;font-size:1.1rem;font-weight:bold;color:#422426;">${title}</h3>
          ${imgUrl ? `<img src="${imgUrl}" style="margin-bottom:8px;border-radius:6px;max-width:100%;">` : ""}
          <p style="font-size:0.95rem;line-height:1.4;">${desc}</p>
        </div>
      `;

      const close = popupContainer.querySelector(".popup-close");
      if (close) {
        close.addEventListener("click", function () {
          if (typeof resetFn === "function") resetFn();
        });
      }
    });
  }

  function buildChart(canvas, elevPoints, movingMarker, surfaceSummaryEl, statsForSurface) {
    if (!canvas || !Array.isArray(elevPoints) || elevPoints.length === 0) return;
    if (typeof Chart === "undefined") return;

    const distances = [];
    const elevations = [];
    const lats = [];
    const lons = [];
    const surfaceCats = [];

    for (let i = 0; i < elevPoints.length; i++) {
      const p = elevPoints[i] || {};
      const d = safeNum(p.distance, i > 0 ? distances[i - 1] : 0);
      const e = safeNum(p.elevation, i > 0 ? elevations[i - 1] : 0);
      distances.push(d);
      elevations.push(e);
      lats.push(p.lat);
      lons.push(p.lon);

      // Normaliser "unknown" -> "trail" slik du gjorde i den fungerende koden
      let cat = (p.surfaceCategory || p.surface || p.category || "").toString().toLowerCase().trim();
      if (!cat || cat === "unknown") cat = "trail";
      if (cat !== "asphalt" && cat !== "gravel" && cat !== "trail") cat = "trail";
      surfaceCats.push(cat);
    }

    // Slopes for tooltip
    const slopes = [0];
    for (let i = 1; i < elevations.length; i++) {
      const delta = elevations[i] - elevations[i - 1];
      const distKm = distances[i] - distances[i - 1];
      const slope = distKm > 0 ? (delta / (distKm * 1000)) * 100 : 0;
      slopes.push(slope);
    }

    // Surface datasets (bånd)
    const asphaltVals = new Array(elevations.length).fill(null);
    const gravelVals  = new Array(elevations.length).fill(null);
    const trailVals   = new Array(elevations.length).fill(null);

    let asphaltKm = 0, gravelKm = 0, trailKm = 0;
    for (let i = 0; i < elevations.length; i++) {
      const e = elevations[i];
      const cat = surfaceCats[i];

      if (cat === "asphalt") asphaltVals[i] = e;
      if (cat === "gravel")  gravelVals[i]  = e;
      if (cat === "trail")   trailVals[i]   = e;

      if (i > 0) {
        const segKm = distances[i] - distances[i - 1];
        if (cat === "asphalt") asphaltKm += segKm;
        else if (cat === "gravel") gravelKm += segKm;
        else trailKm += segKm;
      }
    }

    const totalKm = distances[distances.length - 1];
    renderSurfaceSummary(surfaceSummaryEl, statsForSurface, {
      asphaltKm, gravelKm, trailKm, totalKm
    });

    const highest = Math.max.apply(null, elevations);
    const ctx = canvas.getContext("2d");

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: distances,
        datasets: [
          {
            data: asphaltVals,
            backgroundColor: "#37394E",
            borderColor: "#37394E",
            fill: true,
            pointRadius: 0,
            tension: 0.4
          },
          {
            data: gravelVals,
            backgroundColor: "#A3886C",
            borderColor: "#A3886C",
            fill: true,
            pointRadius: 0,
            tension: 0.4
          },
          {
            data: trailVals,
            backgroundColor: "#5C7936",
            borderColor: "#5C7936",
            fill: true,
            pointRadius: 0,
            tension: 0.4
          },
          {
            data: elevations,
            borderColor: "#37394E",
            borderWidth: 4,
            pointRadius: 0,
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#37394E",
            displayColors: false,
            filter: (item) => item.datasetIndex === 3,
            callbacks: {
              title: (items) => `${safeNum(items[0].label, 0).toFixed(1)} km`,
              label: (c) => {
                const idx = c.dataIndex;
                const elev = elevations[idx];
                const slope = slopes[idx] || 0;
                return `${elev.toFixed(0)} moh / ${slope.toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: totalKm,
            ticks: {
              color: "#37394E",
              callback: (v) => `${Number(v).toFixed(0)} km`
            },
            grid: { display: false }
          },
          y: {
            min: 0,
            max: Math.ceil(highest / 50) * 50,
            ticks: { stepSize: 50, color: "#37394E" },
            grid: { display: false }
          }
        }
      }
    });

    function moveMarkerToIndex(idx) {
      if (!movingMarker) return;
      const lat = lats[idx];
      const lon = lons[idx];
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        movingMarker.setLatLng([Number(lat), Number(lon)]);
      }
    }

    canvas.addEventListener("mousemove", function (evt) {
      const points = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
      if (points.length) moveMarkerToIndex(points[0].index);
    });

    canvas.addEventListener("touchmove", function (e) {
      if (!e.touches || !e.touches.length) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const simulatedEvent = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      canvas.dispatchEvent(simulatedEvent);
    });
  }

// ============================
// INIT (ny grunnmur: routes.json + pois.json + route_markers_v2.json)
// Erstatt ALT fra "async function initRouteSection" og ned til "})();"
// ============================

async function initRouteSection(section) {
  // --- 0) Les input fra HTML (kun disse to + routeId)
  const routeId   = (section.dataset.routeId || "").trim();
  const routesUrl = (section.dataset.routesUrl || "").trim();
  const poisUrl   = (section.dataset.poisUrl || "").trim();

  if (!routeId) {
    console.error("[route_map] Mangler data-route-id på .map-section");
    return;
  }
  if (!routesUrl) {
    console.error("[route_map] Mangler data-routes-url for routeId:", routeId);
    return;
  }
  if (!poisUrl) {
    console.error("[route_map] Mangler data-pois-url for routeId:", routeId);
    return;
  }

  // --- 1) Finn elementene vi skal tegne i
  const mapDiv = section.querySelector(".route-map");
  const popupContainer = section.querySelector(".route-popup");
  const chartCanvas = section.querySelector(".chart-wrapper canvas");
  const surfaceSummaryEl = section.querySelector(".surface-summary");

  if (!mapDiv) {
    console.error("[route_map] Mangler .route-map inni seksjonen for", routeId);
    return;
  }
  if (!popupContainer) {
    console.error("[route_map] Mangler .route-popup inni seksjonen for", routeId);
    return;
  }
  if (!chartCanvas) {
    console.error("[route_map] Mangler .chart-wrapper canvas inni seksjonen for", routeId);
    return;
  }

  // --- 2) Last routes.json og hent riktig rute
  let routesJson;
  try {
    const r = await fetch(routesUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("routes.json fetch failed: " + r.status);
    routesJson = await r.json();
  } catch (e) {
    console.error("[route_map] Klarte ikke å laste routes.json:", routesUrl, e);
    return;
  }

  const route =
    Array.isArray(routesJson)
      ? routesJson.find(x => x && x.id === routeId)
      : (routesJson && routesJson[routeId]) || null;

  if (!route) {
    console.error("[route_map] Fant ikke routeId i routes.json:", routeId);
    return;
  }

  // --- 3) Streng kontrakt: disse må finnes i route-objektet
  const gpxUrl = (route.gpxUrl || "").trim();
  const elevUrl = (route.elevationSurfaceUrl || route.elevationUrl || "").trim();
  const routeMarkersUrl = (route.routeMarkersUrl || "").trim(); // peker til route_markers_v2.json

  if (!gpxUrl) {
    console.error("[route_map] Rute mangler gpxUrl:", routeId, route);
    return;
  }
  if (!elevUrl) {
    console.error("[route_map] Rute mangler elevationUrl/elevationSurfaceUrl:", routeId, route);
    return;
  }
  if (!routeMarkersUrl) {
    console.error("[route_map] Rute mangler routeMarkersUrl (route_markers_v2.json):", routeId, route);
    return;
  }

  // --- 4) Kart init (HTML kan overstyre center/zoom, ellers brukes route eller default)
  const centerLat = parseFloat(section.dataset.centerLat || route.centerLat || "59.83467");
  const centerLng = parseFloat(section.dataset.centerLng || route.centerLng || "9.57846");
  const zoom = parseInt(section.dataset.zoom || route.zoom || "11", 10);

  const map = L.map(mapDiv, {
    center: [centerLat, centerLng],
    zoom,
    scrollWheelZoom: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "Kartdata © OpenStreetMap",
    maxZoom: 19
  }).addTo(map);

  const movingMarker = L.circleMarker([centerLat, centerLng], {
    radius: 6,
    color: "#CA6B2A",
    fillColor: "#CA6B2A",
    fillOpacity: 1,
    weight: 2
  }).addTo(map);

  // routes.json er nå "stats-kilden"
  const routeStats = route;
  renderStats(popupContainer, routeStats);

  function resetPopup() {
    renderStats(popupContainer, routeStats);
  }

  // --- 5) Elevation + surface
  try {
    const elevResp = await fetch(elevUrl, { cache: "no-store" });
    if (!elevResp.ok) throw new Error("elevation fetch failed: " + elevResp.status);
    const elevJson = await elevResp.json();
    const pts = Array.isArray(elevJson.points) ? elevJson.points : elevJson;
    const cleaned = (pts || []).filter(p => p && p.elevation != null);
    if (!cleaned.length) throw new Error("elevation has no points");
    buildChart(chartCanvas, cleaned, movingMarker, surfaceSummaryEl, routeStats);
  } catch (e) {
    console.error("[route_map] Elevation-feil for", routeId, elevUrl, e);
  }

  // --- 6) POI + route_markers_v2 (ID-basert)
  try {
    const [poisResp, routeMarkersResp] = await Promise.all([
      fetch(poisUrl, { cache: "no-store" }),
      fetch(routeMarkersUrl, { cache: "no-store" })
    ]);

    if (!poisResp.ok) throw new Error("pois.json fetch failed: " + poisResp.status);
    if (!routeMarkersResp.ok) throw new Error("route_markers_v2 fetch failed: " + routeMarkersResp.status);

    const poisJson = await poisResp.json();
    const routeMarkersJson = await routeMarkersResp.json();

    const allPois = Array.isArray(poisJson) ? poisJson : Object.values(poisJson || {});
    const poisById = new Map();
    allPois.forEach(p => { if (p && p.id) poisById.set(p.id, p); });

    const poiIdsForRoute = routeMarkersJson[routeId] || [];
    if (!poiIdsForRoute.length) {
      console.warn("[route_map] Ingen POI-id'er for route:", routeId);
    }

    poiIdsForRoute
      .map(id => {
        const p = poisById.get(id);
        if (!p) console.warn("[route_map] Mangler POI for id:", id, "route:", routeId);
        return p;
      })
      .filter(Boolean)
      .forEach(p => addMarkerFromDb(map, p, popupContainer, resetPopup));

  } catch (e) {
    console.error("[route_map] POI-feil for", routeId, e);
  }

  // --- 7) GPX-rute
  try {
    new L.GPX(gpxUrl, {
      async: true,
      polyline_options: { color: "#37394E", weight: 5, opacity: 0.9 },
      marker_options: {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null,
        wptIconUrls: { "": null }
      }
    })
      .on("loaded", function (e) {
        map.fitBounds(e.target.getBounds(), { padding: [50, 50] });
      })
      .addTo(map);

  } catch (e) {
    console.error("[route_map] GPX-feil for", routeId, gpxUrl, e);
  }
}

function initAll() {
  const sections = document.querySelectorAll(".map-section[data-route-id]");
  sections.forEach((section) => initRouteSection(section));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll);
} else {
  initAll();
}
})();
