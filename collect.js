// KALIBRACIA 2 - hladame spravny cielovy bod v meste (smer DO MESTA).
const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) { console.error("chyba TOMTOM_API_KEY"); process.exit(1); }

const KRASNA = { lat: 48.668514, lon: 21.319647 };
const MESTO  = { lat: 48.689744, lon: 21.280667 };

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

// posuvame cielovy bod kolmo na cestu (na druhy jazdny pruh)
// a pripadne kusok spat po ceste
const KANDIDATI = [
  { popis: "povodny",            lat: MESTO.lat,           lon: MESTO.lon },
  { popis: "kolmo na SV",        lat: MESTO.lat + 0.00016, lon: MESTO.lon + 0.00024 },
  { popis: "kolmo na JZ",        lat: MESTO.lat - 0.00016, lon: MESTO.lon - 0.00024 },
  { popis: "200 m spat po ceste", lat: MESTO.lat - 0.0012,  lon: MESTO.lon + 0.0018 },
];

async function trasa(od, kam) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${bod(od)}:${bod(kam)}/json`
    + `?traffic=true&travelMode=car&instructionsType=text&key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const s = j.routes[0].summary;
  const ulice = [];
  for (const g of j.routes[0].guidance?.instructions ?? []) {
    const u = g.street || g.roadNumbers?.[0];
    if (u && ulice[ulice.length - 1] !== u) ulice.push(u);
  }
  return { km: s.lengthInMeters / 1000, min: s.travelTimeInSeconds / 60, ulice };
}

(async () => {
  for (const k of KANDIDATI) {
    try {
      const tam = await trasa(KRASNA, k);
      await new Promise(r => setTimeout(r, 1500));
      const spat = await trasa(k, KRASNA);
      console.log(
        `\n${k.popis}  (${bod(k)})\n` +
        `  DO MESTA:   ${tam.km.toFixed(2)} km / ${tam.min.toFixed(1)} min\n` +
        `     ${tam.ulice.join(" → ")}\n` +
        `  DO KRASNEJ: ${spat.km.toFixed(2)} km / ${spat.min.toFixed(1)} min\n` +
        `     ${spat.ulice.join(" → ")}`
      );
    } catch (e) {
      console.log(`\n${k.popis}  (${bod(k)})  CHYBA: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
})();
