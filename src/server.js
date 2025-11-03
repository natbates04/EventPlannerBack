const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const listEndpoints = require('express-list-endpoints');

const eventRoutes = require("./routes/events");
const userRoutes = require("./routes/users");

const toDoRoutes = require("./routes/to-do");
const linksRoutes = require("./routes/links");
const attendeesRoutes = require("./routes/attendees");
const locationRoutes = require("./routes/location");
const pollsRoutes = require("./routes/polls");
const commentsRoutes = require("./routes/comments");
const calenderRoutes = require("./routes/calender");
const settingsRoutes = require("./routes/settings")

require('./services/reminderEmails');

dotenv.config();

const app = express();

// Configure server timeout
app.use((req, res, next) => {
  // Set timeout to 30 seconds
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

const allowedOrigins = [
  "http://localhost:3000",
  "https://eventtripplanner.netlify.app",
  "https://easytripplanner.uk"
];

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

app.use((req, res, next) => {
  console.log("Incoming request origin:", req.headers.origin);
  next();
});

app.use(express.json()); 

app.use("/api/events", eventRoutes); 
app.use("/api/users", userRoutes); 

app.use("/api/to-do", toDoRoutes); 
app.use("/api/links", linksRoutes); 
app.use("/api/attendees", attendeesRoutes); 
app.use("/api/location", locationRoutes); 
app.use("/api/polls", pollsRoutes); 
app.use("/api/comments", commentsRoutes); 
app.use("/api/calendar", calenderRoutes); 
app.use("/api/settings", settingsRoutes); 

app.get("/api/health", (req, res) => {
  try {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      origin: req.headers.origin || 'No origin specified',
      cors: allowedOrigins.includes(req.headers.origin) ? 'allowed' : 'not allowed'
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path,
    method: req.method 
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.headers.origin
    });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// console.log(listEndpoints(app));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
