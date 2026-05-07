export type WidgetConfig = {
  favoriteSpotId: string;
  favoriteSpotName: string;
  favoriteSpotLat: number;
  favoriteSpotLng: number;
  updatedAt: string;
};

export type WidgetData = {
  spotName: string;
  waterTempC: number | null;
  airTempC: number | null;
  windSpeedMS: number | null;
  windDirDeg: number | null;
  windDirLabel: string;
  waterLevelCM: number | null;
  catchForecastScore: number;
  updatedAt: string;
};
