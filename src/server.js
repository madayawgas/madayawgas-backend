require("dotenv").config();

const http = require("node:http");
const app = require("./app");
const { initializeSocket, closeSocket } = require("./socket");
const { testConnection, isProduction, getConnectionInfo } = require("../database/connection");
const { getBaseUrl } = require("./config/env");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
initializeSocket(server);

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

        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.error(`\n❌ Port ${PORT} is already in use by another process.`);
                console.error(`👉 Terminate the process using port ${PORT} or configure a different PORT in .env.\n`);
            } else {
                console.error("\n❌ Server encountered an unexpected error:", error.message);
            }
            process.exit(1);
        });

        server.listen(PORT, '0.0.0.0', () => {
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

// ======================
// Graceful Shutdown
// ======================

async function handleShutdown(signal) {
    if (!isProduction && process.env.NODE_ENV !== 'production') {
        console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
    }
    try {
        await closeSocket();
        server.close(() => {
            process.exit(0);
        });
    } catch (err) {
        process.exit(1);
    }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

if (require.main === module) {
    startServer();
}

module.exports = { server, startServer };
