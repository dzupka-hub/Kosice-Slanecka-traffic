// JEDNORAZOVE - vykresli trasu, ktoru vybral TomTom, ako odkaz na Google Maps.
const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) { console.error("chyba TOMTOM_API_KEY"); process.exit(1); }

const KRASNA = { lat: 48.668514, lon: 21.319647 };
const MESTO  = { lat: 48.689904, lon: 21.280907 };

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const pauza = ms => new Promise(r => setTimeout(r, ms));

async function trasa(od, kam, nazov) {
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${bod(od)}:${bod(kam)}/json` +
    `?traffic=true&travelMode=car&instructionsType=text` +
    `&routeRepresentation=polyline&key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const route = j.routes[0];
  const body = route.legs[0].points;

  // vyberieme 8 rovnomerne rozlozenych bodov trasy
  const vzorka = [];
  const krok = (body.length - 1) / 7;
  for (let i = 0; i < 8; i++) {
    const p = body[Math.round(i * krok)];
    vzorka.push(`${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`);
  }

  const ulice = [];
  for (const g of route.guidance?.instructions ?? []) {
    const u = g.street || g.roadNumbers?.[0];
    if (u && ulice[ulice.length - 1] !== u) ulice.push(u);
  }

  console.log(`\n=== ${nazov} ===`);
  console.log(`dlzka ${(route.summary.lengthInMeters / 1000).toFixed(2)} km, ` +
              `cas ${(route.summary.travelTimeInSeconds / 60).toFixed(1)} min, ` +
              `bodov trasy: ${body.length}`);
  console.log(`ulice: ${ulice.join(" → ")}`);
  console.log(`MAPA: https://www.google.com/maps/dir/${vzorka.join("/")}`);
}

(async () => {
  await trasa(KRASNA, MESTO, "DO MESTA (z Krasnej)");
  await pauza(1500);
  await trasa(MESTO, KRASNA, "DO KRASNEJ (z mesta)");
})();
