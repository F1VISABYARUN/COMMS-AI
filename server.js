// Root entry point for Hostinger / Passenger deployment with diagnostic logging
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'startup-error.log');

// Helper to log errors to a file
function logStartupError(type, error) {
  const timestamp = new Date().toISOString();
  const errorDetails = error ? (error.stack || error.message || error) : 'Unknown error';
  const logMessage = `[${timestamp}] ${type}:\n${errorDetails}\n\n`;
  try {
    fs.appendFileSync(logPath, logMessage);
  } catch (fsError) {
    console.error('Failed to write to startup-error.log:', fsError);
  }
}

// Catch uncaught exceptions asynchronously
process.on('uncaughtException', (err) => {
  logStartupError('UNCAUGHT EXCEPTION', err);
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logStartupError('UNHANDLED REJECTION', reason);
  console.error('Unhandled Rejection:', reason);
});

try {
  // Clear any old log on a fresh start
  if (fs.existsSync(logPath)) {
    fs.unlinkSync(logPath);
  }
  
  // Load the compiled server
  require('./dist/server.js');
  
  // Log successful entry loading
  fs.writeFileSync(logPath, `[${new Date().toISOString()}] Server entry required successfully. If the site is still 503, check if the app is listening correctly on process.env.PORT.\n`);
} catch (error) {
  logStartupError('SYNCHRONOUS INITIALIZATION ERROR', error);
  console.error('Failed to load server.js:', error);
  throw error;
}
