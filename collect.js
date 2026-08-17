// KALIBRACIA - jednorazovy test, ktory bod v Krasnej je najlepsi.
const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) { console.error("chyba TOMTOM_API_KEY"); process.exit(1); }

const KRASNA = { lat: 48.668514, lon: 21.319647 };  // tvoj povodny bod
const STRED  = { lat: 48.6824,   lon: 21.2904   };  // stred Slaneckej
const MESTO  = { lat: 48.689744, lon: 21.280667 };

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

// kandidati: postupne posuvame bod z Krasnej smerom na Slanecku
const KANDIDATI = [0, 0.10, 0.20, 0.30].map(t => ({
  popis: t === 0 ? "povodny bod" : `posun ${Math.round(t * 100)} % k stredu`,
  lat: KRASNA.lat + (STRED.lat - KRASNA.lat) * t,
  lon: KRASNA.lon + (STRED.lon - KRASNA.lon) * t,
}));

async function trasa(od, kam) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${bod(od)}:${bod(kam)}/json`
    + `?traffic=true&computeTravelTimeFor=all&travelMode=car&key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const s = (await r.json()).routes[0].summary;
  return { km: s.lengthInMeters / 1000, min: s.travelTimeInSeconds / 60 };
}

(async () => {
  console.log("kandidat                | suradnice             | do mesta      | do Krasnej");
  console.log("------------------------|-----------------------|---------------|---------------");
  for (const k of KANDIDATI) {
    try {
      const tam = await trasa(k, MESTO);
      const spat = await trasa(MESTO, k);
      console.log(
        `${k.popis.padEnd(23)} | ${bod(k).padEnd(21)} | ` +
        `${tam.km.toFixed(2)} km ${tam.min.toFixed(1)} min | ` +
        `${spat.km.toFixed(2)} km ${spat.min.toFixed(1)} min`
      );
    } catch (e) {
      console.log(`${k.popis.padEnd(23)} | ${bod(k).padEnd(21)} | CHYBA: ${e.message}`);
    }
  }
  console.log("\nHladame kandidata, kde su obe dlzky podobne a co najmensie.");
})();
