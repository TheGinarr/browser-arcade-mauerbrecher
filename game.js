/* ============================================================
   MAUERBRECHER · game.js
   ------------------------------------------------------------
   SO FUNKTIONIERT DIESES SPIEL
   1. Zustand: Schläger, eine LISTE von Bällen (wegen Mehrfachball),
      die Steine des aktuellen Levels, fallende Power-up-Kapseln und
      eine "phase" (bereit / laeuft / pause / vorbei).
   2. Reine Logik in logik.js: Level-Karten, Abprallwinkel, Kollision
      mit Teilschritten, Tempo-Stufen, Power-up-Würfel. Hier liegen
      Eingabe, Spielschleife und Zeichnen.
   3. Level: 12 feste Karten aus Textzeilen (siehe LEVEL in logik.js),
      danach endlos mit steigendem Tempo. Erreichte Level lassen sich
      über die Level-Auswahl (assets/levelwahl.js) direkt starten.
   4. Regeln aus der Automaten-Zeit: Der Ball wird nach dem 4. und
      12. Treffer schneller und beim ersten Treffer im orangen und im
      roten Band. Trifft er zum ersten Mal die Decke, schrumpft der
      Schläger. Beides gilt bis zum nächsten Level oder Ballverlust.
   5. Look: flache Farbbänder, graue Wände, eckiger Ball, keine
      Leuchteffekte, so wie Ende der 70er. Rahmen, HUD und Knöpfe
      außerhalb des Canvas bleiben im Neon-Design der Seite.
   6. Ende: Sind alle Leben weg, übernimmt gameOverDialog() aus ui.js.
   ============================================================ */

import { topliste, spielZuruecksetzen } from "./assets/storage.js";
import { bewegungReduziert, gameOverDialog, toplisteAnzeigen, zahlHochzaehlen } from "./assets/ui.js";
import { spielSeite, text, TASTE } from "./assets/mobil.js";
import { levelWahl } from "./assets/levelwahl.js";
import {
  FELD_BREITE, FELD_HOEHE, WAND, ANZEIGE_HOEHE, DECKE,
  SCHLAEGER_BREITE, SCHLAEGER_HOEHE, SCHLAEGER_Y, SCHRUMPF_FAKTOR, BREIT_FAKTOR,
  BALL_RADIUS, LEVEL, POWERUPS, POWERUP_TEMPO,
  karteFuer, steineAusKarte, levelGeschafft, effektivesTempo, tempoNachTreffer,
  begrenze, richtungAusWinkel, normiereTempo, bewegeBall, powerupWuerfeln, kapselGefangen,
} from "./logik.js";

/* ---------- Konstanten ---------- */
const SPIEL = "mauerbrecher";
const LEBEN_START = 3;
const SCHLAEGER_TEMPO = 480;          // px/s bei Tastatursteuerung
const MAX_DT = 0.05;
const PUNKTE_LEVELBONUS = 200;
const MAX_BAELLE = 6;

/* ---------- Farben der Ära ----------
   Bewusst feste Werte statt Design-Tokens: Im Spielfeld gilt der flache
   Automaten-Look. Nur Schriften kommen aus dem Design. */
const stil = getComputedStyle(document.body);
const farben = {
  grund: "#000000",
  wand: "#8e8e96",
  text: "#f2f2f2",
  gedaempft: "#b9b9c4",
  schlaeger: "#3d8be0",
  ball: "#f4f4f4",
  baender: ["#d6493a", "#d9822b", "#3fa652", "#c7c23a"],   // rot, orange, grün, gelb
  hart: "#b8bccb",
  panzer: "#c99a3c",
  fest: "#5b606e",
  kapsel: { B: "#3d8be0", M: "#d6493a", L: "#3fa652", K: "#c7c23a", "+": "#e05aa8" },
  schriftPixel: stil.getPropertyValue("--pixel").trim() || "monospace",
  schriftText: stil.getPropertyValue("--sans").trim() || "sans-serif",
};

