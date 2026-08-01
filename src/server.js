require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 5000;
const DB_CLIENT = process.env.DB_CLIENT || "sqlite";

// ======================
// Database Initialization
// ======================

async function initializeDatabase() {
  switch (DB_CLIENT) {
    case "sqlite":
      require("./test/init");
      console.log("📦 Using SQLite");
      break;

    case "postgres":
      const { testConnection } = require("./config/database");

      await testConnection();

      console.log("🐘 Using PostgreSQL");

      break;

    default:
      throw new Error(`Unsupported database: ${DB_CLIENT}`);
  }
}

// ======================
// Start Server
// ======================

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log("");
      console.log("🚀 MadayawGas Backend");
      console.log(`Environment : ${process.env.NODE_ENV}`);
      console.log(`Database    : ${DB_CLIENT}`);
      console.log(`Port        : ${PORT}`);
      console.log(`Health      : http://localhost:${PORT}/health`);
      console.log(`API         : http://localhost:${PORT}/api`);
      console.log("");
    });
  } catch (error) {
    console.error("Failed to start server.");
    console.error(error);

    process.exit(1);
  }
}

startServer();
