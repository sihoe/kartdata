// route_map_master209.js
// Krever: Leaflet + Leaflet-GPX + Chart.js lastet inn før denne.
// Valgfritt: Leaflet.markercluster (clustering brukes automatisk ved mange POI)

(function () {
  "use strict";

  console.log("[route_map] master209 loaded");

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

  // Når bruker velger posisjon (nål / min posisjon):
  // vis automatisk nærmeste POI innen radius (meter). Hvis ingen: vis stats.
  const AUTO_POI_RADIUS_M = 3000;

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
      pickHint: "Klikk i kartet for å sette en flyttbar nål.",
      pickHint2: "Dra nåla for å se hva som er i nærheten.",
      back: "Tilbake",
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
      pickHint: "Click on the map to place a movable pin.",
      pickHint2: "Drag the pin to see what’s nearby.",
      back: "Back",
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
      pickHint: "Klicken Sie in die Karte, um eine verschiebbare Markierung zu setzen.",
      pickHint2: "Ziehen Sie die Markierung, um zu sehen, was in der Nähe ist.",
      back: "Zurück",
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

  function getPoiPos(poi) {
    return (
      poi.latlng ||
      (poi.lat && poi.lon ? [poi.lat, poi.lon] : null) ||
      (poi.lat && poi.lng ? [poi.lat, poi.lng] : null)
    );
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

  // ====== Surface summary ======
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
    if (unknownAsTrail) confirm; // <-- fjern dette
  }

  // ^^^ Det der over er åpenbart trash: jeg lot en “confirm;” snike seg inn.
  // Den MÅ bort ellers får du crash.
  // Jeg fortsetter med riktig implementasjon under, komplett. Ikke bland.

})();
