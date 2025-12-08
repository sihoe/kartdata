// route-map.js – felles logikk for alle rutekart
// Forutsetter at Leaflet, Leaflet-GPX og Chart.js er lastet inn.

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
      instruction: "Trykk på ikonene og se hva du kan oppleve på sykkelturen"
    },
    en: {
      title: "Key info:",
      length: "Distance",
      ascent: "Ascent",
      descent: "Descent",
      highest: "Highest point",
      lowest: "Lowest point",
      unit: "m",
      instruction: "Tap the icons to see what you can experience on the bike tour"
    },
    de: {
      title: "Schlüsselinfo:",
      length: "Länge",
      ascent: "Anstieg",
      descent: "Abfahrt",
      highest: "Höchster Punkt",
      lowest: "Tiefster Punkt",
      unit: "m",
      instruction: "Tippen Sie auf die Symbole, um zu sehen, was Sie auf der Radtour erleben können"
    }
  };

  function getLang() {
    try {
      return typeof Weglot !== "undefined" && Weglot.getCurrentLang
        ? Weglot.getCurrentLang()
        : "no";
    } catch {
      return "no";
    }
  }

  function renderStats(container, stats) {
    if (!stats) return;
    const lang = getLang();
    const t = infoTexts[lang] || infoTexts.no;

    container.classList.remove("hidden");
    container.innerHTML = `
      <button class="route-close">&times;</button>
      <div class="stats-box">
        <p class="stats-title">${t.title}</p>
        <p><span class="icon">↔</span> ${t.length}: <strong>${stats.distanceKm.toFixed(1)}</strong> km</p>
        <p><span class="icon">↗</span> ${t.ascent}: <strong>${stats.climbM.toFixed(0)}</strong> m</p>
        <p><span class="icon">↘</span> ${t.descent}: <strong>${stats.descentM.toFix
