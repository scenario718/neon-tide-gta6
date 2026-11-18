// city.js — builds Porto Alba, the sun-soaked coastal city Neon Tide plays
// in. A grid of avenues divides the map into blocks; each block belongs to a
// district (downtown, suburbs, the docks, marina beach) and is filled with
// buildings, houses or warehouses accordingly. The ocean runs down the east
// edge, with a sand beach and a wooden pier. Everything is generated from a
// seeded RNG so the city is identical on every load.

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_W = 96;
export const WATER_X = 3260; // ocean starts here
export const SAND_X = 3052; // beach sand starts here

export const V_ROADS = [420, 1040, 1660, 2280, 2900];
export const H_ROADS = [400, 1020, 1640, 2180];

const WALL_PALETTES = {
  downtown: ['#8fa3b8', '#7d92a8', '#a8b8c4', '#6f8aa3', '#93a8b5', '#8598ad', '#c2a184', '#a3b19a'],
  midtown: ['#d9c8a9', '#cdbb9d', '#d3bf9f', '#c4b294', '#d8c49c'],
  suburbs: ['#e8b4a0', '#f0d0a8', '#dfe3b8', '#f2e2c4', '#e6c8d8', '#cfe0d8'],
  beach: ['#f5efe2', '#f2d8d8', '#e8f0ee', '#f7e8c8', '#e2ecf5'],
  docks: ['#a8624d', '#8c7a68', '#7a6a5c', '#96604f', '#6e6258'],
};

function districtFor(cx, cy) {
  if (cy >= 2132) return 'docks';
  if (cx >= 2800) return 'beach';
  if (cx >= 968 && cx <= 2352 && cy >= 330 && cy <= 1712) return 'downtown';
  if (cx < 968) return 'suburbs';
  return 'midtown';
}

// One building inside a block, inset by the sidewalk margin.
function building(rng, x, y, w, h, district, floors) {
  const palette = WALL_PALETTES[district] || WALL_PALETTES.midtown;
  const wall = palette[Math.floor(rng.next() * palette.length)] || '#cdbb9d';
  return {
    x, y, w, h,
    wall,
    roof: shade(wall, -28),
    district,
    floors,
    name: null,
  };
}

// Darken/lighten a #rrggbb colour by an amount.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function fillBlock(rng, block, buildings) {
  const { x, y, w, h, district } = block;
  const m = 34; // sidewalk + setback margin inside the block
  const ix = x + m;
  const iy = y + m;
  const iw = w - m * 2;
  const ih = h - m * 2;
  if (iw < 60 || ih < 60) return;
  if (district === 'downtown') {
    // Four towers per block with a plaza gap between them.
    const bw = iw / 2 - 14;
    const bh = ih / 2 - 14;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        buildings.push(building(rng, ix + i * (bw + 28), iy + j * (bh + 28), bw, bh, district, rng.int(8, 18)));
      }
    }
  } else if (district === 'suburbs') {
    // Six small houses with yards.
    const bw = iw / 3 - 16;
    const bh = ih / 2 - 22;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        buildings.push(building(rng, ix + i * (bw + 16), iy + j * (bh + 44), bw, bh, district, 1));
      }
    }
  } else if (district === 'docks') {
    // One or two long warehouses.
    if (rng.chance(0.5)) {
      buildings.push(building(rng, ix, iy, iw, ih * 0.62, district, 2));
    } else {
      const bw = iw / 2 - 12;
      buildings.push(building(rng, ix, iy, bw, ih * 0.7, district, 2));
      buildings.push(building(rng, ix + bw + 24, iy, bw, ih * 0.7, district, 2));
    }
  } else if (district === 'beach') {
    // Low, wide hotels and cafes.
    const bh = ih / 2 - 18;
    buildings.push(building(rng, ix, iy, iw, bh, district, rng.int(2, 4)));
    buildings.push(building(rng, ix, iy + bh + 36, iw, bh, district, rng.int(2, 4)));
  } else {
    // Midtown: two mid-rise slabs.
    const bw = iw / 2 - 12;
    buildings.push(building(rng, ix, iy, bw, ih, district, rng.int(4, 7)));
    buildings.push(building(rng, ix + bw + 24, iy, bw, ih, district, rng.int(4, 7)));
  }
}

