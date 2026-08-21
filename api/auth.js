const crypto = require("crypto");
const L = require("./_lib");

const ID_RE = /^[^\s<>]{2,32}$/;

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

  const b = L.body(req);
  const rawId = String(b.id == null ? "" : b.id).trim();
  const id = L.normId(rawId);
  const pw = String(b.pw == null ? "" : b.pw);
  const action = b.action === "signup" ? "signup" : "login";

  if (!ID_RE.test(rawId)) {
    res.status(400).json({ error: "id", message: "なまえは2〜32文字で、スペースなしにしてください。" });
    return;
  }
  if (pw.length < 4 || pw.length > 64) {
    res.status(400).json({ error: "pw", message: "あいことばは4文字以上にしてください。" });
    return;
  }

  try {
    const existing = await L.readUser(id);

    if (action === "signup") {
      if (existing) {
        res.status(409).json({ error: "taken", message: "そのなまえは、もう つかわれています。" });
        return;
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const user = {
        id: id,
        display: rawId,
        name: L.cleanName(b.name || rawId, rawId.slice(0, 12)),
        color: Math.max(0, Math.min(199, b.color | 0)),
        parts: L.cleanParts(b.parts, b.color | 0),
        accent: Math.max(0, Math.min(3, b.accent | 0)),
        eyes: Math.max(0, Math.min(5, b.eyes | 0)),
        hat: Math.max(0, Math.min(3, b.hat | 0)),
        emblem: Math.max(0, Math.min(5, b.emblem | 0)),
        salt: salt,
        pw: L.hashPw(pw, salt),
        stats: Object.assign({}, L.EMPTY_STATS),
        created: Date.now()
      };
      await L.writeUser(user);
      res.status(200).json({ token: L.makeToken(id), profile: L.publicUser(user) });
      return;
    }

    if (!existing || !L.checkPw(pw, existing)) {
      res.status(401).json({ error: "auth", message: "なまえか あいことばが ちがいます。" });
      return;
    }
    res.status(200).json({ token: L.makeToken(id), profile: L.publicUser(existing) });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーにつながりませんでした。" });
  }
};
