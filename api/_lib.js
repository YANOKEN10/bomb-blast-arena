const crypto = require("crypto");
const { put, get } = require("@vercel/blob");

const SECRET = process.env.AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "bomb-blast-dev-secret";
const ORIGINS = [
  "https://bomb-blast-arena.vercel.app",
  "https://yanoken10.github.io",
  "http://localhost:5177",
  "http://127.0.0.1:5177"
];
const YEAR = 1000 * 60 * 60 * 24 * 365;

function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGINS.indexOf(o) >= 0 || /^https:\/\/bomb-blast-arena-[a-z0-9-]+\.vercel\.app$/.test(o))) {
    res.setHeader("Access-Control-Allow-Origin", o);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

/* --- ids and storage --- */
function normId(id) {
  return String(id == null ? "" : id).normalize("NFKC").trim().toLowerCase();
}
function idKey(id) {
  return "u/" + crypto.createHash("sha256").update("bba1:" + id).digest("hex") + ".json";
}
async function readUser(id) {
  let r;
  try {
    r = await get(idKey(id), { access: "private", useCache: false });
  } catch (e) {
    if (e && /not.?found/i.test(e.message || "")) return null;
    throw e;
  }
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  try { return JSON.parse(text); } catch (e) { return null; }
}
async function writeUser(u) {
  u.updated = Date.now();
  await put(idKey(u.id), JSON.stringify(u), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
}

/* --- passwords --- */
function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString("hex");
}
function checkPw(pw, u) {
  const a = Buffer.from(hashPw(pw, u.salt), "hex");
  const b = Buffer.from(String(u.pw || ""), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* --- tokens --- */
function makeToken(id) {
  const b = Buffer.from(JSON.stringify({ id: id, exp: Date.now() + YEAR })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
  return b + "." + sig;
}
function readToken(tok) {
  if (!tok || String(tok).indexOf(".") < 0) return null;
  const parts = String(tok).split(".");
  const want = crypto.createHmac("sha256", SECRET).update(parts[0]).digest("base64url");
  if (parts[1].length !== want.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!d.id || d.exp < Date.now()) return null;
    return d;
  } catch (e) { return null; }
}
function bearer(req) {
  const h = req.headers.authorization || "";
  return h.indexOf("Bearer ") === 0 ? h.slice(7) : "";
}

/* --- shapes --- */
const EMPTY_STATS = { matches: 0, matchWins: 0, rounds: 0, roundWins: 0 };
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    color: u.color | 0,
    emblem: u.emblem | 0,
    stats: Object.assign({}, EMPTY_STATS, u.stats || {}),
    created: u.created
  };
}
function cleanName(n, fallback) {
  let s = String(n == null ? "" : n).replace(/[\u0000-\u001f<>]/g, "").trim();
  if (s.length > 12) s = s.slice(0, 12);
  return s || fallback;
}

module.exports = {
  cors, body, normId, readUser, writeUser, hashPw, checkPw,
  makeToken, readToken, bearer, publicUser, cleanName, EMPTY_STATS
};
