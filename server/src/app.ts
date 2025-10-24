if (process.env.NODE_ENV !== 'production') {
  await import('dotenv/config');
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import { maybeAuth } from './middlewares/auth.js';

import { usersRouter } from './routes/users.routes.js';
import { ApplicationsRouter } from './routes/applications.routes.js';
import { filesRouter } from './routes/files.routes.js';
import { requirementsRouter } from './routes/requeriments.routes.js';
import { pdfsRoutes } from './routes/pdfs.router.js';
import { historyRouter } from './routes/history.routes.js';
import { AuditRouter } from './routes/audit.routes.js';
import { estratoRouter } from './routes/estrato.routes.js';
import { rolesRouter } from './routes/roles.routes.js';
import { UserRoleRouter } from './routes/user-role.routes.js';
import { errorHandler } from './middlewares/error-handler.js';

const app = express();

app.use(cors({
  origin: [
    "https://agendamiento.supertv.com.co",
    "https://api.supertv.com.co"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-user-id", "Authorization"],
  credentials: true,
}));

app.options(/.*/, cors());

app.use(express.json());

app.use(maybeAuth);

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

app.use("/storage", express.static(path.join(process.cwd(), "storage")));

app.use('/api/users', usersRouter);
app.use('/api/applications', ApplicationsRouter);
app.use('/api/files', filesRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/pdfs', pdfsRoutes);
app.use('/api/history', historyRouter);
app.use('/api/audit', AuditRouter);
app.use('/api/estrato', estratoRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/user-role', UserRoleRouter);

app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
