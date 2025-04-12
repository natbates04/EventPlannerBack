const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require("uuid");
const sendEmail = require("../services/emailService");

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const isEventIdUnique = (newEventId) => {
  return new Promise((resolve, reject) => {
      const query = "SELECT COUNT(*) AS count FROM event_details WHERE event_id = ?";
      db.execute(query, [newEventId], (err, rows) => {
          if (err) {
              reject(err);
          } else {
              resolve(rows[0].count === 0); // If count is 0, the UUID is unique
          }
      });
  });
};

router.get("/fetch-event/:event_id", async (req, res) => {
  const { event_id } = req.params; // Get event_id from the URL path

  console.log("Fetching event: " + event_id);

  db.execute("SELECT title, description, status, chosen_dates, cancellation_reason, location FROM event_details WHERE event_id = ?", [event_id], (err, rows) => {
      if (err) {
          console.error("Error fetching event:", err);
          return res.status(500).json({ message: "Server error" });
      }

      if (rows.length === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      res.json(rows[0]); // Return the event details
  });
});

router.post("/create-event", (req, res) => {
  let {
    event_id,
    title,
    description,
    earliest_date,
    latest_date,
    location,
    duration = 1,
    reminder_time,
    organiser_id,
    status = "pending",
  } = req.body;

  console.log("Organiser's ID:", organiser_id);

  // Generate UUID if not provided
  if (!event_id) {
    event_id = uuidv4();
  } else if (!isUUID(event_id)) {
    return res.status(400).json({ message: "Invalid event_id format" });
  }

  // Validate required fields
  if (!title || !earliest_date || !latest_date || !organiser_id) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Convert empty or undefined values to NULL for MySQL
  reminder_time = reminder_time || null;
  location = location || null;
  title = title || null;
  description = description || null;

  // Ensure numeric fields are treated correctly
  duration = Number(duration) || 1;

  const query = `
    INSERT INTO event_details (event_id, title, description, earliest_date, latest_date, location, 
    duration, reminder_time, organiser_id, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.execute(
    query,
    [
      event_id,
      title,
      description,
      earliest_date,
      latest_date,
      location,
      duration,
      reminder_time,
      organiser_id,
      status,
    ],
    (err, result) => {
      if (err) {
        console.error("Error creating event:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
      }

      console.log("Event created successfully with ID:", event_id);

      // Fetch the organiser's email
      db.execute(
        "SELECT email FROM user_details WHERE user_id = ?",
        [organiser_id],
        (emailErr, emailResult) => {
          if (emailErr) {
            console.error("Error fetching organiser's email:", emailErr);
            return res
              .status(500)
              .json({ message: "Failed to fetch organiser's email" });
          }

          if (emailResult.length === 0) {
            console.error("Organiser email not found for organiser_id:", organiser_id);
            return res
              .status(404)
              .json({ message: "Organiser not found in user_details" });
          }

          const organiserEmail = emailResult[0].email;
          console.log("Organiser's email:", organiserEmail);

          // Prepare the message
          const emailMessage = `Hello, your event "${title}" has been created successfully with Event ID: ${event_id}.`;

          // Call the sendEmail function
          sendEmail(organiserEmail, "Trip Created", emailMessage);

          // Respond to the client
          res
            .status(201)
            .json({ message: "Event created successfully", event_id });
        }
      );
    }
  );
});

router.post("/update-event", async (req, res) => {
  const {
    event_id,
    title,
    description,
    earliest_date,
    latest_date,
    duration,
  } = req.body;

  console.log("Latest event date: ", latest_date);

  // Validate the required fields
  if (!event_id || !title || !description || !earliest_date || !latest_date || !duration) {
    console.log("🔹 Debugging Missing Fields:");
    console.log("event_id:", event_id);
    console.log("title:", title);
    console.log("description:", description);
    console.log("earliest_date:", earliest_date);
    console.log("latest_date:", latest_date);
    console.log("duration:", duration);

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
        duration = ?
       WHERE event_id = ?`,
      [
        title,
        description,
        earliest_date,
        latest_date,
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

router.post("/confirm-event", async (req, res) => {
  const { event_id, reminder_date, selectedDates } = req.body;

  if (!event_id || !reminder_date || !Array.isArray(selectedDates) || selectedDates.length === 0) {
      return res.status(400).json({ message: "event_id, reminder_date, and selectedDates are required" });
  }

  const updateQuery = `
      UPDATE event_details 
      SET status = 'confirmed', reminder_time = ?, chosen_dates = ?
      WHERE event_id = ?
  `;

  try {
      const [result] = await db.promise().execute(updateQuery, [
        reminder_date,
          JSON.stringify(selectedDates), // Store selectedDates as JSON
          event_id
      ]);

      if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      console.log(`Event ${event_id} confirmed successfully with reminder on ${reminder_date}`);

      // Fetch attendees' emails
      const [eventRows] = await db.promise().execute(
          "SELECT attendees FROM event_details WHERE event_id = ?",
          [event_id]
      );

      if (eventRows.length === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      const { attendees } = eventRows[0];
      let emailList = [];

      if (attendees) {
          const attendeeIds = attendees;
          if (Array.isArray(attendeeIds) && attendeeIds.length > 0) {
              const [attendeeEmails] = await db.promise().execute(
                  `SELECT email FROM user_details WHERE user_id IN (${attendeeIds.map(() => '?').join(',')})`,
                  attendeeIds
              );
              emailList.push(...attendeeEmails.map(a => a.email));
          }
      }

      console.log("Notifying attendees:", emailList);

      // Send confirmation emails to attendees
      emailList.forEach(email => {
          sendEmail(email, "Event Confirmed", 
              `The event with ID ${event_id} has been confirmed.\n
               Reminder Date: ${reminder_date}\n
               Selected Dates: ${selectedDates.join(", ")}`
          );
      });

      res.json({ message: "Event confirmed successfully" });

  } catch (error) {
      console.error("Error confirming event:", error);
      res.status(500).json({ message: "Server error" });
  }
});

router.post("/cancel-event", (req, res) => {
  const { event_id, cancellation_reason = "" } = req.body;

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required" });
  }

  const updateQuery = `
    UPDATE event_details 
    SET status = 'canceled', cancellation_reason = ?, reminder_time = NULL 
    WHERE event_id = ?
  `;

  db.execute(updateQuery, [cancellation_reason, event_id], async (err, result) => {
    if (err) {
      console.error("Error cancelling event:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    console.log(`Event ${event_id} cancelled successfully with reason: ${cancellation_reason}`);

    // Fetch attendees' emails
    try {
      const [eventRows] = await db.promise().execute(
        "SELECT attendees FROM event_details WHERE event_id = ?",
        [event_id]
      );

      if (eventRows.length === 0) {
        return res.status(404).json({ message: "Event not found" });
      }

      const { attendees } = eventRows[0];
      let emailList = [];

      let attendeeIds = [];
      try {
        // Safely parse the attendees field
        if (attendees) {
          attendeeIds = attendees;
        }
      } catch (error) {
        console.error("Error parsing attendees JSON:", error);
        return res.status(400).json({ message: "Invalid attendees data format" });
      }

      if (Array.isArray(attendeeIds) && attendeeIds.length > 0) {
        const [attendeeEmails] = await db.promise().execute(
          `SELECT email FROM user_details WHERE user_id IN (${attendeeIds.map(() => '?').join(',')})`,
          attendeeIds
        );
        emailList.push(...attendeeEmails.map(a => a.email));
      }

      console.log("Notifying attendees of cancellation:", emailList);

      // Send cancellation emails to attendees
      emailList.forEach(email => {
        sendEmail(email, "Event Cancelled", `The event with ID ${event_id} has been cancelled. Reason: ${cancellation_reason}`);
      });

      res.json({ message: "Event cancelled successfully" });
    } catch (error) {
      console.error("Error fetching attendees:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
});

router.post('/reopen-event', async (req, res) => {
  const { event_id } = req.body;

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required" });
  }

  const updateQuery = `
    UPDATE event_details 
    SET 
      status = 'pending', 
      reminder_time = NULL,
      chosen_dates = NULL
    WHERE event_id = ?
  `;

  try {
    // Directly log the result to understand its structure
    const result = await db.execute(updateQuery, [event_id]);

    // Check if the result contains the affectedRows field
    if (result && result[0] && result[0].affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    console.log(`Event ${event_id} reopened successfully`);
    return res.status(200).json({ message: 'Event reopened successfully' });
  } catch (err) {
    console.error("Error reopening event:", err);
    return res.status(500).json({ message: 'Error reopening event' });
  }
});


router.post("/update-last-update", async (req, res) => {
  const { event_id, path, timestamp } = req.body;

  // Validate input
  if (!event_id || !path || !timestamp) {
    return res.status(400).json({ message: "Missing required fields (event_id, path, timestamp)" });
  }

  try {
    // Fetch the current last_updated object from the event_details table
    const [event] = await db.promise().execute(
      "SELECT last_updated FROM event_details WHERE event_id = ?",
      [event_id]
    );

    // Check if event exists
    if (!event.length) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Initialize lastUpdated as an array if it's not present or if it's not a valid array
    let lastUpdated = Array.isArray(event[0].last_updated) ? event[0].last_updated : [];

    // Check if the path already exists in the last_updated object
    const existingPathIndex = lastUpdated.findIndex(entry => entry.path === path);

    console.log("INPUT ", timestamp)
    console.log("CAHNGED TOO ", new Date(timestamp));

    if (existingPathIndex !== -1) {
      // If path exists, update the timestamp for that path
      lastUpdated[existingPathIndex].timestamp = timestamp; // Update timestamp
    } else {
      // If path doesn't exist, add a new entry
      lastUpdated.push({
        path,
        timestamp: timestamp, // Add new entry
      });
    }

    // Update the last_updated field in the event_details table with the new data
    const [result] = await db.promise().execute(
      "UPDATE event_details SET last_updated = ? WHERE event_id = ?",
      [JSON.stringify(lastUpdated), event_id] // Save it back as a JSON string
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found or update failed" });
    }

    // Successfully updated
    res.status(200).json({ message: "Last updated path updated successfully" });
  } catch (error) {
    console.error("Error updating last updated path:", error);
    res.status(500).json({ message: "Server error while updating last updated path" });
  }
});

router.post("/fetch-last-update", async (req, res) => {
  const { event_id } = req.body;

  // Validate input
  if (!event_id) {
    return res.status(400).json({ message: "Missing required field (event_id)" });
  }

  try {
    // Fetch the last_updated object from the event_details table
    const [event] = await db.promise().execute(
      "SELECT last_updated FROM event_details WHERE event_id = ?",
      [event_id]
    );

    // Check if event exists
    if (!event.length) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Parse the last_updated data from the database
    const lastUpdated = Array.isArray(event[0].last_updated) ? event[0].last_updated : [];

    // Successfully fetched last updated paths
    res.status(200).json({ last_updated: lastUpdated });
  } catch (error) {
    console.error("Error fetching last updated paths:", error);
    res.status(500).json({ message: "Server error while fetching last updated paths" });
  }
});

// Migrate event to a new unique UUID
router.post("/migrate-event", async (req, res) => {
  const { event_id } = req.body;

  if (!event_id) {
      return res.status(400).json({ message: "Event ID is required" });
  }

  try {
      let newEventId = uuidv4(); // Generate a new UUID
      
      // Check if the generated UUID is unique
      let isUnique = await isEventIdUnique(newEventId);

      // Keep generating new UUIDs until we find a unique one
      while (!isUnique) {
          console.log(`UUID ${newEventId} already exists, generating a new one...`);
          newEventId = uuidv4(); // Generate a new UUID
          isUnique = await isEventIdUnique(newEventId); // Check if it's unique
      }

      // Once we have a unique UUID, update the event's ID
      const updateQuery = "UPDATE event_details SET event_id = ? WHERE event_id = ?";
      db.execute(updateQuery, [newEventId, event_id], (err, result) => {
          if (err) {
              console.error("Error updating event ID:", err);
              return res.status(500).json({ message: "Server error while updating event ID" });
          }

          if (result.affectedRows === 0) {
              return res.status(404).json({ message: "Event not found" });
          }

          console.log(`Event ID successfully migrated from ${event_id} to ${newEventId}`);
          return res.status(200).json({
              message: "Event ID successfully migrated",
              new_event_id: newEventId,
          });
      });
  } catch (error) {
      console.error("Error during migration:", error);
      return res.status(500).json({ message: "Error migrating event" });
  }
});

router.get("/fetch-event-status", (req, res) => {
  const event_id = req.query.event_id;

  if (!event_id) {
    return res.status(400).json({ error: "Missing event_id" });
  }

  const query = "SELECT status FROM event_details WHERE event_id = ?";

  db.execute(query, [event_id], (err, results) => {
    if (err) {
      console.error("Error fetching event status:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const { status } = results[0];
    return res.status(200).json({ status });
  });
});



module.exports = router;
