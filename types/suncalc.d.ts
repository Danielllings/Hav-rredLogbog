declare module "suncalc" {
  interface SunTimes {
    sunrise: Date;
    sunset: Date;
    sunriseEnd: Date;
    sunsetStart: Date;
    dawn: Date;
    dusk: Date;
    nauticalDawn: Date;
    nauticalDusk: Date;
    nightEnd: Date;
    night: Date;
    goldenHourEnd: Date;
    goldenHour: Date;
    solarNoon: Date;
    nadir: Date;
  }

  interface MoonIllumination {
    fraction: number;
    phase: number;
    angle: number;
  }

  interface MoonTimes {
    rise?: Date;
    set?: Date;
    alwaysUp?: boolean;
    alwaysDown?: boolean;
  }

  interface MoonPosition {
    altitude: number;
    azimuth: number;
    distance: number;
    parallacticAngle: number;
  }

  interface SunPosition {
    altitude: number;
    azimuth: number;
  }

  export function getTimes(date: Date, lat: number, lng: number): SunTimes;
  export function getPosition(date: Date, lat: number, lng: number): SunPosition;
  export function getMoonTimes(date: Date, lat: number, lng: number, inUTC?: boolean): MoonTimes;
  export function getMoonPosition(date: Date, lat: number, lng: number): MoonPosition;
  export function getMoonIllumination(date: Date): MoonIllumination;

  const SunCalc: {
    getTimes: typeof getTimes;
    getPosition: typeof getPosition;
    getMoonTimes: typeof getMoonTimes;
    getMoonPosition: typeof getMoonPosition;
    getMoonIllumination: typeof getMoonIllumination;
  };

  export default SunCalc;
}
