// Meranie rychlosti dopravy na Slaneckej ceste (Kosice) cez TomTom Traffic Flow API.
// Bezi v GitHub Actions, vysledky uklada do data/RRRR-MM.json a data/latest.json.
// Ziadne zavislosti - staci Node 18+.

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) {
  console.error("Chyba: chyba secret TOMTOM_API_KEY");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SURADNICE - toto je jedine miesto, ktore mozno budes chciet doladit.
//
// Zvoleny je bod na Slaneckej medzi sidliskom Nad jazerom a odbockou do Krasnej.
// Cesta tu vedie priblizne smerom SZ -> JV. Aby TomTom vratil spravny smer,
// pytame sa na dva body posunute kolmo od osi cesty:
//   - smer DO MESTA (z Krasnej):   jazdny pruh na SV strane
//   - smer DO KRASNEJ (z mesta):   jazdny pruh na JZ strane
//
// Ako overit/doladit: otvor Google Maps, klikni presne na Slanecku,
// skopiruj suradnice a vloz ich do CENTER. Offsety necha tak.
// ---------------------------------------------------------------------------
const CENTER = { lat: 48.6832, lon: 21.2935 };
const OFFSET = { lat: 0.00013, lon: 0.0002 }; // cca 15 m kolmo od osi

const POINTS = {
  toCity: {
    label: "smer do mesta (z Krasnej)",
    lat: CENTER.lat + OFFSET.lat,
    lon: CENTER.lon + OFFSET.lon,
  },
  toKrasna: {
    label: "smer do Krasnej (z mesta)",
    lat: CENTER.lat - OFFSET.lat,
    lon: CENTER.lon - OFFSET.lon,
  },
};

async function fetchFlow(point) {
  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
    `?point=${point.lat.toFixed(6)},${point.lon.toFixed(6)}&unit=KMPH&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TomTom HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const d = json.flowSegmentData;
  return {
    speed: d.currentSpeed,          // aktualna rychlost km/h
    freeFlow: d.freeFlowSpeed,      // rychlost bez premavky km/h
    travelTime: d.currentTravelTime, // sekundy cez segment
    freeFlowTime: d.freeFlowTravelTime,
    confidence: d.confidence,       // 0-1 spolahlivost merania
    closed: d.roadClosure === true,
    // pomocny udaj na jednorazove overenie, ze sme trafili spravny segment:
    segStart: d.coordinates?.coordinate?.[0] ?? null,
  };
}

(async () => {
  const now = new Date();
  const entry = { t: now.toISOString() };

  for (const [dir, point] of Object.entries(POINTS)) {
    try {
      const m = await fetchFlow(point);
      console.log(
        `${point.label}: ${m.speed} km/h (freeflow ${m.freeFlow} km/h, confidence ${m.confidence})`
      );
      console.log(`  segment zacina na:`, JSON.stringify(m.segStart));
      const { segStart, ...rest } = m; // segStart len do logu, nie do dat
      entry[dir] = rest;
    } catch (e) {
      console.error(`${point.label}: CHYBA -`, e.message);
      entry[dir] = { error: true };
    }
  }

  // zapis do mesacneho suboru
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const monthFile = path.join(
    dataDir,
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}.json`
  );

  let arr = [];
  if (fs.existsSync(monthFile)) {
    arr = JSON.parse(fs.readFileSync(monthFile, "utf8"));
  }
  arr.push(entry);
  fs.writeFileSync(monthFile, JSON.stringify(arr));

  // latest.json pre rychle zobrazenie aktualneho stavu
  fs.writeFileSync(path.join(dataDir, "latest.json"), JSON.stringify(entry, null, 2));

  console.log(`Zapisane do ${path.basename(monthFile)} (${arr.length} merani v mesiaci).`);
})();
