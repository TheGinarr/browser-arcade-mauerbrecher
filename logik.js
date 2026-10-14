/* ============================================================
   MAUERBRECHER · logik.js
   ------------------------------------------------------------
   Reine Rechenfunktionen (kein DOM, in Node testbar):
   Level-Karten, Abprallwinkel, Ball-Stein-Kollision mit Substeps,
   Tempo-Stufen und Power-ups.

   Koordinaten: logisches Feld FELD_BREITE x FELD_HOEHE Pixel.
   Oben ein schmaler Anzeigestreifen, darunter die Deckenwand,
   links und rechts Seitenwände (WAND Pixel dick).
   ============================================================ */

export const FELD_BREITE = 480;
export const FELD_HOEHE = 560;
export const WAND = 10;                     // Dicke der Seiten- und Deckenwand
export const ANZEIGE_HOEHE = 30;            // Streifen oben für Punkte/Level (wie am Automaten)
export const DECKE = ANZEIGE_HOEHE + WAND;  // Unterkante der Deckenwand = oberer Spielrand

// Steinraster: 12 Spalten
export const SPALTEN = 12;
export const STEIN_BREITE = 36;
export const STEIN_HOEHE = 14;
export const STEIN_LUECKE = 2;
export const STEIN_OBEN = DECKE + 34;       // Abstand der obersten Steinreihe zur Decke

// Schläger
export const SCHLAEGER_BREITE = 76;
export const SCHLAEGER_HOEHE = 10;
export const SCHLAEGER_Y = FELD_HOEHE - 46;
export const SCHRUMPF_FAKTOR = 0.6;         // nach dem ersten Deckentreffer
export const BREIT_FAKTOR = 1.5;            // Power-up "Breit"

// Ball und Tempo
export const BALL_RADIUS = 5;
export const TEMPO_START = 280;             // px/s in Level 1
export const TEMPO_PRO_LEVEL = 16;
export const TEMPO_MAX = 600;
export const STUFEN_FAKTOR = 0.09;          // +9 % je Tempo-Stufe
export const LANGSAM_FAKTOR = 0.7;          // Power-up "Langsam"
export const MAX_ABPRALL_GRAD = 60;
export const MIN_VERTIKAL = 0.28;
export const MAX_TEILSCHRITT = 4;

/* ---------- Steinarten ----------
   Zeichen in den Karten:
     r o g y  Farbbänder rot, orange, grün, gelb (1 Treffer)
     H        harter Stein (2 Treffer)
     X        Panzerstein (3 Treffer)
     #        unzerstörbar
     .        leer                                             */
export const STEINARTEN = {
  r: { punkte: 70, treffer: 1, band: 0 },
  o: { punkte: 50, treffer: 1, band: 1 },
  g: { punkte: 30, treffer: 1, band: 2 },
  y: { punkte: 10, treffer: 1, band: 3 },
  H: { punkte: 60, treffer: 2 },
  X: { punkte: 100, treffer: 3 },
  "#": { punkte: 0, treffer: Infinity, fest: true },
};

/* ---------- Die 12 festen Level ----------
   Jede Zeile hat genau 12 Zeichen. Danach geht es endlos weiter:
   Die Karten wiederholen sich, der Ball wird von Level zu Level
   schneller. */
