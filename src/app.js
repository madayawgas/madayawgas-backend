const express = require('express');
const cors = require('cors');
const corsOptions = require('./config/cors');
const routes = require('./routes');
const errorHandler = require('./middleware/error.middleware');
const cookieParser = require('./middleware/cookie.middleware');

const app = express();

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser);


// Root / Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'MadayawGas Backend API is operating normally.',
    timestamp: new Date().toISOString(),
  });
});

// API Routes (Direct endpoints without versioning)
app.use('/api', routes);

// Handle 404 (Not Found) Routes
app.use((req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Cannot find endpoint ${req.originalUrl} on this server.`,
  });
});

// Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
