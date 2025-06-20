typescript
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

(async () => {
  const server = await registerRoutes(app);

  const port = Number(process.env.PORT) || 5000;
  
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    log(`Error ${status}: ${message}`, "error");
    res.status(status).json({ message: process.env.NODE_ENV === "production" ? "Internal Server Error" : message });
  });

  server.listen(port, "0.0.0.0", () => {
    log(`Server running on port ${port}`);
  });
})();