export const LEVEL = [
  { name: "Klassik", karte: [
    "rrrrrrrrrrrr", "rrrrrrrrrrrr", "oooooooooooo", "oooooooooooo",
    "gggggggggggg", "gggggggggggg", "yyyyyyyyyyyy", "yyyyyyyyyyyy"] },
  { name: "Pyramide", karte: [
    ".....rr.....", "....rrrr....", "...oooooo...", "..oooooooo..",
    ".gggggggggg.", "gggggggggggg", "yyyyyyyyyyyy"] },
  { name: "Lücken", karte: [
    "r.r.r.r.r.r.", ".r.r.r.r.r.r", "o.o.o.o.o.o.", ".o.o.o.o.o.o",
    "g.g.g.g.g.g.", ".g.g.g.g.g.g", "y.y.y.y.y.y.", ".y.y.y.y.y.y"] },
  { name: "Festung", karte: [
    "HHHHHHHHHHHH", "H..........H", "H.rrrrrrrr.H", "H.oooooooo.H",
    "H.gggggggg.H", "H..........H", "yyyy....yyyy"] },
  { name: "Säulen", karte: [
    "rr.#rrrr#.rr", "oo.#oooo#.oo", "gg.#gggg#.gg", "yy.#yyyy#.yy",
    "yy........yy"] },
  { name: "Raute", karte: [
    ".....HH.....", "....rrrr....", "...oooooo...", "..gggggggg..",
    "...yyyyyy...", "....oooo....", ".....rr....."] },
  { name: "Wellen", karte: [
    "rr....rr....", "oorr..oorr..", "..oorr..oorr", "gg..oogg..oo",
    "yygg..yygg..", "..yygg..yygg", "....yy....yy"] },
  { name: "Tore", karte: [
    "rrrrrrrrrrrr", "oooooooooooo", "##...##...##", "gggggggggggg",
    "yyyyyyyyyyyy", "#....##....#"] },
  { name: "Panzer", karte: [
    "HrHrHrHrHrHr", "rHrHrHrHrHrH", "HoHoHoHoHoHo", "gHgHgHgHgHgH",
    "yyyyyyyyyyyy"] },
  { name: "Herz", karte: [
    "..rr....rr..", ".rrrr..rrrr.", "rrrrrrrrrrrr", "oooooooooooo",
    ".gggggggggg.", "..gggggggg..", "...yyyyyy...", "....yyyy....", ".....yy....."] },
  { name: "Labyrinth", karte: [
    "#rrrrrrrrrr#", "#oooooooooo#", "##..####..##", "gggggggggggg",
    "#..##..##..#", "yyyyyyyyyyyy"] },
  { name: "Finale", karte: [
    "XXXXXXXXXXXX", "rrrrrrrrrrrr", "#HHH#..#HHH#", "oooooooooooo",
    "gg##gggg##gg", "yyyyyyyyyyyy"] },
];

/** Karte des Levels (ab Level 13 wiederholen sich die Karten). */
export function karteFuer(level) {
  return LEVEL[(level - 1) % LEVEL.length];
}

/** Baut aus einer Karte die Liste der Steine. */
export function steineAusKarte(karte) {
  const gesamt = SPALTEN * STEIN_BREITE + (SPALTEN - 1) * STEIN_LUECKE;
  const links = (FELD_BREITE - gesamt) / 2;
  const steine = [];
  karte.forEach((zeile, reihe) => {
    [...zeile].forEach((zeichen, spalte) => {
      const art = STEINARTEN[zeichen];
      if (!art) return;
      steine.push({
        x: links + spalte * (STEIN_BREITE + STEIN_LUECKE),
        y: STEIN_OBEN + reihe * (STEIN_HOEHE + STEIN_LUECKE),
        b: STEIN_BREITE,
        h: STEIN_HOEHE,
        zeichen,
        punkte: art.punkte,
        rest: art.treffer,          // verbleibende Treffer
        fest: Boolean(art.fest),
        band: art.band ?? null,
        lebt: true,
      });
    });
  });
  return steine;
}

/** Sind alle zerstörbaren Steine weg? */
export function levelGeschafft(steine) {
  return steine.every((s) => !s.lebt || s.fest);
}

/* ---------- Tempo ---------- */

/** Grundtempo des Levels: 280, je Level +16, höchstens 520. */
export function ballTempo(level) {
  return Math.min(520, TEMPO_START + (level - 1) * TEMPO_PRO_LEVEL);
}

/**
 * Tatsächliches Tempo: Grundtempo, plus 9 % je Stufe, mal 0,7 bei
 * "Langsam". Stufen gibt es (wie bei den Automaten der 70er) nach dem
 * 4. und 12. Treffer und beim ersten Treffer im orangen und roten Band.
 */
export function effektivesTempo(level, stufe, langsam) {
  const t = ballTempo(level) * (1 + stufe * STUFEN_FAKTOR) * (langsam ? LANGSAM_FAKTOR : 1);
  return Math.min(TEMPO_MAX, t);
}

/**
 * Prüft nach einem Treffer, ob eine neue Tempo-Stufe fällig ist.
 * zustand = { treffer, rotErreicht, orangeErreicht, stufe } wird verändert.
 * Gibt true zurück, wenn die Stufe gestiegen ist.
 */
