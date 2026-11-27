// 공용: 세션·운영자 확인
import { getStore } from "@netlify/blobs";
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const store = (name) => getStore({ name, consistency: "strong" });
export async function readSession(tok) {
  if (!/^[a-f0-9]{64}$/.test(String(tok || ""))) return null;
  const s = await store("atd-sessions").get(tok, { type: "json" });
  return s && s.exp > Date.now() ? s : null;
}
// 운영자: 환경 변수 ATD_ADMINS(쉼표로 구분한 아이디)가 있으면 그 계정들, 없으면 가장 먼저 가입한 계정
export async function isAdmin(name) {
  if (!name) return false;
  const env = (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get("ATD_ADMINS")) || process.env.ATD_ADMINS || "";
  const list = env.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.includes(name.toLowerCase());
  const owner = await store("atd-meta").get("owner", { type: "json" });
  return !!owner && String(owner.name).toLowerCase() === name.toLowerCase();
}
export const THEME_KEYS = ["dawn","moss","deep","steel","dessert","pirate","toy","sakura","winter","haunt","star","dragon","celestial","abyss","glory"];
export const SKIN_IDS = new Set([].concat(...[0,1,2,3,4,5,6,7].map((u) => THEME_KEYS.map((k) => u + ":" + k))));
