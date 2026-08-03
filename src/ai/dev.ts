// Dev environment configuration — dotenv is optional
try {
  const { config } = require('dotenv');
  config();
} catch {
  // dotenv not installed — environment variables must be set externally
}
