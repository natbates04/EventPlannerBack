const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid'); 
const sendEmail = require("../services/emailService");
const jwt = require("jsonwebtoken");
require("dotenv").config(); 


function updateEventLastUpdated(event_id) {
  // Step 1: Get the current value of deleted_warning_sent
  db.execute(
    "SELECT deleted_warning_sent, organiser_id, title FROM event_details WHERE event_id = ?",
    [event_id],
    (err, rows) => {
      if (err) {
        console.error("[Update Event] Failed to fetch event details:", err);
        return;
      }

      if (rows.length === 0) {
        console.warn(`[Update Event] Event not found for event_id: ${event_id}`);
        return;
      }

      const { deleted_warning_sent, organiser_id, title } = rows[0];

      // Step 2: Check if the deleted_warning_sent was 1
      if (deleted_warning_sent === 1) {
        // Step 3: Send email to organiser
        db.execute(
          "SELECT email, username FROM user_details WHERE user_id = ?",
          [organiser_id],
          async (emailErr, userRows) => {
            if (emailErr) {
              console.error("[Update Event] Failed to fetch organiser details:", emailErr);
              return;
            }

            if (userRows.length === 0) {
              console.warn(`[Update Event] Organiser not found for organiser_id: ${organiser_id}`);
              return;
            }

            const { email, username } = userRows[0];
            const firstName = username?.split(" ")[0] || username;
            const emailMessage = `We wanted to let you know that your event "${title}" is no longer going to be deleted as it has been updated recently. You can continue managing your event.`; 

            // Send the email
            await sendEmail(email, firstName, "Event Will Not Be Deleted", emailMessage);
            console.log(`[Update Event] Email sent to organiser for event "${title}".`);
          }
        );
      }

      // Step 4: Update event (reset deleted_warning_sent to 0 and set updated_at)
      db.execute(
        "UPDATE event_details SET updated_at = NOW(), deleted_warning_sent = 0 WHERE event_id = ?",
        [event_id],
        (updateErr) => {
          if (updateErr) {
            console.error("[Update Event] Failed to update last_updated and reset deleted_warning_sent for event:", updateErr);
          } else {
            console.log("[Update Event] Successfully updated last_updated and reset deleted_warning_sent for event:", event_id);
          }
        }
      );
    }
  );
};

// PUBLIC API ENDPOINTS

router.post("/create-user", async (req, res) => {
    const { email, name, fingerprint, role, event_id, profileNum} = req.body;

    const missingFields = [];
    if (!email) missingFields.push("email");
    if (!name) missingFields.push("name");
    if (!fingerprint) missingFields.push("fingerprint");
    if (profileNum === undefined || profileNum === null) missingFields.push("profileNum"); // Allow 0 if that's valid
  
    if (missingFields.length > 0) {
      console.log("MISSING FIELDS:", missingFields.join(", "));
      return res.status(400).json({ message: "Missing required fields", missing: missingFields });
    }


    console.log("creaint user profile pic num " + profileNum);
  
    // Validate and set the role (allowed: 'organiser', 'admin', 'attendee')
    const validRoles = ["organiser", "admin", "attendee"];
    const userRole = validRoles.includes(role) ? role : "attendee";

    if (role === "attendee" && event_id) {
      const firstName = name.split(" ")[0];
    
      // Fetch event title
  const [eventDetails] = await db.execute(
        "SELECT title FROM event_details WHERE event_id = ?",
        [event_id]
      );
    
      if (eventDetails.length > 0) {
        const { title } = eventDetails[0];
        const eventUrl = `${process.env.FRONT_END_URL}/event/${event_id}`;
    
        sendEmail(
          email,
          firstName,
          "Event Joined",
          `You've successfully joined the event "${title}".\n\nClick below to view the event details.`,
          { url: eventUrl, label: "See Event" }
        );
      } else {
        console.warn(`Event not found when sending email to attendee ${email} for event_id ${event_id}`);
      }
    }
    
  
    try {
      // Generate a unique user_id using uuid
      const newUserId = uuidv4();
  
      // Insert the new user into the database
  const [insertResult] = await db.execute(
        "INSERT INTO user_details (user_id, email, username, fingerprint, role, profile_pic) VALUES (?, ?, ?, ?, ?, ?)",
        [newUserId, email, name, fingerprint, userRole, profileNum]
      );

      if (!insertResult.affectedRows) {
        console.error("Failed to insert user into database:");
        return res.status(500).json({ message: "Failed to insert user" });
      }

  
      console.log("New user ID: ", newUserId);
  
      // If event_id is provided, update the attendees column in event_details
      if (event_id) {
        console.log("Updating event attendees for event_id:", event_id);
  
        // Fetch existing attendees for the given event_id
  const [eventRows] = await db.execute(
          "SELECT attendees FROM event_details WHERE event_id = ?",
          [event_id]
        );
  
        if (eventRows.length === 0) {
          return res.status(404).json({ message: "Event not found" });
        }
  
        const event = eventRows[0];
        let attendees = event.attendees ? event.attendees : [];
  
        // Add the new user_id to the attendees array
        if (!attendees.includes(newUserId)) {
          attendees.push(newUserId);
        }
  
        // Update the attendees column in the database
  await db.execute(
          "UPDATE event_details SET attendees = ? WHERE event_id = ?",
          [JSON.stringify(attendees), event_id]
        );
        
        updateEventLastUpdated(event_id);
        console.log("Successfully updated attendees for event_id:", event_id);
      }
  
      // Retrieve the newly created user data
  const [rows] = await db.execute(
        "SELECT * FROM user_details WHERE user_id = ?",
        [newUserId]
      );

      console.log("New user data:", rows);
  
      if (rows.length === 0) {
        return res.status(500).json({ message: "Failed to retrieve user data" });
      }
  
      // Return all user data
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Server error" });
    }
});
  
