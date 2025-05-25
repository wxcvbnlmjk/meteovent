export interface GridCoords {
  domain: number
  sn: number
  we: number
  lat: number
  lon: number
  latDiff: number
  lonDiff: number
}

export interface TimeData {
  z: number[]
  umet: number[]
  vmet: number[]
  ter: number
  pblh: number
  raintot: number
  cfracl: number
  cfracm: number
  cfrach: number
  cldfra: number[]
  ths: number[]
  thr: number[]
}

export interface WeatherData {
  [time: string]: TimeData
}

export interface WeatherResponse {
  gridCoords: GridCoords
  data: WeatherData
  status: string
  time: number
} 