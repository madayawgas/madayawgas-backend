import "./test/init.js"

require('dotenv').config();
const app = require('./app');
const { testConnection, pool } = require('./config/database');

const PORT = process.env.PORT || 5000;

// Uncaught Exception Handler
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

// Start Server
const startServer = async () => {
  // Test PostgreSQL Connection
  await testConnection();

  const server = app.listen(PORT, () => {
    console.log(`🚀 MadayawGas Backend server running in [${process.env.NODE_ENV || 'development'}] mode on port ${PORT}`);
    console.log(`👉 Health check: http://localhost:${PORT}/health`);
    console.log(`👉 API base URL: http://localhost:${PORT}/api`);
  });

  // Unhandled Rejection Handler
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err);
    server.close(() => {
      process.exit(1);
    });
  });

  // Graceful Shutdown Handler
  const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('Http server closed.');
      await pool.end();
      console.log('PostgreSQL connection pool closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startServer();
