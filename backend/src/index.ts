import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { runMigrations } from './db/migrate';
import healthRoutes from './routes/health';
import storeRoutes from './routes/stores';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

// Routes
app.use('/', healthRoutes);
app.use('/api/stores', storeRoutes);

// Error handler
app.use(errorHandler);

// Initialize database and start server
runMigrations();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Store Platform Backend running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Store domain: ${config.storeDomain}`);
});

export default app;
