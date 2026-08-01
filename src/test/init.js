import db from "./database.js";

// ======================
// Create Tables
// ======================

db.exec(`
CREATE TABLE IF NOT EXISTS trucks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    capacity_kg INTEGER NOT NULL,
    assigned_driver_id INTEGER,
    fuel_level INTEGER NOT NULL,
    status TEXT NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    truck_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    mechanic TEXT NOT NULL,
    remarks TEXT,

    FOREIGN KEY (truck_id)
        REFERENCES trucks(id)
        ON DELETE CASCADE
);
`);

// ======================
// Seed Data
// ======================

const truckCount = db
  .prepare("SELECT COUNT(*) AS count FROM trucks")
  .get().count;

if (truckCount === 0) {
  const insertTruck = db.prepare(`
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
    `);

  insertTruck.run("ABC-1234", "Isuzu NQR", 3000, 12, 75, "Available");

  insertTruck.run("XYZ-5689", "Mitsubishi Fuso", 2500, 18, 42, "On Delivery");

  const insertLog = db.prepare(`
        INSERT INTO maintenance_logs
        (
            truck_id,
            date,
            type,
            mechanic,
            remarks
        )
        VALUES (?, ?, ?, ?, ?)
    `);

  insertLog.run(
    1,
    "2026-07-10",
    "Oil Change",
    "Juan Dela Cruz",
    "Changed engine oil and filter",
  );

  insertLog.run(
    1,
    "2026-07-25",
    "Brake Inspection",
    "Pedro Santos",
    "Front brake pads replaced",
  );

  insertLog.run(
    2,
    "2026-07-15",
    "Tire Replacement",
    "Jose Cruz",
    "Rear tires replaced",
  );
}
