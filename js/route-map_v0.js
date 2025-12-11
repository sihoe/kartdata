// route-map-v2.js – felles logikk for alle rutekart
// Forutsetter at Leaflet, Leaflet-GPX og (helst) Chart.js er lastet inn.

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
      instruction:
        "Trykk på ikonene og se hva du kan oppleve på sykkelturen"
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
        "Tap the icons to see what you can experience on the bike tour"
    },
    de: {
      title: "Schlüsselinfo:",
      length: "Länge",
      ascent: "Anstieg",
      descent: "Abfahrt",
      highest: "Höchster Punkt",
      lowest: "Tiefster Punkt",
      unit: "m",
      instruction:
        "Tippen Sie auf die Symbole, um zu sehen, was Sie auf der Radtour erleben können"
    }
  };

  function getLang() {
    try {
      if (typeof Weglot !== "undefined" && Weglot.getCurrentLang) {
        return Weglot.getCurrentLang();
      }
      return "no";
    } catch (e) {
      return "no";
    }
  }

  function renderStats(container, stats) {
    if (!container || !stats) return;

    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    container.classList.remove("hidden");
    container.innerHTML =
      '<button class="route-close">&times;</button>' +
      '<div class="stats-box">' +
      '<p class="stats-title">' + t.title + "</p>" +
      '<p><span class="icon">↔</span> ' + t.length +
      ': <strong>' + stats.distanceKm.toFixed(1) + "</strong> km</p>" +
      '<p><span class="icon">↗</span> ' + t.ascent +
      ': <strong>' + stats.climbM.toFixed(0) + "</strong> m</p>" +
      '<p><span class="icon">↘</span> ' + t.descent +
      ': <strong>' + stats.descentM.toFixed(0) + "</strong> m</p>" +
      '<p><span class="icon">▲</span> ' + t.highest +
      ': <strong>' + stats.maxElevationM.toFixed(0) + "</strong> ' +
      t.unit + "</p>" +
      '<p><span class="icon">▼</span> ' + t.lowest +
      ': <strong>' + stats.minElevationM.toFixed(0) + "</strong> ' +
      t.unit + "</p>" +
      '<p style="margin-top:16px;font-style:italic;">' +
      t.instruction +
      "</p>" +
      "</div>";

    const closeBtn = container.querySelector(".route-close");
    if (closeBtn && window.innerWidth <= 768) {
      closeBtn.addEventListener("click", function () {
        container.classList.add("hidden");
      });
    }
  }

  function addMarkerFromDb(map, marker, popupContainer, resetFn) {
    if (!map || !marker) return;

    const pos =
      marker.latlng ||
      (marker.lat && marker.lon ? [marker.lat, marker.lon] : null) ||
      (marker.lat && marker.lng ? [marker.lat, marker.lng] : null);

    if (!pos) {
      console.warn("Markør mangler koordinater", marker);
      return;
    }

    const symbol = marker.symbolType || marker.symbol || null;
    const iconUrl = symbol
      ? "https://cdn.jsdelivr.net/gh/sihoe/symbols@main/symbols-" +
        symbol +
        ".svg"
      : null;

    const customIcon = L.divIcon({
      className: "custom-icon",
      html: iconUrl
        ? '<img src="' + iconUrl + '" style="width:30px;height:30px;">'
        : '<div style="width:30px;height:30px;background:#422426;border-radius:50%;"></div>',
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

      const title =
        langBlock.title ||
        marker.name ||
        marker.title ||
        "";

      const desc =
        langBlock.description ||
        langBlock.desc ||
        marker.description ||
        "";

      const imgUrl =
        marker.imageUrl ||
        marker.symbolUrl ||
        marker.image ||
        null;

      var img = "";
      if (imgUrl) {
        img =
          '<img src="' + imgUrl + '" style="margin-bottom:8px;border-radius:6px;max-width:100%;">';
      }

      popupContainer.innerHTML =
        '<div style="background:white;padding:15px;border-radius:6px;">' +
        '<div style="text-align:right;">' +
        '<button class="popup-close" style="background:none;border:none;font-size:22px;font-weight:bold;color:#422426;cursor:pointer;line-height:1;margin-bottom:5px;">&times;</button>' +
        "</div>" +
        '<h3 style="margin-top:0;font-size:1.1rem;font-weight:bold;color:#422426;">' +
        title +
        "</h3>" +
        img +
        '<p style="font-size:0.95rem;line-height:1.4;">' +
        desc +
        "</p>" +
        "</div>";

      const close = popupContainer.querySelector(".popup-close");
      if (close) {
        close.addEventListener("click", function () {
          if (typeof resetFn === "function") {
            resetFn();
          }
        });
      }
    });
  }

  function buildChart(canvas, elevData, movingMarker) {
    if (!canvas || !elevData || elevData.length === 0) return;
    if (typeof Chart === "undefined") {
      console.warn("Chart.js ikke lastet – hopper over høydeprofil");
      return;
    }

    var distances = [];
    var elevations = [];

    for (var i = 0; i < elevData.length; i++) {
      var p = elevData[i];
      var rawD = Number(p.distance);
      var rawE = Number(p.elevation);

      var lastD = i > 0 ? distances[i - 1] : 0;
      var lastE = i > 0 ? elevations[i - 1] : 0;

      distances.push(isFinite(rawD) ? rawD : lastD);
      elevations.push(isFinite(rawE) ? rawE : lastE);
    }

    var slopes = [0];
    for (var j = 1; j < elevations.length; j++) {
      var delta = elevations[j] - elevations[j - 1];
      var distKm = distances[j] - distances[j - 1];
      var slope = distKm > 0 ? (delta / (distKm * 1000)) * 100 : 0;
      slopes.push(slope);
    }

    var steep = elevations.map(function (e, idx) {
      return slopes[idx] > 5 ? e : null;
    });

    var moderate = elevations.map(function (e, idx) {
      return slopes[idx] > 2.5 && slopes[idx] <= 5 ? e : null;
    });

    var highest = Math.max.apply(null, elevations);

    var ctx = canvas.getContext("2d");

    var chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: distances,
        datasets: [
          {
            data: steep,
            backgroundColor: "rgba(202,107,42,0.6)",
            borderColor: "transparent",
            fill: true,
            pointRadius: 0,
            tension: 0.4
          },
          {
            data: moderate,
            backgroundColor: "rgba(241,185,97,0.6)",
            borderColor: "transparent",
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
            filter: function (item) {
              return item.datasetIndex === 2;
            },
            callbacks: {
              title: function (items) {
                var idx = items[0].dataIndex;
                var d = distances[idx];
                var safe = isFinite(d) ? d : 0;
                return safe.toFixed(1) + " km";
              },
              label: function (ctx) {
                var elev = ctx.raw != null ? Number(ctx.raw) : null;
                var idx = ctx.dataIndex;
                var slope = slopes[idx] || 0;
                var elevText =
                  elev != null && isFinite(elev)
                    ? elev.toFixed(0)
                    : "";
                return elevText + " moh / " + slope.toFixed(1) + "%";
              }
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: distances[distances.length - 1],
            ticks: {
              color: "#37394E",
              callback: function (v) {
                return Number(v).toFixed(0) + " km";
              }
            },
            grid: { display: false }
          },
          y: {
            min: 0,
            max: Math.ceil(highest / 50) * 50,
            ticks: {
              stepSize: 50,
              color: "#37394E"
            },
            grid: { display: false }
          }
        }
      }
    });

    canvas.addEventListener("mousemove", function (evt) {
      var points = chart.getElementsAtEventForMode(
        evt,
        "index",
        { intersect: false },
        true
      );
      if (points.length > 0 && movingMarker) {
        var idx = points[0].index;
        var point = elevData[idx];
        if (point && point.lat && point.lon) {
          movingMarker.setLatLng([point.lat, point.lon]);
        }
      }
    });

    canvas.addEventListener("touchmove", function (e) {
      if (e.touches.length > 0) {
        var touch = e.touches[0];
        var rect = canvas.getBoundingClientRect();
        var x = touch.clientX - rect.left;
        var y = touch.clientY - rect.top;

        var simulatedEvent = new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x + rect.left,
          clientY: y + rect.top
        });
        canvas.dispatchEvent(simulatedEvent);
      }
    });
  }

  async function initRouteSection(section) {
    var routeId = section.dataset.routeId;
    var statsUrl = section.dataset.statsUrl;
    var markersUrl = section.dataset.markersUrl;
    var routeMarkersUrl = section.dataset.routeMarkersUrl;
    var gpxUrl = section.dataset.gpxUrl;

    if (!routeId || !statsUrl || !markersUrl || !routeMarkersUrl || !gpxUrl) {
      console.warn("Mangler data-attributter på map-section", section);
      return;
    }

    var mapDiv = section.querySelector(".route-map");
    var popupContainer = section.querySelector(".route-popup");
    var chartCanvas = section.querySelector(".chart-wrapper canvas");

    if (!mapDiv || !popupContainer || !chartCanvas) {
      console.warn("Mangler interne elementer i map-section", section);
      return;
    }

    var centerLat = parseFloat(section.dataset.centerLat || "59.83467");
    var centerLng = parseFloat(section.dataset.centerLng || "9.57846");
    var zoom = parseInt(section.dataset.zoom || "11", 10);

    var map = L.map(mapDiv, {
      center: [centerLat, centerLng],
      zoom: zoom,
      scrollWheelZoom: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "Kartdata © OpenStreetMap",
      maxZoom: 19
    }).addTo(map);

    var movingMarker = L.circleMarker([centerLat, centerLng], {
      radius: 6,
      color: "#CA6B2A",
      fillColor: "#CA6B2A",
      fillOpacity: 1,
      weight: 2
    }).addTo(map);

    var routeStats = null;

    function resetPopup() {
      if (routeStats) {
        renderStats(popupContainer, routeStats);
      }
    }

    try {
      // 1) stats + høydeprofil
      var statsResp = await fetch(statsUrl);
      if (statsResp.ok) {
        var statsJson = await statsResp.json();
        var meta = Array.isArray(statsJson)
          ? statsJson.find(function (r) { return r.id === routeId; })
          : statsJson[routeId];

        if (meta) {
          routeStats = meta;
          renderStats(popupContainer, routeStats);

          if (meta.elevationUrl) {
            var elevResp = await fetch(meta.elevationUrl);
            if (elevResp.ok) {
              var elevJson = await elevResp.json();
              var pts = Array.isArray(elevJson.points)
                ? elevJson.points
                : elevJson;
              var cleaned = pts.filter(function (p) {
                return p.elevation != null;
              });
              buildChart(chartCanvas, cleaned, movingMarker);
            }
          }
        } else {
          console.warn("Fant ikke routeStats for", routeId);
        }
      } else {
        console.warn("Stats-URL svarte ikke OK:", statsResp.status);
      }

      // 2) markører
      var markersResp = await fetch(markersUrl);
      var routeMarkersResp = await fetch(routeMarkersUrl);

      if (markersResp.ok && routeMarkersResp.ok) {
        var markersJson = await markersResp.json();
        var routeMarkersJson = await routeMarkersResp.json();

        var allMarkers = Array.isArray(markersJson)
          ? markersJson
          : Object.values(markersJson);

        var markersByName = new Map();
        allMarkers.forEach(function (m) {
          var key =
            m.name ||
            m.title ||
            (m.texts &&
              m.texts.no &&
              (m.texts.no.title || m.texts.no.name)) ||
            null;
          if (key) {
            markersByName.set(key, m);
          }
        });

        var markerNamesForRoute = routeMarkersJson[routeId] || [];
        var thisRouteMarkers = markerNamesForRoute
          .map(function (n) {
            var m = markersByName.get(n);
            if (!m) {
              console.warn(
                "Fant ikke markør for navn",
                n,
                "på rute",
                routeId
              );
            }
            return m;
          })
          .filter(Boolean);

        thisRouteMarkers.forEach(function (m) {
          addMarkerFromDb(map, m, popupContainer, resetPopup);
        });
      } else {
        console.warn(
          "Feil ved henting av markører eller route_markers:",
          markersResp.status,
          routeMarkersResp.status
        );
      }

      // 3) GPX-rute
      new L.GPX(gpxUrl, {
        async: true,
        polyline_options: {
          color: "#37394E",
          weight: 5,
          opacity: 0.9
        },
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
    } catch (err) {
      console.error("Feil under init av rutekart:", err);
    }
  }

  function initAll() {
    var sections = document.querySelectorAll(".map-section[data-route-id]");
    sections.forEach(function (section) {
      initRouteSection(section);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
