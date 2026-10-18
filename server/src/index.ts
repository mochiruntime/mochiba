import { ServerApp } from './ServerApp.js';

const PORT = 3001;
const server = new ServerApp();

server.start(PORT).then(() => {
  console.log(`[Server] Mochiba server running on ws://localhost:${PORT} at ${server.TICK_RATE}Hz`);
});