/* ---------- Elemente ---------- */
const leinwand = document.getElementById("leinwand");
const z = leinwand.getContext("2d");
const hudPunkte = document.getElementById("hud-punkte");
const hudLeben = document.getElementById("hud-leben");
const hudLevel = document.getElementById("hud-level");
const hudRekord = document.getElementById("hud-rekord");
const toplisteBox = document.getElementById("topliste");
const resetKnopf = document.getElementById("reset");
leinwand.width = FELD_BREITE;
leinwand.height = FELD_HOEHE;
leinwand.style.touchAction = "none";

/* ---------- Zustand ---------- */
let phase;            // "bereit" | "laeuft" | "pause" | "vorbei"
let welt;             // { schlaeger, steine, tempo }
let baelle = [];      // [{ x, y, vx, vy, r, klebt: null | Versatz zur Schlägermitte }]
let kapseln = [];     // fallende Power-ups [{ x, y, art }]
let partikel = [];
let punkte = 0, leben = LEBEN_START, level = 1, startLevel = 1;
let tempoZustand;     // { treffer, stufe, orangeErreicht, rotErreicht }
let geschrumpft = false;
let effekte = { breit: 0, langsam: 0, kleben: 0 };   // Restzeit in Sekunden
let rekordGespeichert = 0;
let banner = "", bannerRest = 0;
let letzteZeit = 0;
let dialogGezeigt = false;
let ruhigerModus = bewegungReduziert();
const taste = { links: false, rechts: false };

/* ============================================================
   HUD
   ============================================================ */
function toplisteAktualisieren() {
  const liste = topliste(SPIEL);
  rekordGespeichert = liste.length ? liste[0].punkte : 0;
  toplisteAnzeigen(toplisteBox, SPIEL, (p) => `${p} Punkte`);
}
function hudAktualisieren() {
  zahlHochzaehlen(hudPunkte, punkte, 250);
  hudLeben.textContent = String(leben);
  hudLevel.textContent = String(level);
  hudRekord.textContent = String(Math.max(rekordGespeichert, punkte));
}

/* ============================================================
   Spielablauf
   ============================================================ */
function schlaegerBreite() {
  return SCHLAEGER_BREITE * (effekte.breit > 0 ? BREIT_FAKTOR : 1) * (geschrumpft ? SCHRUMPF_FAKTOR : 1);
}

function tempoAktualisieren() {
  welt.tempo = effektivesTempo(level, tempoZustand.stufe, effekte.langsam > 0);
  for (const b of baelle) {
    if (b.klebt === null) Object.assign(b, normiereTempo(b.vx, b.vy, welt.tempo));
  }
}

function neuerBallAufSchlaeger() {
  baelle = [{ x: welt.schlaeger.x, y: SCHLAEGER_Y - BALL_RADIUS, vx: 0, vy: 0, r: BALL_RADIUS, klebt: 0 }];
}

/** Level aufbauen: Steine, Tempo-Stufen zurück, Ball auf den Schläger. */
function levelStarten(n) {
  level = n;
  welt.steine = steineAusKarte(karteFuer(level).karte);
  tempoZustand = { treffer: 0, stufe: 0, orangeErreicht: false, rotErreicht: false };
  geschrumpft = false;
  effekte = { breit: 0, langsam: 0, kleben: 0 };
  kapseln = [];
  welt.schlaeger.b = schlaegerBreite();
  tempoAktualisieren();
  neuerBallAufSchlaeger();
  phase = "bereit";
  const name = karteFuer(level).name;
  banner = level > LEVEL.length ? `LEVEL ${level} · ${name.toUpperCase()}+` : `LEVEL ${level} · ${name.toUpperCase()}`;
  bannerRest = 2.2;
  wahl.erreicht(level);
  wahl.aktiv(level);
  hudAktualisieren();
}

