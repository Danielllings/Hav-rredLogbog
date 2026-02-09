// lib/maps.ts

// Ortofoto forår Web Mercator – GeoDanmark (orto_foraar_webm_DAF)
// Korrekt WMTS-url til react-native-maps UrlTile

export const ORTO_FORAAR_URL =
  "https://api.dataforsyningen.dk/orto_foraar_webm_DAF" +
  "?token=7e9587e556e5aad85e876609d05aef8e" +
  "&SERVICE=WMTS" +
  "&REQUEST=GetTile" +
  "&VERSION=1.0.0" +
  "&LAYER=orto_foraar_webm" +
  "&STYLE=default" +
  "&FORMAT=image/jpeg" +
  "&tileMatrixSet=DFD_GoogleMapsCompatible" +
  "&tileMatrix={z}" +
  "&tileRow={y}" +
  "&tileCol={x}";
