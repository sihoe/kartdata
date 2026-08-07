// route_map_master215.js
// Krever: Leaflet + Leaflet-GPX + Chart.js lastet inn før denne.
// Valgfritt: Leaflet.markercluster (clustering brukes automatisk ved mange POI)

(function () {
  "use strict";

  console.log("[route_map] master215 loaded");

  // ======================
  // JSON fetch cache (page-lifetime)
  // ======================
  const __jsonCache = new Map();

  function cacheBustUrl(url) {
    if (!url) return url;

    const shouldBust =
      url.includes("cdn.jsdelivr.net/gh/sihoe/kartdata@main/") ||
      url.includes("raw.githubusercontent.com/sihoe/kartdata/main/");

    if (!shouldBust) return url;

    const u = new URL(url, window.location.href);

    // Én felles versjon for alle kartdata.
    // Endre denne ved behov, eller overstyr globalt fra Squarespace.
    const version =
      window.SVINGOM_KARTDATA_VERSION ||
      "live-20260709-1";

    u.searchParams.set("sv", version);
    return u.toString();
  }

  async function fetchJsonCached(url) {
    if (!url) throw new Error("Missing URL");

    const bustedUrl = cacheBustUrl(url);

    if (__jsonCache.has(bustedUrl)) {
      return __jsonCache.get(bustedUrl);
    }

    const p = fetch(bustedUrl, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            `fetch failed ${r.status} for ${bustedUrl}`
          );
        }
        return r.json();
      })
      .catch((error) => {
        // En kortvarig nettverks-/CDN-feil skal ikke forgifte
        // hurtigbufferen resten av sidevisningen.
        __jsonCache.delete(bustedUrl);
        throw error;
      });

    __jsonCache.set(bustedUrl, p);
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

  const POS_NEAR_KM = 0.2;
  const POS_FAR_KM = 5.0;

  const NEARBY_RADIUS_M = 5000;
  const NEARBY_LIMIT = 8;

  const DEFAULT_BICYCLE_PARKING_ICON_URL =
    "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/bicycle_parking.svg";

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
      instruction:
        "Trykk på ikonene og se hva du kan oppleve på sykkelturen",
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
      nearbyEmpty:
        "Ingen registrerte opplevelser/tilbud i nærheten.",

      btnMeTitle: "Vis min posisjon",
      btnPickTitle: "Plasser nål (klikk i kartet)",
      pickHint:
        "Trykk 📍 og klikk i kartet for å plassere nålen. Dra den for å justere.",
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
      instruction:
        "Tap the icons to see what you can experience on the bike tour",
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
      nearbyEmpty:
        "No registered experiences/services nearby.",

      btnMeTitle: "Show my location",
      btnPickTitle: "Place pin (click map)",
      pickHint:
        "Press 📍 and click the map to place the pin. Drag to adjust.",
      backToInfo: "Back to key info",
    },

    de: {
      title: "Schlüsselinfo:",
      length: "Länge",
      ascent: "Anstieg",
      descent: "Abfahrt",
      highest: "Höchster Punkt",
      lowest: "Niedrigster Punkt",
      unit: "m",
      instruction:
        "Tippen Sie auf die Symbole, um zu sehen, was Sie auf der Radtour erleben können",
      surfaceLabel: "Untergrund:",
      asphalt: "Asphalt",
      gravel: "Schotter",
      trail: "Pfad",
      unknown: "Unbekannt",

      posTitle: "Ihre Position relativ zur Route:",
      posNearest: "Nächstgelegener Punkt",
      posStart: "Zum Start",
      posEnd: "Zum Ziel",
      posOnRoute:
        "Sie sind auf oder sehr nahe an der Route.",
      posFar:
        "Sie sind ziemlich weit von der Route entfernt.",

      nearbyTitle: "In der Nähe:",
      nearbyEmpty:
        "Keine registrierten Angebote/Erlebnisse in der Nähe.",

      btnMeTitle: "Meinen Standort zeigen",
      btnPickTitle: "Nadel setzen (Karte klicken)",
      pickHint:
        "Drücken Sie 📍 und klicken Sie in die Karte, um die Nadel zu setzen. Ziehen zum Anpassen.",
      backToInfo: "Zurück zur Schlüsselinfo",
    },
  };

  function getLang() {
    try {
      if (
        typeof Weglot !== "undefined" &&
        Weglot.getCurrentLang
      ) {
        return Weglot.getCurrentLang();
      }
    } catch (_) {}

    return "no";
  }

  function safeNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtKm(v) {
    const n = Number(v);

    if (!Number.isFinite(n)) {
      return "–";
    }

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
      Chart.defaults.font.family =
        getComputedStyle(document.body).fontFamily;
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

    return String(sym)
      .trim()
      .toLowerCase();
  }

  function symbolUrl(sym) {
    const s = normalizeSymbol(sym);

    if (!s) return null;

    if (s === "bathingspot") {
      return "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-bathingspot-blue.svg";
    }

    return (
      "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-" +
      s +
      ".svg"
    );
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

    const statsBox =
      popupContainer.querySelector(".stats-box");

    if (!statsBox) return null;

    let el =
      popupContainer.querySelector(".nearby-box");

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

          <p>
            <span class="icon">↔</span>
            ${t.length}:
            <strong>${s.distanceKm.toFixed(1)}</strong> km
          </p>

          <p>
            <span class="icon">↗</span>
            ${t.ascent}:
            <strong>${s.climbM.toFixed(0)}</strong> m
          </p>

          <p>
            <span class="icon">↘</span>
            ${t.descent}:
            <strong>${s.descentM.toFixed(0)}</strong> m
          </p>

          <p>
            <span class="icon">▲</span>
            ${t.highest}:
            <strong>${s.maxElevationM.toFixed(0)}</strong>
            ${t.unit}
          </p>

          <p>
            <span class="icon">▼</span>
            ${t.lowest}:
            <strong>${s.minElevationM.toFixed(0)}</strong>
            ${t.unit}
          </p>

          <p style="margin-top:16px;font-style:italic;">
            ${t.instruction}
          </p>
        </div>
      </div>
    `;

    ensurePosBox(popupContainer);
    ensureNearbyBox(popupContainer);
  }

  function showPoiCard(
    popupContainer,
    poi,
    resetFn
  ) {
    if (!popupContainer || !poi) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    const texts = poi.texts || {};
    const langBlock =
      texts[lang] ||
      texts.no ||
      {};

    const title =
      langBlock.title ||
      poi.name ||
      poi.title ||
      "";

    const desc =
      langBlock.description ||
      langBlock.desc ||
      poi.description ||
      "";

    const imgUrl =
      poi.imageUrl ||
      poi.image ||
      null;

    popupContainer.innerHTML = `
      <div class="poi-card">
        <div class="poi-card__top">
          <button
            class="popup-close"
            aria-label="Close"
          >&times;</button>
        </div>

        <h3 class="poi-card__title">
          ${title}
        </h3>

        ${
          imgUrl
            ? `<img class="poi-card__img" src="${imgUrl}" alt="">`
            : ""
        }

        <p class="poi-card__desc">
          ${desc}
        </p>

        <button
          class="poi-back"
          type="button"
          style="margin-top:12px;border:none;background:#CA6B2A;color:#EEE9E0;padding:10px 12px;border-radius:10px;cursor:pointer;"
        >
          ${t.backToInfo}
        </button>
      </div>
    `;

    const close =
      popupContainer.querySelector(".popup-close");

    const back =
      popupContainer.querySelector(".poi-back");

    const goBack = () =>
      typeof resetFn === "function"
        ? resetFn()
        : null;

    if (close) {
      close.addEventListener("click", goBack);
    }

    if (back) {
      back.addEventListener("click", goBack);
    }
  }

  // ======================
  // Surface summary
  // ======================
  function renderSurfaceSummary(
    container,
    route,
    computedFromFile,
    unknownAsTrail
  ) {
    if (!container || !route) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    const surface = route.surface || null;

    const categoryKm =
      surface && surface.categoryKm
        ? surface.categoryKm
        : null;

    let asphaltKm =
      computedFromFile?.asphaltKm;

    let gravelKm =
      computedFromFile?.gravelKm;

    let trailKm =
      computedFromFile?.trailKm;

    let unknownKm =
      computedFromFile?.unknownKm;

    let totalKm =
      computedFromFile?.totalKm;

    if (
      !Number.isFinite(Number(asphaltKm)) &&
      categoryKm
    ) {
      asphaltKm = categoryKm.asphalt;
    }

    if (
      !Number.isFinite(Number(gravelKm)) &&
      categoryKm
    ) {
      gravelKm = categoryKm.gravel;
    }

    if (
      !Number.isFinite(Number(trailKm)) &&
      categoryKm
    ) {
      trailKm = categoryKm.trail;
    }

    if (
      !Number.isFinite(Number(unknownKm)) &&
      categoryKm
    ) {
      unknownKm = categoryKm.unknown;
    }

    if (
      !Number.isFinite(Number(totalKm)) &&
      surface
    ) {
      totalKm = surface.totalKm;
    }

    const a0 = safeNum(asphaltKm, 0);
    const g0 = safeNum(gravelKm, 0);
    const tr0 = safeNum(trailKm, 0);
    const u0 = safeNum(unknownKm, 0);

    const tot0 =
      Number.isFinite(Number(totalKm))
        ? Number(totalKm)
        : a0 + g0 + tr0 + u0;

    let a = a0;
    let g = g0;
    let tr = tr0;
    let u = u0;
    let tot = tot0;

    if (unknownAsTrail) {
      tr += u;
      u = 0;
    }

    if (tot <= 0.0001) {
      container.innerHTML = "";
      return;
    }

    const pct = (v) =>
      tot > 0
        ? Math.round((v / tot) * 100)
        : 0;

    const showUnknown =
      !unknownAsTrail &&
      u > 0.01;

    container.innerHTML = `
      <span class="surface-label">
        ${t.surfaceLabel}
      </span>

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

      ${
        showUnknown
          ? `
            <span class="surface-legend-item">
              <span class="surface-swatch unknown"></span>
              ${t.unknown} ${u.toFixed(1)} km (${pct(u)} %)
            </span>
          `
          : ""
      }
    `;
  }

  // ======================
  // POI markers
  // ======================
  function getPoiPos(poi) {
    return (
      poi.latlng ||
      (
        poi.lat && poi.lon
          ? [poi.lat, poi.lon]
          : null
      ) ||
      (
        poi.lat && poi.lng
          ? [poi.lat, poi.lng]
          : null
      )
    );
  }

  function addMarkerFromDb(
    mapOrLayer,
    poi,
    popupContainer,
    resetFn
  ) {
    if (!mapOrLayer || !poi) return null;

    const pos = getPoiPos(poi);

    if (!pos) return null;

    const sym =
      poi.symbolType ||
      poi.symbol ||
      null;

    const iconUrl = symbolUrl(sym);

    const customIcon = L.divIcon({
      className: "custom-icon",

      html: iconUrl
        ? `<img src="${iconUrl}" style="width:30px;height:30px;">`
        : `<div style="width:30px;height:30px;background:#422426;border-radius:50%;"></div>`,

      iconSize: [30, 30],
      iconAnchor: [15, 30],
    });

    const leafletMarker =
      L.marker(pos, {
        icon: customIcon,
      });

    leafletMarker.addTo(mapOrLayer);

    leafletMarker.on(
      "mouseover",
      function () {
        showPoiCard(
          popupContainer,
          poi,
          resetFn
        );
      }
    );

    leafletMarker.on(
      "click",
      function () {
        showPoiCard(
          popupContainer,
          poi,
          resetFn
        );
      }
    );

    return leafletMarker;
  }

  // ======================
  // Surface category normalization
  // ======================
  function normalizeSurfaceCategory(
    raw,
    unknownAsTrail
  ) {
    let cat = (raw || "")
      .toString()
      .toLowerCase()
      .trim();

    if (!cat) {
      cat = "unknown";
    }

    if (
      cat !== "asphalt" &&
      cat !== "gravel" &&
      cat !== "trail" &&
      cat !== "unknown"
    ) {
      cat = "unknown";
    }

    if (
      unknownAsTrail &&
      cat === "unknown"
    ) {
      return "trail";
    }

    return cat;
  }

  // ======================
  // Build route index from elevation points
  // points must have:
  // lat, lon, distance (km), elevation, surfaceCategory
  // ======================
  function buildRouteIndex(
    elevPoints,
    unknownAsTrail
  ) {
    const distances = [];
    const lats = [];
    const lons = [];