function neuesSpiel(ab = startLevel) {
  startLevel = ab;
  welt = { schlaeger: { x: FELD_BREITE / 2, y: SCHLAEGER_Y, b: SCHLAEGER_BREITE, h: SCHLAEGER_HOEHE }, steine: [], tempo: 0 };
  punkte = 0;
  leben = LEBEN_START;
  partikel = [];
  dialogGezeigt = false;
  toplisteAktualisieren();
  hudPunkte.textContent = "0";
  levelStarten(ab);
}

function punkteDazu(n) {
  punkte += n;
  hudAktualisieren();
}

/** Alle klebenden Bälle lösen (Abschuss). */
function abschiessen() {
  for (const b of baelle) {
    if (b.klebt === null) continue;
    // Winkel wie beim Schlägertreffer: Versatz zur Mitte bestimmt die Richtung,
    // beim allerersten Abschuss ein kleiner Zufall um die Senkrechte.
    const versatz = b.klebt === 0 ? (Math.random() * 2 - 1) * 0.25 : b.klebt / (welt.schlaeger.b / 2) * 1.05;
    Object.assign(b, richtungAusWinkel(begrenze(versatz, -1.05, 1.05), welt.tempo));
    b.klebt = null;
  }
  phase = "laeuft";
}

function ballVerloren() {
  leben -= 1;
  effekte = { breit: 0, langsam: 0, kleben: 0 };
  geschrumpft = false;
  kapseln = [];
  tempoZustand = { treffer: 0, stufe: 0, orangeErreicht: tempoZustand.orangeErreicht, rotErreicht: tempoZustand.rotErreicht };
  welt.schlaeger.b = schlaegerBreite();
  hudAktualisieren();
  if (leben <= 0) {
    phase = "vorbei";
    baelle = [];
  } else {
    tempoAktualisieren();
    neuerBallAufSchlaeger();
    phase = "bereit";
  }
}

function powerupAusloesen(art) {
  const p = POWERUPS[art];
  banner = p.name.toUpperCase();
  bannerRest = 1.2;
  if (art === "B") effekte.breit = p.dauer;
  else if (art === "L") effekte.langsam = p.dauer;
  else if (art === "K") effekte.kleben = p.dauer;
  else if (art === "+") { leben += 1; hudAktualisieren(); }
  else if (art === "M") {
    // Jeder fliegende Ball bekommt zwei Geschwister mit leicht anderem Winkel
    const neu = [];
    for (const b of baelle) {
      if (b.klebt !== null) continue;
      for (const dreh of [-0.45, 0.45]) {
        if (baelle.length + neu.length >= MAX_BAELLE) break;
        const w = Math.atan2(b.vx, -b.vy) + dreh;
        neu.push({ x: b.x, y: b.y, r: b.r, klebt: null, ...richtungAusWinkel(w, welt.tempo) });
      }
    }
    baelle.push(...neu);
  }
  welt.schlaeger.b = schlaegerBreite();
  schlaegerSetzen(welt.schlaeger.x);
  tempoAktualisieren();
}

function schlaegerSetzen(mitteX) {
  const halb = welt.schlaeger.b / 2;
  welt.schlaeger.x = begrenze(mitteX, WAND + halb, FELD_BREITE - WAND - halb);
}