export function tempoNachTreffer(zustand, stein) {
  const vorher = zustand.stufe;
  zustand.treffer += 1;
  if (zustand.treffer === 4 || zustand.treffer === 12) zustand.stufe += 1;
  if (stein.band === 1 && !zustand.orangeErreicht) { zustand.orangeErreicht = true; zustand.stufe += 1; }
  if (stein.band === 0 && !zustand.rotErreicht) { zustand.rotErreicht = true; zustand.stufe += 1; }
  return zustand.stufe > vorher;
}

/* ---------- Geometrie ---------- */

export function begrenze(wert, min, max) {
  return Math.min(max, Math.max(min, wert));
}

/** Abprallwinkel am Schläger: Mitte = senkrecht, Rand = flach (±60°). */
export function abprallWinkel(ballX, schlaegerMitte, schlaegerBreite, maxGrad = MAX_ABPRALL_GRAD) {
  const t = begrenze((ballX - schlaegerMitte) / (schlaegerBreite / 2), -1, 1);
  return t * (maxGrad * Math.PI) / 180;
}

/** Winkel (von der Senkrechten) und Tempo in vx/vy umrechnen. */
export function richtungAusWinkel(winkel, tempo) {
  return { vx: tempo * Math.sin(winkel), vy: -tempo * Math.cos(winkel) };
}

/** Tempo normieren und einen Mindestanteil nach oben/unten erzwingen. */
export function normiereTempo(vx, vy, tempo) {
  const betrag = Math.hypot(vx, vy);
  if (betrag === 0) return { vx: 0, vy: -tempo };
  let nx = (vx / betrag) * tempo;
  let ny = (vy / betrag) * tempo;
  const mindestVy = MIN_VERTIKAL * tempo;
  if (Math.abs(ny) < mindestVy) {
    ny = (ny <= 0 ? -1 : 1) * mindestVy;
    nx = (nx < 0 ? -1 : 1) * Math.sqrt(tempo * tempo - ny * ny);
  }
  return { vx: nx, vy: ny };
}

/** Berührt der Ball (Kreis) den Stein (Rechteck)? Liefert die Achse oder null. */
export function kollisionBallStein(ball, stein) {
  const nx = begrenze(ball.x, stein.x, stein.x + stein.b);
  const ny = begrenze(ball.y, stein.y, stein.y + stein.h);
  const dx = ball.x - nx;
  const dy = ball.y - ny;
  if (dx * dx + dy * dy > ball.r * ball.r) return null;
  const ueberX = Math.min(ball.x + ball.r - stein.x, stein.x + stein.b - (ball.x - ball.r));
  const ueberY = Math.min(ball.y + ball.r - stein.y, stein.y + stein.h - (ball.y - ball.r));
  return { achse: ueberX < ueberY ? "seite" : "oben-unten" };
}

export function findeStein(ball, steine) {
  let bester = null;
  let besterAbstand = Infinity;
  for (const stein of steine) {
    if (!stein.lebt) continue;
    const treffer = kollisionBallStein(ball, stein);
    if (!treffer) continue;
    const abstand = (ball.x - (stein.x + stein.b / 2)) ** 2 + (ball.y - (stein.y + stein.h / 2)) ** 2;
    if (abstand < besterAbstand) {
      besterAbstand = abstand;
      bester = { stein, achse: treffer.achse };
    }
  }
  return bester;
}

export function trifftSchlaeger(ball, s) {
  if (ball.vy <= 0) return false;
  return ball.y + ball.r >= s.y
    && ball.y <= s.y + s.h / 2
    && ball.x + ball.r >= s.x - s.b / 2
    && ball.x - ball.r <= s.x + s.b / 2;
}

/**
 * Bewegt EINEN Ball um dt Sekunden (in Teilschritten gegen Tunneling)
 * und liefert Ereignisse:
 *   { typ: "wand" } | { typ: "decke" } | { typ: "schlaeger" }
 *   { typ: "stein", stein, zerstoert } | { typ: "unten" }
 * welt = { schlaeger, steine, tempo }
 */
