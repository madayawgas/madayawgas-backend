require("dotenv").config();

const app = require("./app");
const { testConnection, isProduction, getConnectionInfo } = require("../database/connection");
const { getBaseUrl } = require("./config/env");

const PORT = process.env.PORT || 5000;

// ======================
// Database Initialization
// ======================

async function initializeDatabase() {
    await testConnection();
}

// ======================
// Start Server
// ======================

async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, '0.0.0.0', () => {
            const baseUrl = getBaseUrl(PORT);
            const dbInfo = getConnectionInfo();

            console.log("");
            console.log("🚀 MadayawGas Backend");
            console.log(`Environment : ${isProduction ? "production (PRODUCTION=true)" : (process.env.NODE_ENV || "development") + " (PRODUCTION=false)"}`);
            console.log(`Database    : PostgreSQL [${dbInfo.mode}]`);
            console.log(`Target Host : ${dbInfo.targetHost}/${dbInfo.targetDatabase}`);
            console.log(`Source Var  : ${dbInfo.sourceEnv}`);
            console.log(`Target URL  : ${dbInfo.maskedUrl}`);
            console.log(`SSL Enabled : ${dbInfo.requiresSsl ? "true" : "false"}`);
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
