/* Mythos breakdown-chip v1 — script-to-production parser.
 * PORTABLE: no dependencies, no DOM required for the pure core.
 * Other systems can load this one file and call the pure fns with
 * plain data. DOM helpers (readCanvas) are guarded and optional.
 *
 * INPUT:  paras = [{type, text}] where type is one of
 *   scene | action | character | parenthetical | dialogue | transition
 * Feed it from fromFountain(text), fromHtml(html), or readCanvas().
 *
 * INLINE TAG CONVENTION (inside action/dialogue text):
 *   [prop: manifest]  [w: grease-stained coveralls]  [makeup: scar]
 *   [vfx: salt glow]  [sfx: rain on roof]  [vehicle: idling truck]
 *   [animal: horse]  [stunt: barrier lift]  [sound: wire hum]
 *   [music: low drone]  [extra: market crowd]
 * A bare [manifest] with no colon counts as a prop.
 * Aliases: wardrobe=w, ward=w, sfx=sound? no — sfx and sound stay
 * separate (sfx = effects, sound = design/ambience). fx maps to vfx.
 *
 * OUTPUT: breakdown(paras) -> {
 *   spec, scenes: [{n, header, intExt, set, location, time,
 *     cast[], onSet[], dialogueLines, actionLines, words, estPages,
 *     props[], wardrobe[], makeup[], vfx[], sfx[], vehicles[],
 *     animals[], stunts[], sound[], music[], extras[], transitions[]}],
 *   sets[], cast[], totals: {scenes, words, estPages, ...}
 * }
 * onSet = speakers + CAPS names mentioned in the scene (must be
 * available that day). extras come ONLY from [extra:] tags — a head
 * count cannot be inferred from prose, and guessing would lie on a
 * call sheet.
 */
