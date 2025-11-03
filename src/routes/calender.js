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
  const [rows] = await db.execute(
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
  const [eventRows] = await db.execute(
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
  const [userRows] = await db.execute(
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


router.get("/fetch-user-availability/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;
  console.log("Received request to fetch availability for user_id:", user_id);

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const [rows] = await db.execute(
      "SELECT availability FROM user_details WHERE user_id = ?",
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found or no availability data" });
    }

    const availabilityData = rows[0].availability;
    let parsedAvailability;
    try {
      parsedAvailability = typeof availabilityData === "string"
        ? JSON.parse(availabilityData)
        : availabilityData;
    } catch (parseError) {
      console.error("Failed to parse availability data:", parseError);
      return res.status(500).json({ message: "Invalid data format in availability column" });
    }
    return res.status(200).json(parsedAvailability);
  } catch (error) {
    console.error("Error fetching user availability:", error);
    return res.status(500).json({ message: "Server error" });
  }
});
  

router.post("/set-availability", authenticateToken, async (req, res) => {
  const { user_id, updates } = req.body;
  console.log("Received request to set availability:", req.body);

  if (!user_id || !Array.isArray(updates)) {
    return res.status(400).json({ message: "User ID and updates array are required" });
  }

  try {
    const [rows] = await db.execute(
      "SELECT availability FROM user_details WHERE user_id = ?",
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    let availability = {};
    try {
      const existingAvailability = rows[0].availability;
      if (typeof existingAvailability === "string" && existingAvailability.trim() !== "") {
        availability = JSON.parse(existingAvailability);
      } else if (typeof existingAvailability === "object" && existingAvailability !== null) {
        availability = existingAvailability;
      } else {
        availability = {};
      }
    } catch (parseError) {
      console.error("Error parsing existing availability:", parseError);
      return res.status(500).json({ message: "Invalid availability data format" });
    }

    updates.forEach(({ date, status }) => {
      const validStatuses = ["available", "not available", "tentative"];
      if (status === null) {
        delete availability[date];
      } else if (validStatuses.includes(status)) {
        availability[date] = status;
      } else {
        console.log(`Invalid status value for date ${date}: ${status}`);
      }
    });

    const updatedAvailability = Object.keys(availability).length > 0 ? JSON.stringify(availability) : "{}";

    await db.execute(
      "UPDATE user_details SET availability = ? WHERE user_id = ?",
      [updatedAvailability, user_id]
    );

    console.log(`Successfully updated availability for user_id: ${user_id}`);
    res.status(200).json({ message: "Availability updated successfully", availability });
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({ message: "Server error while updating availability" });
  }
});


router.post("/update-chosen-date", authenticateToken, async (req, res) => {
  console.log("Received request to update chosen date");
  const { event_id, chosen_date } = req.body;

  if (!event_id || chosen_date === undefined) {
    return res.status(400).json({ message: "event_id and chosen_date are required" });
  }

  try {
    // Ensure chosen_date is an array
    let formattedChosenDate = Array.isArray(chosen_date) ? chosen_date.map(String) : [String(chosen_date)];

    // Query to get the current chosen_dates for the event
    const [result] = await db.execute(
      "SELECT chosen_dates FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    let currentChosenDates = result[0].chosen_dates;
    try {
      currentChosenDates = typeof currentChosenDates === "string" ? JSON.parse(currentChosenDates) : (Array.isArray(currentChosenDates) ? currentChosenDates : []);
    } catch (parseError) {
      currentChosenDates = [];
    }

    // Toggle chosen_date (add if not in array, remove if already exists)
    formattedChosenDate.forEach(date => {
      if (currentChosenDates.includes(date)) {
        currentChosenDates = currentChosenDates.filter(d => d !== date);
      } else {
        currentChosenDates.push(date);
      }
    });

    await db.execute(
      "UPDATE event_details SET chosen_dates = ? WHERE event_id = ?",
      [JSON.stringify(currentChosenDates), event_id]
    );

    res.json({ message: "Chosen date updated successfully", chosen_dates: currentChosenDates });
  } catch (error) {
    console.error("Error updating chosen date:", error);
    res.status(500).json({ message: "Server error" });
  }
});


router.post("/clear-availability", authenticateToken, async (req, res) => {
  const { user_id } = req.body;
  console.log("Received request to clear availability for user:", user_id);

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const [result] = await db.execute(
      "UPDATE user_details SET availability = '{}' WHERE user_id = ?",
      [user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Availability cleared successfully" });
  } catch (error) {
    console.error("Error clearing user availability:", error);
    res.status(500).json({ message: "Server error while clearing availability" });
  }
});

module.exports = router;