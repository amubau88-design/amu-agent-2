import { startServer } from './amu-api/server.ts';

const PORT = Number(process.env.PORT) || 3030;

startServer(PORT).then(() => {
  console.log(`🚀 AMU-Agent-2 Engine & API is active and ready on http://localhost:${PORT}`);
}).catch((err) => {
  console.error('Failed to start AMU-Agent-2 Server:', err);
  process.exitCode = 1;
});