export function bewegeBall(welt, ball, dt) {
  const { schlaeger, steine } = welt;
  const ereignisse = [];
  const strecke = Math.hypot(ball.vx, ball.vy) * dt;
  const teilschritte = Math.max(1, Math.ceil(strecke / MAX_TEILSCHRITT));
  const teilDt = dt / teilschritte;
  let steinGetroffen = false;

  for (let i = 0; i < teilschritte; i++) {
    ball.x += ball.vx * teilDt;
    ball.y += ball.vy * teilDt;

    let wand = false;
    if (ball.x - ball.r < WAND) { ball.x = WAND + ball.r; ball.vx = Math.abs(ball.vx); wand = true; }
    else if (ball.x + ball.r > FELD_BREITE - WAND) { ball.x = FELD_BREITE - WAND - ball.r; ball.vx = -Math.abs(ball.vx); wand = true; }
    if (ball.y - ball.r < DECKE) {
      ball.y = DECKE + ball.r;
      ball.vy = Math.abs(ball.vy);
      wand = true;
      ereignisse.push({ typ: "decke" });
    }
    if (wand) {
      Object.assign(ball, normiereTempo(ball.vx, ball.vy, welt.tempo));
      ereignisse.push({ typ: "wand" });
    }

    if (trifftSchlaeger(ball, schlaeger)) {
      ball.y = schlaeger.y - ball.r;
      Object.assign(ball, richtungAusWinkel(abprallWinkel(ball.x, schlaeger.x, schlaeger.b), welt.tempo));
      ereignisse.push({ typ: "schlaeger" });
      return ereignisse;      // Rest des Frames verfällt: Das Spiel darf den Ball festhalten (Kleben)
    }

    if (!steinGetroffen) {
      const treffer = findeStein(ball, steine);
      if (treffer) {
        steinGetroffen = true;
        const { stein, achse } = treffer;
        let zerstoert = false;
        if (!stein.fest) {
          stein.rest -= 1;
          if (stein.rest <= 0) { stein.lebt = false; zerstoert = true; }
        }
        if (achse === "seite") {
          const links = ball.x < stein.x + stein.b / 2;
          ball.vx = (links ? -1 : 1) * Math.abs(ball.vx);
          ball.x = links ? stein.x - ball.r : stein.x + stein.b + ball.r;
        } else {
          const oben = ball.y < stein.y + stein.h / 2;
          ball.vy = (oben ? -1 : 1) * Math.abs(ball.vy);
          ball.y = oben ? stein.y - ball.r : stein.y + stein.h + ball.r;
        }
        Object.assign(ball, normiereTempo(ball.vx, ball.vy, welt.tempo));
        ereignisse.push({ typ: "stein", stein, zerstoert });
      }
    }

    if (ball.y - ball.r > FELD_HOEHE) {
      ereignisse.push({ typ: "unten" });
      return ereignisse;
    }
  }
  return ereignisse;
}

/* ---------- Power-ups ----------
   Fällt aus einem zerstörten Stein mit einer gewissen Chance.
   B = breiter Schläger, M = Mehrfachball, L = langsamer Ball,
   K = Klebeschläger, + = Extraleben (selten). */
export const POWERUPS = {
  B: { name: "Breit", dauer: 15, gewicht: 30 },
  M: { name: "Mehrfachball", dauer: 0, gewicht: 24 },
  L: { name: "Langsam", dauer: 12, gewicht: 22 },
  K: { name: "Kleben", dauer: 15, gewicht: 18 },
  "+": { name: "Extraleben", dauer: 0, gewicht: 6 },
};
export const POWERUP_CHANCE = 0.13;
export const POWERUP_TEMPO = 120;   // Fallgeschwindigkeit px/s

/** Würfelt, ob und welches Power-up ein zerstörter Stein freigibt. */
export function powerupWuerfeln(zufall) {
  if (zufall() >= POWERUP_CHANCE) return null;
  const summe = Object.values(POWERUPS).reduce((s, p) => s + p.gewicht, 0);
  let wurf = zufall() * summe;
  for (const [art, p] of Object.entries(POWERUPS)) {
    wurf -= p.gewicht;
    if (wurf < 0) return art;
  }
  return "B";
}

/** Fängt der Schläger die fallende Kapsel (24 x 10 px, Mitte x/y)? */
export function kapselGefangen(kapsel, s) {
  return kapsel.y + 5 >= s.y && kapsel.y - 5 <= s.y + s.h
    && kapsel.x + 12 >= s.x - s.b / 2 && kapsel.x - 12 <= s.x + s.b / 2;
}
