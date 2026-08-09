import { WebSocket, WebSocketServer } from 'ws';
import { config } from '../config/index.js';
import { parseCookies } from '../http/middleware.js';
import { findSessionUser } from '../services/auth.js';

export class RealtimeHub {
  constructor(database) {
    this.database = database;
    this.clients = new Map();
    this.unsubscribe = null;
    this.heartbeat = null;
  }

  async attach(server) {
    this.server = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
    this.server.on('connection', async (socket, request) => {
      try {
        const token = parseCookies(request.headers.cookie)[config.cookieName];
        const user = await findSessionUser(this.database, token);
        if (!user) return socket.close(4401, 'Authentication required');
        socket.userId = user.id;
        socket.alive = true;
        socket.on('pong', () => { socket.alive = true; });
        const sockets = this.clients.get(user.id) || new Set();
        sockets.add(socket);
        this.clients.set(user.id, sockets);
        socket.on('close', () => {
          sockets.delete(socket);
          if (!sockets.size) this.clients.delete(user.id);
        });
        socket.send(JSON.stringify({ type: 'connection.ready' }));
      } catch {
        socket.close(1011, 'Connection failed');
      }
    });

    this.unsubscribe = await this.database.listen('skill_events', (payload) => {
      try {
        this.broadcast(JSON.parse(payload));
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', event: 'realtime_payload_invalid', message: error.message }));
      }
    });
    this.heartbeat = setInterval(() => {
      for (const socket of this.server.clients) {
        if (!socket.alive) socket.terminate();
        else {
          socket.alive = false;
          socket.ping();
        }
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  async publish(event) {
    await this.database.notify('skill_events', JSON.stringify(event));
  }

  broadcast(event) {
    for (const userId of new Set(event.userIds || [])) {
      for (const socket of this.clients.get(userId) || []) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
      }
    }
  }

  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.unsubscribe) await this.unsubscribe();
    if (this.server) {
      for (const socket of this.server.clients) socket.close(1001, 'Server shutdown');
      await new Promise((resolve) => this.server.close(resolve));
    }
  }
}
