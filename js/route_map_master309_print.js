// route_map_master308_print.js
// Krever: Leaflet + Leaflet-GPX + Chart.js lastet inn før denne.
// Valgfritt: Leaflet.markercluster (clustering brukes automatisk ved mange POI)

(function () {
  "use strict";

  console.log("[route_map] master308 print loaded");

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

  const DEFAULT_PRINT_LOGO_URL =
    "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/svingom-logo-sort.png";

  const DEFAULT_PRINT_SYMBOL_URL =
    "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/svingom-symbol-sort.png";

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
    if (!canvas) return;

    try {
      if (canvas.__chart) {
        canvas.__chart.destroy();
        canvas.__chart = null;
      }

      if (
        typeof Chart !== "undefined" &&
        typeof Chart.getChart === "function"
      ) {
        const existing = Chart.getChart(canvas);

        if (existing) {
          existing.destroy();
        }
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

    const websiteUrl =
      poi.websiteUrl ||
      poi.website ||
      poi.url ||
      null;

    const websiteLabel =
      lang === "de"
        ? "Webseite"
        : lang === "en"
          ? "Website"
          : "Nettside";

    const backLabel =
      t.backToInfo ||
      "Tilbake til nøkkelinformasjon";

    popupContainer.classList.remove("hidden");

    popupContainer.innerHTML = `
      <div class="poi-or-info">
        <div class="poi-card">
          ${
            imgUrl
              ? `
                <img
                  src="${imgUrl}"
                  alt="${title}"
                  loading="lazy"
                >
              `
              : ""
          }

          <h3>${title}</h3>

          ${
            desc
              ? `<p>${desc}</p>`
              : ""
          }

          ${
            websiteUrl
              ? `
                <p>
                  <a
                    href="${websiteUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${websiteLabel}
                  </a>
                </p>
              `
              : ""
          }

          <p style="margin-top:16px;">
            <button
              type="button"
              class="back-to-route-info"
              style="
                border:1px solid #422426;
                background:#EEE9E0;
                color:#422426;
                padding:8px 12px;
                border-radius:4px;
                cursor:pointer;
                font:inherit;
                font-weight:600;
              "
            >
              ← ${backLabel}
            </button>
          </p>
        </div>
      </div>
    `;

    const backBtn =
      popupContainer.querySelector(
        ".back-to-route-info"
      );

    if (backBtn) {
      backBtn.addEventListener(
        "click",
        () => {
          if (
            typeof resetFn ===
            "function"
          ) {
            resetFn();
          }
        }
      );
    }
  }

  // ======================
  // Surface summary
  // ======================
  function renderSurfaceSummary(
    container,
    route,
    calculated,
    unknownAsTrail
  ) {
    if (!container) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    const surface = route.surface || null;

    const source =
      surface && surface.categoryKm
        ? surface.categoryKm
        : calculated || {};

    let asphaltKm =
      safeNum(source.asphalt, NaN);

    let gravelKm =
      safeNum(source.gravel, NaN);

    let trailKm =
      safeNum(source.trail, NaN);

    let unknownKm =
      safeNum(source.unknown, NaN);

    if (!Number.isFinite(asphaltKm)) {
      asphaltKm =
        safeNum(calculated.asphaltKm, 0);
    }

    if (!Number.isFinite(gravelKm)) {
      gravelKm =
        safeNum(calculated.gravelKm, 0);
    }

    if (!Number.isFinite(trailKm)) {
      trailKm =
        safeNum(calculated.trailKm, 0);
    }

    if (!Number.isFinite(unknownKm)) {
      unknownKm =
        safeNum(calculated.unknownKm, 0);
    }

    if (unknownAsTrail) {
      trailKm += unknownKm;
      unknownKm = 0;
    }

    let totalKm =
      asphaltKm +
      gravelKm +
      trailKm +
      unknownKm;

    if (
      surface &&
      Number.isFinite(
        Number(surface.totalKm)
      )
    ) {
      totalKm = Number(surface.totalKm);
    }

    if (
      !Number.isFinite(totalKm) ||
      totalKm <= 0
    ) {
      totalKm =
        safeNum(calculated.totalKm, 0);
    }

    const pct = (km) =>
      totalKm > 0
        ? Math.round(
            (km / totalKm) * 100
          )
        : 0;

    const asphaltPct = pct(asphaltKm);
    const gravelPct = pct(gravelKm);
    const trailPct = pct(trailKm);
    const unknownPct = pct(unknownKm);

    container.innerHTML = `
      <span class="surface-label">
        ${t.surfaceLabel}
      </span>

      <span class="surface-legend-item">
        <span class="surface-swatch asphalt"></span>
        ${t.asphalt}
        ${asphaltKm.toFixed(1)} km
        (${asphaltPct} %)
      </span>

      <span class="surface-legend-item">
        <span class="surface-swatch gravel"></span>
        ${t.gravel}
        ${gravelKm.toFixed(1)} km
        (${gravelPct} %)
      </span>

      <span class="surface-legend-item">
        <span class="surface-swatch trail"></span>
        ${t.trail}
        ${trailKm.toFixed(1)} km
        (${trailPct} %)
      </span>

      ${
        !unknownAsTrail &&
        unknownKm > 0.001
          ? `
            <span class="surface-legend-item">
              <span class="surface-swatch unknown"></span>
              ${t.unknown}
              ${unknownKm.toFixed(1)} km
              (${unknownPct} %)
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
  // ======================
  function buildRouteIndex(
    elevPoints,
    unknownAsTrail
  ) {
    const distances = [];
    const lats = [];
    const lons = [];
    const elevations = [];
    const cats = [];

    for (let i = 0; i < elevPoints.length; i++) {
      const p = elevPoints[i] || {};

      const d = safeNum(
        p.distance,
        i > 0 ? distances[i - 1] : 0
      );

      const e = safeNum(
        p.elevation,
        i > 0 ? elevations[i - 1] : 0
      );

      distances.push(d);
      elevations.push(e);
      lats.push(Number(p.lat));
      lons.push(Number(p.lon));

      const raw =
        p.surfaceCategory ??
        p.surface ??
        p.category ??
        "unknown";

      cats.push(
        normalizeSurfaceCategory(
          raw,
          unknownAsTrail
        )
      );
    }

    const totalKm =
      distances.length
        ? distances[distances.length - 1]
        : 0;

    return {
      distances,
      lats,
      lons,
      elevations,
      cats,
      totalKm,
    };
  }

  function haversineKm(
    lat1,
    lon1,
    lat2,
    lon2
  ) {
    const R = 6371;

    const toRad = (x) =>
      (x * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return R * c;
  }

  function nearestOnRouteKm(
    routeIndex,
    lat,
    lon
  ) {
    if (
      !routeIndex ||
      !routeIndex.lats ||
      !routeIndex.lats.length
    ) {
      return null;
    }

    let bestIdx = -1;
    let bestDist = Infinity;

    for (
      let i = 0;
      i < routeIndex.lats.length;
      i++
    ) {
      const la = routeIndex.lats[i];
      const lo = routeIndex.lons[i];

      if (
        !Number.isFinite(la) ||
        !Number.isFinite(lo)
      ) {
        continue;
      }

      const d = haversineKm(
        lat,
        lon,
        la,
        lo
      );

      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return null;

    const fromStartKm =
      routeIndex.distances[bestIdx];

    const toEndKm = Math.max(
      0,
      routeIndex.totalKm - fromStartKm
    );

    return {
      nearestKm: bestDist,
      fromStartKm,
      toEndKm,
      idx: bestIdx,
    };
  }

  function renderPositionResult(
    popupContainer,
    routeIndex,
    lat,
    lon
  ) {
    if (!popupContainer) return;

    const statsBox =
      popupContainer.querySelector(
        ".stats-box"
      );

    if (!statsBox) return;

    const posBox =
      ensurePosBox(popupContainer);

    if (!posBox) return;

    const lang = getLang();
    const t =
      infoTexts[lang] ||
      infoTexts.no;

    const res = nearestOnRouteKm(
      routeIndex,
      lat,
      lon
    );

    if (!res) {
      posBox.innerHTML = "";
      return;
    }

    const near = res.nearestKm;
    const onRoute =
      near <= POS_NEAR_KM;
    const far =
      near >= POS_FAR_KM;

    const hint = onRoute
      ? t.posOnRoute
      : far
        ? t.posFar
        : "";

    posBox.innerHTML = `
      <div class="pos-box__inner">
        <p
          class="pos-title"
          style="font-weight:700;margin:10px 0 8px;"
        >
          ${t.posTitle}
        </p>

        ${
          hint
            ? `
              <p
                class="pos-hint"
                style="margin:0 0 8px;font-style:italic;"
              >
                ${hint}
              </p>
            `
            : ""
        }

        <p style="margin:0 0 6px;">
          ${t.posNearest}:
          <strong>${fmtKm(near)} km</strong>
        </p>

        <p style="margin:0 0 6px;">
          ${t.posStart}:
          <strong>${fmtKm(res.fromStartKm)} km</strong>
        </p>

        <p style="margin:0;">
          ${t.posEnd}:
          <strong>${fmtKm(res.toEndKm)} km</strong>
        </p>
      </div>
    `;
  }

  function renderNearbyPois(
    popupContainer,
    poisForRoute,
    lat,
    lon
  ) {
    if (
      !popupContainer ||
      !Array.isArray(poisForRoute)
    ) {
      return;
    }

    const lang = getLang();
    const t =
      infoTexts[lang] ||
      infoTexts.no;

    const box =
      ensureNearbyBox(
        popupContainer
      );

    if (!box) return;

    const center = L.latLng(
      lat,
      lon
    );

    const items =
      poisForRoute
        .map((poi) => {
          const pos =
            getPoiPos(poi);

          if (!pos) return null;

          const ll = L.latLng(
            pos[0],
            pos[1]
          );

          const dKm =
            center.distanceTo(ll) /
            1000;

          return {
            poi,
            dKm,
          };
        })
        .filter(
          (x) =>
            x &&
            x.dKm <=
              NEARBY_RADIUS_M /
                1000
        )
        .sort(
          (a, b) =>
            a.dKm - b.dKm
        )
        .slice(
          0,
          NEARBY_LIMIT
        );

    box.innerHTML = `
      <p
        style="
          font-weight:700;
          margin:10px 0 8px;
        "
      >
        ${t.nearbyTitle}
      </p>
    `;

    if (!items.length) {
      const empty =
        document.createElement(
          "p"
        );

      empty.style.margin = "0";
      empty.textContent =
        t.nearbyEmpty;

      box.appendChild(empty);
      return;
    }

    const list =
      document.createElement(
        "div"
      );

    list.className =
      "nearby-list";

    box.appendChild(list);

    items.forEach(
      ({ poi, dKm }) => {
        const texts =
          poi.texts || {};

        const langBlock =
          texts[lang] ||
          texts.no ||
          {};

        const title =
          langBlock.title ||
          poi.name ||
          poi.title ||
          "";

        const btn =
          document.createElement(
            "button"
          );

        btn.type = "button";
        btn.className =
          "nearby-poi-button";

        btn.style.display =
          "block";
        btn.style.width = "100%";
        btn.style.textAlign =
          "left";
        btn.style.border = "0";
        btn.style.background =
          "transparent";
        btn.style.padding =
          "5px 0";
        btn.style.cursor =
          "pointer";
        btn.style.font =
          "inherit";
        btn.style.color =
          "inherit";

        btn.innerHTML = `
          ${title}
          <strong>
            (${dKm.toFixed(1)} km)
          </strong>
        `;

        btn.addEventListener(
          "click",
          () =>
            showPoiCard(
              popupContainer,
              poi,
              () => {}
            )
        );

        list.appendChild(btn);
      }
    );
  }

  // ======================
  // Chart builder
  // Returns routeIndex
  // ======================
  function buildChart(
    canvas,
    elevPoints,
    movingMarker,
    surfaceSummaryEl,
    route,
    unknownAsTrail
  ) {
    if (
      !canvas ||
      !Array.isArray(elevPoints) ||
      elevPoints.length === 0
    ) {
      return null;
    }

    if (
      typeof Chart === "undefined"
    ) {
      return null;
    }

    initChartDefaultsOnce();
    destroyExistingChart(canvas);

    const idx = buildRouteIndex(
      elevPoints,
      unknownAsTrail
    );

    const distances = idx.distances;
    const elevations = idx.elevations;
    const cats = idx.cats;

    const slopes = [0];

    for (
      let i = 1;
      i < elevations.length;
      i++
    ) {
      const delta =
        elevations[i] -
        elevations[i - 1];

      const distKm =
        distances[i] -
        distances[i - 1];

      const slope =
        distKm > 0
          ? (
              delta /
              (distKm * 1000)
            ) * 100
          : 0;

      slopes.push(slope);
    }

    const asphaltPts = [];
    const gravelPts = [];
    const trailPts = [];
    const unknownPts = [];
    const linePts = [];

    let asphaltKm = 0;
    let gravelKm = 0;
    let trailKm = 0;
    let unknownKm = 0;

    const pointsByCategory = {
      asphalt: asphaltPts,
      gravel: gravelPts,
      trail: trailPts,
      unknown: unknownPts,
    };

    for (
      let i = 0;
      i < elevations.length;
      i++
    ) {
      const x = distances[i];
      const y = elevations[i];

      linePts.push({ x, y });

      asphaltPts.push({ x, y: null });
      gravelPts.push({ x, y: null });
      trailPts.push({ x, y: null });
      unknownPts.push({ x, y: null });
    }

    for (
      let i = 1;
      i < elevations.length;
      i++
    ) {
      const cat =
        pointsByCategory[cats[i]]
          ? cats[i]
          : "unknown";

      const targetPoints =
        pointsByCategory[cat];

      targetPoints[i - 1].y =
        elevations[i - 1];

      targetPoints[i].y =
        elevations[i];

      const segKm =
        distances[i] -
        distances[i - 1];

      if (cat === "asphalt") {
        asphaltKm += segKm;
      } else if (cat === "gravel") {
        gravelKm += segKm;
      } else if (cat === "trail") {
        trailKm += segKm;
      } else {
        unknownKm += segKm;
      }
    }
        renderSurfaceSummary(
      surfaceSummaryEl,
      route,
      {
        asphaltKm,
        gravelKm,
        trailKm,
        unknownKm,
        totalKm: idx.totalKm,
      },
      unknownAsTrail
    );

    const highest =
      Math.max.apply(
        null,
        elevations
      );

    const ctx =
      canvas.getContext("2d");

    const datasets = [
      {
        data: asphaltPts,
        backgroundColor: "#37394E",
        borderColor: "#37394E",
        fill: true,
        pointRadius: 0,
        tension: 0.4,
        spanGaps: false,
      },
      {
        data: gravelPts,
        backgroundColor: "#A3886C",
        borderColor: "#A3886C",
        fill: true,
        pointRadius: 0,
        tension: 0.4,
        spanGaps: false,
      },
      {
        data: trailPts,
        backgroundColor: "#5C7936",
        borderColor: "#5C7936",
        fill: true,
        pointRadius: 0,
        tension: 0.4,
        spanGaps: false,
      },
    ];

    if (!unknownAsTrail) {
      datasets.push({
        data: unknownPts,
        backgroundColor: "#9AA0A6",
        borderColor: "#9AA0A6",
        fill: true,
        pointRadius: 0,
        tension: 0.4,
        spanGaps: false,
      });
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

    const lineDatasetIndex =
      datasets.length - 1;

    const chart = new Chart(
      ctx,
      {
        type: "line",

        data: {
          datasets,
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: true,

          interaction: {
            intersect: false,
            mode: "index",
          },

          plugins: {
            legend: {
              display: false,
            },

            tooltip: {
              backgroundColor:
                "#37394E",

              displayColors: false,

              filter: (item) =>
                item.datasetIndex ===
                lineDatasetIndex,

              callbacks: {
                title: (items) => {
                  const x =
                    items?.[0]
                      ?.parsed?.x ?? 0;

                  return (
                    `${Number(x).toFixed(1)}` +
                    " km"
                  );
                },

                label: (c) => {
                  const i =
                    c.dataIndex;

                  const elev =
                    elevations[i];

                  const slope =
                    slopes[i] || 0;

                  return (
                    `${elev.toFixed(0)} moh / ` +
                    `${slope.toFixed(1)}%`
                  );
                },
              },
            },
          },

          scales: {
            x: {
              type: "linear",
              min: 0,
              max: idx.totalKm,

              ticks: {
                color: "#37394E",

                callback: (v) =>
                  `${Number(v).toFixed(0)} km`,
              },

              grid: {
                display: false,
              },
            },

            y: {
              min: 0,

              max:
                Math.ceil(
                  highest / 50
                ) * 50,

              ticks: {
                stepSize: 50,
                color: "#37394E",
              },

              grid: {
                display: false,
              },
            },
          },
        },
      }
    );

    canvas.__chart = chart;

    function moveMarkerToIndex(i) {
      if (!movingMarker) return;

      const lat = idx.lats[i];
      const lon = idx.lons[i];

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        movingMarker.setLatLng([
          lat,
          lon,
        ]);
      }
    }

    for (
      let i = 0;
      i < idx.lats.length;
      i++
    ) {
      const lat = idx.lats[i];
      const lon = idx.lons[i];

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        moveMarkerToIndex(i);
        break;
      }
    }

    canvas.addEventListener(
      "mousemove",
      function (evt) {
        const points =
          chart.getElementsAtEventForMode(
            evt,
            "index",
            {
              intersect: false,
            },
            true
          );

        if (points.length) {
          moveMarkerToIndex(
            points[0].index
          );
        }
      }
    );

    canvas.addEventListener(
      "touchmove",
      function (e) {
        if (
          !e.touches ||
          !e.touches.length
        ) {
          return;
        }

        const touch = e.touches[0];

        const simulatedEvent =
          new MouseEvent(
            "mousemove",
            {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX:
                touch.clientX,
              clientY:
                touch.clientY,
            }
          );

        canvas.dispatchEvent(
          simulatedEvent
        );
      },
      {
        passive: true,
      }
    );

    return idx;
  }

  // ======================
  // MarkerCluster
  // ======================
  function hasMarkerCluster() {
    return (
      typeof L !== "undefined" &&
      typeof L.markerClusterGroup ===
        "function"
    );
  }

  function createClusterLayer(map) {
    if (
      !map ||
      !hasMarkerCluster()
    ) {
      return null;
    }

    try {
      const layer =
        L.markerClusterGroup();

      map.addLayer(layer);
      return layer;
    } catch (_) {
      return null;
    }
  }

  function enableLazyPoiRendering(
    map,
    poisForRoute,
    popupContainer,
    resetPopup
  ) {
    const added = new Set();

    function shouldShowPoi(poi) {
      const pos = getPoiPos(poi);

      if (!pos) return false;

      const bounds =
        map.getBounds();

      if (
        !bounds ||
        !bounds.contains(
          L.latLng(
            pos[0],
            pos[1]
          )
        )
      ) {
        return false;
      }

      const zoom = map.getZoom();

      if (
        zoom >= ANCHOR_ZOOM
      ) {
        return true;
      }

      const t = normalizeSymbol(
        poi.symbolType ||
        poi.symbol ||
        ""
      );

      return ANCHOR_TYPES.has(t);
    }

    function key(poi) {
      return poi && poi.id
        ? String(poi.id)
        : JSON.stringify(
            getPoiPos(poi) || []
          );
    }

    function render() {
      for (
        const poi of poisForRoute
      ) {
        if (!shouldShowPoi(poi)) {
          continue;
        }

        const k = key(poi);

        if (added.has(k)) {
          continue;
        }

        added.add(k);

        addMarkerFromDb(
          map,
          poi,
          popupContainer,
          resetPopup
        );
      }
    }

    map.on(
      "moveend zoomend",
      render
    );

    render();
  }

  // ======================
  // Fullscreen control
  // ======================
  function enterFullscreen(el) {
    if (!el) return;

    const fn =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen;

    if (fn) {
      fn.call(el);
    }
  }

  function exitFullscreen() {
    const fn =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;

    if (fn) {
      fn.call(document);
    }
  }

  function isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  }

  function addFullscreenControl(
    map,
    sectionEl
  ) {
    if (!map || !sectionEl) return;

    const ctrl = L.control({
      position: "topleft",
    });

    ctrl.onAdd = function () {
      const wrap =
        L.DomUtil.create(
          "div",
          "leaflet-bar svingom-fs-wrap"
        );

      const btn =
        L.DomUtil.create(
          "button",
          "svingom-fs-btn",
          wrap
        );

      btn.type = "button";
      btn.title = "Fullskjerm";
      btn.innerHTML = "⤢";

      L.DomEvent.disableClickPropagation(
        wrap
      );

      L.DomEvent.on(
        btn,
        "click",
        (e) => {
          L.DomEvent.stop(e);

          if (isFullscreen()) {
            exitFullscreen();
          } else {
            enterFullscreen(sectionEl);

            setTimeout(
              () => map.invalidateSize(),
              250
            );
          }
        }
      );

      return wrap;
    };

    ctrl.addTo(map);
  }

  // ======================
  // A4 print preview
  // ======================
  function localizedPoiTitle(poi) {
    const lang = getLang();
    const texts = (poi && poi.texts) || {};
    const block = texts[lang] || texts.no || {};

    return (
      block.title ||
      poi.name ||
      poi.title ||
      ""
    );
  }

  function localizedRouteTitle(route) {
    const lang = getLang();
    const texts = (route && route.texts) || {};
    const block = texts[lang] || texts.no || {};
    const title = route && route.title;

    return (
      block.title ||
      (
        title &&
        typeof title === "object"
          ? title[lang] || title.no
          : title
      ) ||
      (document.querySelector("h1") || {}).textContent ||
      document.title ||
      "Sykkeltur"
    );
  }

  function ensurePrintStyles() {
    if (
      document.getElementById(
        "svingom-print-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "svingom-print-styles";

    style.textContent = `
      .svingom-print-preview{position:fixed;inset:0;z-index:999999;background:#d9dde2;overflow:auto;padding:26px;font-family:inherit;color:#422426}
      .svingom-print-toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:center;gap:10px;padding:0 0 16px}
      .svingom-print-toolbar button{border:0;border-radius:4px;padding:11px 18px;font:700 15px inherit;cursor:pointer;background:#422426;color:#fff}
      .svingom-print-toolbar .close{background:#fff;color:#422426;border:1px solid #422426}
      .svingom-print-sheet{width:210mm;height:297mm;min-height:297mm;margin:0 auto;background:#fff;box-sizing:border-box;padding:8mm;box-shadow:0 8px 30px rgba(0,0,0,.22);display:grid;grid-template-rows:auto 150mm 82mm 27mm;gap:3mm;overflow:hidden}
      .svingom-print-sheet+.svingom-print-sheet{margin-top:12mm}
      .svingom-print-title{font-size:23px;line-height:1.15;margin:0;color:#422426}
      .svingom-print-map{width:100%;height:100%;background:#eee}
      .svingom-print-chart-block{display:grid;grid-template-rows:1fr auto;min-height:0}
      .svingom-print-chart-wrap{position:relative;width:100%;height:100%;min-height:0}
      .svingom-print-chart-wrap canvas{width:100%!important;height:100%!important}
      .svingom-print-surface{display:flex;gap:5mm;align-items:center;font-size:9px;padding-top:1mm;color:#422426}
      .svingom-print-surface-item{display:inline-flex;gap:1.2mm;align-items:center}
      .svingom-print-surface-swatch{width:3mm;height:3mm;border-radius:.7mm;display:inline-block}
      .svingom-print-footer{display:grid;grid-template-columns:18mm minmax(0,1fr) 35mm 38mm;gap:5mm;align-items:center;border-top:1px solid #d7cec3;padding-top:2mm;min-height:0}
      .svingom-print-stats{display:flex;flex-wrap:wrap;gap:2mm 6mm;font-size:9px;line-height:1.2}
      .svingom-print-stats strong{font-size:11px}
      .svingom-print-qr{display:flex;align-items:center;gap:2mm}
      .svingom-print-qr-box{position:relative;width:18mm;height:18mm;display:flex;align-items:center;justify-content:center;background:#fff}
      .svingom-print-qr-box>img:not(.svingom-print-qr-logo),.svingom-print-qr-box>canvas{width:18mm!important;height:18mm!important}
      .svingom-print-qr-logo{position:absolute;z-index:3;width:6mm!important;height:6mm!important;object-fit:contain;background:#fff;padding:.6mm;box-sizing:border-box}
      .svingom-print-logo-space{width:38mm;text-align:right;justify-self:end;align-self:end}
      .svingom-print-logo-space img{display:block;width:38mm;max-height:18mm;object-fit:contain;object-position:right bottom}
      .svingom-print-route-note{font-size:8px;line-height:1.25;color:#645356;max-width:35mm;align-self:start;padding-top:1mm}
      .svingom-detail-sheet{display:grid;grid-template-rows:auto 1fr auto;gap:3mm}
      .svingom-detail-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:5mm}
      .svingom-detail-heading h2{font-size:21px;line-height:1.15;margin:0;color:#422426}
      .svingom-detail-heading p{font-size:9px;line-height:1.3;margin:0;text-align:right;max-width:78mm}
      .svingom-detail-maps{display:grid;gap:3mm;min-height:0}
      .svingom-detail-panel{display:grid;grid-template-rows:auto 1fr;gap:1.5mm;min-height:0;overflow:hidden}
      .svingom-detail-caption{display:flex;justify-content:space-between;gap:4mm;font-size:10px;line-height:1.1;font-weight:700}
      .svingom-detail-map{width:100%;height:100%;min-height:0;background:#eee;border:1px solid #d7cec3;box-sizing:border-box}
      .svingom-detail-footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #d7cec3;padding-top:2mm;font-size:8px}
      .svingom-detail-footer img{width:30mm;max-height:12mm;object-fit:contain;object-position:right center}
      .svingom-km-marker{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:2px solid #fff;border-radius:50%;background:#422426;color:#fff;font:700 9px/1 sans-serif;box-shadow:0 1px 2px rgba(0,0,0,.35)}
      .svingom-start-end{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border:2px solid #fff;border-radius:50%;background:#CA6B2A;color:#fff;font:800 10px/1 sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4)}
      .svingom-direction-arrow{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #CA2F36;filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff);transform-origin:50% 50%}
      .svingom-print-control{display:flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:0;background:#fff;color:#422426;cursor:pointer}
      .svingom-print-control svg{width:25px;height:25px;display:block}
      @media(max-width:850px){.svingom-print-preview{padding:8px}.svingom-print-sheet{transform-origin:top left;transform:scale(.46);margin:0;width:210mm}.svingom-print-sheet+.svingom-print-sheet{margin-top:calc(-153mm + 12px)}.svingom-print-toolbar{justify-content:flex-start}}
      @media print{
        @page{size:A4 portrait;margin:0}
        body>*:not(.svingom-print-preview){display:none!important}
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        .svingom-print-preview{position:static!important;display:block!important;padding:0!important;background:#fff!important;overflow:visible!important}
        .svingom-print-toolbar{display:none!important}
        .svingom-print-sheet{width:210mm!important;height:297mm!important;min-height:297mm!important;margin:0!important;padding:8mm!important;box-sizing:border-box!important;box-shadow:none!important;transform:none!important;zoom:1!important;overflow:hidden!important;break-after:page;page-break-after:always}
        .svingom-print-sheet:last-child{break-after:auto;page-break-after:auto}
      }
    `;

    document.head.appendChild(style);
  }

  function loadQrLibrary() {
    if (window.QRCode) {
      return Promise.resolve();
    }

    if (window.__svingomQrPromise) {
      return window.__svingomQrPromise;
    }

    window.__svingomQrPromise =
      new Promise(
        (resolve, reject) => {
          const script =
            document.createElement(
              "script"
            );

          script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

          script.onload = resolve;
          script.onerror = reject;

          document.head.appendChild(
            script
          );
        }
      );

    return window.__svingomQrPromise;
  }

  function routePageUrl(route) {
    const raw =
      (
        route &&
        (
          route.articleUrl ||
          route.pageUrl ||
          route.url
        )
      ) ||
      window.location.href;

    try {
      return new URL(
        raw,
        window.location.href
      ).href;
    } catch (_) {
      return window.location.href;
    }
  }

  function detailMapCount(totalKm) {
    if (totalKm < 25) return 1;
    if (totalKm < 50) return 2;
    if (totalKm < 75) return 3;
    return 4;
  }

  function nearestRouteIndexForKm(routeIndex, km) {
    const values = routeIndex.distances || [];
    let lo = 0;
    let hi = values.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (values[mid] < km) lo = mid + 1;
      else hi = mid;
    }

    if (
      lo > 0 &&
      Math.abs(values[lo - 1] - km) <
        Math.abs(values[lo] - km)
    ) {
      return lo - 1;
    }

    return lo;
  }

  function routePointAtKm(routeIndex, km) {
    const i = nearestRouteIndexForKm(routeIndex, km);
    const lat = Number(routeIndex.lats[i]);
    const lon = Number(routeIndex.lons[i]);

    return Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon, i }
      : null;
  }

  function bearingDegrees(a, b) {
    if (!a || !b) return 0;
    const toRad = (v) => (v * Math.PI) / 180;
    const toDeg = (v) => (v * 180) / Math.PI;
    const p1 = toRad(a.lat);
    const p2 = toRad(b.lat);
    const dl = toRad(b.lon - a.lon);
    const y = Math.sin(dl) * Math.cos(p2);
    const x =
      Math.cos(p1) * Math.sin(p2) -
      Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function detailSegments(totalKm, count) {
    const base = totalKm / count;
    const overlap = Math.min(2, Math.max(0.6, base * 0.08));

    return Array.from({ length: count }, (_, i) => ({
      from: Math.max(0, i * base - (i ? overlap : 0)),
      to: Math.min(
        totalKm,
        (i + 1) * base + (i < count - 1 ? overlap : 0)
      ),
      coreFrom: i * base,
      coreTo: Math.min(totalKm, (i + 1) * base),
    }));
  }

  function createPrintDivIcon(className, html, size, anchor) {
    return L.divIcon({
      className: "",
      html: `<div class="${className}">${html}</div>`,
      iconSize: size,
      iconAnchor: anchor,
    });
  }

  function addDirectionArrow(map, routeIndex, km) {
    const a = routePointAtKm(routeIndex, km);
    const b = routePointAtKm(
      routeIndex,
      Math.min(routeIndex.totalKm, km + 0.18)
    );
    if (!a || !b) return;
    const angle = bearingDegrees(a, b);
    const icon = createPrintDivIcon(
      "svingom-direction-arrow",
      "",
      [14, 16],
      [7, 8]
    );
    const marker = L.marker([a.lat, a.lon], {
      icon,
      interactive: false,
      keyboard: false,
    }).addTo(map);
    const el = marker.getElement();
    const arrow = el && el.querySelector(".svingom-direction-arrow");
    if (arrow) arrow.style.transform = `rotate(${angle}deg)`;
  }

  function createDetailPrintMaps(
    preview,
    routeIndex,
    printablePois,
    logoUrl
  ) {
    const count = detailMapCount(routeIndex.totalKm || 0);
    if (!count) return [];

    const sheet = document.createElement("main");
    sheet.className = "svingom-print-sheet svingom-detail-sheet";
    sheet.innerHTML = `
      <header class="svingom-detail-heading">
        <h2>Detaljkart</h2>
        <p>Utsnittene overlapper. Følg kilometermerkene og pilene i sykkelretningen.</p>
      </header>
      <div class="svingom-detail-maps"></div>
      <footer class="svingom-detail-footer">
        <span>Skann QR-koden på side 1 for interaktivt kart og din posisjon.</span>
        <img alt="SvingOm" src="${logoUrl}">
      </footer>`;
    preview.appendChild(sheet);

    const mapsEl = sheet.querySelector(".svingom-detail-maps");
    mapsEl.style.gridTemplateRows = `repeat(${count}, minmax(0, 1fr))`;
    const maps = [];

    detailSegments(routeIndex.totalKm, count).forEach((segment, n) => {
      const panel = document.createElement("section");
      panel.className = "svingom-detail-panel";
      panel.innerHTML = `
        <div class="svingom-detail-caption">
          <span>Del ${n + 1} av ${count}</span>
          <span>km ${segment.coreFrom.toFixed(0)}–${segment.coreTo.toFixed(0)}</span>
        </div>
        <div class="svingom-detail-map"></div>`;
      mapsEl.appendChild(panel);

      const map = L.map(panel.querySelector(".svingom-detail-map"), {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
      });
      maps.push(map);

      L.tileLayer(
        "https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png",
        {
          attribution: "© Kartverket",
          maxZoom: 18,
          crossOrigin: true,
        }
      ).addTo(map);

      const startI = nearestRouteIndexForKm(routeIndex, segment.from);
      const endI = nearestRouteIndexForKm(routeIndex, segment.to);
      const latlngs = [];
      for (let i = startI; i <= endI; i++) {
        const lat = Number(routeIndex.lats[i]);
        const lon = Number(routeIndex.lons[i]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          latlngs.push([lat, lon]);
        }
      }

      const casing = L.polyline(latlngs, {
        color: "#ffffff",
        weight: 9,
        opacity: 0.95,
        lineJoin: "round",
      }).addTo(map);
      L.polyline(latlngs, {
        color: "#CA2F36",
        weight: 5,
        opacity: 1,
        lineJoin: "round",
      }).addTo(map);
      map.fitBounds(casing.getBounds(), { padding: [14, 14] });

      L.control.scale({
        position: "bottomleft",
        metric: true,
        imperial: false,
        maxWidth: 100,
      }).addTo(map);

      const firstKm = Math.ceil(segment.from / 5) * 5;
      for (let km = firstKm; km <= segment.to; km += 5) {
        const p = routePointAtKm(routeIndex, km);
        if (!p) continue;
        L.marker([p.lat, p.lon], {
          icon: createPrintDivIcon(
            "svingom-km-marker",
            String(Math.round(km)),
            [28, 28],
            [14, 14]
          ),
          interactive: false,
        }).addTo(map);
      }

      const arrowStep = Math.max(2.5, (segment.to - segment.from) / 5);
      for (
        let km = segment.from + arrowStep / 2;
        km < segment.to;
        km += arrowStep
      ) {
        addDirectionArrow(map, routeIndex, km);
      }

      if (n === 0) {
        const p = routePointAtKm(routeIndex, 0);
        if (p) L.marker([p.lat, p.lon], {
          icon: createPrintDivIcon("svingom-start-end", "S", [31, 31], [15, 15]),
          interactive: false,
        }).addTo(map);
      }
      if (n === count - 1) {
        const p = routePointAtKm(routeIndex, routeIndex.totalKm);
        if (p) L.marker([p.lat, p.lon], {
          icon: createPrintDivIcon("svingom-start-end", "M", [31, 31], [15, 15]),
          interactive: false,
        }).addTo(map);
      }

      setTimeout(() => map.invalidateSize(), 100);
    });

    return maps;
  }

  function openPrintPreview(
    route,
    routeIndex,
    printPoisForRoute,
    printLogoUrl,
    printSymbolUrl
  ) {
    if (
      !routeIndex ||
      !routeIndex.distances ||
      !routeIndex.distances.length
    ) {
      alert(
        "Høydeprofilen er ikke ferdig lastet. Prøv igjen om et øyeblikk."
      );

      return;
    }

    document
      .querySelectorAll(
        ".svingom-print-preview"
      )
      .forEach(
        (el) => el.remove()
      );

    ensurePrintStyles();

    const lang = getLang();
    const t =
      infoTexts[lang] ||
      infoTexts.no;

    const stats =
      getRouteStats(route);

    const pageUrl =
      routePageUrl(route);

    const fullLogoUrl =
      printLogoUrl || DEFAULT_PRINT_LOGO_URL;

    const qrSymbolUrl =
      printSymbolUrl || DEFAULT_PRINT_SYMBOL_URL;

    const preview =
      document.createElement(
        "div"
      );

    preview.className =
      "svingom-print-preview";

    preview.innerHTML = `
      <div class="svingom-print-toolbar">
        <button type="button" class="print">
          Skriv ut / lagre som PDF
        </button>

        <button type="button" class="close">
          Lukk
        </button>
      </div>

      <main class="svingom-print-sheet">
        <h1 class="svingom-print-title"></h1>

        <div class="svingom-print-map"></div>

        <div class="svingom-print-chart-block">
          <div class="svingom-print-chart-wrap">
            <canvas></canvas>
          </div>
          <div class="svingom-print-surface"></div>
        </div>

        <footer class="svingom-print-footer">
          <div class="svingom-print-qr">
            <div class="svingom-print-qr-box"></div>
          </div>

          <div class="svingom-print-stats">
            <span>
              ${t.length}<br>
              <strong>
                ${stats.distanceKm.toFixed(1)} km
              </strong>
            </span>

            <span>
              ${t.ascent}<br>
              <strong>
                ${stats.climbM.toFixed(0)} m
              </strong>
            </span>

            <span>
              ${t.descent}<br>
              <strong>
                ${stats.descentM.toFixed(0)} m
              </strong>
            </span>

            <span>
              ${t.highest}<br>
              <strong>
                ${stats.maxElevationM.toFixed(0)}
                ${t.unit}
              </strong>
            </span>

            <span>
              ${t.lowest}<br>
              <strong>
                ${stats.minElevationM.toFixed(0)}
                ${t.unit}
              </strong>
            </span>
          </div>

          <div class="svingom-print-route-note">
            Skann QR-koden for interaktivt kart og din posisjon.
          </div>

          <div class="svingom-print-logo-space">
            <img alt="SvingOm" src="${fullLogoUrl}">
          </div>
        </footer>
      </main>
    `;

    document.body.appendChild(
      preview
    );

    preview.querySelector(
      "h1"
    ).textContent =
      localizedRouteTitle(
        route
      ).trim();

    const printablePois =
      (printPoisForRoute || [])
        .map((poi) => {
          const pos =
            getPoiPos(poi);

          if (!pos) return null;

          const match =
            nearestOnRouteKm(
              routeIndex,
              Number(pos[0]),
              Number(pos[1])
            );

          if (!match) {
            return null;
          }

          return {
            poi,
            pos,
            match,
            title:
              localizedPoiTitle(
                poi
              ),
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.match.fromStartKm -
            b.match.fromStartKm
        );

    const detailMaps =
      createDetailPrintMaps(
        preview,
        routeIndex,
        printablePois,
        fullLogoUrl
      );

    const printMap = L.map(
      preview.querySelector(
        ".svingom-print-map"
      ),
      {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
      }
    );

    L.tileLayer(
      "https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png",
      {
        attribution: "© Kartverket",
        maxZoom: 18,
        crossOrigin: true,
      }
    ).addTo(printMap);

    const routeLatLngs =
      routeIndex.lats
        .map(
          (lat, i) => [
            lat,
            routeIndex.lons[i],
          ]
        )
        .filter(
          (p) =>
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1])
        );

    const routeCasing =
      L.polyline(
        routeLatLngs,
        {
          color: "#ffffff",
          weight: 9,
          opacity: 0.95,
          lineJoin: "round",
        }
      ).addTo(printMap);

    const routeLine =
      L.polyline(
        routeLatLngs,
        {
          color: "#CA2F36",
          weight: 5,
          opacity: 1,
          lineJoin: "round",
        }
      ).addTo(printMap);

    printMap.fitBounds(
      routeCasing.getBounds(),
      {
        padding: [3, 3],
      }
    );

    L.control.scale({
      position: "bottomleft",
      metric: true,
      imperial: false,
      maxWidth: 120,
    }).addTo(printMap);

    setTimeout(
      () =>
        printMap.invalidateSize(),
      80
    );

    const chartPois =
      printablePois.map(
        (x) => ({
          x:
            x.match.fromStartKm,

          y:
            routeIndex
              .elevations[
                x.match.idx
              ],

          title: x.title,

          iconUrl:
            symbolUrl(
              x.poi.symbolType ||
              x.poi.symbol
            ),
        })
      );

    const poiPlugin = {
      id: "svingomPrintPois",

      afterDatasetsDraw(chart) {
        const ctx =
          chart.ctx;

        const xScale =
          chart.scales.x;

        const yScale =
          chart.scales.y;

        ctx.save();
        ctx.font =
          "8px sans-serif";
        ctx.fillStyle =
          "#422426";
        ctx.strokeStyle =
          "#b8ada2";
        ctx.lineWidth = 0.7;

        const occupiedUntil = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity];

        chartPois.forEach(
          (p) => {
            const x =
              xScale.getPixelForValue(
                p.x
              );

            const y =
              yScale.getPixelForValue(
                p.y
              );

            let labelX =
              Math.max(
                chart.chartArea.left + 2,
                Math.min(
                  x - 8,
                  chart.chartArea.right - 92
                )
              );

            const estimatedWidth = Math.min(
              92,
              Math.max(34, ctx.measureText(p.title || "").width + 8)
            );

            let lane = occupiedUntil.findIndex(
              (right) => right + 4 <= labelX
            );

            if (lane < 0) {
              lane = occupiedUntil.indexOf(
                Math.min(...occupiedUntil)
              );
              labelX = Math.min(
                chart.chartArea.right - estimatedWidth,
                Math.max(labelX, occupiedUntil[lane] + 4)
              );
            }

            occupiedUntil[lane] = labelX + estimatedWidth;

            const labelY = 9 + lane * 20;

            ctx.beginPath();
            ctx.moveTo(
              x,
              y - 2
            );
            ctx.lineTo(
              labelX,
              labelY + 5
            );
            ctx.stroke();

            ctx.save();
            ctx.translate(labelX, labelY);
            ctx.fillText(
              p.title,
              0,
              0,
              92
            );
            ctx.restore();

            ctx.beginPath();
            ctx.arc(
              x,
              y,
              3,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        );

        ctx.restore();
      },
    };

    const lineData =
      routeIndex.distances.map(
        (x, i) => ({
          x,
          y:
            routeIndex
              .elevations[i],
        })
      );

    const printSurfacePoints = {
      asphalt: lineData.map((p) => ({ x: p.x, y: null })),
      gravel: lineData.map((p) => ({ x: p.x, y: null })),
      trail: lineData.map((p) => ({ x: p.x, y: null })),
      unknown: lineData.map((p) => ({ x: p.x, y: null })),
    };

    const printSurfaceKm = {
      asphalt: 0,
      gravel: 0,
      trail: 0,
      unknown: 0,
    };

    for (let i = 1; i < lineData.length; i++) {
      const cat =
        printSurfacePoints[routeIndex.cats[i]]
          ? routeIndex.cats[i]
          : "unknown";

      printSurfacePoints[cat][i - 1].y =
        lineData[i - 1].y;

      printSurfacePoints[cat][i].y =
        lineData[i].y;

      printSurfaceKm[cat] += Math.max(
        0,
        lineData[i].x - lineData[i - 1].x
      );
    }

    const printSurfaceEl =
      preview.querySelector(
        ".svingom-print-surface"
      );

    if (printSurfaceEl) {
      const total =
        routeIndex.totalKm || 1;

      const surfaceItem =
        (label, km, color) => `
          <span class="svingom-print-surface-item">
            <span class="svingom-print-surface-swatch" style="background:${color}"></span>
            ${label} ${km.toFixed(1)} km (${Math.round((km / total) * 100)} %)
          </span>
        `;

      printSurfaceEl.innerHTML =
        `<strong>${t.surfaceLabel}</strong>` +
        surfaceItem(t.asphalt, printSurfaceKm.asphalt, "#37394E") +
        surfaceItem(t.gravel, printSurfaceKm.gravel, "#A3886C") +
        surfaceItem(t.trail, printSurfaceKm.trail, "#5C7936");
    }

    const printDatasets = [
      {
        data: printSurfacePoints.asphalt,
        borderColor: "#37394E",
        backgroundColor: "#37394E",
        borderWidth: 0,
        pointRadius: 0,
        fill: true,
        tension: 0.25,
        spanGaps: false,
      },
      {
        data: printSurfacePoints.gravel,
        borderColor: "#A3886C",
        backgroundColor: "#A3886C",
        borderWidth: 0,
        pointRadius: 0,
        fill: true,
        tension: 0.25,
        spanGaps: false,
      },
      {
        data: printSurfacePoints.trail,
        borderColor: "#5C7936",
        backgroundColor: "#5C7936",
        borderWidth: 0,
        pointRadius: 0,
        fill: true,
        tension: 0.25,
        spanGaps: false,
      },
      {
        data: lineData,
        borderColor: "#37394E",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.25,
        spanGaps: false,
      },
    ];

    const printChart =
      new Chart(
        preview
          .querySelector(
            "canvas"
          )
          .getContext("2d"),
        {
          type: "line",

          plugins: [
            poiPlugin,
          ],

          data: {
            datasets: printDatasets,
          },

          options: {
            responsive: true,
            maintainAspectRatio:
              false,
            animation: false,

            layout: {
              padding: {
                top: 112,
                right: 4,
                left: 2,
              },
            },

            plugins: {
              legend: {
                display: false,
              },

              tooltip: {
                enabled: false,
              },
            },

            scales: {
              x: {
                type: "linear",
                min: 0,
                max:
                  routeIndex.totalKm,

                ticks: {
                  callback:
                    (v) =>
                      `${Math.round(Number(v))} km`,

                  font: {
                    size: 9,
                  },
                },

                grid: {
                  display: false,
                },
              },

              y: {
                ticks: {
                  font: {
                    size: 9,
                  },
                },

                grid: {
                  color: "#eee",
                },
              },
            },
          },
        }
      );

    const qrBox =
      preview.querySelector(
        ".svingom-print-qr-box"
      );

    loadQrLibrary()
      .then(
        () => {
          new QRCode(
            qrBox,
            {
              text: pageUrl,
              width: 256,
              height: 256,
              colorDark:
                "#422426",
              colorLight:
                "#ffffff",
              correctLevel:
                QRCode
                  .CorrectLevel.H,
            }
          );

          if (qrSymbolUrl) {
            const qrLogo =
              document.createElement("img");

            qrLogo.className =
              "svingom-print-qr-logo";
            qrLogo.src = qrSymbolUrl;
            qrLogo.alt = "";

            qrLogo.addEventListener(
              "error",
              () => qrLogo.remove()
            );

            qrBox.appendChild(qrLogo);
          }
        }
      )
      .catch(
        () => {
          qrBox.textContent =
            "QR-kode kunne ikke lastes";
        }
      );

    const close = () => {
      try {
        printChart.destroy();
        printMap.remove();
        detailMaps.forEach((map) => map.remove());
      } catch (_) {}

      preview.remove();
    };

    preview
      .querySelector(
        "button.close"
      )
      .addEventListener(
        "click",
        close
      );

    preview
      .querySelector(
        "button.print"
      )
      .addEventListener(
        "click",
        () => {
          setTimeout(
            () =>
              window.print(),
            120
          );
        }
      );
  }

  function addPrintControl(
    map,
    route,
    getRouteIndex,
    getPrintPois,
    printLogoUrl,
    printSymbolUrl
  ) {
    if (!map) return;

    const ctrl =
      L.control({
        position: "topright",
      });

    ctrl.onAdd = function () {
      const wrap =
        L.DomUtil.create(
          "div",
          "leaflet-bar"
        );

      const btn =
        L.DomUtil.create(
          "button",
          "svingom-print-control",
          wrap
        );

      btn.type = "button";
      btn.title =
        "Skriv ut turen";

      btn.setAttribute(
        "aria-label",
        "Skriv ut turen"
      );

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M6 8V3h12v5h1a3 3 0 0 1 3 3v6h-4v4H6v-4H2v-6a3 3 0 0 1 3-3h1Zm2-3v3h8V5H8Zm8 10H8v4h8v-4Zm3-5H5a1 1 0 0 0-1 1v4h2v-2h12v2h2v-4a1 1 0 0 0-1-1Zm-1 1.25a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
        </svg>`;

      L.DomEvent
        .disableClickPropagation(
          wrap
        );

      L.DomEvent.on(
        btn,
        "click",
        (e) => {
          L.DomEvent.stop(e);

          openPrintPreview(
            route,
            getRouteIndex(),
            getPrintPois(),
            printLogoUrl,
            printSymbolUrl
          );
        }
      );

      return wrap;
    };

    ctrl.addTo(map);
  }

  // ======================
  // Position control
  // My location + place pin
  // ======================
  function addPositionControl(
    map,
    popupContainer,
    getRouteIndex,
    poisForRoute,
    revealPoisNear,
    resetPopup
  ) {
    if (!map) return;

    let userMarker = null;
    let userCircle = null;
    let chosenMarker = null;
    let pickMode = false;

    function t() {
      const lang = getLang();

      return (
        infoTexts[lang] ||
        infoTexts.no
      );
    }

    function setPickMode(on) {
      pickMode = !!on;

      map
        .getContainer()
        .style.cursor =
          pickMode
            ? "crosshair"
            : "";
    }

    function updatePanels(latlng) {
      const idx =
        typeof getRouteIndex ===
        "function"
          ? getRouteIndex()
          : null;

      if (!idx) return;

      renderPositionResult(
        popupContainer,
        idx,
        latlng.lat,
        latlng.lng
      );

      renderNearbyPois(
        popupContainer,
        poisForRoute,
        latlng.lat,
        latlng.lng
      );
    }

    function showPickHintOnce() {
      const text =
        t().pickHint;

      const box =
        L.control({
          position: "topleft",
        });

      box.onAdd =
        function () {
          const el =
            L.DomUtil.create(
              "div",
              "svingom-pick-hint"
            );

          el.style.background =
            "#EEE9E0";

          el.style.color =
            "#422426";

          el.style.padding =
            "8px 10px";

          el.style.borderRadius =
            "10px";

          el.style.boxShadow =
            "0 1px 8px rgba(0,0,0,0.12)";

          el.style.marginTop =
            "6px";

          el.style.maxWidth =
            "220px";

          el.style.fontSize =
            "13px";

          el.innerHTML = text;

          return el;
        };

      box.addTo(map);

      setTimeout(
        () => {
          try {
            map.removeControl(
              box
            );
          } catch (_) {}
        },
        4500
      );
    }

    const ctrl =
      L.control({
        position: "topleft",
      });

    ctrl.onAdd =
      function () {
        const wrap =
          L.DomUtil.create(
            "div",
            "leaflet-bar svingom-pos-wrap"
          );

        const btnMe =
          L.DomUtil.create(
            "button",
            "svingom-pos-btn",
            wrap
          );

        btnMe.type =
          "button";

        btnMe.title =
          t().btnMeTitle;

        btnMe.innerHTML =
          "◎";

        const btnPick =
          L.DomUtil.create(
            "button",
            "svingom-pos-btn",
            wrap
          );

        btnPick.type =
          "button";

        btnPick.title =
          t().btnPickTitle;

        btnPick.innerHTML =
          "📍";

        L.DomEvent
          .disableClickPropagation(
            wrap
          );

        L.DomEvent.on(
          btnMe,
          "click",
          (e) => {
            L.DomEvent.stop(e);

            if (
              !navigator.geolocation
            ) {
              return alert(
                "Geolocation støttes ikke i denne nettleseren."
              );
            }

            navigator.geolocation
              .getCurrentPosition(
                (pos) => {
                  const lat =
                    pos.coords
                      .latitude;

                  const lon =
                    pos.coords
                      .longitude;

                  const acc =
                    pos.coords
                      .accuracy || 0;

                  const ll =
                    L.latLng(
                      lat,
                      lon
                    );

                  if (
                    !userMarker
                  ) {
                    userMarker =
                      L.marker(
                        ll
                      ).addTo(
                        map
                      );
                  } else {
                    userMarker
                      .setLatLng(
                        ll
                      );
                  }

                  if (
                    !userCircle
                  ) {
                    userCircle =
                      L.circle(
                        ll,
                        {
                          radius:
                            acc,
                          weight:
                            1,
                        }
                      ).addTo(
                        map
                      );
                  } else {
                    userCircle
                      .setLatLng(
                        ll
                      )
                      .setRadius(
                        acc
                      );
                  }

                  map.setView(
                    ll,
                    Math.max(
                      map.getZoom(),
                      12
                    )
                  );

                  if (
                    typeof resetPopup ===
                    "function"
                  ) {
                    resetPopup();
                  }

                  updatePanels(
                    ll
                  );

                  if (
                    typeof revealPoisNear ===
                    "function"
                  ) {
                    try {
                      revealPoisNear(
                        ll,
                        3000
                      );
                    } catch (_) {}
                  }
                },

                (err) =>
                  alert(
                    "Klarte ikke hente posisjon: " +
                      (
                        err.message ||
                        err.code
                      )
                  ),

                {
                  enableHighAccuracy: true,
                  timeout: 8000,
                  maximumAge: 30000,
                }
              );
          }
        );

        L.DomEvent.on(
          btnPick,
          "click",
          (e) => {
            L.DomEvent.stop(e);

            const next = !pickMode;

            setPickMode(next);

            btnPick.classList.toggle(
              "active",
              next
            );

            if (next) {
              showPickHintOnce();
            }
          }
        );

        return wrap;
      };

    ctrl.addTo(map);

    map.on(
      "click",
      (evt) => {
        if (!pickMode) return;

        const ll = evt.latlng;

        if (!chosenMarker) {
          chosenMarker = L.marker(
            ll,
            {
              draggable: true,
            }
          ).addTo(map);

          const onMove = () => {
            const p =
              chosenMarker.getLatLng();

            updatePanels(p);

            if (
              typeof revealPoisNear ===
              "function"
            ) {
              try {
                revealPoisNear(
                  p,
                  3000
                );
              } catch (_) {}
            }
          };

          chosenMarker.on(
            "drag",
            onMove
          );

          chosenMarker.on(
            "dragend",
            onMove
          );
        } else {
          chosenMarker.setLatLng(ll);
        }

        if (
          typeof resetPopup ===
          "function"
        ) {
          resetPopup();
        }

        updatePanels(ll);

        if (
          typeof revealPoisNear ===
          "function"
        ) {
          try {
            revealPoisNear(
              ll,
              3000
            );
          } catch (_) {}
        }

        setPickMode(false);

        const active =
          map
            .getContainer()
            .querySelector(
              ".svingom-pos-btn.active"
            );

        if (active) {
          active.classList.remove(
            "active"
          );
        }
      }
    );
  }

  // ======================
  // Bicycle parking
  // ======================
  function enableBicycleParkingLayer(
    map,
    dataUrl,
    minZoom,
    iconUrl
  ) {
    if (!dataUrl) return;

    let layer = null;
    let loading = null;

    async function ensureLayer() {
      if (layer) return layer;
      if (loading) return loading;

      loading = fetchJsonCached(
        dataUrl
      )
        .then((geojson) => {
          const features =
            Array.isArray(
              geojson &&
              geojson.features
            )
              ? geojson.features.filter(
                  (feature) => {
                    const access =
                      String(
                        (
                          feature &&
                          feature.properties &&
                          feature
                            .properties
                            .access
                        ) || ""
                      ).toLowerCase();

                    return (
                      access !==
                      "private"
                    );
                  }
                )
              : [];

          const parkingIcon =
            L.icon({
              iconUrl: cacheBustUrl(
                iconUrl ||
                  DEFAULT_BICYCLE_PARKING_ICON_URL
              ),

              iconSize: [15, 15],
              iconAnchor: [7.5, 7.5],

              className:
                "svingom-bicycle-parking-icon",
            });

          layer = L.geoJSON(
            {
              type:
                "FeatureCollection",
              features,
            },
            {
              pointToLayer: (
                _feature,
                latlng
              ) =>
                L.marker(
                  latlng,
                  {
                    icon: parkingIcon,
                    opacity: 0.55,
                    zIndexOffset: -500,
                    interactive: false,
                    keyboard: false,
                    title: "Sykkelparkering",
                  }
                ),
            }
          );

          return layer;
        })
        .catch((error) => {
          loading = null;

          console.error(
            "[route_map] Bicycle parking error:",
            dataUrl,
            error
          );

          throw error;
        });

      return loading;
    }

    async function updateVisibility() {
      if (
        map.getZoom() <
        minZoom
      ) {
        if (
          layer &&
          map.hasLayer(layer)
        ) {
          map.removeLayer(layer);
        }

        return;
      }

      try {
        const readyLayer =
          await ensureLayer();

        if (
          map.getZoom() >=
            minZoom &&
          !map.hasLayer(readyLayer)
        ) {
          readyLayer.addTo(map);
        }
      } catch (_) {}
    }

    map.on(
      "zoomend",
      updateVisibility
    );

    updateVisibility();
  }

  // ======================
  // Core init per section
  // ======================
  async function initRouteSection(
    section
  ) {
    try {
      const routeId =
        (
          section.dataset.routeId ||
          ""
        ).trim();

      const routesUrl =
        (
          section.dataset.routesUrl ||
          ""
        ).trim();

      const poisUrl =
        (
          section.dataset.poisUrl ||
          ""
        ).trim();

      const routeMarkersUrl =
        (
          section.dataset
            .routeMarkersUrl ||
          ""
        ).trim();

      const bicycleParkingUrl =
        (
          section.dataset
            .bicycleParkingUrl ||
          ""
        ).trim();

      const bicycleParkingIconUrl =
        (
          section.dataset
            .bicycleParkingIconUrl ||
          ""
        ).trim();

      const bicycleParkingMinZoom =
        Math.max(
          0,
          parseInt(
            section.dataset
              .bicycleParkingMinZoom ||
              "14",
            10
          ) || 14
        );

      const unknownAsTrail =
        String(
          section.dataset
            .unknownAsTrail ||
            ""
        ).trim() === "1";

      if (
        !routeId ||
        !routesUrl ||
        !poisUrl ||
        !routeMarkersUrl
      ) {
        console.error(
          "[route_map] Missing data attributes:",
          {
            routeId,
            routesUrl,
            poisUrl,
            routeMarkersUrl,
          }
        );

        return;
      }

      const mapDiv =
        section.querySelector(
          ".route-map"
        );

      const popupContainer =
        section.querySelector(
          ".route-popup"
        );

      const chartCanvas =
        section.querySelector(
          ".chart-wrapper canvas"
        );

      const surfaceSummaryEl =
        section.querySelector(
          ".surface-summary"
        );

      if (
        !mapDiv ||
        !popupContainer ||
        !chartCanvas
      ) {
        console.error(
          "[route_map] Missing DOM elements for",
          routeId
        );

        return;
      }

      if (
        typeof L ===
          "undefined" ||
        typeof L.map !==
          "function" ||
        typeof L.GPX !==
          "function" ||
        typeof Chart ===
          "undefined"
      ) {
        console.warn(
          "[route_map] Waiting for Leaflet, Leaflet-GPX and Chart.js"
        );

        return;
      }

      if (
        section
          .__routeMapInitialized ||
        section
          .__routeMapInitializing
      ) {
        return;
      }

      section.__routeMapInitializing =
        true;

      const routesJson =
        await fetchJsonCached(
          routesUrl
        );

      const route =
        Array.isArray(routesJson)
          ? routesJson.find(
              (x) =>
                x &&
                x.id === routeId
            )
          : (
              routesJson &&
              routesJson[routeId]
            ) ||
            null;

      if (!route) {
        console.error(
          "[route_map] routeId not found in routes.json:",
          routeId
        );

        section.__routeMapInitializing =
          false;

        return;
      }

      const gpxUrl =
        (
          route.gpxUrl ||
          ""
        ).trim();

      const elevUrl =
        (
          route.elevationSurfaceUrl ||
          route.elevationUrl ||
          ""
        ).trim();

      if (
        !gpxUrl ||
        !elevUrl
      ) {
        console.error(
          "[route_map] Route missing gpxUrl/elevationUrl:",
          routeId,
          route
        );

        section.__routeMapInitializing =
          false;

        return;
      }

      const centerLat =
        parseFloat(
          section.dataset.centerLat ||
          route.centerLat ||
          "59.83467"
        );

      const centerLng =
        parseFloat(
          section.dataset.centerLng ||
          route.centerLng ||
          "9.57846"
        );

      const zoom =
        parseInt(
          section.dataset.zoom ||
          route.zoom ||
          "11",
          10
        );

      const map = L.map(
        mapDiv,
        {
          center: [
            centerLat,
            centerLng,
          ],

          zoom,

          scrollWheelZoom:
            true,
        }
      );

      section.__routeMap = map;

      L.tileLayer(
        "https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png",
        {
          attribution: "© Kartverket",
          maxZoom: 18,
          crossOrigin: true,
        }
      ).addTo(map);

      enableBicycleParkingLayer(
        map,
        bicycleParkingUrl,
        bicycleParkingMinZoom,
        bicycleParkingIconUrl
      );

      const movingMarker =
        L.circleMarker(
          [
            centerLat,
            centerLng,
          ],
          {
            radius: 6,
            color: "#CA6B2A",
            fillColor:
              "#CA6B2A",
            fillOpacity: 1,
            weight: 2,
          }
        ).addTo(map);

      renderStats(
        popupContainer,
        route
      );

      function resetPopup() {
        renderStats(
          popupContainer,
          route
        );
      }

      let routeIndex = null;
      let printPoisForRoute = [];

      addPrintControl(
        map,
        route,
        () => routeIndex,
        () => printPoisForRoute,
        (
          section.dataset
            .printLogoUrl ||
          route.printLogoUrl ||
          DEFAULT_PRINT_LOGO_URL
        ).trim(),
        (
          section.dataset
            .printSymbolUrl ||
          route.printSymbolUrl ||
          DEFAULT_PRINT_SYMBOL_URL
        ).trim()
      );

      try {
        const elevJson =
          await fetchJsonCached(
            elevUrl
          );

        const pts =
          Array.isArray(
            elevJson.points
          )
            ? elevJson.points
            : elevJson;

        const cleaned =
          (pts || []).filter(
            (p) =>
              p &&
              p.elevation != null &&
              p.lat != null &&
              p.lon != null &&
              p.distance != null
          );

        if (cleaned.length) {
          routeIndex =
            buildChart(
              chartCanvas,
              cleaned,
              movingMarker,
              surfaceSummaryEl,
              route,
              unknownAsTrail
            );
        } else {
          console.warn(
            "[route_map] Elevation: no usable points in",
            elevUrl
          );
        }
      } catch (e) {
        console.error(
          "[route_map] Elevation error:",
          routeId,
          elevUrl,
          e
        );
      }

      let poisForRoute = [];

      try {
        const [
          poisJson,
          routeMarkersJson,
        ] = await Promise.all([
          fetchJsonCached(
            poisUrl
          ),

          fetchJsonCached(
            routeMarkersUrl
          ),
        ]);

        const allPois =
          Array.isArray(poisJson)
            ? poisJson
            : Object.values(
                poisJson || {}
              );

        const poisById =
          new Map();

        allPois.forEach((p) => {
          if (p && p.id) {
            poisById.set(
              p.id,
              p
            );
          }
        });

        const ids =
          routeMarkersJson &&
          routeMarkersJson[
            routeId
          ]
            ? routeMarkersJson[
                routeId
              ]
            : [];

        poisForRoute = ids
          .map((id) =>
            poisById.get(id)
          )
          .filter(Boolean);

        const printIds =
          routeMarkersJson &&
          routeMarkersJson._print &&
          Array.isArray(
            routeMarkersJson._print[
              routeId
            ]
          )
            ? routeMarkersJson._print[
                routeId
              ]
            : [];

        printPoisForRoute =
          printIds
            .map((id) =>
              poisById.get(id)
            )
            .filter(Boolean);

        if (
          poisForRoute.length <=
          POI_THRESHOLD
        ) {
          poisForRoute.forEach(
            (p) =>
              addMarkerFromDb(
                map,
                p,
                popupContainer,
                resetPopup
              )
          );
        } else {
          const clusterLayer =
            createClusterLayer(map);

          if (clusterLayer) {
            poisForRoute.forEach(
              (p) =>
                addMarkerFromDb(
                  clusterLayer,
                  p,
                  popupContainer,
                  resetPopup
                )
            );
          } else {
            enableLazyPoiRendering(
              map,
              poisForRoute,
              popupContainer,
              resetPopup
            );
          }
        }
      } catch (e) {
        console.error(
          "[route_map] POI error:",
          routeId,
          e
        );
      }

      const boosted =
        new Set();

      function revealPoisNear(
        latlng,
        radiusMeters = 3000
      ) {
        if (
          !latlng ||
          !Array.isArray(
            poisForRoute
          ) ||
          !poisForRoute.length
        ) {
          return;
        }

        const center = L.latLng(
          latlng.lat,
          latlng.lng
        );

        for (
          const p of
          poisForRoute
        ) {
          const pos =
            getPoiPos(p);

          if (!pos) continue;

          const ll = L.latLng(
            pos[0],
            pos[1]
          );

          if (
            center.distanceTo(ll) <=
            radiusMeters
          ) {
            const k =
              p && p.id
                ? String(p.id)
                : JSON.stringify(
                    pos
                  );

            if (
              boosted.has(k)
            ) {
              continue;
            }

            boosted.add(k);

            addMarkerFromDb(
              map,
              p,
              popupContainer,
              resetPopup
            );
          }
        }
      }

      const enableFullscreen =
        String(
          section.dataset
            .enableFullscreen ||
            "1"
        ) === "1";

      const enablePosition =
        String(
          section.dataset
            .enablePosition ||
            "1"
        ) === "1";

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

      if (enableFullscreen) {
        addFullscreenControl(
          map,
          section
        );
      }

      try {
        new L.GPX(
          cacheBustUrl(gpxUrl),
          {
            async: true,

            polyline_options: {
              color: "#37394E",
              weight: 5,
              opacity: 0.9,
            },

            marker_options: {
              startIconUrl: null,
              endIconUrl: null,
              shadowUrl: null,
              wptIconUrls: {},
            },
          }
        )
          .on(
            "loaded",
            function (e) {
              map.fitBounds(
                e.target.getBounds(),
                {
                  padding: [
                    50,
                    50,
                  ],
                }
              );

              setTimeout(
                () =>
                  map.invalidateSize(),
                60
              );
            }
          )
          .addTo(map);
      } catch (e) {
        console.error(
          "[route_map] GPX error:",
          routeId,
          gpxUrl,
          e
        );
      }

      section.__routeMapInitialized =
        true;

      section.__routeMapInitializing =
        false;
    } catch (e) {
      section.__routeMapInitializing =
        false;

      if (
        section.__routeMap &&
        !section
          .__routeMapInitialized
      ) {
        try {
          section
            .__routeMap
            .remove();
        } catch (_) {}

        section.__routeMap = null;
      }

      console.error(
        "[route_map] initRouteSection fatal:",
        e
      );
    }
  }

  // ======================
  // Robust init for Squarespace
  // ======================
  function initAllOnce() {
    initChartDefaultsOnce();

    const sections =
      document.querySelectorAll(
        ".map-section.map-master[data-route-id]"
      );

    console.log(
      "[route_map] initAll sections:",
      sections.length
    );

    sections.forEach(
      (section) =>
        initRouteSection(
          section
        )
    );
  }

  function startRobustInit() {
    let tries = 0;
    const maxTries = 120;

    const tick = () => {
      tries++;

      initAllOnce();

      const sections =
        Array.from(
          document.querySelectorAll(
            ".map-section.map-master[data-route-id]"
          )
        );

      const allReady =
        sections.length > 0 &&
        sections.every(
          (section) =>
            section
              .__routeMapInitialized
        );

      if (
        allReady ||
        tries >= maxTries
      ) {
        return;
      }

      setTimeout(
        tick,
        250
      );
    };

    tick();

    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        () =>
          setTimeout(
            initAllOnce,
            0
          )
      );
    } else {
      setTimeout(
        initAllOnce,
        0
      );
    }

    try {
      const obs =
        new MutationObserver(
          () => initAllOnce()
        );

      obs.observe(
        document.documentElement,
        {
          childList: true,
          subtree: true,
        }
      );

      setTimeout(
        () => {
          try {
            obs.disconnect();
          } catch (_) {}
        },
        30000
      );
    } catch (_) {}
  }

  startRobustInit();
})();    
