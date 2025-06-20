import express from "express";
import { registerRoutes } from "./routes.js";
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
(async () => {
  const server = await registerRoutes(app);
  
  const port = process.env.PORT || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
})();