/** Ein Frame Spiellogik. */
function logik(dt) {
  if (taste.links !== taste.rechts) {
    schlaegerSetzen(welt.schlaeger.x + (taste.rechts ? 1 : -1) * SCHLAEGER_TEMPO * dt);
  }
  // Klebende Bälle fahren mit dem Schläger
  for (const b of baelle) {
    if (b.klebt !== null) { b.x = welt.schlaeger.x + b.klebt; b.y = SCHLAEGER_Y - b.r; }
  }
  if (phase !== "laeuft") return;

  // Power-up-Zeiten ablaufen lassen
  let neuRechnen = false;
  for (const k of Object.keys(effekte)) {
    if (effekte[k] > 0) {
      effekte[k] = Math.max(0, effekte[k] - dt);
      if (effekte[k] === 0) neuRechnen = true;
    }
  }
  if (neuRechnen) {
    welt.schlaeger.b = schlaegerBreite();
    schlaegerSetzen(welt.schlaeger.x);
    tempoAktualisieren();
  }

  // Bälle bewegen
  for (const b of baelle) {
    if (b.klebt !== null) continue;
    for (const e of bewegeBall(welt, b, dt)) {
      if (e.typ === "unten") b.weg = true;
      else if (e.typ === "decke" && !geschrumpft) {
        geschrumpft = true;
        welt.schlaeger.b = schlaegerBreite();
        schlaegerSetzen(welt.schlaeger.x);
      } else if (e.typ === "schlaeger" && effekte.kleben > 0) {
        b.klebt = begrenze(b.x - welt.schlaeger.x, -welt.schlaeger.b / 2, welt.schlaeger.b / 2);
        b.vx = 0; b.vy = 0;
      } else if (e.typ === "stein") {
        steinGetroffen(e.stein, e.zerstoert);
      }
    }
  }
  baelle = baelle.filter((b) => !b.weg);

  // Kapseln fallen
  for (const k of kapseln) {
    k.y += POWERUP_TEMPO * dt;
    if (kapselGefangen(k, welt.schlaeger)) { k.weg = true; powerupAusloesen(k.art); }
    else if (k.y > FELD_HOEHE + 10) k.weg = true;
  }
  kapseln = kapseln.filter((k) => !k.weg);

  if (baelle.length === 0) ballVerloren();
  else if (levelGeschafft(welt.steine)) {
    punkteDazu(PUNKTE_LEVELBONUS);
    levelStarten(level + 1);
  }
}

function steinGetroffen(stein, zerstoert) {
  partikelErzeugen(stein, zerstoert ? 8 : 3);
  if (stein.fest) return;
  if (zerstoert) {
    punkteDazu(stein.punkte);
    const art = powerupWuerfeln(Math.random);
    if (art) kapseln.push({ x: stein.x + stein.b / 2, y: stein.y + stein.h / 2, art });
  }
  if (tempoNachTreffer(tempoZustand, stein)) tempoAktualisieren();
}

/* ---------- Dialog ---------- */
function dialogAnzeigen() {
  if (dialogGezeigt) return;
  dialogGezeigt = true;
  const dialog = gameOverDialog({
    spiel: SPIEL,
    titel: "GAME OVER",
    punkte,
    punkteText: `${punkte} Punkte`,
    richtung: "hoch",
    format: (p) => `${p} Punkte`,
    neustart: () => neuesSpiel(startLevel),
  });
  dialog.addEventListener("close", () => { toplisteAktualisieren(); hudAktualisieren(); });
}

/* ============================================================
   Eingabe
   ============================================================ */
function pauseUmschalten() {
  if (phase === "laeuft") phase = "pause";
  else if (phase === "pause") phase = "laeuft";
}

/** Leertaste, Enter, Klick: abschießen, weiter, Klebebälle lösen, neu beginnen. */
function bestaetigen() {
  if (phase === "bereit") abschiessen();
  else if (phase === "pause") phase = "laeuft";
  else if (phase === "laeuft" && baelle.some((b) => b.klebt !== null)) abschiessen();
  else if (phase === "vorbei" && dialogGezeigt && !document.getElementById("spiel-dialog")) neuesSpiel(startLevel);
}

