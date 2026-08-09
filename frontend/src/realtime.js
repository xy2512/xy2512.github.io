export class RealtimeClient {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.socket = null;
    this.timer = null;
    this.attempt = 0;
    this.enabled = false;
  }

  connect() {
    this.enabled = true;
    this.open();
  }

  open() {
    if (!this.enabled || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket.addEventListener('open', () => { this.attempt = 0; });
    this.socket.addEventListener('message', (event) => {
      try { this.onEvent(JSON.parse(event.data)); } catch { /* Ignore malformed server frames. */ }
    });
    this.socket.addEventListener('close', (event) => {
      this.socket = null;
      if (!this.enabled || event.code === 4401) return;
      const delay = Math.min(20_000, 800 * (2 ** this.attempt++));
      this.timer = setTimeout(() => this.open(), delay);
    });
  }

  disconnect() {
    this.enabled = false;
    clearTimeout(this.timer);
    this.socket?.close(1000, 'Client logout');
    this.socket = null;
  }
}
