require('dotenv').config();
const mysql = require('mysql2');
require('dotenv').config({ path: '../.env' });

console.log(process.env.DB_HOST, process.env.DB_USER);

const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
});

db.connect(err => {
    if (err) {
        console.error("Database connection failed:", err);
    } else {
        console.log("Connected to MySQL database");
    }
});

module.exports = db;