const dialogOffen = () => Boolean(document.getElementById("spiel-dialog"));

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || dialogOffen()) return;
  const ziel = e.target;
  if (ziel instanceof HTMLElement && ziel.matches("input, textarea, select")) return;
  const t = e.key.toLowerCase();
  if (t === "p") { pauseUmschalten(); return; }
  const istLinks = t === "arrowleft" || t === "a";
  const istRechts = t === "arrowright" || t === "d";
  const istStart = t === " " || t === "enter";
  if (!istLinks && !istRechts && !istStart) return;
  if (istStart && ziel instanceof HTMLElement && ziel.matches("button, a, summary")) return;
  e.preventDefault();
  if (istLinks) taste.links = true;
  else if (istRechts) taste.rechts = true;
  else if (!e.repeat) bestaetigen();
});
document.addEventListener("keyup", (e) => {
  const t = e.key.toLowerCase();
  if (t === "arrowleft" || t === "a") taste.links = false;
  if (t === "arrowright" || t === "d") taste.rechts = false;
});
window.addEventListener("blur", () => { taste.links = false; taste.rechts = false; });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase === "laeuft") phase = "pause";
});

/* Maus/Finger: Schläger folgt der x-Position, Tippen ohne Ziehen = bestätigen */
function leinwandX(e) {
  const r = leinwand.getBoundingClientRect();
  return (e.clientX - r.left) * (FELD_BREITE / r.width);
}
let tippStart = null;
let hatGezogen = false;
leinwand.addEventListener("pointerdown", (e) => {
  tippStart = { x: e.clientX, y: e.clientY };
  hatGezogen = false;
  try { leinwand.setPointerCapture(e.pointerId); } catch { /* egal */ }
  if (e.pointerType !== "mouse" && (phase === "bereit" || phase === "laeuft")) schlaegerSetzen(leinwandX(e));
});
leinwand.addEventListener("pointermove", (e) => {
  if (dialogOffen()) return;
  if (e.pointerType !== "mouse" && !tippStart) return;
  if (tippStart && Math.hypot(e.clientX - tippStart.x, e.clientY - tippStart.y) > 10) hatGezogen = true;
  if (phase === "bereit" || phase === "laeuft") schlaegerSetzen(leinwandX(e));
});
leinwand.addEventListener("pointerup", () => {
  if (tippStart && !hatGezogen) bestaetigen();
  tippStart = null;
});
leinwand.addEventListener("pointercancel", () => { tippStart = null; });
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || e.target === leinwand || dialogOffen()) return;
  if (phase === "bereit" || phase === "laeuft") schlaegerSetzen(leinwandX(e));
});

resetKnopf.addEventListener("click", () => {
  spielZuruecksetzen(SPIEL);
  toplisteAktualisieren();
  wahl.neuLaden();
  hudAktualisieren();
  if (phase === "laeuft") phase = "pause";
  resetKnopf.blur();
});

/* ============================================================
   Partikel
   ============================================================ */
function steinFarbe(s) {
  if (s.fest) return farben.fest;
  if (s.zeichen === "H") return farben.hart;
  if (s.zeichen === "X") return farben.panzer;
  return farben.baender[s.band];
}
function partikelErzeugen(stein, menge) {
  if (ruhigerModus) return;
  const farbe = steinFarbe(stein);
  for (let i = 0; i < menge; i++) {
    const w = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 120;
    partikel.push({ x: stein.x + Math.random() * stein.b, y: stein.y + stein.h / 2, vx: Math.cos(w) * v, vy: Math.sin(w) * v + 40, leben: 1, farbe });
  }
}
function partikelBewegen(dt) {
  for (const p of partikel) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.leben -= dt * 2; }
  partikel = partikel.filter((p) => p.leben > 0);
}

/* ============================================================
   Zeichnen (flacher Automaten-Look)
   ============================================================ */
function zeichneWaende() {
  z.fillStyle = farben.wand;
  z.fillRect(0, ANZEIGE_HOEHE, WAND, FELD_HOEHE - ANZEIGE_HOEHE);
  z.fillRect(FELD_BREITE - WAND, ANZEIGE_HOEHE, WAND, FELD_HOEHE - ANZEIGE_HOEHE);
  z.fillRect(0, ANZEIGE_HOEHE, FELD_BREITE, WAND);
}

