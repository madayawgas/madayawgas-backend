const { EventEmitter } = require('events');

/**
 * Emergency Alerts Notifier Adapter
 * Decoupled event dispatcher providing a standing integration hook for future WebSockets,
 * server-sent events (SSE), or external push notification gateways.
 */
class AlertsNotifier extends EventEmitter {
  constructor() {
    super();
    this.wsBroadcaster = null;
  }

  /**
   * Registers a WebSocket or external push broadcaster callback.
   * When WebSockets are implemented in a future sprint, this hook receives real-time alerts.
   *
   * @param {Function} broadcasterFn - (alertPayload) => void
   */
  registerWebSocketBroadcaster(broadcasterFn) {
    if (typeof broadcasterFn === 'function') {
      this.wsBroadcaster = broadcasterFn;
    }
  }

  /**
   * Dispatches an emergency alert notification to all registered listeners and WebSocket channels.
   *
   * @param {Object} alertPayload - Standardized alert DTO
   */
  dispatchEmergencyAlert(alertPayload) {
    // 1. Emit local process event
    this.emit('emergency:dispatched', alertPayload);

    // 2. Invoke WebSocket broadcaster hook if wired
    if (this.wsBroadcaster && typeof this.wsBroadcaster === 'function') {
      try {
        this.wsBroadcaster(alertPayload);
      } catch (err) {
        console.error('[AlertsNotifier] WebSocket broadcast failed:', err.message);
      }
    }
  }

  /**
   * Dispatches status update notifications (e.g. alert acknowledged or resolved).
   *
   * @param {Object} alertPayload - Standardized alert DTO
   */
  dispatchStatusUpdate(alertPayload) {
    this.emit('emergency:status_updated', alertPayload);

    if (this.wsBroadcaster && typeof this.wsBroadcaster === 'function') {
      try {
        this.wsBroadcaster({ event: 'emergency:status_updated', data: alertPayload });
      } catch (err) {
        console.error('[AlertsNotifier] WebSocket status update broadcast failed:', err.message);
      }
    }
  }
}

module.exports = new AlertsNotifier();