router.post("/login", async (req, res) => {
  const { email, fingerprint, event_id } = req.body;

  console.log("[Login] Received request with email:", email, ", event_id:", event_id);

  if (!email || !fingerprint || !event_id) {
    console.log("[Login] Missing required fields.");
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    console.log("[Login] Fetching event details for event_id:", event_id);

    db.execute(
      "SELECT organiser_id, attendees, requests FROM event_details WHERE event_id = ?",
      [event_id],
      (err, rows) => {
        if (err) {
          console.error("[Login] Error fetching event details:", err);
          return res.status(500).json({ message: "Server error" });
        }

        if (rows.length === 0) {
          console.log("[Login] No event found for event_id:", event_id);
          return res.status(404).json({ message: "Event not found" });
        }

        const event = rows[0];
        console.log("[Login] Event details fetched successfully:", event);

        const organiserId = event.organiser_id;

        // Safely parse attendees and requests
        let attendees = [];
        try {
          attendees = typeof event.attendees === "string" ? JSON.parse(event.attendees) : event.attendees || [];
        } catch (parseError) {
          console.warn("[Login] Failed to parse attendees as JSON. Defaulting to empty array.");
          attendees = [];
        }

        let requests = [];
        try {
          requests = typeof event.requests === "string" ? JSON.parse(event.requests) : event.requests || [];
        } catch (parseError) {
          console.warn("[Login] Failed to parse requests as JSON. Defaulting to empty array.");
          requests = [];
        }

        console.log("[Login] Organiser ID:", organiserId);
        console.log("[Login] Attendees list:", attendees);
        console.log("[Login] Pending requests:", requests);

        // Check if the email is in the pending requests
        const pendingRequest = requests.find(request => request.email === email);
        if (pendingRequest) {
          console.log("[Login] Email is in pending requests:", pendingRequest);
          return res.status(200).json({
            status: "pending",
            message: "Your request is pending.",
            request_details: pendingRequest,
          });
        }

        // Check if the user exists in the user_details table
        db.execute(
          "SELECT * FROM user_details WHERE email = ?",
          [email],
          (userErr, userRows) => {
            if (userErr) {
              console.error("[Login] Error fetching user details:", userErr);
              return res.status(500).json({ message: "Server error" });
            }

            if (userRows.length > 0) {
              console.log("[Login] Multiple users found for email:", email);

              // Iterate over all userRows to check matches
              for (const user of userRows) {
                console.log("[Login] Checking user:", user);

                if (user.user_id === organiserId) {
                  console.log("[Login] User is the organiser.");
                  
                  // Update fingerprint for the organiser
                  db.execute(
                    "UPDATE user_details SET fingerprint = ? WHERE user_id = ?",
                    [fingerprint, user.user_id],
                    (updateErr) => {
                      if (updateErr) {
                        console.error("[Login] Error updating fingerprint for organiser:", updateErr);
                        return res.status(500).json({ message: "Error updating fingerprint" });
                      }

                      updateEventLastUpdated(event_id);
                      const token = jwt.sign(
                        {
                          user_id: user.user_id,
                          email: user.email,
                          role: user.role,
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: "1h" } // expires in 1 hour
                      );

                      return res.status(200).json({
                        authorized: true,
                        message: "User authorized as organiser.",
                        token: token,
                        user_details: {
                          user_id: user.user_id,
                          email: user.email,
                          username: user.username,
                          role: user.role,
                          profile_pic: user.profile_pic,
                        },
                      });
                    }
                  );
                  return; // Exit the loop once the organiser is handled
                }

                if (attendees.includes(user.user_id)) {
                  console.log("[Login] User is an attendee.");
                  
                  // Update fingerprint for the attendee
                  db.execute(
                    "UPDATE user_details SET fingerprint = ? WHERE user_id = ?",
                    [fingerprint, user.user_id],
                    (updateErr) => {
                      if (updateErr) {
                        console.error("[Login] Error updating fingerprint for attendee:", updateErr);
                        return res.status(500).json({ message: "Error updating fingerprint" });
                      }
                      updateEventLastUpdated(event_id);
                      
                      updateEventLastUpdated(event_id);
                      const token = jwt.sign(
                        {
                          user_id: user.user_id,
                          email: user.email,
                          role: user.role,
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: "1h" } // expires in 1 hour
                      );

                      return res.status(200).json({
                        authorized: true,
                        message: "User authorized as attendee.",
                        token: token,
                        user_details: {
                          user_id: user.user_id,
                          email: user.email,
                          username: user.username,
                          role: user.role,
                          profile_pic: user.profile_pic,
                        },
                      });
                    }
                  );
                  return; // Exit the loop once the attendee is handled
                }
              }
            }

            // If the user is not an organiser or attendee, return false
            console.log("[Login] Email not authorized, not an organiser or attendee:", email);
            return res.status(200).json({
              authorized: false,
              message: "User not authorized or does not exist.",
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("[Login] Error during login:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// PRIVATE API ENDPOINTS

router.post('/auto-sign-in', (req, res) => {
  const { event_id, fingerprint } = req.body;

  // Validate the input
  if (!event_id || !fingerprint) {
    console.log('Missing event_id or fingerprint');
    return res.status(400).json({ message: 'Event ID and fingerprint are required' });
  }

  console.log(`Received event_id: ${event_id}, fingerprint: ${fingerprint}`);

  // Query to get the event organiser and attendees
  const query = `
    SELECT organiser_id, attendees
    FROM event_details
    WHERE event_id = ?;
  `;

  db.execute(query, [event_id], (err, rows) => {
    if (err) {
      console.error("Error querying event details:", err);
      return res.status(500).json({ message: "Server error while fetching event details" });
    }

    console.log(`Query result rows: ${JSON.stringify(rows)}`);

    if (rows.length === 0) {
      console.log('Event not found for event_id:', event_id);
      return res.status(404).json({ message: "Event not found" });
    }

    const event = rows[0];
    const organiser_id = event.organiser_id;
    const attendees = event.attendees ? event.attendees : [];

    // Step 2: Get organiser details using organiser_id
    const organiserQuery = `
      SELECT user_id, email, fingerprint
      FROM user_details
      WHERE user_id = ?;
    `;

    db.execute(organiserQuery, [organiser_id], (err, organiserRows) => {
      if (err) {
        console.error("Error querying organiser details:", err);
        return res.status(500).json({ message: "Server error while fetching organiser details" });
      }

      console.log(`Organiser details: ${JSON.stringify(organiserRows)}`);

      if (organiserRows.length === 0) {
        console.log('Organiser not found for organiser_id:', organiser_id);
        return res.status(404).json({ message: "Organiser not found" });
      }

      const organiser = organiserRows[0];

      // Step 3: Check if organiser's fingerprint matches
      if (organiser.fingerprint === fingerprint) {
        console.log('Match found with organiser!');
        return res.json({ success: true, email: organiser.email });
      }

      console.log('Organiser fingerprint does not match');

      // Step 4: If there are attendees, check their fingerprints
      if (attendees.length === 0) {
        console.log('No attendees found, only checking organiser');
        return res.json({ success: false });
      }

      // Query to get attendee details based on the attendee IDs
      const attendeesQuery = `
        SELECT user_id, email, fingerprint
        FROM user_details
        WHERE user_id IN (?);
      `;

      db.execute(attendeesQuery, [attendees], (err, attendeeRows) => {
        if (err) {
          console.error("Error querying attendees' details:", err);
          return res.status(500).json({ message: "Server error while fetching attendees' details" });
        }

        console.log(`Attendee details: ${JSON.stringify(attendeeRows)}`);

        // Check if any attendee's fingerprint matches
        const matchingAttendee = attendeeRows.filter(attendee => attendee.fingerprint === fingerprint);

        // Check if there are multiple matches
        if (matchingAttendee.length > 1) {
          console.log(`Duplicate fingerprints found for event ${event_id}:`, matchingAttendee);
          return res.json({ success: false, message: "Duplicate fingerprint detected" });
        }

        if (matchingAttendee.length === 1) {
          console.log('Match found with attendee!');
          return res.json({ success: true, email: matchingAttendee[0].email });
        }

        // If no match found
        console.log('No matching fingerprint found for organiser or attendees');
        return res.json({ success: false });
      });
    });
  });
});

router.post("/update-last-opened", async (req, res) => {
  const { user_id, path, timestamp } = req.body;

  // Validate input
  if (!user_id || !path || !timestamp) {
    return res.status(400).json({ message: "Missing required fields (user_id, path, timestamp)" });
  }

  try {
    // Fetch the current last_opened object from the database
  const [user] = await db.execute(
      "SELECT last_opened FROM user_details WHERE user_id = ?",
      [user_id]
    );

    // Check if user exists
    if (!user.length) {
      return res.status(404).json({ message: "User not found" });
    }

    // Initialize lastOpened as an array if it's not present or if it's not a valid array
    let lastOpened = Array.isArray(user[0].last_opened) ? user[0].last_opened : [];

    // Check if the path already exists in the last_opened object
    const existingPathIndex = lastOpened.findIndex(entry => entry.path === path);

    if (existingPathIndex !== -1) {
      // If path exists, update the timestamp for that path
      lastOpened[existingPathIndex].timestamp = new Date(timestamp); // Update timestamp
    } else {
      // If path doesn't exist, add a new entry
      lastOpened.push({
        path,
        timestamp: new Date(timestamp), // Add new entry
      });
    }

    // Update the last_opened field in the user_details table with the new data
  const [result] = await db.execute(
      "UPDATE user_details SET last_opened = ? WHERE user_id = ?",
      [JSON.stringify(lastOpened), user_id] // Save it back as a JSON string
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found or update failed" });
    }

    // Successfully updated
    res.status(200).json({ message: "Last opened path updated successfully" });
  } catch (error) {
    console.error("Error updating last opened path:", error);
    res.status(500).json({ message: "Server error while updating last opened path" });
  }
});

router.post("/fetch-last-opened", async (req, res) => {
  const { user_id } = req.body;

  // Validate input
  if (!user_id) {
    return res.status(400).json({ message: "Missing required field (user_id)" });
  }

  try {
    // Fetch the last_opened object from the database
  const [user] = await db.execute(
      "SELECT last_opened FROM user_details WHERE user_id = ?",
      [user_id]
    );

    // Check if user exists
    if (!user.length) {
      return res.status(404).json({ message: "User not found" });
    }

    // Parse the last_opened data from the database
    const lastOpened = Array.isArray(user[0].last_opened) ? user[0].last_opened : [];

    // Successfully fetched last opened paths
    res.status(200).json({ last_opened: lastOpened });
  } catch (error) {
    console.error("Error fetching last opened paths:", error);
    res.status(500).json({ message: "Server error while fetching last opened paths" });
  }
});

router.post("/update-user", async (req, res) => {
  const { user_id, name, email, event_id, profile_pic } = req.body;

  console.log("Update user request:", req.body);

  if (!user_id || !name || !email || !event_id || profile_pic === null) {
    return res.status(400).json({ message: "Missing required fields (user_id, name, email, event_id, profile_pic)" });
  }

  console.log("NOT 0 : ", !profile_pic);

  try {
    // 1. Get user to be updated
  const [userResult] = await db.execute(
      "SELECT * FROM user_details WHERE user_id = ?",
      [user_id]
    );

    if (userResult.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Get event details
  const [eventRows] = await db.execute(
      "SELECT organiser_id, attendees FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    const event = eventRows[0];
    const organiserId = event.organiser_id;
    const attendees = typeof event.attendees === "string"
      ? JSON.parse(event.attendees)
      : event.attendees || [];

    // 3. Check if organiser (not the same user) has this email
    if (organiserId !== user_id) {
  const [organiserRows] = await db.execute(
        "SELECT email FROM user_details WHERE user_id = ?",
        [organiserId]
      );

      if (organiserRows.length && organiserRows[0].email === email) {
        return res.status(409).json({ message: "Email is already used." });
      }
    }

    // 4. Check if any other attendee (excluding self) has this email
    const filteredAttendees = attendees.filter(id => id !== user_id);
    if (filteredAttendees.length > 0) {
  const [attendeeRows] = await db.execute(
        "SELECT email FROM user_details WHERE user_id IN (?)",
        [filteredAttendees]
      );

      const duplicate = attendeeRows.find(att => att.email === email);
      if (duplicate) {
        return res.status(409).json({ message: "Email is already used." });
      }
    }

    // 5. All clear — update the user
  await db.execute(
      "UPDATE user_details SET username = ?, email = ?, profile_pic = ? WHERE user_id = ?",
      [name, email, profile_pic, user_id]
    );

    res.status(200).json({ message: "User updated successfully." });

  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error while updating user." });
  }
});

router.post("/set-is-coming", async (req, res) => {
  const { user_id, is_coming } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
  await db.execute(
      "UPDATE user_details SET is_coming = ? WHERE user_id = ?",
      [is_coming, user_id]
    );
    res.status(200).json({ message: "RSVP status updated" });
  } catch (error) {
    console.error("Error updating RSVP:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/fetch-username", async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
  const [rows] = await db.execute(
      "SELECT user_id, username, profile_pic, is_coming FROM user_details WHERE user_id = ?",
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user_id: rows[0].user_id, name: rows[0].username, profile_pic: rows[0].profile_pic, is_coming: rows[0].is_coming});
  } catch (error) {
    console.error("Error fetching user name:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/leave-event", async (req, res) => {
  const { user_id, event_id } = req.body;

  if (!user_id || !event_id) {
    return res.status(400).json({ message: "Missing required fields (user_id, event_id)" });
  }

  try {
    // 1. Fetch event details
  const [eventRows] = await db.execute(
      "SELECT attendees FROM event_details WHERE event_id = ?",
      [event_id]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    let attendees = typeof eventRows[0].attendees === "string"
      ? JSON.parse(eventRows[0].attendees)
      : eventRows[0].attendees || [];

    // 2. Check if the user is in the list
    if (!attendees.includes(user_id)) {
      return res.status(400).json({ message: "User is not an attendee of this event" });
    }

    // 3. Remove user from attendees array
    attendees = attendees.filter(id => id !== user_id);

    // 4. Update event_details with new attendees list
  await db.execute(
      "UPDATE event_details SET attendees = ? WHERE event_id = ?",
      [JSON.stringify(attendees), event_id]
    );

    // 5. Optionally, delete the user from user_details
  await db.execute(
      "DELETE FROM user_details WHERE user_id = ?",
      [user_id]
    );

    res.status(200).json({ message: "User successfully removed from event and deleted." });

  } catch (error) {
    console.error("Error in leave-event:", error);
    res.status(500).json({ message: "Server error while processing leave-event" });
  }
});


module.exports = router;

