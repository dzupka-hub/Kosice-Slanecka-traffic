// OVERENIE - rekonstrukcia trasy po Slaneckej (supportingPoints).
const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) { console.error("chyba TOMTOM_API_KEY"); process.exit(1); }

// Trasa po Slaneckej, od Krasnej k mostu (poradie je dolezite)
const TRASA = [
  { lat: 48.668544, lon: 21.319388 },
  { lat: 48.669446, lon: 21.314844 },
  { lat: 48.671410, lon: 21.304668 },
  { lat: 48.672216, lon: 21.303419 },
  { lat: 48.674686, lon: 21.300643 },
  { lat: 48.679451, lon: 21.294658 },
  { lat: 48.685382, lon: 21.286124 },
  { lat: 48.687341, lon: 21.283420 },
  { lat: 48.688446, lon: 21.282243 },
];

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const pauza = ms => new Promise(r => setTimeout(r, ms));

async function trasa(body, nazov) {
  const od = body[0], kam = body[body.length - 1];
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${bod(od)}:${bod(kam)}/json` +
    `?traffic=true&computeTravelTimeFor=all&travelMode=car` +
    `&instructionsType=text&routeRepresentation=polyline&key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supportingPoints: body.map(p => ({ latitude: p.lat, longitude: p.lon })),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const route = (await res.json()).routes[0];
  const s = route.summary;
  const vsetky = route.legs.flatMap(l => l.points);

  const vzorka = [];
  const krok = (vsetky.length - 1) / 9;
  for (let i = 0; i < 10; i++) {
    const p = vsetky[Math.round(i * krok)];
    vzorka.push(`${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`);
  }

  const ulice = [];
  for (const g of route.guidance?.instructions ?? []) {
    const u = g.street || g.roadNumbers?.[0];
    if (u && ulice[ulice.length - 1] !== u) ulice.push(u);
  }

  console.log(`\n=== ${nazov} ===`);
  console.log(`dlzka ${(s.lengthInMeters / 1000).toFixed(2)} km, ` +
              `cas ${(s.travelTimeInSeconds / 60).toFixed(1)} min, ` +
              `volne ${(s.noTrafficTravelTimeInSeconds / 60).toFixed(1)} min`);
  console.log(`ulice: ${ulice.join(" → ") || "(bez nazvov)"}`);
  console.log(`MAPA: https://www.google.com/maps/dir/${vzorka.join("/")}`);
}

(async () => {
  try {
    await trasa(TRASA, "DO MESTA (z Krasnej)");
  } catch (e) { console.error("DO MESTA CHYBA:", e.message); }
  await pauza(1500);
  try {
    await trasa([...TRASA].reverse(), "DO KRASNEJ (z mesta)");
  } catch (e) { console.error("DO KRASNEJ CHYBA:", e.message); }
})();
