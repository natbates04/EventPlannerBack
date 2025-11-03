const mysql = require('mysql2');
require('dotenv').config();

// Verify required environment variables
const requiredEnvVars = ['MYSQLHOST', 'MYSQLUSER', 'MYSQLPASSWORD', 'MYSQLDATABASE', 'MYSQLPORT'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const poolConfig = {
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
  acquireTimeout: 10000,
  timeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create the connection pool
const pool = mysql.createPool(poolConfig).promise();

// Test the connection and handle errors
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to MySQL database');
    console.log('Database host:', process.env.MYSQLHOST);
    
    // Test the connection with a simple query
    await connection.query('SELECT 1');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection error:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      hostname: error.hostname
    });
    
    // Additional debugging information
    console.log('Database connection details:', {
      host: process.env.MYSQLHOST,
      port: process.env.MYSQLPORT,
      database: process.env.MYSQLDATABASE,
      user: process.env.MYSQLUSER
    });
    
    return false;
  }
}

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection was closed. Attempting to reconnect...');
    testConnection();
  }
});

// Initial connection test
testConnection();

module.exports = pool;
