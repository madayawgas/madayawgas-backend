require("dotenv").config();

const app = require("./app");
const { testConnection } = require("./database/connection");

const PORT = process.env.PORT || 5000;

// ======================
// Database Initialization
// ======================

async function initializeDatabase() {
    await testConnection();

    console.log("🐘 Using PostgreSQL");
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
            console.log(`Environment : ${process.env.NODE_ENV || "development"}`);
            console.log("Database    : PostgreSQL");
            console.log(`Port        : ${PORT}`);
            console.log(`Health      : http://localhost:${PORT}/health`);
            console.log(`API         : http://localhost:${PORT}/api`);
            console.log("");
        });
    } catch (error) {
        console.error("❌ Failed to start server.");
        console.error(error.message);

        process.exit(1);
    }
}

startServer();