function zeichneAnzeige() {
  z.fillStyle = farben.text;
  z.font = `14px ${farben.schriftPixel}`;
  z.textBaseline = "middle";
  z.textAlign = "left";
  z.fillText(String(punkte).padStart(5, "0"), 12, ANZEIGE_HOEHE / 2 + 1);
  z.textAlign = "center";
  z.fillText(`L${String(level).padStart(2, "0")}`, FELD_BREITE / 2, ANZEIGE_HOEHE / 2 + 1);
  // Leben als kleine Quadrate rechts
  for (let i = 0; i < Math.min(leben, 8); i++) {
    z.fillRect(FELD_BREITE - 20 - i * 14, ANZEIGE_HOEHE / 2 - 4, 8, 8);
  }
}

function zeichneSteine() {
  for (const s of welt.steine) {
    if (!s.lebt) continue;
    const farbe = steinFarbe(s);
    z.fillStyle = farbe;
    z.fillRect(s.x, s.y, s.b, s.h);
    // dunklere Unterkante: minimale Tiefe, wie bei Röhrenmonitoren üblich
    z.fillStyle = "#00000055";
    z.fillRect(s.x, s.y + s.h - 3, s.b, 3);
    if (s.fest) {
      // schraffiert = unzerstörbar
      z.strokeStyle = "#2e3240";
      z.lineWidth = 2;
      z.beginPath();
      for (let x = s.x - s.h; x < s.x + s.b; x += 7) {
        z.moveTo(Math.max(s.x, x), Math.min(s.y + s.h, s.y + s.h - (Math.max(s.x, x) - x)));
        z.lineTo(Math.min(s.x + s.b, x + s.h), Math.max(s.y, s.y + s.h - (Math.min(s.x + s.b, x + s.h) - x)));
      }
      z.stroke();
    } else if (s.zeichen === "X") {
      z.fillStyle = "#5c4210";
      for (const dx of [5, s.b - 8]) z.fillRect(s.x + dx, s.y + 4, 3, 3);   // Nieten
    }
    // Risse bei angeschlagenen harten Steinen
    const voll = s.zeichen === "H" ? 2 : s.zeichen === "X" ? 3 : 1;
    if (!s.fest && s.rest < voll) {
      z.strokeStyle = "#000000aa";
      z.lineWidth = 1.5;
      z.beginPath();
      z.moveTo(s.x + s.b * 0.3, s.y);
      z.lineTo(s.x + s.b * 0.45, s.y + s.h * 0.5);
      z.lineTo(s.x + s.b * 0.35, s.y + s.h);
      if (s.rest < voll - 1) { z.moveTo(s.x + s.b * 0.7, s.y); z.lineTo(s.x + s.b * 0.6, s.y + s.h * 0.6); }
      z.stroke();
    }
  }
}

function zeichneKapseln() {
  z.font = `9px ${farben.schriftPixel}`;
  z.textAlign = "center";
  z.textBaseline = "middle";
  for (const k of kapseln) {
    z.fillStyle = farben.kapsel[k.art];
    z.fillRect(k.x - 12, k.y - 5, 24, 10);
    z.fillStyle = "#000";
    z.fillText(k.art, k.x, k.y + 1);
  }
}

function zeichneSchlaegerUndBaelle() {
  const s = welt.schlaeger;
  z.fillStyle = farben.schlaeger;
  z.fillRect(s.x - s.b / 2, s.y, s.b, s.h);
  if (effekte.kleben > 0) {
    z.fillStyle = farben.kapsel.K;
    z.fillRect(s.x - s.b / 2, s.y, s.b, 2);
  }
  z.fillStyle = farben.ball;
  for (const b of baelle) z.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);
}

