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

dotenv.config();

const app = express();
app.use(cors());
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


app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// console.log(listEndpoints(app));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
