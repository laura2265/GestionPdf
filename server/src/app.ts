if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

import express from "express";
import cors from "cors";
import path from "path";
import { maybeAuth } from "./middlewares/auth.js";
import { usersRouter } from "./routes/users.routes.js";
import { ApplicationsRouter } from "./routes/applications.routes.js";
import { filesRouter } from "./routes/files.routes.js";
import { requirementsRouter } from "./routes/requeriments.routes.js";
import { pdfsRoutes } from "./routes/pdfs.router.js";
import { historyRouter } from "./routes/history.routes.js";
import { AuditRouter } from "./routes/audit.routes.js";
import { estratoRouter } from "./routes/estrato.routes.js";
import { rolesRouter } from "./routes/roles.routes.js";
import { UserRoleRouter } from "./routes/user-role.routes.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { getBaseUrl } from "./utils/http.js";
import { WebSocketServer } from "ws";
import { smartOltRouter } from "./routes/smartOlts.routes.js";

const app = express();
app.set("trust proxy", true);

const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = [
  "https://agendamiento.supertv.com.co",
  "https://api.supertv.com.co",
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    if (!isProd) return cb(null, true);

    if (!origin) return cb(null, false);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-user-id", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());

app.use(maybeAuth);

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

app.use("/storage", express.static(path.join(process.cwd(), "storage")));

app.use("/api/users", usersRouter);
app.use("/api/applications", ApplicationsRouter);
app.use("/api/files", filesRouter);
app.use("/api/requirements", requirementsRouter);
app.use("/api/pdfs", pdfsRoutes);
app.use("/api/history", historyRouter);
app.use("/api/audit", AuditRouter);
app.use("/api/estrato", estratoRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/user-role", UserRoleRouter);
app.use("/api/smart-olt/", smartOltRouter)

app.get("/health", (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV, marker: "APP-LOCAL-WS" })
);

app.get("/debug-url", (req, res) => {
  res.json({
    protocol: req.protocol,
    host: req.get("host"),
    xfp: req.get("x-forwarded-proto"),
    xfh: req.get("x-forwarded-host"),
    base: getBaseUrl(req),
  });
});

app.use(errorHandler);
const PORT = parseInt((process.env.PORT ?? "").trim(), 10) || 3000;

const server = app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
  console.log(`WS  on :${PORT}/ws`);
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  console.log("WS connected:", req.socket.remoteAddress);

  ws.send(JSON.stringify({ type: "connected", ok: true }));

  ws.on("message", (data) => {
    ws.send(data.toString());
  });

  ws.on("close", () => console.log("WS disconnected"));
});
