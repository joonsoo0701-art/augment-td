// 증강 타워디펜스 · 운영자 도구 (회원 목록, 스킨·별가루 지급)
import { json, store, readSession, isAdmin, SKIN_IDS } from "../lib/common.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const s = await readSession((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!s) return json({ error: "로그인이 필요해요" }, 401);
  if (!(await isAdmin(s.user))) return json({ error: "운영자만 쓸 수 있어요" }, 403);
  let b;
  try { b = await req.json(); } catch { return json({ error: "요청 형식이 올바르지 않아요" }, 400); }
  const users = store("atd-users");

  if (b.action === "users") {
    const { blobs } = await users.list();
    const names = [];
    for (const bl of blobs.slice(0, 500)) { const u = await users.get(bl.key, { type: "json" }); if (u && u.name) names.push(u.name); }
    names.sort((a, c) => a.localeCompare(c, "ko"));
    return json({ users: names });
  }

  if (b.action === "grant") {
    const targets = String(b.to ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 50);
    const skins = (Array.isArray(b.skins) ? b.skins : []).map(String).filter((id) => SKIN_IDS.has(id));
    const uniq = [...new Set(skins)].slice(0, 112);
    const dust = Math.max(0, Math.min(100000, Math.floor(Number(b.dust) || 0)));
    const note = String(b.note ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
    if (!targets.length) return json({ error: "받을 아이디를 입력해 주세요" }, 400);
    if (!uniq.length && !dust) return json({ error: "지급할 스킨이나 별가루를 골라 주세요" }, 400);
    const inbox = store("atd-inbox"), done = [], missing = [];
    for (const t of targets) {
      const u = await users.get(t.toLowerCase(), { type: "json" });
      if (!u) { missing.push(t); continue; }
      const key = u.name.toLowerCase();
      const box = (await inbox.get(key, { type: "json" })) || { items: [] };
      box.items = (Array.isArray(box.items) ? box.items : []).slice(-49);
      box.items.push({ skins: uniq, dust, note, from: s.user, at: Date.now() });
      await inbox.setJSON(key, box);
      done.push(u.name);
    }
    return json({ ok: true, done, missing });
  }
  return json({ error: "action" }, 400);
};

export const config = { path: "/api/admin" };
