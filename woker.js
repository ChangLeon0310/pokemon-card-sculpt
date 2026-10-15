const LIBRARY_KEY = "library.json";
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const safeId = (value = "") => String(value).trim().replace(/[^a-zA-Z0-9_-]/g, "");
const naturalSort = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
async function readLibrary(env) {
  const object = await env.CARD_IMAGES.get(LIBRARY_KEY);
  if (!object) return { sets: [] };
  try { return JSON.parse(await object.text()); } catch { return { sets: [] }; }
}
async function writeLibrary(env, library) {
  library.updatedAt = new Date().toISOString();
  await env.CARD_IMAGES.put(LIBRARY_KEY, JSON.stringify(library, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}
function requireAdmin(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}
function imageExtension(file) {
  const byType = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  return byType[file.type] || "";
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "GET" && path === "/api/library") {
        return json(await readLibrary(env));
      }
      if (request.method === "GET" && path.startsWith("/api/image/")) {
        const key = decodeURIComponent(path.slice("/api/image/".length));
        if (!key || key.includes("..")) return new Response("Bad path", { status: 400 });
        const object = await env.CARD_IMAGES.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "private, max-age=3600");
        return new Response(object.body, { headers });
      }
      if (path.startsWith("/api/") && !requireAdmin(request, env)) {
        return new Response("管理密碼錯誤或尚未設定", { status: 403 });
      }
      if (request.method === "POST" && path === "/api/sets") {
        const body = await request.json();
        const id = safeId(body.id);
        const name = String(body.name || "").trim();
        if (!id || !name) return new Response("擴充包代碼與名稱不可空白", { status: 400 });
        const library = await readLibrary(env);
        if (library.sets.some((item) => item.id.toLowerCase() === id.toLowerCase())) return new Response("擴充包代碼已存在", { status: 409 });
        library.sets.push({ id, name, releaseDate: body.releaseDate || "", cards: [] });
        await writeLibrary(env, library);
        return json({ ok: true }, 201);
      }
      const uploadMatch = path.match(/^\/api\/sets\/([^/]+)\/cards$/);
      if (request.method === "POST" && uploadMatch) {
        const setId = safeId(decodeURIComponent(uploadMatch[1]));
        const form = await request.formData();
        const files = form.getAll("files").filter((item) => item instanceof File);
        if (!files.length) return new Response("沒有收到圖片", { status: 400 });
        const library = await readLibrary(env);
        const set = library.sets.find((item) => item.id === setId);
        if (!set) return new Response("找不到擴充包", { status: 404 });
        for (const file of files) {
          const ext = imageExtension(file);
          if (!ext) continue;
          const rawNumber = file.name.replace(/\.[^.]+$/, "");
          const number = rawNumber.trim().replace(/[^a-zA-Z0-9_-]/g, "");
          if (!number) continue;
          const old = set.cards.find((item) => item.number === number);
          if (old?.storageKey && old.storageKey !== `cards/${setId}/${number}.${ext}`) await env.CARD_IMAGES.delete(old.storageKey);
          const storageKey = `cards/${setId}/${number}.${ext}`;
          await env.CARD_IMAGES.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } });
          const card = { id: `${setId}-${number}`, number, name: old?.name || `${setId} ${number}`, storageKey, image: `/api/image/${encodeURIComponent(storageKey)}` };
          const index = set.cards.findIndex((item) => item.number === number);
          if (index >= 0) set.cards[index] = card; else set.cards.push(card);
        }
        set.cards.sort(naturalSort);
        await writeLibrary(env, library);
        return json({ ok: true, count: files.length });
      }
      const deleteMatch = path.match(/^\/api\/sets\/([^/]+)$/);
      if (request.method === "DELETE" && deleteMatch) {
        const setId = safeId(decodeURIComponent(deleteMatch[1]));
        const library = await readLibrary(env);
        const set = library.sets.find((item) => item.id === setId);
        if (!set) return new Response("找不到擴充包", { status: 404 });
        let cursor;
        do {
          const listed = await env.CARD_IMAGES.list({ prefix: `cards/${setId}/`, cursor });
          await Promise.all(listed.objects.map((item) => env.CARD_IMAGES.delete(item.key)));
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);
        library.sets = library.sets.filter((item) => item.id !== setId);
        await writeLibrary(env, library);
        return json({ ok: true });
      }
      if (path.startsWith("/api/")) return new Response("API not found", { status: 404 });
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return new Response(`伺服器錯誤：${error.message}`, { status: 500 });
    }
  },
};
