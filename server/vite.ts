typescript
import { createServer as createViteServer } from "vite";
import type { Express } from "express";
import type { Server } from "http";
import path from "path";
import { createLogger } from "vite";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  viteLogger.info(`${message}`, { timestamp: true });
}

export async function setupVite(app: Express, server: Server) {
  const viteConfig = await import("../vite.config.js");
  
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );
      let template = await vite.transformIndexHtml(url, clientTemplate);
      
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "client", "dist");
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
