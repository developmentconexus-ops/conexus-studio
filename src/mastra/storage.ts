import { PostgresStore } from '@mastra/pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não definida. Veja .env.example.');
}

export const storage = new PostgresStore({ id: 'studio', connectionString });
