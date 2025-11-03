const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require("uuid");
const sendEmail = require("../services/emailService");
const authenticateToken = require("../middleware/auth"); 

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

// PUBLIC API ENDPOINTS

router.get("/fetch-event-title/:event_id", async (req, res) => {
  const { event_id } = req.params;
  console.log("Fetching event: " + event_id);
  try {
    const [rows] = await db.execute("SELECT title FROM event_details WHERE event_id = ?", [event_id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    console.log("Event fetched successfully:", rows[0]);
    return res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching event:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});


router.post("/create-event", async (req, res) => {
  console.log("CREATE EVENT ROUTE REACHED");
  try {
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

    console.log("Events's ID:", event_id);

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

    // Insert event
    const [result] = await db.execute(
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
      ]
    );

    console.log("Event created successfully with ID:", event_id);

    // Fetch the organiser's email
    const [emailResult] = await db.execute(
      "SELECT email, username FROM user_details WHERE user_id = ?",
      [organiser_id]
    );

    if (emailResult.length === 0) {
      console.error("Organiser email not found for organiser_id:", organiser_id);
      return res.status(404).json({ message: "Organiser not found in user_details" });
    }

    const { email: organiserEmail, username: organiserName } = emailResult[0];
    console.log("Organiser's email:", organiserEmail);

    const firstName = organiserName.split(" ")[0] || organiserName;

    // Prepare the message
    const emailMessage = `Your event "${title}" has been created successfully. You can view it by pressing the button below.`;

    // Call the sendEmail function
    await sendEmail(organiserEmail, firstName, "Event Created", emailMessage, { url: `${process.env.FRONT_END_URL}/event/${event_id}`, label: "See Event" });

    // Respond to the client
    res.status(201).json({ message: "Event created successfully", event_id });
  } catch (error) {
    console.error("Unhandled error in /create-event:", error);
    res.status(500).json({ message: "Unhandled server error", error: error.message });
  }
  console.log("STUFF HAS FINISHED RUNNING");
});

// PRIVATE API ENDPOINTS


router.get("/fetch-event/:event_id", authenticateToken, async (req, res) => {
  const { event_id } = req.params;
  console.log("Fetching event: " + event_id);
  try {
    const [rows] = await db.execute(
      "SELECT title, description, status, chosen_dates, cancellation_reason, location, attendees, organiser_id FROM event_details WHERE event_id = ?",
      [event_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching event:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/update-event", authenticateToken, async (req, res) => {
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
    const [rows] = await db.execute(
      "SELECT * FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Update event in the database with new fields (title, description, and other details)
    await db.execute(
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

router.post("/confirm-event", authenticateToken, async (req, res) => {
  const { event_id, reminder_date, selectedDates } = req.body;

  console.log("REMINDER DATE SET TO: ", reminder_date);

  if (!event_id || !Array.isArray(selectedDates) || selectedDates.length === 0) {
    return res.status(400).json({ message: "event_id and selectedDates are required" });
  }

  const updateQuery = `
    UPDATE event_details 
    SET status = 'confirmed', reminder_time = ?, chosen_dates = ?
    WHERE event_id = ?
  `;

  try {
    const [updateResult] = await db.execute(updateQuery, [
      reminder_date || null,
      JSON.stringify(selectedDates),
      event_id,
    ]);

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    console.log(`Event ${event_id} confirmed with reminder on ${reminder_date || "none"}`);

    // Fetch event data including organiser and attendees
    const [eventRows] = await db.execute(
      "SELECT organiser_id, attendees, title FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { organiser_id, attendees, title } = eventRows[0];

    // Fetch organiser details
    const [organiserRows] = await db.execute(
      "SELECT email, username FROM user_details WHERE user_id = ?",
      [organiser_id]
    );

    if (organiserRows.length > 0) {
      const { email: organiserEmail, username } = organiserRows[0];
      const organiserFirstName = username.split(" ")[0];
    
      const earliestDate = new Date(
        selectedDates.reduce((min, date) => new Date(date) < new Date(min) ? date : min)
      ).toLocaleDateString();
    
      const eventUrl = `${process.env.FRONT_END_URL}/event/${event_id}`;
    
      await sendEmail(
        organiserEmail,
        organiserFirstName,
        "Event Confirmed",
        `Hi ${organiserFirstName}, your event "${title}" has been confirmed.\n` +
        `Confirmed Date: ${earliestDate}\n\n`,
        { url: eventUrl, label: "See Details" }
      );
    }
    

    // Parse and notify attendees
    let attendeeIds = attendees;

    if (Array.isArray(attendeeIds) && attendeeIds.length > 0) {
      const [attendeeRows] = await db.execute(
        `SELECT email, username FROM user_details WHERE user_id IN (${attendeeIds.map(() => '?').join(',')})`,
        attendeeIds
      );
    
      const earliestDate = new Date(
        selectedDates.reduce((min, date) => new Date(date) < new Date(min) ? date : min)
      ).toLocaleDateString();
    
      const eventUrl = `${process.env.FRONT_END_URL}/event/${event_id}`;
    
      await Promise.all(
        attendeeRows.map(({ email, username }) => {
          const firstName = username.split(" ")[0];
          return sendEmail(
            email,
            firstName,
            "Event Confirmed",
            `Hi ${firstName}, the event "${title}" you were invited to has been confirmed.\n` +
            `Confirmed Date: ${earliestDate}\n\n`,
            { url: eventUrl, label: "See Details" }
          );
        })
      );

    
      console.log("Confirmation sent to attendees:", attendeeRows.map(a => a.email));
    }

    res.json({ message: "Event confirmed and notifications sent" });
  } catch (error) {
    console.error("Error confirming event:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.post("/cancel-event", authenticateToken, async (req, res) => {
  const { event_id, cancellation_reason = "" } = req.body;

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required" });
  }

  try {
    // --- Step 1: Update event status ---
    const [updateResult] = await db.execute(
      `
        UPDATE event_details 
        SET status = 'canceled', cancellation_reason = ?, reminder_time = NULL 
        WHERE event_id = ?
      `,
      [cancellation_reason, event_id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    console.log(`✅ Event ${event_id} cancelled with reason: ${cancellation_reason}`);

    // --- Step 2: Fetch organiser, attendees, and title ---
    const [eventRows] = await db.execute(
      "SELECT organiser_id, attendees, title FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found after update" });
    }

    const { organiser_id, attendees, title } = eventRows[0];

    // --- Step 3: Fetch organiser details ---
    const [organiserRows] = await db.execute(
      "SELECT email, username FROM user_details WHERE user_id = ?",
      [organiser_id]
    );

    if (organiserRows.length === 0) {
      console.warn(`⚠️ No organiser found for organiser_id: ${organiser_id}`);
    } else {
      const { email: organiserEmail, username: organiserName } = organiserRows[0];
      const organiserFirstName = organiserName.split(" ")[0];

      // --- Step 4: Notify organiser ---
      await sendEmail(
        organiserEmail,
        organiserFirstName,
        "Event Cancelled",
        `Hi ${organiserFirstName}, your event "${title}" has been cancelled.${
          cancellation_reason ? ` Reason: ${cancellation_reason}` : ""
        }`
      );

      console.log(`📧 Notified organiser: ${organiserEmail}`);
    }

    // --- Step 5: Notify attendees (if any) ---
    if (Array.isArray(attendees) && attendees.length > 0) {
      const placeholders = attendees.map(() => "?").join(",");
      const [attendeeRows] = await db.execute(
        `SELECT email, username FROM user_details WHERE user_id IN (${placeholders})`,
        attendees
      );

      const attendeeMessage = `The event "${title}" you were invited to has been cancelled.${
        cancellation_reason ? ` Reason: ${cancellation_reason}` : ""
      }`;

      await Promise.all(
        attendeeRows.map(({ email, username }) => {
          const firstName = username.split(" ")[0];
          return sendEmail(email, firstName, "Event Cancelled", attendeeMessage);
        })
      );

      console.log(`📨 Notified ${attendeeRows.length} attendees`);
    }

    // --- Step 6: Respond success ---
    res.status(200).json({
      message: "Event cancelled and notifications sent successfully",
    });

  } catch (error) {
    console.error("❌ Error during cancellation:", error);
    res.status(500).json({
      message: "Server error during event cancellation",
      error: error.message,
    });
  }
});


router.post('/reopen-event', authenticateToken, async (req, res) => {
  const { event_id } = req.body;

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required" });
  }

  const updateQuery = `
    UPDATE event_details 
    SET 
      status = 'pending', 
      reminder_time = NULL,
      chosen_dates = NULL,
      reminder_sent = NULL,
      daily_reminder_sent = NULL
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

router.post("/update-last-update", authenticateToken, async (req, res) => {
  const { event_id, path, timestamp } = req.body;

  // Validate input
  if (!event_id || !path || !timestamp) {
    return res.status(400).json({ message: "Missing required fields (event_id, path, timestamp)" });
  }

  try {
    // Fetch the current last_updated object from the event_details table
    const [event] = await db.execute(
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
    const [result] = await db.execute(
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
    const [event] = await db.execute(
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

router.post("/migrate-event", authenticateToken, async (req, res) => {
  const { event_id } = req.body;

  if (!event_id) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  try {
    // --- Generate a unique new event ID ---
    let newEventId = uuidv4();
    let isUnique = await isEventIdUnique(newEventId);

    while (!isUnique) {
      console.log(`UUID ${newEventId} already exists, generating a new one...`);
      newEventId = uuidv4();
      isUnique = await isEventIdUnique(newEventId);
    }

    // --- Fetch organiser, attendees, and title ---
    const [eventRows] = await db.execute(
      "SELECT organiser_id, attendees, title FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { organiser_id, attendees, title } = eventRows[0];

    // --- Update the event ID ---
    const [updateResult] = await db.execute(
      "UPDATE event_details SET event_id = ? WHERE event_id = ?",
      [newEventId, event_id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    console.log(`✅ Event ID successfully migrated from ${event_id} → ${newEventId}`);

    // --- Fetch organiser details ---
    const [organiserRes] = await db.execute(
      "SELECT email, username FROM user_details WHERE user_id = ?",
      [organiser_id]
    );

    if (organiserRes.length === 0) {
      return res.status(404).json({ message: "Organiser not found" });
    }

    const { email: organiserEmail, username: organiserName } = organiserRes[0];
    const organiserFirstName = organiserName.split(" ")[0];

    // --- Send email to organiser ---
    const organiserMessage = `Your event "${title}" has been migrated. View it using the button below.`;

    await sendEmail(organiserEmail, organiserFirstName, "Event Migrated", organiserMessage, {
      url: `${process.env.FRONT_END_URL}/event/${newEventId}`,
      label: "See Event",
    });

    console.log(`📧 Email sent to organiser: ${organiserEmail}`);

    // --- Notify attendees (if any) ---
    if (Array.isArray(attendees) && attendees.length > 0) {
      const placeholders = attendees.map(() => "?").join(",");
      const [attendeeRows] = await db.execute(
        `SELECT email, username FROM user_details WHERE user_id IN (${placeholders})`,
        attendees
      );

      const attendeeMessage = `An event you are part of, "${title}", has been migrated. View it using the button below.`;

      // Use Promise.all to send in parallel safely
      await Promise.all(
        attendeeRows.map(({ email, username }) => {
          const firstName = username.split(" ")[0];
          return sendEmail(email, firstName, "Event Migrated", attendeeMessage, {
            url: `${process.env.FRONT_END_URL}/event/${newEventId}`,
            label: "See Event",
          });
        })
      );

      console.log(`📨 Emails sent to ${attendeeRows.length} attendees`);
    }

    // --- Success response ---
    return res.status(200).json({
      message: "Event successfully migrated and all emails sent",
      new_event_id: newEventId,
    });

  } catch (error) {
    console.error("❌ Error during migration:", error);
    return res.status(500).json({
      message: "Error migrating event",
      error: error.message,
    });
  }
});

router.get("/fetch-event-status", authenticateToken, async (req, res) => {
  const event_id = req.query.event_id;
  if (!event_id) {
    return res.status(400).json({ error: "Missing event_id" });
  }
  try {
    const [results] = await db.execute(
      "SELECT status FROM event_details WHERE event_id = ?",
      [event_id]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    const { status } = results[0];
    return res.status(200).json({ status });
  } catch (err) {
    console.error("Error fetching event status:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

router.delete("/delete-event", authenticateToken, async (req, res) => {
  const { event_id } = req.body;

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required" });
  }

  try {
    // Fetch event details
    const [eventRows] = await db.execute(
      "SELECT organiser_id, attendees, title FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { organiser_id, attendees, title } = eventRows[0];

    // --- Fetch organiser details ---
    const [emailResult] = await db.execute(
      "SELECT email, username FROM user_details WHERE user_id = ?",
      [organiser_id]
    );

    if (emailResult.length === 0) {
      console.error("Organiser not found in user_details for organiser_id:", organiser_id);
      return res.status(404).json({ message: "Organiser not found in user_details" });
    }

    const { email: organiserEmail, username: organiserName } = emailResult[0];
    const firstName = organiserName.split(" ")[0] || organiserName;

    // --- Send confirmation email to organiser ---
    const emailMessage = `Your event "${title}" has been deleted successfully.`;
    await sendEmail(organiserEmail, firstName, "Event Deleted", emailMessage);

    console.log("Email sent to organiser:", organiserEmail);

    // --- Collect all user IDs to delete (organiser + attendees) ---
    const userIdsToDelete = [organiser_id];

    if (Array.isArray(attendees)) {
      userIdsToDelete.push(...attendees);
    }

    // --- Delete the event ---
    await db.execute("DELETE FROM event_details WHERE event_id = ?", [event_id]);
    console.log("Event deleted from event_details:", event_id);

    // --- Delete users from user_details (optional, ensure this is intended) ---
    if (userIdsToDelete.length > 0) {
      await db.execute(
        `DELETE FROM user_details WHERE user_id IN (${userIdsToDelete.map(() => "?").join(",")})`,
        userIdsToDelete
      );
      console.log("Deleted associated users:", userIdsToDelete);
    }

    res.status(200).json({ message: "Event and associated users deleted successfully" });

  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Server error while deleting event and users", error: error.message });
  }
});



module.exports = router;