function zeichnePartikel() {
  for (const p of partikel) {
    z.globalAlpha = Math.max(0, p.leben);
    z.fillStyle = p.farbe;
    z.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  z.globalAlpha = 1;
}

function zeichneEffekte() {
  // aktive Power-ups unten links mit Restzeit
  let x = WAND + 6;
  z.font = `10px ${farben.schriftPixel}`;
  z.textAlign = "left";
  z.textBaseline = "middle";
  for (const [art, schluessel] of [["B", "breit"], ["L", "langsam"], ["K", "kleben"]]) {
    if (effekte[schluessel] <= 0) continue;
    z.fillStyle = farben.kapsel[art];
    z.fillText(`${art} ${Math.ceil(effekte[schluessel])}`, x, FELD_HOEHE - 14);
    x += 56;
  }
}

function zeichneMittig(zeile1, zeile2, y, abdunkeln) {
  z.save();
  if (abdunkeln) {
    z.globalAlpha = 0.82;
    z.fillStyle = farben.grund;
    z.fillRect(0, DECKE, FELD_BREITE, FELD_HOEHE - DECKE);
    z.globalAlpha = 1;
  }
  z.textAlign = "center";
  z.textBaseline = "middle";
  z.fillStyle = farben.text;
  z.font = `16px ${farben.schriftPixel}`;
  z.fillText(zeile1, FELD_BREITE / 2, y);
  if (zeile2) {
    z.font = `15px ${farben.schriftText}`;
    z.fillText(zeile2, FELD_BREITE / 2, y + 30);
  }
  z.restore();
}

function zeichneAlles() {
  z.globalAlpha = 1;
  z.fillStyle = farben.grund;
  z.fillRect(0, 0, FELD_BREITE, FELD_HOEHE);
  zeichneAnzeige();
  zeichneWaende();
  zeichneSteine();
  zeichneKapseln();
  zeichnePartikel();
  zeichneSchlaegerUndBaelle();
  zeichneEffekte();

  const unterSteinen = Math.max(...welt.steine.map((s) => s.y + s.h), DECKE) + 60;
  if (phase === "bereit") {
    zeichneMittig(bannerRest > 0 ? banner : `LEVEL ${level}`,
      text("Leertaste oder Klick: abschießen", "Tippen oder ●: abschießen"), Math.min(unterSteinen, SCHLAEGER_Y - 90), false);
  } else if (phase === "pause") {
    zeichneMittig("PAUSE", text("P oder Klick: weiter", "Antippen: weiter"), FELD_HOEHE / 2, true);
  } else if (phase === "laeuft" && bannerRest > 0) {
    zeichneMittig(banner, "", Math.min(unterSteinen, SCHLAEGER_Y - 90), false);
  }
}

/* ============================================================
   Hauptschleife
   ============================================================ */
function einzelbild(jetzt) {
  const dt = Math.min((jetzt - letzteZeit) / 1000, MAX_DT);
  letzteZeit = jetzt;
  ruhigerModus = bewegungReduziert();
  if (phase === "laeuft" || phase === "bereit") logik(dt);
  if (phase !== "pause") {
    bannerRest = Math.max(0, bannerRest - dt);
    partikelBewegen(dt);
  }
  if (phase === "vorbei" && !dialogGezeigt) dialogAnzeigen();
  zeichneAlles();
  requestAnimationFrame(einzelbild);
}

/* ============================================================
   Start
   ============================================================ */
const wahl = levelWahl({
  spiel: SPIEL,
  namen: LEVEL.map((l) => l.name),
  nach: document.querySelector(".steuerung"),
  gesperrt: () => phase === "laeuft",
  beiWahl: (n) => neuesSpiel(n),
});
spielSeite({
  phase: () => phase,
  gamepad: {
    links: [{ ...TASTE.links, breit: true }, { ...TASTE.rechts, breit: true }],
    rechts: [{ ...TASTE.leer, name: "Abschießen", beschriftung: "LOS", gross: true }],
  },
});
neuesSpiel(1);
letzteZeit = performance.now();
requestAnimationFrame(einzelbild);
