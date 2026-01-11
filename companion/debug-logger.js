// Debug logger for instrumentation
const fs = require('fs');
const path = require('path');

const DEBUG_LOG_PATH = path.join(__dirname, '..', '.cursor', 'debug.log');
const SERVER_ENDPOINT = 'http://127.0.0.1:7242/ingest/86716442-378e-4392-ba69-3c91920c565e';

function debugLog(location, message, data, hypothesisId) {
  const logEntry = {
    location,
    message,
    data,
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId
  };
  
  // Write to file (always works)
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify(logEntry) + '\n');
  } catch (e) {
    // Ignore file write errors
  }
  
  // Also try HTTP endpoint if fetch is available
  if (typeof fetch !== 'undefined') {
    try {
      fetch(SERVER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      }).catch(() => {}); // Ignore HTTP errors
    } catch (e) {
      // Ignore fetch errors
    }
  }
}

module.exports = { debugLog };
