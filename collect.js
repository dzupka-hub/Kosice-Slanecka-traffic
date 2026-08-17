// KALIBRACIA - hladame spravny bod B (Kostolianska c. 32).
const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) { console.error("chyba TOMTOM_API_KEY"); process.exit(1); }

const A = { lat: 48.745627, lon: 21.248161 };   // Kostolianska 694/39

const KANDIDATI = [
  { popis: "novy bod (od teba)", lat: 48.741252, lon: 21.247154 },
  { popis: "novy + kolmo na V",  lat: 48.741260, lon: 21.247354 },
  { popis: "novy + kolmo na Z",  lat: 48.741244, lon: 21.246954 },
  { popis: "novy, 80 m na sever",lat: 48.741972, lon: 21.247254 },
  { popis: "povodny bod",        lat: 48.741193, lon: 21.247421 },
];

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const pauza = ms => new Promise(r => setTimeout(r, ms));

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
  return { m: s.lengthInMeters, s: s.travelTimeInSeconds, ulice };
}

(async () => {
  console.log("Cielova dlzka podla merania 2024: 508 m\n");
  for (const k of KANDIDATI) {
    try {
      const tam = await trasa(A, k);
      await pauza(1200);
      const spat = await trasa(k, A);
      console.log(`${k.popis}  (${bod(k)})`);
      console.log(`   A->B: ${tam.m} m / ${tam.s} s   [${tam.ulice.join(" → ")}]`);
      console.log(`   B->A: ${spat.m} m / ${spat.s} s   [${spat.ulice.join(" → ")}]\n`);
    } catch (e) {
      console.log(`${k.popis}: CHYBA ${e.message}\n`);
    }
    await pauza(1200);
  }
})();
