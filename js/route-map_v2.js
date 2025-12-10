<!-- TEST: superenkel Leaflet-kart for å sjekke at ting i det hele tatt funker -->

<!-- Leaflet CSS + JS -->
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet/dist/leaflet.css"
/>
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>

<style>
  #test-map {
    width: 100%;
    height: 400px;
    border: 1px solid #ccc;
  }
</style>

<div id="test-map"></div>

<script>
  console.log("TESTSCRIPT: starter");

  document.addEventListener("DOMContentLoaded", function () {
    console.log("TESTSCRIPT: DOMContentLoaded");

    if (typeof L === "undefined") {
      console.error("Leaflet (L) er IKKE definert – Leaflet lastes ikke.");
      return;
    }

    var map = L.map("test-map", {
      center: [59.83467, 9.57846],
      zoom: 11
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "Kartdata © OpenStreetMap",
      maxZoom: 19
    }).addTo(map);

    console.log("TESTSCRIPT: Kart burde nå være synlig.");
  });
</script>
