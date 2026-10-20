const { EventEmitter } = require('events');
const { safeEmitSocketEvent } = require('../../../socket');

/**
 * Emergency Alerts Notifier Adapter
 * Decoupled event dispatcher providing real-time WebSockets integration,
 * local event emission, and standing hooks for external push gateways.
 */
class AlertsNotifier extends EventEmitter {
  constructor() {
    super();
    this.wsBroadcaster = null;
  }

  /**
   * Registers a WebSocket or external push broadcaster callback.
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

    // 2. Real-time WebSocket broadcast to room:alerts
    safeEmitSocketEvent('EMERGENCY_ALERT_TRIGGERED', alertPayload, 'room:alerts');

    // 3. Invoke custom broadcaster hook if registered
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
    // 1. Emit local process event
    this.emit('emergency:status_updated', alertPayload);

    // 2. Real-time WebSocket broadcast to room:alerts
    safeEmitSocketEvent('EMERGENCY_ALERT_STATUS_UPDATED', alertPayload, 'room:alerts');

    // 3. Invoke custom broadcaster hook if registered
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

