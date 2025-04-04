const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");

router.post("/update-event", async (req, res) => {
    const {
      event_id,
      title,
      description,
      earliest_date,
      latest_date,
      location,
      duration,
    } = req.body;
  
    // Validate the required fields
    if (!event_id || !title || !description || !earliest_date || !latest_date || !location || !duration) {
      return res.status(400).json({ message: "All fields are required" });
    }
  
    try {
      // Query to check if the event exists
      const [rows] = await db.promise().execute(
        "SELECT * FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "Event not found" });
      }
  
      // Update event in the database with new fields (title, description, and other details)
      await db.promise().execute(
        `UPDATE event_details SET
          title = ?, 
          description = ?, 
          earliest_date = ?, 
          latest_date = ?, 
          location = ?, 
          duration = ?
         WHERE event_id = ?`,
        [
          title,
          description,
          earliest_date,
          latest_date,
          location,
          duration,
          event_id,
        ]
      );
  
      res.status(200).json({ message: "Event updated successfully" });
    } catch (error) {
      console.error("Error updating event:", error);
      res.status(500).json({ message: "Server error" });
    }
});

router.get("/fetch-settings", async (req, res) => {

  console.log("fetching settings");

  const { event_id } = req.query;

  // Validate the event_id parameter
  if (!event_id) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  try {
    // Query to fetch event details
    const [rows] = await db.promise().execute(
      "SELECT title, description, earliest_date, latest_date, duration FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Return the event details
    res.status(200).json({
      event: rows[0], // Assuming rows contains the event data
    });
  } catch (error) {
    console.error("Error fetching event details:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;