export function buildCity(rng) {
  // Block ranges between the avenues (avenue centres minus/plus half width).
  const colEdges = [0, ...V_ROADS.flatMap((x) => [x - ROAD_W / 2, x + ROAD_W / 2]), SAND_X];
  const rowEdges = [0, ...H_ROADS.flatMap((y) => [y - ROAD_W / 2, y + ROAD_W / 2]), WORLD_H];
  const cols = [];
  const rows = [];
  for (let i = 0; i < colEdges.length; i += 2) cols.push([colEdges[i], colEdges[i + 1]]);
  for (let i = 0; i < rowEdges.length; i += 2) rows.push([rowEdges[i], rowEdges[i + 1]]);

  const blocks = [];
  const buildings = [];
  const sidewalkLoops = [];
  for (let ci = 0; ci < cols.length; ci++) {
    for (let ri = 0; ri < rows.length; ri++) {
      const [x0, x1] = cols[ci];
      const [y0, y1] = rows[ri];
      const block = {
        x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        district: districtFor((x0 + x1) / 2, (y0 + y1) / 2),
        col: ci, row: ri,
      };
      blocks.push(block);
      // Pedestrians walk the block perimeter, inset onto the sidewalk.
      const s = 16;
      sidewalkLoops.push([
        { x: x0 + s, y: y0 + s },
        { x: x1 - s, y: y0 + s },
        { x: x1 - s, y: y1 - s },
        { x: x0 + s, y: y1 - s },
      ]);
      fillBlock(rng, block, buildings);
    }
  }

  // Landmarks replace whatever the generator put in their blocks.
  const landmark = (col, row, w, h, floors, wall, name) => {
    const block = blocks.find((b) => b.col === col && b.row === row);
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (b.x >= block.x && b.y >= block.y && b.x < block.x + block.w && b.y < block.y + block.h) {
        buildings.splice(i, 1);
      }
    }
    const b = {
      x: block.x + (block.w - w) / 2,
      y: block.y + (block.h - h) / 2,
      w, h, wall, roof: shade(wall, -30),
      district: block.district, floors, name,
    };
    buildings.push(b);
    return b;
  };
  const albaTower = landmark(2, 1, 300, 300, 24, '#7e97ad', 'ALBA TOWER');
  const hotelBrisa = landmark(4, 1, 380, 170, 5, '#f5efe2', 'HOTEL BRISA');
  const garage = landmark(0, 2, 240, 150, 1, '#c8b498', "DOM'S GARAGE");
  const policeStation = landmark(3, 3, 300, 170, 3, '#9fb2c4', 'POLICE');
  const hospital = landmark(1, 0, 320, 170, 4, '#eef0ea', 'HOSPITAL');
  const pierNine = landmark(3, 4, 420, 190, 2, '#a8624d', 'PIER 9 STORAGE');

  // Shipping containers and crates scattered through the docks (solid).
  const containers = [];
  const containerColors = ['#b5543c', '#3c7ab5', '#4da364', '#c9a227', '#7a5ba6'];
  for (let i = 0; i < 26; i++) {
    const x = rng.range(120, 2900);
    const y = rng.range(2260, 2500);
    if (buildings.some((b) => x > b.x - 70 && x < b.x + b.w + 70 && y > b.y - 40 && y < b.y + b.h + 40)) continue;
    containers.push({ x, y, w: 62, h: 26, color: containerColors[i % containerColors.length] });
  }

  // Palm trees: thick along the beach and the coastal avenue, some inland.
  const palms = [];
  for (let i = 0; i < 90; i++) {
    const x = rng.range(2960, 3240);
    const y = rng.range(30, 2570);
    palms.push({ x, y, s: rng.range(0.8, 1.3), sway: rng.range(0, Math.PI * 2) });
  }
  for (let i = 0; i < 46; i++) {
    const x = rng.range(40, 2900);
    const y = rng.range(40, 2560);
    if (onRoad(x, y)) continue;
    palms.push({ x, y, s: rng.range(0.7, 1.1), sway: rng.range(0, Math.PI * 2) });
  }

  // Street lamps at every intersection corner (drawn, not solid).
  const lamps = [];
  for (const vx of V_ROADS) {
    for (const hy of H_ROADS) {
      lamps.push({ x: vx - ROAD_W / 2 - 8, y: hy - ROAD_W / 2 - 8 });
      lamps.push({ x: vx + ROAD_W / 2 + 8, y: hy + ROAD_W / 2 + 8 });
    }
  }

  // The pier: a wooden deck reaching into the ocean from the docks.
  const pier = { x: 3160, y: 2282, w: 400, h: 56 };

  const locations = {
    hideout: { x: 300, y: 700, label: "Mari's Place" },
    playerStart: { x: 386, y: 700 },
    garageDoor: { x: garage.x + garage.w / 2, y: garage.y + garage.h + 26, label: "Dom's Garage" },
    docksPickup: { x: pierNine.x + pierNine.w / 2, y: pierNine.y + pierNine.h + 30, label: 'Pier 9 Storage' },
    pierEnd: { x: pier.x + pier.w - 30, y: pier.y + pier.h / 2, label: 'The Pier' },
    beachHotel: { x: hotelBrisa.x + hotelBrisa.w / 2, y: hotelBrisa.y + hotelBrisa.h + 26, label: 'Hotel Brisa' },
    officeDoor: { x: albaTower.x + albaTower.w / 2, y: albaTower.y + albaTower.h + 26, label: 'Alba Tower' },
    hospitalDoor: { x: hospital.x + hospital.w / 2, y: hospital.y + hospital.h + 26, label: 'Hospital' },
    policeDoor: { x: policeStation.x + policeStation.w / 2, y: policeStation.y + policeStation.h + 26, label: 'Police Station' },
  };

  const solids = [...buildings, ...containers];

  return {
    w: WORLD_W, h: WORLD_H,
    blocks, buildings, containers, palms, lamps, pier, locations, solids,
    sidewalkLoops,
    landmarks: { albaTower, hotelBrisa, garage, policeStation, hospital, pierNine },
  };
}

export function onRoad(x, y) {
  for (const vx of V_ROADS) if (Math.abs(x - vx) <= ROAD_W / 2) return true;
  for (const hy of H_ROADS) if (Math.abs(y - hy) <= ROAD_W / 2) return true;
  return false;
}

export function onPier(city, x, y) {
  const p = city.pier;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

export function inWater(city, x, y) {
  return x >= WATER_X && !onPier(city, x, y);
}

export function districtAt(city, x, y) {
  if (x >= WATER_X) return 'ocean';
  if (x >= SAND_X) return 'beach';
  if (y >= 2132) return 'docks'; // the south band, avenues included
  if (x >= 2852) return 'beach'; // the coastal avenue and its blocks
  for (const b of city.blocks) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.district;
  }
  return 'midtown';
}
