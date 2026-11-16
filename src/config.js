// Wszystkie wymiary "mapy" są w metrach świata gry (1 km x 4 km).
// Grupa mapy jest skalowana MAP_SCALE, więc 1000 m -> 0,5 m na stole.

export const MAP_W = 1000;          // szerokość mapy (oś X), m
export const MAP_D = 4000;          // długość mapy (oś Z), m
export const RES_X = 128;           // podział siatki terenu
export const RES_Z = 512;
export const MAP_SCALE = 1 / 2000;  // 1:2000 -> stół 0,5 m x 2 m
export const WATER_LEVEL = 0;
export const BASE_Y = -45;          // spód "bryły" dioramy

// Balistyka
export const G = 9.81;
export const MUZZLE_V = 265;        // m/s (zasięg maks. ~7 km)
export const SHELL_TIME_SCALE = 5;  // pociski lecą 5x szybciej niż w rzeczywistości
export const RELOAD_TIME = 4.0;     // s
export const LETHAL_RADIUS = 40;    // m
export const DISPERSION = {         // rozrzut salwy
  elevationDeg: 0.22,
  azimuthDeg: 0.35,
  velocity: 0.005,
};

// Rozmieszczenie
export const BATTERY_Z = 1800;      // bateria przy "bliższym" końcu stołu
export const SPAWN_Z = -1940;       // wróg wychodzi z dalekiego końca
export const BREACH_Z = 1660;       // linia, której wróg nie może przekroczyć
export const MAX_BREACHES = 10;

// Domyślne położenie stołu (metry rzeczywiste, układ local-floor)
export const TABLE_DEFAULT = {
  scale: 0.8,
  height: 0.85,
};

const params = new URLSearchParams(location.search);
export const SHADOWS = params.get('shadows') !== '0';
export const SEED = parseInt(params.get('seed') || '1337', 10);
