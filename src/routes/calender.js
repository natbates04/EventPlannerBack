const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");
const authenticateToken = require("../middleware/auth"); 

router.get("/fetch-calendar", authenticateToken, async (req, res) => {

  console.log("Received request to fetch calendar");

  const { event_id } = req.query;

  if (!event_id) {
      return res.status(400).json({ message: "Event ID is required" });
  }

  try {
      // Retrieve event details from the database
      const [rows] = await db.promise().execute(
          "SELECT earliest_date, latest_date, duration, chosen_dates FROM event_details WHERE event_id = ?",
          [event_id]
      );

      if (rows.length === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      const eventData = rows[0];

      res.status(200).json({
          event_id: event_id,
          earliest_date: eventData.earliest_date,
          latest_date: eventData.latest_date,
          duration: eventData.duration,
          chosen_dates: eventData.chosen_dates
      });
  } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ message: "Server error" });
  }
});

router.get("/fetch-availability/:event_id", authenticateToken, async (req, res) => {
  const { event_id } = req.params;

  console.log("Received request to fetch availability for event_id:", event_id);

  if (!event_id) {
      return res.status(400).json({ message: "Event ID is required" });
  }

  try {
      // 🔹 Step 1: Fetch organizer ID & attendee IDs from event_details
      const [eventRows] = await db.promise().execute(
          "SELECT organiser_id, attendees FROM event_details WHERE event_id = ?",
          [event_id]
      );

      if (eventRows.length === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      console.log("Fetched event details:", eventRows[0]);

      const { organiser_id, attendees } = eventRows[0];

      // If attendees is null, treat it as an empty array
      const attendeesList = attendees ? attendees : [];

      // Create a list of user IDs to fetch details for
      const userIds = [organiser_id, ...attendeesList].filter(Boolean);

      console.log("Fetching details for user IDs:", userIds);

      if (userIds.length === 0) {
          return res.status(404).json({ message: "No users found for this event" });
      }

      // 🔹 Step 2: Fetch user details and availability for all users
      const [userRows] = await db.promise().execute(
          `SELECT user_id, username, role, availability, profile_pic, created_at FROM user_details WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
          userIds
      );

      // 🔹 Step 3: Organize the data
      let response = {
          organiser: null,
          attendees: []
      };

      userRows.forEach(({ user_id, username, role, availability, profile_pic, created_at}) => {
          const userData = {
              user_id,
              username,
              availability: availability,
              profile_pic,
              created_at
          };

          if (user_id === organiser_id) {
              response.organiser = userData;
          } else {
              response.attendees.push(userData);
          }
      });

      return res.status(200).json(response);
  } catch (error) {
      console.error("Error fetching availability:", error);
      return res.status(500).json({ message: "Server error" });
  }
});

router.get("/fetch-user-availability/:user_id", authenticateToken, (req, res) => {
    const { user_id } = req.params;
  
    console.log("Received request to fetch availability for user_id:", user_id);
  
    // Validate input
    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }
  
    // Query the database to get user's availability
    const query = "SELECT availability FROM user_details WHERE user_id = ?";
  
    db.execute(query, [user_id], (err, rows) => {
      if (err) {
        console.error("Error fetching user availability:", err);
        return res.status(500).json({ message: "Server error" });
      }
  
      if (rows.length === 0) {
        console.log(`No availability data found for user_id: ${user_id}`);
        return res.status(404).json({ message: "User not found or no availability data" });
      }
  
      const availabilityData = rows[0].availability;
  
      try {
        // Parse JSON availability if stored as a string
        const parsedAvailability = typeof availabilityData === "string"
          ? JSON.parse(availabilityData)
          : availabilityData;
  
        return res.status(200).json(parsedAvailability);
      } catch (parseError) {
        console.error("Failed to parse availability data:", parseError);
        return res.status(500).json({ message: "Invalid data format in availability column" });
      }
    });
});
  
router.post("/set-availability", authenticateToken, (req, res) => {
  const { user_id, updates } = req.body;

  console.log("Received request to set availability:", req.body);

  // Validate input
  if (!user_id || !Array.isArray(updates)) {
    return res.status(400).json({ message: "User ID and updates array are required" });
  }

  // Fetch the current availability JSON for the user
  const query = "SELECT availability FROM user_details WHERE user_id = ?";
  db.execute(query, [user_id], (err, rows) => {
    if (err) {
      console.error("Error fetching user availability:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (rows.length === 0) {
      console.log(`User with ID ${user_id} not found`);
      return res.status(404).json({ message: "User not found" });
    }

    let availability = {};

    console.log("Fetched availability data:", rows[0].availability);

    // Ensure the availability data is parsed correctly
    try {
      const existingAvailability = rows[0].availability;
      if (typeof existingAvailability === "string" && existingAvailability.trim() !== "") {
        availability = JSON.parse(existingAvailability);
      } else if (typeof existingAvailability === "object" && existingAvailability !== null) {
        availability = existingAvailability; // Already an object, no need to parse
      } else {
        availability = {}; // Handle null or empty case
      }
    } catch (parseError) {
      console.error("Error parsing existing availability:", parseError);
      return res.status(500).json({ message: "Invalid availability data format" });
    }

    // Process each update
    updates.forEach(({ date, status }) => {
      // Validate status value
      const validStatuses = ["available", "not available", "tentative"];
      if (status === null) {
        // Remove date from availability if status is null
        delete availability[date];
      } else if (validStatuses.includes(status)) {
        // Set or update the availability for the date
        availability[date] = status;
      } else {
        // Skip invalid status values
        console.log(`Invalid status value for date ${date}: ${status}`);
      }
    });

    // Convert updated availability back to JSON
    const updatedAvailability = Object.keys(availability).length > 0 ? JSON.stringify(availability) : "{}";

    console.log("Updated availability data:", updatedAvailability);

    // Update the availability in the database
    const updateQuery = "UPDATE user_details SET availability = ? WHERE user_id = ?";
    db.execute(updateQuery, [updatedAvailability, user_id], (updateErr) => {
      if (updateErr) {
        console.error("Error updating availability:", updateErr);
        return res.status(500).json({ message: "Server error while updating availability" });
      }

      console.log(`Successfully updated availability for user_id: ${user_id}`);
      res.status(200).json({ message: "Availability updated successfully", availability });
    });
  });
});

router.post("/update-chosen-date", authenticateToken, (req, res) => {
  console.log("Received request to update chosen date");

  const { event_id, chosen_date } = req.body;

  // Check if event_id or chosen_date are missing
  if (!event_id || chosen_date === undefined) {
    console.log("Missing event_id or chosen_date");
    return res.status(400).json({ message: "event_id and chosen_date are required" });
  }

  // If chosen_date is explicitly null, set it to NULL in the database
  let updateChosenDate = chosen_date === null ? null : chosen_date;

  // Ensure chosen_date is an array
  let formattedChosenDate = Array.isArray(chosen_date) ? chosen_date.map(String) : [String(chosen_date)];

  // Query to get the current chosen_dates for the event
  const selectQuery = `SELECT chosen_dates FROM event_details WHERE event_id = ?`;

  db.execute(selectQuery, [event_id], (err, result) => {
    if (err) {
      console.error("Error fetching current chosen dates:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (result.length === 0) {
      console.log(`Event with ID ${event_id} not found`);
      return res.status(404).json({ message: "Event not found" });
    }

    let currentChosenDates = result[0].chosen_dates;

    // If currentChosenDates is null or not an array, initialize it as an empty array
    if (!currentChosenDates || !Array.isArray(currentChosenDates)) {
      console.log("No valid current chosen_dates, initializing as empty array.");
      currentChosenDates = [];
    }

    // Toggle chosen_date (add if not in array, remove if already exists)
    formattedChosenDate.forEach(date => {
      if (currentChosenDates.includes(date)) {
        // Remove the date if it already exists
        currentChosenDates = currentChosenDates.filter(d => d !== date);
      } else {
        // Add the date if it doesn't exist
        currentChosenDates.push(date);
      }
    });

    console.log("Updated chosen_dates array:", currentChosenDates);

    // Update the chosen_dates in the database with the new array
    const updateQuery = `UPDATE event_details SET chosen_dates = ? WHERE event_id = ?`;

    db.execute(updateQuery, [JSON.stringify(currentChosenDates), event_id], (updateErr, updateResult) => {
      if (updateErr) {
        console.error("Error updating chosen date:", updateErr);
        return res.status(500).json({ message: "Server error" });
      }

      if (updateResult.affectedRows === 0) {
        console.log("No rows affected during update");
        return res.status(404).json({ message: "Event not found" });
      }

      console.log("Chosen date updated successfully");
      res.json({ message: "Chosen date updated successfully", chosen_dates: currentChosenDates });
    });
  });
});

router.post("/clear-availability", authenticateToken, (req, res) => {
  const { user_id } = req.body;

  console.log("Received request to clear availability for user:", user_id);

  // Validate input
  if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
  }

  // Clear the availability for the given user by setting the availability to an empty object
  const clearQuery = "UPDATE user_details SET availability = '{}' WHERE user_id = ?";
  db.execute(clearQuery, [user_id], (err, result) => {
      if (err) {
          console.error("Error clearing user availability:", err);
          return res.status(500).json({ message: "Server error while clearing availability" });
      }

      if (result.affectedRows === 0) {
          console.log(`User with ID ${user_id} not found`);
          return res.status(404).json({ message: "User not found" });
      }

      console.log(`Successfully cleared availability for user_id: ${user_id}`);
      res.status(200).json({ message: "Availability cleared successfully" });
  });
});

module.exports = router;