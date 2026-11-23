import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The block editor's files (dev server only; `npm run blocks`): lists, reads,
 * writes and deletes map blocks in src/data/blocks/, one JSON file each
 * (docs/design/levels.md). Not part of the build.
 */
export function blockFiles() {
  const dir = path.resolve(__dirname, "../src/data/blocks");
  const file = (id) => (/^[a-z0-9][a-z0-9_-]*$/.test(id) ? path.join(dir, `${id}.json`) : null);
  return {
    name: "vamps-block-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__blocks", (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        fs.mkdirSync(dir, { recursive: true });
        const id = decodeURIComponent((req.url ?? "/").replace(/^\/+|\?.*$/g, ""));
        if (!id) {
          if (req.method !== "GET") return send(405, { error: "list is GET only" });
          const list = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
            try {
              const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
              return { id: b.id, name: b.name, terrains: b.terrains, type: b.type, entrances: b.entrances, w: b.w, h: b.h };
            } catch {
              return { id: f.replace(/\.json$/, ""), name: "(unreadable)", terrains: [], type: "?", entrances: [], w: 0, h: 0 };
            }
          });
          return send(200, list);
        }
        const f = file(id);
        if (!f) return send(400, { error: "bad id" });
        if (req.method === "GET") return fs.existsSync(f) ? send(200, JSON.parse(fs.readFileSync(f, "utf8"))) : send(404, { error: "no such block" });
        if (req.method === "DELETE") {
          if (fs.existsSync(f)) fs.unlinkSync(f);
          return send(200, { ok: true });
        }
        if (req.method === "PUT") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const b = JSON.parse(body);
              if (b.id !== id) return send(400, { error: "id doesn't match the file" });
              fs.writeFileSync(f, body.endsWith("\n") ? body : body + "\n");
              send(200, { ok: true });
            } catch (e) {
              send(400, { error: String(e) });
            }
          });
          return;
        }
        send(405, { error: "method" });
      });
    },
  };
}

