const L = require("./_lib");

const STAT_KEYS = ["matches", "matchWins", "rounds", "roundWins"];

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const claim = L.readToken(L.bearer(req));
  if (!claim) { res.status(401).json({ error: "auth", message: "ログインしなおしてください。" }); return; }

  try {
    const user = await L.readUser(claim.id);
    if (!user) { res.status(404).json({ error: "gone", message: "データが見つかりませんでした。" }); return; }

    if (req.method === "GET") {
      res.status(200).json({ profile: L.publicUser(user) });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

    const b = L.body(req);
    let dirty = false;

    if (b.profile && typeof b.profile === "object") {
      if (b.profile.name != null) { user.name = L.cleanName(b.profile.name, user.name); dirty = true; }
      if (b.profile.color != null) { user.color = Math.max(0, Math.min(199, b.profile.color | 0)); dirty = true; }
      if (b.profile.parts != null) {
        const parts = L.cleanParts(b.profile.parts, user.color | 0);
        if (parts) { user.parts = parts; dirty = true; }
      }
      if (b.profile.accent != null) { user.accent = Math.max(0, Math.min(3, b.profile.accent | 0)); dirty = true; }
      if (b.profile.eyes != null) { user.eyes = Math.max(0, Math.min(5, b.profile.eyes | 0)); dirty = true; }
      if (b.profile.hat != null) { user.hat = Math.max(0, Math.min(3, b.profile.hat | 0)); dirty = true; }
      if (b.profile.emblem != null) { user.emblem = Math.max(0, Math.min(5, b.profile.emblem | 0)); dirty = true; }
    }
    if (b.newPw != null && String(b.newPw).length >= 4) {
      if (!L.checkPw(String(b.oldPw == null ? "" : b.oldPw), user)) {
        res.status(401).json({ error: "auth", message: "いまの あいことばが ちがいます。" });
        return;
      }
      user.pw = L.hashPw(String(b.newPw), user.salt);
      dirty = true;
    }
    if (b.addStats && typeof b.addStats === "object") {
      user.stats = Object.assign({}, L.EMPTY_STATS, user.stats || {});
      for (let i = 0; i < STAT_KEYS.length; i++) {
        const k = STAT_KEYS[i];
        const add = Math.max(0, Math.min(50, b.addStats[k] | 0));
        if (add) { user.stats[k] = (user.stats[k] | 0) + add; dirty = true; }
      }
    }

    if (dirty) await L.writeUser(user);
    res.status(200).json({ profile: L.publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーにつながりませんでした。" });
  }
};