var MythosBreakdown = (function () {
  "use strict";
  var SPEC = "breakdown-chip/v1";
  var STOP = {
    INT: 1, EXT: 1, EST: 1, CUT: 1, TO: 1, FADE: 1, IN: 1, OUT: 1,
    SMASH: 1, DISSOLVE: 1, MATCH: 1, JUMP: 1, DAY: 1, NIGHT: 1,
    DAWN: 1, DUSK: 1, MORNING: 1, EVENING: 1, CONTINUOUS: 1,
    LATER: 1, MOMENTS: 1, SAME: 1, MAGIC: 1, HOUR: 1
  };
  function str(s) { return String(s == null ? "" : s); }
  function clean(t) {
    return str(t).split("&nbsp;").join(" ")
      .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }
  function uniq(a) {
    var o = [], i;
    for (i = 0; i < a.length; i++) if (o.indexOf(a[i]) === -1) o.push(a[i]);
    return o;
  }

  /* ---- scene header: "INT. NIGHT BUS - NIGHT" ---- */
  function parseSceneHeader(text) {
    var raw = clean(text);
    var work = raw.replace(/^\.\s*/, "");
    var m = work.match(/^(INT|EXT|EST|INT\/EXT|I\/E)\.?\s*(.*)$/i);
    var intExt = "", rest = work;
    if (m) {
      intExt = m[1].toUpperCase().replace("I/E", "INT/EXT");
      rest = (m[2] || "").trim();
    }
    var set = rest, time = "";
    var dash = rest.lastIndexOf(" - ");
    if (dash !== -1) {
      set = rest.slice(0, dash).trim();
      time = rest.slice(dash + 3).trim().toUpperCase();
    }
    if (!set) set = raw || "UNSLUGGED";
    return { raw: raw, intExt: intExt, set: set, location: set, time: time };
  }

  /* ---- inline [kind: value] tags ---- */
  var KIND_ALIAS = {
    prop: "props", props: "props",
    w: "wardrobe", wardrobe: "wardrobe", ward: "wardrobe",
    makeup: "makeup", "make-up": "makeup",
    vfx: "vfx", fx: "vfx", cgi: "vfx",
    sfx: "sfx", sound: "sound", music: "music",
    vehicle: "vehicles", vehicles: "vehicles",
    animal: "animals", animals: "animals",
    stunt: "stunts", stunts: "stunts",
    extra: "extras", extras: "extras",
    location: "locations", locations: "locations"
  };
  function extractTags(text) {
    var out = [];
    var re = /\[([^\[\]]+)\]/g, m;
    while ((m = re.exec(str(text)))) {
      var inner = m[1].trim();
      if (!inner) continue;
      var ci = inner.indexOf(":");
      if (ci === -1) {
        if (/^[a-z]/i.test(inner) && inner.length <= 60) out.push({ kind: "props", value: inner });
        continue;
      }
      var k = inner.slice(0, ci).trim().toLowerCase();
      var v = inner.slice(ci + 1).trim();
      if (!v) continue;
      var norm = KIND_ALIAS[k] || null;
      if (norm) out.push({ kind: norm, value: v });
    }
    return out;
  }

  /* ---- CAPS names in prose: who must be on set ---- */
  function mentionedNames(text) {
    var found = [];
    var re = /\b([A-Z][A-Z'&\-]*(?:\s+[A-Z][A-Z'&\-]*){0,2})\b/g, m;
    while ((m = re.exec(str(text)))) {
      var name = m[1].trim();
      if (name.length < 2) continue;
      var words = name.split(/\s+/);
      var skip = false, i;
      for (i = 0; i < words.length; i++) {
        if (STOP[words[i]] || words[i].length < 2) { skip = true; break; }
      }
      if (skip) continue;
      found.push(name);
    }
    return uniq(found);
  }

  function emptyScene(n, header) {
    var h = parseSceneHeader(header);
    return {
      n: n, header: h.raw, intExt: h.intExt, set: h.set,
      location: h.location, time: h.time,
      cast: [], onSet: [], dialogueLines: 0, actionLines: 0,
      words: 0, estPages: 0,
      props: [], wardrobe: [], makeup: [], vfx: [], sfx: [],
      vehicles: [], animals: [], stunts: [], sound: [], music: [],
      extras: [], locations: [], transitions: []
    };
  }

  /* ---- core: paras -> breakdown ---- */
  function breakdown(paras) {
    var scenes = [];
    var cur = null;
    var n = 0;
    function open(header) {
      n++;
      cur = emptyScene(n, header);
      scenes.push(cur);
    }
    var list = Array.isArray(paras) ? paras : [];
    var i, p, type, text;
    for (i = 0; i < list.length; i++) {
      p = list[i] || {};
      type = str(p.type || "action").toLowerCase();
      text = clean(p.text);
      if (!text) continue;
      if (type === "scene") { open(text); continue; }
      if (!cur) open("");
      if (type === "character") {
        var nm = text.toUpperCase();
        if (cur.cast.indexOf(nm) === -1) cur.cast.push(nm);
        if (cur.onSet.indexOf(nm) === -1) cur.onSet.push(nm);
        cur.words += text.split(/\s+/).length;
        continue;
      }
      if (type === "dialogue") { cur.dialogueLines++; cur.words += text.split(/\s+/).length; continue; }
      if (type === "transition") {
        if (cur.transitions.indexOf(text.toUpperCase()) === -1) cur.transitions.push(text.toUpperCase());
        continue;
      }
      /* action + parenthetical: count, scan names + tags */
      cur.actionLines++;
      cur.words += text.split(/\s+/).length;
      var tags = extractTags(p.text);
      var t;
      for (t = 0; t < tags.length; t++) {
        var k = tags[t].kind;
        if (cur[k] && cur[k].indexOf(tags[t].value) === -1) cur[k].push(tags[t].value);
      }
      var names = mentionedNames(text);
      for (t = 0; t < names.length; t++) {
        if (cur.onSet.indexOf(names[t]) === -1) cur.onSet.push(names[t]);
      }
    }
    if (!scenes.length) open("");
    for (i = 0; i < scenes.length; i++) {
      scenes[i].estPages = Math.round((scenes[i].words / 150) * 10) / 10;
      /* fold "CORPORAL DUBE" into speaker "DUBE": any mentioned name
         sharing a word with the cast list is the same person on set */
      (function (s) {
        var keep = [];
        var k;
        for (k = 0; k < s.onSet.length; k++) {
          var nm = s.onSet[k];
          if (s.cast.indexOf(nm) !== -1) { keep.push(nm); continue; }
          var parts = nm.split(/\s+/), hit = false, w;
          for (w = 0; w < parts.length; w++) {
            if (s.cast.indexOf(parts[w]) !== -1) { hit = true; break; }
          }
          if (!hit) keep.push(nm);
        }
        s.onSet = keep;
      })(scenes[i]);
    }
    var sets = [], cast = [], words = 0;
    var totals = {
      props: 0, wardrobe: 0, makeup: 0, vfx: 0, sfx: 0,
      vehicles: 0, animals: 0, stunts: 0, sound: 0, music: 0, extras: 0
    };
    for (i = 0; i < scenes.length; i++) {
      var s = scenes[i];
      if (sets.indexOf(s.set) === -1) sets.push(s.set);
      var c;
      for (c = 0; c < s.cast.length; c++) if (cast.indexOf(s.cast[c]) === -1) cast.push(s.cast[c]);
      words += s.words;
      for (var k in totals) if (s[k]) totals[k] += s[k].length;
    }
    totals.scenes = scenes.length;
    totals.sets = sets.length;
    totals.cast = cast.length;
    totals.words = words;
    totals.estPages = Math.round((words / 150) * 10) / 10;
    return { spec: SPEC, scenes: scenes, sets: sets, cast: cast, totals: totals };
  }

  /* ---- stripboard order: group by set + time, keep story order inside ---- */
  function stripboard(bd) {
    var order = [], seen = {}, i;
    for (i = 0; i < bd.scenes.length; i++) {
      var key = bd.scenes[i].set + " :: " + (bd.scenes[i].time || "UNSPECIFIED");
      if (!seen[key]) { seen[key] = true; order.push(key); }
    }
    var rows = [];
    for (i = 0; i < order.length; i++) {
      var k = order[i], j;
      for (j = 0; j < bd.scenes.length; j++) {
        if ((bd.scenes[j].set + " :: " + (bd.scenes[j].time || "UNSPECIFIED")) === k) rows.push(bd.scenes[j].n);
      }
    }
    return { groups: order, sceneOrder: rows };
  }

  /* ---- serializers ---- */
  function csvCell(v) {
    var s = str(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.split('"').join('""') + '"' : s;
  }
  var BREAK_COLS = ["scene_n", "header", "int_ext", "set", "time", "cast",
    "on_set", "dialogue_lines", "action_lines", "words", "est_pages",
    "props", "wardrobe", "makeup", "vfx", "sfx", "vehicles", "animals",
    "stunts", "sound", "music", "extras", "transitions"];
  function toCSV(bd) {
    var lines = [BREAK_COLS.join(",")];
    for (var i = 0; i < bd.scenes.length; i++) {
      var s = bd.scenes[i];
      var row = {
        scene_n: s.n, header: s.header, int_ext: s.intExt, set: s.set,
        time: s.time, cast: s.cast.join(" | "), on_set: s.onSet.join(" | "),
        dialogue_lines: s.dialogueLines, action_lines: s.actionLines,
        words: s.words, est_pages: s.estPages,
        props: s.props.join(" | "), wardrobe: s.wardrobe.join(" | "),
        makeup: s.makeup.join(" | "), vfx: s.vfx.join(" | "),
        sfx: s.sfx.join(" | "), vehicles: s.vehicles.join(" | "),
        animals: s.animals.join(" | "), stunts: s.stunts.join(" | "),
        sound: s.sound.join(" | "), music: s.music.join(" | "),
        extras: s.extras.join(" | "), transitions: s.transitions.join(" | ")
      };
      lines.push(BREAK_COLS.map(function (c) { return csvCell(row[c]); }).join(","));
    }
    return lines.join("\n") + "\n";
  }

  /* default coverage: master + one medium per speaker + inserts per prop/vfx */
  var SHOT_COLS = ["shot_id", "scene_n", "set", "int_ext", "time",
    "size", "subject", "detail", "status"];
  function toShots(bd) {
    var shots = [];
    for (var i = 0; i < bd.scenes.length; i++) {
      var s = bd.scenes[i], k = 0;
      k++;
      shots.push({
        shot_id: "S" + s.n + "-" + k, scene_n: s.n, set: s.set,
        int_ext: s.intExt, time: s.time, size: "WS",
        subject: s.set, detail: "master, hold the geography", status: "TODO"
      });
      var c;
      for (c = 0; c < s.cast.length; c++) {
        k++;
        shots.push({
          shot_id: "S" + s.n + "-" + k, scene_n: s.n, set: s.set,
          int_ext: s.intExt, time: s.time, size: "MS",
          subject: s.cast[c], detail: "dialogue coverage", status: "TODO"
        });
      }
      var ins = s.props.concat(s.vfx);
      for (c = 0; c < ins.length; c++) {
        k++;
        shots.push({
          shot_id: "S" + s.n + "-" + k, scene_n: s.n, set: s.set,
          int_ext: s.intExt, time: s.time, size: "INSERT",
          subject: ins[c], detail: "practical or effect plate", status: "TODO"
        });
      }
      if (!s.cast.length && !ins.length) {
        k++;
        shots.push({
          shot_id: "S" + s.n + "-" + k, scene_n: s.n, set: s.set,
          int_ext: s.intExt, time: s.time, size: "WS",
          subject: s.set, detail: "environmental beat", status: "TODO"
        });
      }
    }
    return shots;
  }
  function toShotlistCSV(bd) {
    var shots = toShots(bd);
    var lines = [SHOT_COLS.join(",")];
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      lines.push(SHOT_COLS.map(function (c) { return csvCell(s[c]); }).join(","));
    }
    return lines.join("\n") + "\n";
  }

  /* ---- feeders: other systems speak fountain, html, or paras ---- */
  function parasFromFountain(text) {
    var blocks = [], cur = [], lines = str(text || "").split(/\r?\n/), i;
    for (i = 0; i < lines.length; i++) {
      if (/^\s*$/.test(lines[i])) { if (cur.length) { blocks.push(cur); cur = []; } }
      else cur.push(lines[i].trim());
    }
    if (cur.length) blocks.push(cur);
    var out = [], prev = "";
    function isScene(l) {
      return /^(INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\b)/i.test(l.replace(/^\.\s*/, ""));
    }
    function isTrans(l) {
      return /^(FADE IN|FADE OUT|CUT TO|SMASH CUT TO|DISSOLVE TO|MATCH CUT TO|JUMP CUT TO)/i.test(l) || /TO:\s*$/.test(l);
    }
    function isChar(l) {
      var t = l.replace(/^@/, "");
      if (!t || t.length > 38) return false;
      if (/^(INT\.|EXT\.|EST\.)/i.test(t)) return false;
      if (/^\(.*\)$/.test(t)) return false;
      return t === t.toUpperCase() && /[A-Z]/.test(t);
    }
    for (i = 0; i < blocks.length; i++) {
      var bl = blocks[i].filter(function (x) {
        return x && !/^(Title|Credit|Author|Draft date|Date|Contact)\s*:/i.test(x);
      });
      if (!bl.length) continue;
      if (bl.length === 1) {
        var L = bl[0].replace(/^!\s*/, "");
        if (L.charAt(0) === ".") { out.push({ type: "scene", text: L.slice(1) }); prev = "scene"; continue; }
        if (L.charAt(0) === "@") { out.push({ type: "character", text: L.slice(1) }); prev = "character"; continue; }
        if (isScene(L)) { out.push({ type: "scene", text: L }); prev = "scene"; continue; }
        if (isTrans(L)) { out.push({ type: "transition", text: L }); prev = "transition"; continue; }
        if (/^\(.*\)$/.test(L)) {
          out.push({ type: (prev === "character" || prev === "dialogue" || prev === "parenthetical") ? "parenthetical" : "action", text: L });
          prev = out[out.length - 1].type;
          continue;
        }
        if (isChar(L)) { out.push({ type: "character", text: L }); prev = "character"; continue; }
        if (prev === "character" || prev === "parenthetical") { out.push({ type: "dialogue", text: L }); prev = "dialogue"; continue; }
        out.push({ type: "action", text: L }); prev = "action"; continue;
      }
      var first = bl[0].replace(/^!\s*/, "");
      if (first.charAt(0) === "@" || isChar(first)) {
        out.push({ type: "character", text: first.replace(/^@/, "") });
        var rest = bl.slice(1), di = 0;
        if (rest.length && /^\(.*\)$/.test(rest[0])) { out.push({ type: "parenthetical", text: rest[0] }); di = 1; }
        var dlg = rest.slice(di).join(" ");
        if (dlg) out.push({ type: "dialogue", text: dlg });
        prev = "dialogue";
        continue;
      }
      if (isScene(first)) {
        out.push({ type: "scene", text: first });
        var tail = bl.slice(1).join(" ");
        if (tail) out.push({ type: "action", text: tail });
        prev = "action";
        continue;
      }
      out.push({ type: "action", text: bl.join(" ") }); prev = "action";
    }
    return out;
  }
  function parasFromHtml(html) {
    var raw = str(html || ""), out = [];
    var re = /<p[^>]*data-type="([^"]*)"[^>]*>([\s\S]*?)<\/p>/gi, m;
    while ((m = re.exec(raw))) {
      var t = (m[1] || "action").toLowerCase();
      if ("scene action character parenthetical dialogue transition".indexOf(t) === -1) t = "action";
      var txt = clean(m[2]);
      if (txt) out.push({ type: t, text: txt });
    }
    return out;
  }
  function readCanvas(canvasId) {
    try {
      if (typeof document === "undefined") return [];
      var c = document.getElementById(canvasId || "mythos-editable");
      if (!c) return [];
      var ps = c.querySelectorAll("p"), out = [], i;
      for (i = 0; i < ps.length; i++) {
        out.push({
          type: (ps[i].getAttribute("data-type") || "action").toLowerCase(),
          text: clean(ps[i].textContent)
        });
      }
      return out;
    } catch (e) { return []; }
  }

  return {
    SPEC: SPEC,
    parseSceneHeader: parseSceneHeader,
    extractTags: extractTags,
    mentionedNames: mentionedNames,
    breakdown: breakdown,
    stripboard: stripboard,
    toCSV: toCSV,
    BREAK_COLS: BREAK_COLS.slice(),
    toShots: toShots,
    toShotlistCSV: toShotlistCSV,
    SHOT_COLS: SHOT_COLS.slice(),
    parasFromFountain: parasFromFountain,
    parasFromHtml: parasFromHtml,
    readCanvas: readCanvas
  };
})();

if (typeof window !== "undefined") window.MythosBreakdown = MythosBreakdown;
if (typeof self !== "undefined" && typeof window === "undefined") self.MythosBreakdown = MythosBreakdown;
if (typeof module !== "undefined" && module.exports) module.exports = MythosBreakdown;

export default MythosBreakdown;
export { MythosBreakdown };
