// Meranie dopravy na Slaneckej ceste (Kosice).
//   1) FLOW  - bodova rychlost na segmente (Traffic Flow API)
//   2) TRASA - cas prejazdu celym usekom (Routing API)

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) {
  console.error("Chyba: chyba secret TOMTOM_API_KEY");
  process.exit(1);
}

const KRASNA = { lat: 48.668514, lon: 21.319647 };
const MESTO  = { lat: 48.689744, lon: 21.280667 };
const STRED  = { lat: 48.6824, lon: 21.2904 };
const OFFSET = { lat: 0.00013, lon: 0.0002 };
const PRIEBEZNY_BOD = true;

const BODY = {
  toCity:   { lat: STRED.lat + OFFSET.lat, lon: STRED.lon + OFFSET.lon },
  toKrasna: { lat: STRED.lat - OFFSET.lat, lon: STRED.lon - OFFSET.lon },
};
const NAZVY = {
  toCity: "smer do mesta (z Krasnej)",
  toKrasna: "smer do Krasnej (z mesta)",
};
const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

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
    travelTime: d.currentTravelTime,
    freeFlowTime: d.freeFlowTravelTime,
    confidence: d.confidence,
    closed: d.roadClosure === true,
  };
}

async function meraj_trasu(zaciatok, koniec) {
  const cesta = PRIEBEZNY_BOD
    ? `${bod(zaciatok)}:${bod(STRED)}:${bod(koniec)}`
    : `${bod(zaciatok)}:${bod(koniec)}`;
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${cesta}/json` +
    `?traffic=true&computeTravelTimeFor=all&travelMode=car&routeType=fastest&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing HTTP ${res.status}: ${await res.text()}`);
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
    try {
      const [od, kam] = smer === "toCity" ? [KRASNA, MESTO] : [MESTO, KRASNA];
      const r = await meraj_trasu(od, kam);
      entry[smer].trasa = r;
      console.log(
        `${NAZVY[smer]} | trasa: ${(r.cas / 60).toFixed(1)} min ` +
        `(volne ${(r.casBezDopravy / 60).toFixed(1)}, zdrzanie ${r.zdrzanie}s, ` +
        `dlzka ${(r.dlzka / 1000).toFixed(2)} km)`
      );
    } catch (e) {
      entry[smer].trasa = { error: true };
      console.error(`${NAZVY[smer]} | trasa: CHYBA - ${e.message}`);
    }
  }

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

  const csvFile = path.join(dataDir, "merania.csv");
  const HLAVICKA = [
    "cas_utc", "datum", "cas", "den_v_tyzdni",
    "do_mesta_rychlost", "do_mesta_volna", "do_mesta_stav",
    "do_mesta_cas_min", "do_mesta_volny_cas_min", "do_mesta_zdrzanie_min", "do_mesta_dlzka_km",
    "do_krasnej_rychlost", "do_krasnej_volna", "do_krasnej_stav",
    "do_krasnej_cas_min", "do_krasnej_volny_cas_min", "do_krasnej_zdrzanie_min", "do_krasnej_dlzka_km",
  ].join(";");

  const L = new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});

  const cislo = (v, des = 1) =>
    v == null || Number.isNaN(v) ? "" : v.toFixed(des).replace(".", ",");

  function stlpce(m) {
    const out = [];
    if (!m || m.error) out.push("", "", "chyba");
    else if (m.closed || m.freeFlow === 0) out.push("", "", "uzavera");
    else {
      const p = m.speed / m.freeFlow;
      out.push(m.speed, m.freeFlow,
        p >= 0.85 ? "plynula" : p >= 0.6 ? "spomalena" : "kolona");
    }
    const t = m && m.trasa;
    if (!t || t.error) out.push("", "", "", "");
    else out.push(
      cislo(t.cas / 60), cislo(t.casBezDopravy / 60),
      cislo(t.zdrzanie / 60), cislo(t.dlzka / 1000, 2)
    );
    return out;
  }

  const riadok = [
    entry.t,
    `${L.day}.${L.month}.${L.year}`,
    `${L.hour}:${L.minute}`,
    L.weekday.replace(".", ""),
    ...stlpce(entry.toCity),
    ...stlpce(entry.toKrasna),
  ].join(";");

  if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, "\uFEFF" + HLAVICKA + "\n");
  fs.appendFileSync(csvFile, riadok + "\n");

  console.log(`Zapisane: ${path.basename(monthFile)} (${arr.length} merani), merania.csv`);
})();
