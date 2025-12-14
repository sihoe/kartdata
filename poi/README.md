# POI data – kontrakt pois51. 

Denne mappen inneholder felles POI-database brukt av alle kart på svingom.no.

## Viktige regler (må følges)
- `id` er stabil og skal aldri endres eller regenereres.
- POI-er kobles til ruter **kun** via `route_markers.json`.
- Ikke legg inn ruteinformasjon (`routes`) i POI-objektene.
- Kun disse feltene er tillatt i en POI:
  - `id`
  - `latlng` (eller `lat` + `lon`)
  - `imageUrl`
  - `symbolType`
  - `texts`
- `texts.no.title` er obligatorisk.
- Bilder skal bruke jsDelivr (`cdn.jsdelivr.net`), ikke `raw.githubusercontent`.

## Gyldig eksempel
```json
{
  "id": "andersnatten-d97e8071",
  "latlng": [60.117004005, 9.418557601],
  "imageUrl": "https://cdn.jsdelivr.net/gh/sihoe/svingombilder@main/andersnatten_kittelsen.jpg",
  "symbolType": "attractions",
  "texts": {
    "no": { "title": "Andersnatten", "description": "..." },
    "en": { "title": "Andersnatten", "description": "..." },
    "de": { "title": "Andersnatten", "description": "..." }
  }
}
