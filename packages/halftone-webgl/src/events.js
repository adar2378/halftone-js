export default class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] || (this._listeners[event] = [])).push(fn);
    return this;
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (!list) return this;
    if (fn) {
      this._listeners[event] = list.filter(f => f !== fn);
    } else {
      delete this._listeners[event];
    }
    return this;
  }

  emit(event, data) {
    const list = this._listeners[event];
    if (list) list.forEach(fn => fn(data));
  }

  destroy() {
    this._listeners = {};
  }
}
