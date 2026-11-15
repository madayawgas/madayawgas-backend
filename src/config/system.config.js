/**
 * Central Non-Secret System Configuration
 *
 * Holds:
 * 1. `businessDefaults`: Canonical fallback defaults for the 6 DB-backed
 *    `system_settings` variables (which are editable in the System Settings UI).
 * 2. `system`: System-wide non-secret operational constants (cache TTLs, upload
 *    ceilings, pagination bounds, session lifetimes, fleet operational bounds).
 *
 * NOTE: Secrets, credentials, and environment-specific URLs belong in `.env`
 * and `src/config/env.js`, NOT here.
 */
module.exports = {
  businessDefaults: {
    'fleet.pm_odometer_threshold_km': 5000,
    'fleet.work_order_approval_threshold': 5000.0,
    'operations.fuel_efficiency_variance_percent': 5,
    'operations.sos_dedup_window_seconds': 60,
    'inventory.canisters_per_crate': 24,
    'schedules.max_generation_days': 31,
  },
  system: {
    settingsCacheTtlMs: 60 * 1000, // 1 minute
    maxUploadFileSizeBytes: 5 * 1024 * 1024, // 5 MB
    pagination: {
      defaultLimit: 20,
      maxLimit: 100,
    },
    auth: {
      idleTimeoutMs: 8 * 60 * 60 * 1000, // 8 hours
      absoluteLifetimeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
    fleet: {
      maxOdometerKm: 999999,
      pmApproachingRatio: 0.8,
    },
  },
};
