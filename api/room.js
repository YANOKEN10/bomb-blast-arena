/* Signalling for friend matches. One small record per room, so a poll costs a
   single read; peers stop polling as soon as the direct connection is up. */
const crypto = require("crypto");
const { put, get, del, list } = require("@vercel/blob");
const L = require("./_lib");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
const WHO_RE = /^(host|g[1-3])$/;
const ROOM_TTL = 20 * 60 * 1000;
const MAX_ICE = 40;

function roomKey(code) { return "room/" + code + ".json"; }

function makeCode() {
  const bytes = crypto.randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

async function readRoom(code) {
  let r;
  try {
    r = await get(roomKey(code), { access: "private", useCache: false });
  } catch (e) {
    return null;
  }
  if (!r || r.statusCode !== 200) return null;
  try { return JSON.parse(await new Response(r.stream).text()); } catch (e) { return null; }
}

async function writeRoom(code, room) {
  await put(roomKey(code), JSON.stringify(room), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json"
  });
}

function blank(name) {
  return {
    created: Date.now(), open: true,
    host: { name: name, answers: {}, ice: [], seen: Date.now() },
    g1: null, g2: null, g3: null
  };
}

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

  const b = L.body(req);
  const action = String(b.action || "");
  const code = String(b.code || "").toUpperCase();
  const who = String(b.who || "");

  try {
    if (action === "create") {
      const code2 = makeCode();
      await writeRoom(code2, blank(L.cleanName(b.name, "ホスト")));
      res.status(200).json({ code: code2 });
      return;
    }

    if (!CODE_RE.test(code)) {
      res.status(400).json({ error: "code", message: "あいことばは4文字です。" });
      return;
    }

    const room = await readRoom(code);
    if (!room) { res.status(404).json({ error: "nf", message: "そのへやは見つかりません。" }); return; }
    if (Date.now() - (room.created || 0) > ROOM_TTL) {
      res.status(410).json({ error: "old", message: "そのへやは時間切れです。" });
      return;
    }

    if (action === "join") {
      if (room.open === false) { res.status(409).json({ error: "started", message: "そのへやは、もうはじまっています。" }); return; }
      let slot = "";
      for (let i = 1; i <= 3; i++) {
        const s = "g" + i;
        if (!room[s] || Date.now() - (room[s].seen || 0) > 30000) { slot = s; break; }
      }
      if (!slot) { res.status(409).json({ error: "full", message: "へやがいっぱいです。" }); return; }
      room[slot] = { name: L.cleanName(b.name, "プレイヤー"), offer: null, ice: [], seen: Date.now() };
      await writeRoom(code, room);
      res.status(200).json({ slot: slot, host: { name: room.host.name } });
      return;
    }

    if (action === "post") {
      if (!WHO_RE.test(who)) { res.status(400).json({ error: "who" }); return; }
      const cur = room[who] || (who === "host" ? { name: "ホスト", answers: {}, ice: [] } : { name: "プレイヤー", ice: [] });
      if (b.data && typeof b.data === "object") {
        if (b.data.offer) cur.offer = b.data.offer;
        if (b.data.answers && typeof b.data.answers === "object") cur.answers = b.data.answers;
        if (typeof b.data.name === "string") cur.name = L.cleanName(b.data.name, cur.name);
      }
      if (Array.isArray(b.addIce) && b.addIce.length) {
        cur.ice = (Array.isArray(cur.ice) ? cur.ice : []).concat(b.addIce.slice(0, 12)).slice(-MAX_ICE);
      }
      cur.seen = Date.now();
      room[who] = cur;
      if (who === "host" && b.open === false) room.open = false;
      await writeRoom(code, room);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "poll") {
      const slots = { host: room.host };
      for (let i = 1; i <= 3; i++) { const s = "g" + i; if (room[s]) slots[s] = room[s]; }
      res.status(200).json({ slots: slots, open: room.open !== false });
      return;
    }

    if (action === "close") {
      try {
        const r = await list({ prefix: roomKey(code) });
        if (r.blobs.length) await del(r.blobs.map((x) => x.url));
      } catch (e) { /* already gone */ }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "action" });
  } catch (e) {
    res.status(500).json({ error: "server", message: "つうしんに しっぱいしました。" });
  }
};
