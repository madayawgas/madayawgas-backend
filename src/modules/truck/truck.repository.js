import db from "../../test/database.js";

export function findAll() {
  return db
    .prepare(
      `
        SELECT *
        FROM trucks
        ORDER BY id
    `,
    )
    .all();
}

export function findById(id) {
  return db
    .prepare(
      `
        SELECT *
        FROM trucks
        WHERE id = ?
    `,
    )
    .get(id);
}

export function findAvailable() {
  return db
    .prepare(
      `
        SELECT *
        FROM trucks
        WHERE status = 'Available'
        ORDER BY plate_number
    `,
    )
    .all();
}

export function findByStatus(status) {
  return db
    .prepare(
      `
        SELECT *
        FROM trucks
        WHERE status = ?
        ORDER BY plate_number
    `,
    )
    .all(status);
}

export function findMaintenanceLogs(truckId) {
  return db
    .prepare(
      `
        SELECT
            id,
            date,
            type,
            mechanic,
            remarks
        FROM maintenance_logs
        WHERE truck_id = ?
        ORDER BY date DESC
    `,
    )
    .all(truckId);
}

export function updateFuelLevel(id, fuelLevel) {
  db.prepare(
    `
        UPDATE trucks
        SET fuel_level = ?
        WHERE id = ?
    `,
  ).run(fuelLevel, id);

  return findById(id);
}

export function create(truck) {
  const result = db
    .prepare(
      `
        INSERT INTO trucks
        (
            plate_number,
            model,
            capacity_kg,
            assigned_driver_id,
            fuel_level,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      truck.plateNumber,
      truck.model,
      truck.capacityKg,
      truck.assignedDriverId,
      truck.fuelLevel,
      truck.status,
    );

  return findById(result.lastInsertRowid);
}

export function deleteById(id) {
  return db
    .prepare(
      `
        DELETE FROM trucks
        WHERE id = ?
    `,
    )
    .run(id);
}
