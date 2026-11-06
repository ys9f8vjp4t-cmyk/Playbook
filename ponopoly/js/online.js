// Клиент онлайн-комнат (WebSocket). Сервер — server/index.js.
import { getPref, setPref } from './storage.js';

export function defaultServerUrl() {
  const cfg = (typeof window !== 'undefined' && window.PONOPOLY_CONFIG) || {};
  const saved = getPref('serverUrl', '');
  if (saved) return saved;
  if (cfg.serverUrl) return cfg.serverUrl;
  if (typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  return '';
}

export class Online {
  constructor() {
    this.ws = null; this.url = null; this.handlers = {};
    this.room = null; this.state = null; this.you = null; this.secret = null; this.code = null;
    this.closedByUser = false; this.retry = 0; this.timer = null; this.connected = false;
  }
  on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); return this; }
  emit(evt, data) { for (const fn of this.handlers[evt] || []) { try { fn(data); } catch (e) { console.error(e); } } }

  connect(url) {
    this.url = url; this.closedByUser = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      try { this.ws = new WebSocket(url); } catch (e) { reject(e); return; }
      const ws = this.ws;
      const to = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch {} reject(new Error('Сервер не отвечает')); } }, 8000);
      ws.onopen = () => { this.connected = true; this.retry = 0; this.emit('open'); };
      ws.onmessage = (m) => {
        let msg; try { msg = JSON.parse(m.data); } catch { return; }
        if (msg.t === 'hello' && !settled) { settled = true; clearTimeout(to); resolve(msg); }
        this.handle(msg);
      };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error('Не удалось подключиться к серверу')); } };
      ws.onclose = () => {
        this.connected = false; this.emit('close');
        if (!settled) { settled = true; clearTimeout(to); reject(new Error('Соединение закрыто')); }
        if (!this.closedByUser && this.code) this.scheduleReconnect();
      };
    });
  }

  scheduleReconnect() {
    clearTimeout(this.timer);
    const delay = Math.min(15000, 1000 * 2 ** this.retry++);
    this.emit('reconnecting', delay);
    this.timer = setTimeout(async () => {
      try { await this.connect(this.url); this.send({ t: 'rejoin', code: this.code, pid: this.you, secret: this.secret }); }
      catch { if (!this.closedByUser) this.scheduleReconnect(); }
    }, delay);
  }

  handle(msg) {
    switch (msg.t) {
      case 'joined':
        this.code = msg.code; this.you = msg.pid; this.secret = msg.secret;
        setPref('online', { url: this.url, code: this.code, pid: this.you, secret: this.secret });
        this.emit('joined', msg); break;
      case 'room': this.room = msg.room; this.emit('room', msg.room); break;
      case 'state': this.state = msg.state; this.emit('state', { state: msg.state, events: msg.events || [] }); break;
      case 'error': this.emit('error', msg.msg); break;
      case 'kicked': this.forget(); this.emit('kicked'); break;
      case 'hello': break;
      default: break;
    }
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  create(name, token) { this.send({ t: 'create', name, token }); }
  join(code, name, token) { this.send({ t: 'join', code: String(code).toUpperCase(), name, token }); }
  rejoin(sess) { this.code = sess.code; this.you = sess.pid; this.secret = sess.secret; this.send({ t: 'rejoin', code: sess.code, pid: sess.pid, secret: sess.secret }); }
  start() { this.send({ t: 'start' }); }
  addBot() { this.send({ t: 'add_bot' }); }
  kick(pid) { this.send({ t: 'kick', pid }); }
  settings(settings) { this.send({ t: 'settings', settings }); }
  action(action) { this.send({ t: 'action', action }); }
  leave() { this.send({ t: 'leave' }); this.forget(); this.close(); }
  forget() { this.code = null; this.you = null; this.secret = null; this.room = null; this.state = null; this._langSent = false; setPref('online', null); }
  close() { this.closedByUser = true; clearTimeout(this.timer); try { this.ws && this.ws.close(); } catch {} this.ws = null; }

  static savedSession() { return getPref('online', null); }
}
