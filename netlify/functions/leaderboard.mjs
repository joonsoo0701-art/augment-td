// 증강 타워디펜스 · 무한 모드 랭킹 (회원만 기록) · Netlify Functions + Netlify Blobs
import { getStore } from "@netlify/blobs";
import { readSession } from "../lib/common.mjs";

const BOARDS = new Set(["solo_n", "solo_h", "coop_n", "coop_h"]);
const MAX_KEEP = 200;
const CHAR_COUNT = 6;

const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f<>"'`\\]/g, "").trim().slice(0, 12);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const pub = ({ pid, name, wave, ch, pc, at }) => ({ pid, name, wave, ch, pc, at });
const isMember = (e) => typeof e.pid === "string" && e.pid.startsWith("u:");

export default async (req) => {
  const store = getStore({ name: "atd-leaderboard", consistency: "strong" });

  if (req.method === "GET") {
    const board = new URL(req.url).searchParams.get("board");
    if (!BOARDS.has(board)) return json({ error: "board" }, 400);
    const doc = await store.get(board, { type: "json" });
    const entries = doc && Array.isArray(doc.entries) ? doc.entries : [];
    return json({ entries: entries.filter(isMember).slice(0, 100).map(pub) });
  }

  if (req.method === "POST") {
    const session = await readSession((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!session) return json({ error: "login" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "json" }, 400); }
    const board = body && body.board;
    if (!BOARDS.has(board)) return json({ error: "board" }, 400);
    const wave = Math.floor(Number(body.wave));
    if (!(wave >= 1 && wave <= 5000)) return json({ error: "wave" }, 400);
    const name = session.user;
    const pid = "u:" + name.toLowerCase();
    const ch = Math.floor(Number(body.ch));
    if (!(ch >= 0 && ch < CHAR_COUNT)) return json({ error: "ch" }, 400);
    const pcN = Math.floor(Number(body.pc));
    const pc = body.pc == null || !(pcN >= 0 && pcN < CHAR_COUNT) ? null : pcN;

    for (let attempt = 0; attempt < 6; attempt++) {
      const cur = await store.getWithMetadata(board, { type: "json" });
      const entries = cur && cur.data && Array.isArray(cur.data.entries) ? cur.data.entries.filter(isMember) : [];
      const i = entries.findIndex((e) => e.pid === pid);
      const now = Date.now();
      if (i >= 0) {
        entries[i] = wave > entries[i].wave ? { pid, name, wave, ch, pc, at: now } : { ...entries[i], name };
      } else {
        entries.push({ pid, name, wave, ch, pc, at: now });
      }
      entries.sort((a, c) => c.wave - a.wave || a.at - c.at);
      const kept = entries.slice(0, MAX_KEEP);
      // 동시에 여러 명이 등록해도 기록이 덮어써지지 않도록 ETag 조건부 쓰기 후 재시도
      const res = !cur
        ? await store.setJSON(board, { entries: kept }, { onlyIfNew: true })
        : cur.etag
          ? await store.setJSON(board, { entries: kept }, { onlyIfMatch: cur.etag })
          : await store.setJSON(board, { entries: kept });
      if (res && res.modified) {
        const r = kept.findIndex((e) => e.pid === pid);
        return json({ ok: true, rank: r >= 0 ? r + 1 : 0, best: r >= 0 ? kept[r].wave : wave });
      }
      await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 160));
    }
    return json({ error: "busy" }, 503);
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/leaderboard" };
