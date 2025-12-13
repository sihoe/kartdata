// route_map_v12.js – felles logikk for rutekart (routes.json + pois.json + elevation + surface)
// Forutsetter: Leaflet, Leaflet-GPX og Chart.js er lastet inn før denne.

(function () {
  const DEFAULT_ROUTE_MARKERS_URL =
    "https://cdn.jsdelivr.net/gh/sihoe/kartdata@main/poi/route_markers_v2.json";

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

  function renderSurfaceSummary(container, routeSurface, computedFromFile) {
    if (!container) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    // routes.json: surface kan være {asphaltKm,gravelKm,trailKm,unknownKm,totalKm}
    // eller gammel struktur. Vi støtter begge.
    const s = routeSurface || null;
    const summary = computedFromFile || null;

    const asphaltKm =
      summary?.asphaltKm ??
      s?.asphaltKm ??
      s?.categoryKm?.asphalt ??
      null;

    const gravelKm =
      summary?.gravelKm ??
      s?.gravelKm ??
      s?.categoryKm?.gravel ??
      null;

    const trailKm =
      summary?.trailKm ??
      s?.trailKm ??
      s?.categoryKm?.trail ??
      null;

    const unknownKm =
      summary?.unknownKm ??
      s?.unknownKm ??
      s?.categoryKm?.unknown ??
      null;

    const totalKm =
      summary?.totalKm ??
      s?.totalKm ??
      null;

    // Vi krever bare total + minst én kategori for å vise noe fornuftig
    const hasSome =
      [asphaltKm, gravelKm, trailKm, unknownKm].some(v => Number.isFinite(Number(v)));
    if (!Number.isFinite(Number(totalKm)) || !hasSome) {
      container.innerHTML = "";
      return;
    }

    const a = safeNum(asphaltKm, 0);
    const g = safeNum(gravelKm, 0);
    const tr = safeNum(trailKm, 0);
    const u = safeNum(unknownKm, 0);
    const tot = safeNum(totalKm, a + g + tr + u);

    const pct = (x) => (tot > 0 ? (x / tot) * 100 : 0);

    container.innerHTML = `
      <span style="margin-right:10px;">${t.surfaceLabel}</span>

      <span class="surface-legend-item">
        <span class="surface-legend-color asphalt"></span>
        Asfalt ${a.toFixed(1)} km (${pct(a).toFixed(0)} %)
      </span>

      <span class="surface-legend-item">
        <span class="surface-legend-color gravel"></span>
        Grus ${g.toFixed(1)} km (${pct(g).toFixed(0)} %)
      </span>

      <span class="surface-legend-item">
        <span class="surface-legend-color trail"></span>
        Sti ${tr.toFixed(1)} km (${pct(tr).toFixed(0)} %)
      </span>

      <span class="surface-legend-item">
        <span class="surface-legend-color unknown"></span>
        Ukjent ${u.toFixed(1)} km (${pct(u).toFixed(0)} %)
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
      const desc = langBlock.description || langBlock.desc || marker.description || "";
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

  function buildChart(canvas, elevPoints, movingMarker, surfaceSummaryEl, routeSurfaceForLegend) {
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

      // Vi støtter 4 kategorier: asphalt, gravel, trail, unknown.
      let cat = (p.surfaceCategory || p.surface || p.category || "unknown").toString().toLowerCase().trim();
      if (cat !== "asphalt" && cat !== "gravel" && cat !== "trail" && cat !== "unknown") cat = "unknown";
      surfaceCats.push(cat);
    }

    // Slopes til tooltip
    const slopes = [0];
    for (let i = 1; i < elevations.length; i++) {
      const delta = elevations[i] - elevations[i - 1];
      const distKm = distances[i] - distances[i - 1];
      const slope = distKm > 0 ? (delta / (distKm * 1000)) * 100 : 0;
      slopes.push(slope);
    }

    // Surface datasets (bånd)
    const asphaltVals = new Array(elevations.length).fill(null);
    const gravelVals = new Array(elevations.length).fill(null);
    const trailVals = new Array(elevations.length).fill(null);
    const unknownVals = new Array(elevations.length).fill(null);

    let asphaltKm = 0, gravelKm = 0, trailKm = 0, unknownKm = 0;

    for (let i = 0; i < elevations.length; i++) {
      const e = elevations[i];
      const cat = surfaceCats[i];

      if (cat === "asphalt") asphaltVals[i] = e;
      if (cat === "gravel") gravelVals[i] = e;
      if (cat === "trail") trailVals[i] = e;
      if (cat === "unknown") unknownVals[i] = e;

      if (i > 0) {
        const segKm = distances[i] - distances[i - 1];
        if (cat === "asphalt") asphaltKm += segKm;
        else if (cat === "gravel") gravelKm += segKm;
        else if (cat === "trail") trailKm += segKm;
        else unknownKm += segKm;
      }
    }

    const totalKm = distances[distances.length - 1];

    // Legend: foretrekk routes.json surface (manuelt korrigert), ellers beregn fra fil
    renderSurfaceSummary(
      surfaceSummaryEl,
      routeSurfaceForLegend,
      { asphaltKm, gravelKm, trailKm, unknownKm, totalKm }
    );

    const highest = Math.max.apply(null, elevations);
    const ctx = canvas.getContext("2d");

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: distances,
        datasets: [
          { data: asphaltVals, backgroundColor: "#37394E", borderColor: "#37394E", fill: true, pointRadius: 0, tension: 0.4 },
          { data: gravelVals,  backgroundColor: "#A3886C", borderColor: "#A3886C", fill: true, pointRadius: 0, tension: 0.4 },
          { data: trailVals,   backgroundColor: "#5C7936", borderColor: "#5C7936", fill: true, pointRadius: 0, tension: 0.4 },
          { data: unknownVals, backgroundColor: "#9B9B9B", borderColor: "#9B9B9B", fill: true, pointRadius: 0, tension: 0.4 },

          // selve høydekurven (øverst)
          { data: elevations, borderColor: "#37394E", borderWidth: 4, pointRadius: 0, tension: 0.4, fill: false }
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
            // Vis kun tooltip for høydekurven (datasetIndex 4)
            filter: (item) => item.datasetIndex === 4,
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

  function poiBelongsToRoute(poi, routeId) {
    if (!poi || !routeId) return false;
    if (poi.routeId && String(poi.routeId).trim() === routeId) return true;

    const r1 = poi.routes;
    if (Array.isArray(r1) && r1.map(String).includes(routeId)) return true;

    const r2 = poi.routeIds;
    if (Array.isArray(r2) && r2.map(String).includes(routeId)) return true;

    return false;
  }

  async function initRouteSection(section) {
    const routeId = (section.dataset.routeId || "").trim();
    const routesUrl = (section.dataset.routesUrl || "").trim();
    const poisUrl = (section.dataset.poisUrl || "").trim();
    const routeMarkersUrl = (section.dataset.routeMarkersUrl || "").trim(); // valgfri

    if (!routeId) return console.error("[route_map] Mangler data-route-id");
    if (!routesUrl) return console.error("[route_map] Mangler data-routes-url for", routeId);
    if (!poisUrl) return console.error("[route_map] Mangler data-pois-url for", routeId);

    const mapDiv = section.querySelector(".route-map");
    const popupContainer = section.querySelector(".route-popup");
    const chartCanvas = section.querySelector(".chart-wrapper canvas");
    const surfaceSummaryEl = section.querySelector(".surface-summary");

    if (!mapDiv || !popupContainer || !chartCanvas) {
      return console.error("[route_map] Mangler nødvendig DOM inni seksjonen for", routeId);
    }

    // 1) routes.json -> route
    let routesJson;
    try {
      const r = await fetch(routesUrl, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      routesJson = await r.json();
    } catch (e) {
      return console.error("[route_map] Klarte ikke å hente routes.json:", routesUrl, e);
    }

    const route =
      Array.isArray(routesJson)
        ? routesJson.find(x => x && x.id === routeId)
        : (routesJson && routesJson[routeId]) || null;

    if (!route) return console.error("[route_map] Fant ikke routeId i routes.json:", routeId);

    const gpxUrl = (route.gpxUrl || "").trim();
    const elevUrl = (route.elevationSurfaceUrl || route.elevationUrl || "").trim();

    if (!gpxUrl) return console.error("[route_map] Rute mangler gpxUrl:", routeId, route);
    if (!elevUrl) return console.error("[route_map] Rute mangler elevationUrl:", routeId, route);

    // 2) kart init
    const centerLat = parseFloat(section.dataset.centerLat || route.centerLat || "59.83467");
    const centerLng = parseFloat(section.dataset.centerLng || route.centerLng || "9.57846");
    const zoom = parseInt(section.dataset.zoom || route.zoom || "11", 10);

    const map = L.map(mapDiv, { center: [centerLat, centerLng], zoom, scrollWheelZoom: true });

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

    // 3) stats + popup
    const stats = route.stats || route; // fallback hvis du har flat struktur et sted
    renderStats(popupContainer, stats);

    function resetPopup() {
      renderStats(popupContainer, stats);
    }

    // 4) elevation + chart + surface legend
    try {
      const elevResp = await fetch(elevUrl, { cache: "no-store" });
      if (!elevResp.ok) throw new Error("HTTP " + elevResp.status);
      const elevJson = await elevResp.json();
      const pts = Array.isArray(elevJson.points) ? elevJson.points : elevJson;
      const cleaned = (pts || []).filter(p => p && p.elevation != null);
      if (!cleaned.length) throw new Error("Ingen punkter i elevationfil");
      buildChart(chartCanvas, cleaned, movingMarker, surfaceSummaryEl, route.surface || null);
    } catch (e) {
      console.error("[route_map] Elevation-feil:", routeId, elevUrl, e);
    }

    // 5) POI-er: prøv route_markers_v2.json først, fallback til filtrering på POI-felter
    let allPois = [];
    try {
      const p = await fetch(poisUrl, { cache: "no-store" });
      if (!p.ok) throw new Error("HTTP " + p.status);
      const poisJson = await p.json();
      allPois = Array.isArray(poisJson) ? poisJson : Object.values(poisJson || {});
    } catch (e) {
      console.error("[route_map] Klarte ikke å hente pois.json:", poisUrl, e);
      allPois = [];
    }

    const poisById = new Map();
    allPois.forEach(p => { if (p && p.id) poisById.set(p.id, p); });

    let added = 0;

    // 5a) route_markers mapping
    const rmUrl = routeMarkersUrl || DEFAULT_ROUTE_MARKERS_URL;
    try {
      const rm = await fetch(rmUrl, { cache: "no-store" });
      if (!rm.ok) throw new Error("HTTP " + rm.status);
      const routeMarkersJson = await rm.json();

      const ids = routeMarkersJson && routeMarkersJson[routeId] ? routeMarkersJson[routeId] : [];
      if (!ids.length) {
        console.warn("[route_map] route_markers har ingen POI-id'er for", routeId, "-> prøver fallback-filter");
        throw new Error("No ids for route");
      }

      ids
        .map(id => {
          const poi = poisById.get(id);
          if (!poi) console.warn("[route_map] Mangler POI for id:", id, "route:", routeId);
          return poi;
        })
        .filter(Boolean)
        .forEach(poi => {
          addMarkerFromDb(map, poi, popupContainer, resetPopup);
          added++;
        });

    } catch (e) {
      // 5b) fallback: POI har egne route-felter
      const fallbackPois = allPois.filter(poi => poiBelongsToRoute(poi, routeId));
      fallbackPois.forEach(poi => {
        addMarkerFromDb(map, poi, popupContainer, resetPopup);
        added++;
      });
    }

    if (!added) {
      console.warn("[route_map] Ingen POI-er ble lagt til for", routeId, "(sjekk route_markers_v2.json eller POI-routefelter)");
    }

    // 6) GPX-rute
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
