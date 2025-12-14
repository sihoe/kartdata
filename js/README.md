route_map_master200.js er master og fungerer for alle ruter, med filter på 
Adds POI_THRESHOLD behavior:
- <= threshold: render all POI (old behavior)
- > threshold: cluster if markercluster exists, else lazy-add by bounds+zoom
No changes to chart logic or HTML required.
