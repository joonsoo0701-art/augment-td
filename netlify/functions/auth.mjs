// 증강 타워디펜스 · 회원가입/로그인 (Netlify Functions + Netlify Blobs)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { isAdmin, store } from "../lib/common.mjs";

const NAME_RE = /^[0-9A-Za-z가-힣_]{2,12}$/;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function newSession(sess, name) {
  const token = crypto.randomBytes(32).toString("hex");
  await sess.setJSON(token, { user: name, exp: Date.now() + 30 * 864e5 });
  return { token, name, admin: await isAdmin(name) };
}
async function readSession(sess, tok) {
  if (!/^[a-f0-9]{64}$/.test(tok)) return null;
  const s = await sess.get(tok, { type: "json" });
  return s && s.exp > Date.now() ? s : null;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "요청 형식이 올바르지 않아요" }, 400); }
  const users = getStore({ name: "atd-users", consistency: "strong" });
  const sess = getStore({ name: "atd-sessions", consistency: "strong" });
  const act = b && b.action;

  if (act === "signup" || act === "login") {
    const name = String(b.name ?? "").trim(), pw = String(b.password ?? "");
    if (!NAME_RE.test(name)) return json({ error: "아이디는 2~12자의 한글·영문·숫자·_ 로 정해 주세요" }, 400);
    if (pw.length < 6 || pw.length > 64) return json({ error: "비밀번호는 6~64자로 정해 주세요" }, 400);
    const key = name.toLowerCase();
    if (act === "signup") {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
      const r = await users.setJSON(key, { name, salt, hash, created: Date.now(), fails: 0, lock: 0 }, { onlyIfNew: true });
      if (!r || !r.modified) return json({ error: "이미 사용 중인 아이디예요" }, 409);
      await store("atd-meta").setJSON("owner", { name, at: Date.now() }, { onlyIfNew: true });
      return json(await newSession(sess, name));
    }
    const u = await users.get(key, { type: "json" });
    if (!u) return json({ error: "아이디 또는 비밀번호가 맞지 않아요" }, 401);
    if (u.lock > Date.now()) return json({ error: "로그인을 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요" }, 429);
    const ok = crypto.timingSafeEqual(crypto.scryptSync(pw, u.salt, 64), Buffer.from(u.hash, "hex"));
    if (!ok) {
      u.fails = (u.fails | 0) + 1;
      if (u.fails >= 5) { u.lock = Date.now() + 10 * 60 * 1000; u.fails = 0; }
      await users.setJSON(key, u);
      return json({ error: "아이디 또는 비밀번호가 맞지 않아요" }, 401);
    }
    if (u.fails) { u.fails = 0; await users.setJSON(key, u); }
    return json(await newSession(sess, u.name));
  }

  const tok = String(b.token ?? "");
  if (act === "me") {
    const s = await readSession(sess, tok);
    return s ? json({ name: s.user, admin: await isAdmin(s.user) }) : json({ error: "로그인이 만료됐어요" }, 401);
  }
  if (act === "inbox") {
    const s = await readSession(sess, tok);
    if (!s) return json({ error: "로그인이 만료됐어요" }, 401);
    const inbox = store("atd-inbox"), key = s.user.toLowerCase();
    const box = await inbox.get(key, { type: "json" });
    if (box && Array.isArray(box.items) && box.items.length) await inbox.delete(key);
    return json({ items: box && Array.isArray(box.items) ? box.items : [] });
  }
  if (act === "logout") {
    if (/^[a-f0-9]{64}$/.test(tok)) await sess.delete(tok);
    return json({ ok: true });
  }
  return json({ error: "action" }, 400);
};

export const config = { path: "/api/auth" };
