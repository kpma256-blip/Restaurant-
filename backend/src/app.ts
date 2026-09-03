import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { currentUser } from "./middleware/currentUser";
import { errorHandler } from "./middleware/errorHandler";

import { categoriesRouter } from "./routes/categories.routes";
import { unitsRouter } from "./routes/units.routes";
import { suppliersRouter } from "./routes/suppliers.routes";
import { productsRouter } from "./routes/products.routes";
import { menuItemsRouter } from "./routes/menuItems.routes";
import { salesRouter } from "./routes/sales.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { reportsRouter } from "./routes/reports.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { usersRouter } from "./routes/users.routes";
import { toastRouter } from "./routes/toast.routes";
import { toastWebhookRouter } from "./integrations/toast/webhook";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
  app.use(currentUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use("/api/categories", categoriesRouter);
  app.use("/api/units", unitsRouter);
  app.use("/api/suppliers", suppliersRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/menu-items", menuItemsRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/toast", toastRouter);
  app.use("/api/toast/webhook", toastWebhookRouter);

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));
  app.use(errorHandler);

  return app;
}
