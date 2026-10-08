require("dotenv").config();

const app = require("./app");
const { testConnection, isProduction } = require("../database/connection");
const { getBaseUrl } = require("./config/env");

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
            const baseUrl = getBaseUrl(PORT);

            console.log("");
            console.log("🚀 MadayawGas Backend");
            console.log(`Environment : ${isProduction ? "production" : (process.env.NODE_ENV || "development")}`);
            console.log("Database    : PostgreSQL");
            console.log(`Port        : ${PORT}`);
            console.log(`Health      : ${baseUrl}/health`);
            console.log(`API         : ${baseUrl}/api`);
            console.log("");
        });
    } catch (error) {
        console.error("❌ Failed to start server.");
        console.error(error.message);

        process.exit(1);
    }
}

startServer();
