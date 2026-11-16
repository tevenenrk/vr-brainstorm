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
export const MAX_V = 420;           // maks. prędkość wylotowa (najmocniejszy ładunek), m/s
export const LETHAL_RADIUS = 40;    // m
export const CRATER = { r: 17, depth: 6 };
export const DISPERSION = {         // rozrzut pojedynczego strzału
  elevationDeg: 0.2,
  azimuthDeg: 0.3,
  velocity: 0.004,
};
export const ANGLE_MIN = 15, ANGLE_MAX = 85;

// Rodzaje amunicji
export const AMMO = {
  he: { name: 'Odłamkowo-burząca', radius: 40, color: '#7dffb0' },
  cluster: { name: 'Kasetowa', radius: 65, color: '#ffe36a', bomblets: 18 },
  fire: { name: 'Zapalająca', radius: 50, color: '#ff9a40', burnTime: 14 },
  nuke: { name: 'Głowica atomowa', radius: 450, color: '#ff5050' },
};
export const AMMO_ORDER = ['he', 'cluster', 'fire', 'nuke'];
export const NUKE_COOLDOWN = 25;   // s — atomówkę strzela tylko jedno działo
export const NUKE = { kill: 520, trees: 430, houses: 450, shockMax: 760, crater: 70, craterDepth: 24 };
export const GUNS_MAX = 8;

// Rozmieszczenie
export const BATTERY_Z = 1530;      // linia dział
export const HOME = { z0: 1690, z1: 1955, count: 14 }; // wioska za działami
export const SPAWN_Z = -1940;       // wróg wychodzi z dalekiego końca

// Domyślne położenie stołu (metry rzeczywiste, układ local-floor)
export const TABLE_DEFAULT = {
  scale: 0.8,
  height: 0.9,
};

const params = new URLSearchParams(location.search);
export const SHADOWS = params.get('shadows') !== '0';
export const SEED = parseInt(params.get('seed') || '1337', 10);

// Opcje zmieniane w menu (zapamiętywane w przeglądarce)
export const DIFFICULTY_NAMES = ['Łatwa', 'Normalna', 'Trudna', 'Piekło'];
const DEFAULT_OPTS = {
  guns: 4,           // liczba dział
  reload: 5,         // bazowy czas ładowania, s (każde działo ma własny, ±15%)
  angle: 60,         // kąt podniesienia lufy, stopnie
  speed: 1,          // mnożnik szybkości pocisków (1 = domyślnie)
  difficulty: 1,
  ammo: 0,           // indeks w AMMO_ORDER
};
export const OPTS = { ...DEFAULT_OPTS };
try {
  const saved = JSON.parse(localStorage.getItem('artyleria-opts') || '{}');
  for (const k of Object.keys(DEFAULT_OPTS)) if (typeof saved[k] === 'number') OPTS[k] = saved[k];
} catch (e) { /* brak dostępu do pamięci — domyślne */ }
export function saveOpts() {
  try { localStorage.setItem('artyleria-opts', JSON.stringify(OPTS)); } catch (e) { /* ignoruj */ }
}

// Czas gry pocisku: ile sekund "fizycznych" mija na sekundę rzeczywistą.
// 7 => tor stromy na ~3 km trwa ok. 4–5 s (2x dłużej niż płaski tor w poprzedniej wersji).
export const shellTimeScale = () => 7 * OPTS.speed;
export const ammoKey = () => AMMO_ORDER[OPTS.ammo] || 'he';
