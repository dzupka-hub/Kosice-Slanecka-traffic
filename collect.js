// Meranie dopravy na Slaneckej (Kosice) - Krasna <-> most, 3,65 km.
//
// Trasa je zafixovana cez supportingPoints, takze TomTom ju nepocita,
// ale iba vyhodnoti cas po presne zadanej ceste. Oba smery idu po tej
// istej trase, len obratene - vysledky su tak priamo porovnatelne.
//
// Vystup: data/RRRR-MM.json, data/latest.json, data/merania.csv

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) {
  console.error("Chyba: chyba secret TOMTOM_API_KEY");
  process.exit(1);
}

// Trasa po Slaneckej od Krasnej k mostu (poradie je dolezite)
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

// Bod pre bodove meranie rychlosti (stred useku) - sluzi ako kontrolka uzavery
const STRED  = { lat: 48.6824, lon: 21.2904 };
const OFFSET = { lat: 0.00013, lon: 0.0002 };
const BODY = {
  toCity:   { lat: STRED.lat + OFFSET.lat, lon: STRED.lon + OFFSET.lon },
  toKrasna: { lat: STRED.lat - OFFSET.lat, lon: STRED.lon - OFFSET.lon },
};

const NAZVY = {
  toCity: "smer do mesta (z Krasnej)",
  toKrasna: "smer do Krasnej (z mesta)",
};

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const pauza = ms => new Promise(r => setTimeout(r, ms));

async function meraj_flow(point) {
  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
    `?point=${bod(point)}&unit=KMPH&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Flow HTTP ${res.status}`);
  const d = (await res.json()).flowSegmentData;
  return {
    speed: d.currentSpeed,
    freeFlow: d.freeFlowSpeed,
    confidence: d.confidence,
    closed: d.roadClosure === true,
  };
}

async function meraj_trasu(body) {
  const od = body[0], kam = body[body.length - 1];
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${bod(od)}:${bod(kam)}/json` +
    `?traffic=true&computeTravelTimeFor=all&travelMode=car&key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supportingPoints: body.map(p => ({ latitude: p.lat, longitude: p.lon })),
    }),
  });
  if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
  const s = (await res.json()).routes[0].summary;
  return {
    cas: s.travelTimeInSeconds,
    casBezDopravy: s.noTrafficTravelTimeInSeconds,
    casObvykly: s.historicTrafficTravelTimeInSeconds,
    zdrzanie: s.trafficDelayInSeconds,
    dlzka: s.lengthInMeters,
  };
}

(async () => {
  const now = new Date();
  const entry = { t: now.toISOString() };

  for (const smer of ["toCity", "toKrasna"]) {
    entry[smer] = {};

    try {
      const f = await meraj_flow(BODY[smer]);
      Object.assign(entry[smer], f);
      console.log(`${NAZVY[smer]} | bod: ${f.speed}/${f.freeFlow} km/h`);
    } catch (e) {
      entry[smer].error = true;
      console.error(`${NAZVY[smer]} | bod: CHYBA - ${e.message}`);
    }
    await pauza(500);

    try {
      const body = smer === "toCity" ? TRASA : [...TRASA].reverse();
      const r = await meraj_trasu(body);
      entry[smer].trasa = r;
      console.log(
        `${NAZVY[smer]} | trasa: ${(r.cas / 60).toFixed(1)} min ` +
        `(volne ${(r.casBezDopravy / 60).toFixed(1)}, obvykle ${(r.casObvykly / 60).toFixed(1)}, ` +
        `${(r.dlzka / 1000).toFixed(2)} km)`
      );
    } catch (e) {
      entry[smer].trasa = { error: true };
      console.error(`${NAZVY[smer]} | trasa: CHYBA - ${e.message}`);
    }
    await pauza(500);
  }

  // ---------------------------- JSON ----------------------------
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const monthFile = path.join(
    dataDir,
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}.json`
  );
  const arr = fs.existsSync(monthFile)
    ? JSON.parse(fs.readFileSync(monthFile, "utf8"))
    : [];
  arr.push(entry);
  fs.writeFileSync(monthFile, JSON.stringify(arr));
  fs.writeFileSync(path.join(dataDir, "latest.json"), JSON.stringify(entry, null, 2));

  // ----------------------------- CSV ----------------------------
  const csvFile = path.join(dataDir, "merania.csv");
  const HLAVICKA = [
    "cas_utc", "datum", "cas", "den_v_tyzdni",
    "do_mesta_cas_min", "do_mesta_volny_cas_min", "do_mesta_obvykly_cas_min",
    "do_mesta_zdrzanie_min", "do_mesta_rychlost_kmh", "do_mesta_stav",
    "do_krasnej_cas_min", "do_krasnej_volny_cas_min", "do_krasnej_obvykly_cas_min",
    "do_krasnej_zdrzanie_min", "do_krasnej_rychlost_kmh", "do_krasnej_stav",
    "dlzka_km",
  ].join(";");

  const L = new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});

  const cislo = (v, des = 1) =>
    v == null || Number.isNaN(v) ? "" : v.toFixed(des).replace(".", ",");

  function stlpce(m) {
    const t = m && m.trasa;
    const out = [];
    if (!t || t.error) out.push("", "", "", "");
    else out.push(
      cislo(t.cas / 60), cislo(t.casBezDopravy / 60),
      cislo(t.casObvykly / 60), cislo(t.zdrzanie / 60)
    );
    // rychlost usekom + stav podla pomeru k volnemu prejazdu
    if (!t || t.error) out.push("", m && m.closed ? "uzavera" : "chyba");
    else {
      const kmh = (t.dlzka / 1000) / (t.cas / 3600);
      const p = t.casBezDopravy / t.cas;
      out.push(cislo(kmh, 0),
        m && m.closed ? "uzavera"
          : p >= 0.85 ? "plynula" : p >= 0.6 ? "spomalena" : "kolona");
    }
    return out;
  }

  const dlzka = entry.toCity?.trasa?.dlzka ?? entry.toKrasna?.trasa?.dlzka;
  const riadok = [
    entry.t,
    `${L.day}.${L.month}.${L.year}`,
    `${L.hour}:${L.minute}`,
    L.weekday.replace(".", ""),
    ...stlpce(entry.toCity),
    ...stlpce(entry.toKrasna),
    dlzka ? cislo(dlzka / 1000, 2) : "",
  ].join(";");

  if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, "\uFEFF" + HLAVICKA + "\n");
  fs.appendFileSync(csvFile, riadok + "\n");

  console.log(`Zapisane: ${path.basename(monthFile)} (${arr.length} merani), merania.csv`);
})();
