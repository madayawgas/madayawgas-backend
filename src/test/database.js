import Database from "better-sqlite3";

const db = new Database("madayawgas.db");

// Enforce foreign keys
db.pragma("foreign_keys = ON");

export default db;
