// route_map_master_v1.js
// Master: routes.json + pois.json + route_markers_v2.json + elevation_with_surface.json
// Krever: Leaflet, Leaflet-GPX, Chart.js lastet inn før denne.

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
      surfaceLabel: "Underlag:",
      asphalt: "Asfalt",
      gravel: "Grus",
      trail: "Sti",
      unknown: "Ukjent"
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
      unknown: "Unknown"
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
      unknown: "Unbekannt"
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
    return String(sym).trim().toLowerCase();
  }

  function symbolUrl(sym) {
    const s = normalizeSymbol(sym);
    if (!s) return null;

    // Spesialregel: bathingspot -> bathingspot-blue
    if (s === "bathingspot") {
      return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-bathingspot-blue.svg";
    }
    return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-" + s + ".svg";
  }

  function getRouteStats(route) {
    // routes.json har stats under route.stats
    const st = (route && route.stats) || {};
    return {
      distanceKm: safeNum(st.distanceKm, 0),
      climbM: safeNum(st.climbM, 0),
      descentM: safeNum(st.descentM, 0),
      maxElevationM: safeNum(st.maxElevationM, 0),
      minElevationM: safeNum(st.minElevationM, 0)
    };
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

  // routes.json: route.surface.categoryKm.{asphalt,gravel,trail,unknown} + totalKm
  const surface = route.surface || null;
  const categoryKm = surface && surface.categoryKm ? surface.categoryKm : null;

  // Prefer: computedFromFile (fra elev.points)
  let asphaltKm = computedFromFile?.asphaltKm;
  let gravelKm  = computedFromFile?.gravelKm;
  let trailKm   = computedFromFile?.trailKm;
  let unknownKm = computedFromFile?.unknownKm;
  let totalKm   = computedFromFile?.totalKm;

  // Fallback: route.surface
  if (!Number.isFinite(Number(asphaltKm)) && categoryKm) asphaltKm = categoryKm.asphalt;
  if (!Number.isFinite(Number(gravelKm))  && categoryKm) gravelKm  = categoryKm.gravel;
  if (!Number.isFinite(Number(trailKm))   && categoryKm) trailKm   = categoryKm.trail;
  if (!Number.isFinite(Number(unknownKm)) && categoryKm) unknownKm = categoryKm.unknown;
  if (!Number.isFinite(Number(totalKm))   && surface)    totalKm   = surface.totalKm;

  // Hvis total mangler, prøv å summere
  const a0 = safeNum(asphaltKm, 0);
  const g0 = safeNum(gravelKm, 0);
  const tr0 = safeNum(trailKm, 0);
  const u0 = safeNum(unknownKm, 0);
  const tot0 = Number.isFinite(Number(totalKm)) ? Number(totalKm) : (a0 + g0 + tr0 + u0);

  // Unknown -> trail (hvis ønsket for ruten)
  let a = a0, g = g0, tr = tr0, u = u0, tot = tot0;
  if (unknownAsTrail) {
    tr += u;
    u = 0;
  }

  // Hvis alt er 0, ikke vis noe
  if (tot <= 0.0001) {
    container.innerHTML = "";
    return;
  }

  const pct = (v) => (tot > 0 ? Math.round((v / tot) * 100) : 0);

  const showUnknown = !unknownAsTrail && u > 0.01;

  // Forklaring av farger (match dataset-fargene dine)
   container.innerHTML = `
    <span class="surface-label">${t.surfaceLabel}</span>

    <span class="surface-legend-item">
      <span class="surface-swatch asphalt"></span>
      ${t.asphalt} ${a.toFixed(1)} km (${pct(a)} %)
    </span>

    <span class="surface-legend-item">
      <span class="surface-swatch gravel"></span>
      ${t.gravel} ${g.toFixed(1)} km (${pct(g)} %)
    </span>

    <span class="surface-legend-item">
      <span class="surface-swatch trail"></span>
      ${t.trail} ${tr.toFixed(1)} km (${pct(tr)} %)
    </span>

    ${showUnknown ? `
      <span class="surface-legend-item">
        <span class="surface-swatch unknown"></span>
        ${t.unknown} ${u.toFixed(1)} km (${pct(u)} %)
      </span>
    ` : ""}
  `;

  function addMarkerFromDb(map, poi, popupContainer, resetFn) {
    if (!map || !poi) return;

    const pos =
      poi.latlng ||
      (poi.lat && poi.lon ? [poi.lat, poi.lon] : null) ||
      (poi.lat && poi.lng ? [poi.lat, poi.lng] : null);

    if (!pos) return;

    const sym = poi.symbolType || poi.symbol || null;
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
      const texts = poi.texts || {};
      const langBlock = texts[lang] || texts.no || {};

      const title = langBlock.title || poi.name || poi.title || "";
      const desc  = langBlock.description || langBlock.desc || poi.description || "";
      const imgUrl = poi.imageUrl || poi.image || null;

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

  function normalizeSurfaceCategory(raw, unknownAsTrail) {
    let cat = (raw || "").toString().toLowerCase().trim();
    if (!cat) cat = "unknown";

    // Tillatte kategorier på punktnivå
    if (cat !== "asphalt" && cat !== "gravel" && cat !== "trail" && cat !== "unknown") {
      cat = "unknown";
    }

    // Viktig: hvis du vil “alt ukjent = sti” for en rute
    if (unknownAsTrail && cat === "unknown") return "trail";
    return cat;
  }

  function buildChart(canvas, elevPoints, movingMarker, surfaceSummaryEl, route, unknownAsTrail) {
    if (!canvas || !Array.isArray(elevPoints) || elevPoints.length === 0) return;
    if (typeof Chart === "undefined") return;

    const distances = [];
    const elevations = [];
    const lats = [];
    const lons = [];
    const cats = [];

    for (let i = 0; i < elevPoints.length; i++) {
      const p = elevPoints[i] || {};
      const d = safeNum(p.distance, i > 0 ? distances[i - 1] : 0);
      const e = safeNum(p.elevation, i > 0 ? elevations[i - 1] : 0);

      distances.push(d);
      elevations.push(e);
      lats.push(p.lat);
      lons.push(p.lon);

      // Elevasjonsfila kan ha surfaceCategory eller surface eller category
      const raw = p.surfaceCategory ?? p.surface ?? p.category ?? "unknown";
      cats.push(normalizeSurfaceCategory(raw, unknownAsTrail));
    }

    // Slopes for tooltip
    const slopes = [0];
    for (let i = 1; i < elevations.length; i++) {
      const delta = elevations[i] - elevations[i - 1];
      const distKm = distances[i] - distances[i - 1];
      const slope = distKm > 0 ? (delta / (distKm * 1000)) * 100 : 0;
      slopes.push(slope);
    }

    // Underlag-bånd
    const asphaltVals = new Array(elevations.length).fill(null);
    const gravelVals  = new Array(elevations.length).fill(null);
    const trailVals   = new Array(elevations.length).fill(null);
    const unknownVals = new Array(elevations.length).fill(null);

    let asphaltKm = 0, gravelKm = 0, trailKm = 0, unknownKm = 0;

    for (let i = 0; i < elevations.length; i++) {
      const e = elevations[i];
      const cat = cats[i];

      if (cat === "asphalt") asphaltVals[i] = e;
      else if (cat === "gravel") gravelVals[i] = e;
      else if (cat === "trail") trailVals[i] = e;
      else unknownVals[i] = e;

      if (i > 0) {
        const segKm = distances[i] - distances[i - 1];
        if (cat === "asphalt") asphaltKm += segKm;
        else if (cat === "gravel") gravelKm += segKm;
        else if (cat === "trail") trailKm += segKm;
        else unknownKm += segKm;
      }
    }

    const totalKm = distances[distances.length - 1];

    renderSurfaceSummary(surfaceSummaryEl, route, {
      asphaltKm, gravelKm, trailKm, unknownKm, totalKm
    }, unknownAsTrail);

    const highest = Math.max.apply(null, elevations);
    const ctx = canvas.getContext("2d");

    // Hvis unknownAsTrail=true, gir unknown-bånd ingen mening (alt ble trail), så vi dropper dataset
    const datasets = [
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
      }
    ];

    if (!unknownAsTrail) {
      datasets.push({
        data: unknownVals,
        backgroundColor: "#9AA0A6",
        borderColor: "#9AA0A6",
        fill: true,
        pointRadius: 0,
        tension: 0.4
      });
    }

    // Selve linja oppå alt
    datasets.push({
      data: elevations,
      borderColor: "#37394E",
      borderWidth: 4,
      pointRadius: 0,
      tension: 0.4,
      fill: false
    });

    const lineDatasetIndex = datasets.length - 1;

    const chart = new Chart(ctx, {
      type: "line",
      data: { labels: distances, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#37394E",
            displayColors: false,
            // kun tooltip på linja (ikke bånd)
            filter: (item) => item.datasetIndex === lineDatasetIndex,
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

  async function initRouteSection(section) {
    const routeId = (section.dataset.routeId || "").trim();
    const routesUrl = (section.dataset.routesUrl || "").trim();
    const poisUrl = (section.dataset.poisUrl || "").trim();
    const routeMarkersUrl = (section.dataset.routeMarkersUrl || "").trim();

    // Dette er hele trikset ditt for Follsjø rundt:
    const unknownAsTrail = String(section.dataset.unknownAsTrail || "").trim() === "1";

    if (!routeId || !routesUrl || !poisUrl || !routeMarkersUrl) {
      console.error("[route_map] Mangler data-attributter:", {
        routeId, routesUrl, poisUrl, routeMarkersUrl
      });
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

    // --- routes.json
    let routesJson;
    try {
      const r = await fetch(routesUrl, { cache: "no-store" });
      if (!r.ok) throw new Error("routes fetch failed: " + r.status);
      routesJson = await r.json();
    } catch (e) {
      console.error("[route_map] Klarte ikke å laste routes.json:", routesUrl, e);
      return;
    }

    const route = Array.isArray(routesJson)
      ? routesJson.find(x => x && x.id === routeId)
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

    // Kart init
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

    renderStats(popupContainer, route);

    function resetPopup() {
      renderStats(popupContainer, route);
    }

    // Elevation
    try {
      const elevResp = await fetch(elevUrl, { cache: "no-store" });
      if (!elevResp.ok) throw new Error("elevation fetch failed: " + elevResp.status);
      const elevJson = await elevResp.json();
      const pts = Array.isArray(elevJson.points) ? elevJson.points : elevJson;
      const cleaned = (pts || []).filter(p => p && p.elevation != null);
      if (cleaned.length) {
        buildChart(chartCanvas, cleaned, movingMarker, surfaceSummaryEl, route, unknownAsTrail);
      } else {
        console.warn("[route_map] Elevation: ingen punkter i", elevUrl);
      }
    } catch (e) {
      console.error("[route_map] Elevation-feil:", routeId, elevUrl, e);
    }

    // POI + route_markers_v2
    try {
      const [poisResp, routeMarkersResp] = await Promise.all([
        fetch(poisUrl, { cache: "no-store" }),
        fetch(routeMarkersUrl, { cache: "no-store" })
      ]);

      if (!poisResp.ok) throw new Error("pois fetch failed: " + poisResp.status);
      if (!routeMarkersResp.ok) throw new Error("route_markers fetch failed: " + routeMarkersResp.status);

      const poisJson = await poisResp.json();
      const routeMarkersJson = await routeMarkersResp.json();

      const allPois = Array.isArray(poisJson) ? poisJson : Object.values(poisJson || {});
      const poisById = new Map();
      allPois.forEach(p => { if (p && p.id) poisById.set(p.id, p); });

      const ids = routeMarkersJson[routeId] || [];
      ids
        .map(id => {
          const p = poisById.get(id);
          if (!p) console.warn("[route_map] Fant ikke POI id:", id, "for route:", routeId);
          return p;
        })
        .filter(Boolean)
        .forEach(p => addMarkerFromDb(map, p, popupContainer, resetPopup));

    } catch (e) {
      console.error("[route_map] POI-feil:", routeId, e);
    }

    // GPX
    try {
      new L.GPX(gpxUrl, {
        async: true,
        polyline_options: { color: "#37394E", weight: 5, opacity: 0.9 },
        marker_options: {
          startIconUrl: null,
          endIconUrl: null,
          shadowUrl: null,
          // Vi bryr oss ikke om wpt fra GPX (du har egne POI)
          wptIconUrls: { "": null }
        }
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
    const sections = document.querySelectorAll(".map-section[data-route-id]");
    sections.forEach(section => initRouteSection(section));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
