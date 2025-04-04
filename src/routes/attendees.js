const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/fetch-attendees", (req, res) => {
    const { event_id } = req.query;
    console.log("[fetch-attendees] Received request for event_id:", event_id);
  
    if (!event_id) {
      console.log("[fetch-attendees] Missing event_id in request query");
      return res.status(400).json({ message: "Missing event_id" });
    }
  
    // Fetch the organiser_id, attendees, and requests list for the event
    db.execute(
      "SELECT organiser_id, attendees, requests FROM event_details WHERE event_id = ?",
      [event_id],
      (err, rows) => {
        if (err) {
          console.error("[fetch-attendees] Database error while fetching event:", err);
          return res.status(500).json({ message: "Server error" });
        }
  
        if (rows.length === 0) {
          console.log("[fetch-attendees] No event found for event_id:", event_id);
          return res.status(404).json({ message: "Event not found" });
        }
  
        // Extract organiser_id, attendees, and requests from the retrieved row
        const eventRow = rows[0];
        console.log("[fetch-attendees] Fetched event row:", eventRow);
        const organiserId = eventRow.organiser_id;
        let attendeesList = [];
        let requestsList = [];

        if (eventRow.attendees) {
          try {
            // If the data is stored as a string, parse it; if it’s an array, use it directly.
            if (typeof eventRow.attendees === "string") {
              attendeesList = JSON.parse(eventRow.attendees);
            } else if (Array.isArray(eventRow.attendees)) {
              attendeesList = eventRow.attendees;
            }
            console.log("[fetch-attendees] Parsed attendees list:", attendeesList);
          } catch (parseErr) {
            console.error("[fetch-attendees] Error parsing attendees:", parseErr);
            // If parsing fails, default to an empty array.
            attendeesList = [];
          }
        } else {
          console.log("[fetch-attendees] No attendees found in event row.");
        }

        if (eventRow.requests) {
          try {
            // If the data is stored as a string, parse it; if it’s an array, use it directly.
            if (typeof eventRow.requests === "string") {
              requestsList = JSON.parse(eventRow.requests);
            } else if (Array.isArray(eventRow.requests)) {
              requestsList = eventRow.requests;
            }
            console.log("[fetch-attendees] Parsed requests list:", requestsList);
          } catch (parseErr) {
            console.error("[fetch-attendees] Error parsing requests:", parseErr);
            // If parsing fails, default to an empty array.
            requestsList = [];
          }
        } else {
          console.log("[fetch-attendees] No requests found in event row.");
        }
  
        // Combine organiser_id, attendees, and requests (ensuring there are no duplicates)
        const userIdsSet = new Set();
        if (organiserId) {
          userIdsSet.add(organiserId);
        }
        if (Array.isArray(attendeesList)) {
          attendeesList.forEach((uuid) => {
            // Ensure uuid is valid (not undefined or null)
            if (uuid) {
              userIdsSet.add(uuid);
            }
          });
        }
        const userIds = Array.from(userIdsSet);
        console.log("[fetch-attendees] Combined user IDs:", userIds);
  
        if (userIds.length === 0) {
          console.log("[fetch-attendees] No user IDs to fetch details for");
          return res.status(200).json({ organiser: null, attendees: [], requests: [] });
        }
  
        // Build a dynamic query to fetch details from user_details for these UUIDs
        const placeholders = userIds.map(() => "?").join(", ");
        const query = `SELECT user_id, username, role, created_at FROM user_details WHERE user_id IN (${placeholders})`;
        console.log("[fetch-attendees] Executing query:", query, "with userIds:", userIds);
  
        db.execute(query, userIds, (userErr, userRows) => {
          if (userErr) {
            console.error("[fetch-attendees] Error fetching user details:", userErr);
            return res.status(500).json({ message: "Error fetching user details" });
          }
  
          console.log("[fetch-attendees] Fetched user rows:", userRows);
  
          // Separate organiser from the attendee list
          const organiser = userRows.find((user) => user.user_id === organiserId) || null;
          const attendees = userRows.filter((user) => user.user_id !== organiserId);
  
          // Return the combined data object, including requests
          return res.status(200).json({
            organiser,
            attendees,
            requests: requestsList,
          });
        });
      }
    );
});

router.post("/request-access", async (req, res) => {

    const { email, username, event_id, time_requested } = req.body;
  
    console.log("[Request Access] Received request:", email, username, event_id, time_requested);
  
    if (!email || !username || !event_id || !time_requested) {
      console.log("[Request Access] Missing required fields.");
      return res.status(400).json({ message: "Missing required fields" });
    }
  
    try {
      // Fetch event details to check the requests column
      const [rows] = await db.promise().execute(
        "SELECT requests FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (rows.length === 0) {
        console.log("[Request Access] No event found for event_id:", event_id);
        return res.status(404).json({ message: "Event not found" });
      }
  
      const event = rows[0];
      let requests = [];
  
      // Safely parse `requests` column (if it exists)
      try {
        requests = typeof event.requests === "string" ? JSON.parse(event.requests) : event.requests || [];
      } catch (parseError) {
        console.warn("[Request Access] Failed to parse requests. Defaulting to empty array.");
        requests = [];
      }
  
      // Append new request with 'status' set to 'pending'
      const newRequest = {
        username,
        email,
        time_requested,
        status: "pending",  // Set default status as 'pending'
      };
  
      requests.push(newRequest);
  
      // Update the requests column with the new list
      const updateQuery = "UPDATE event_details SET requests = ? WHERE event_id = ?";
      await db.promise().execute(updateQuery, [JSON.stringify(requests), event_id]);
  
      console.log("[Request Access] Request added successfully for event_id:", event_id);
  
      // Return success response
      res.status(200).json({ success: true, message: "Request added successfully." });
    } catch (error) {
      console.error("[Request Access] Error processing request:", error);
      res.status(500).json({ message: "Server error" });
    }
});
  
router.post("/reject-request", async (req, res) => {

    const { event_id, email } = req.body;
  
    if (!event_id || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }
  
    try {
      // Fetch the event details
      const [rows] = await db.promise().execute(
        "SELECT * FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "Event not found" });
      }
  
      const event = rows[0];
  
      // Parse the requests JSON column if necessary
      let requests = [];
      try {
        requests = typeof event.requests === "string" ? JSON.parse(event.requests) : event.requests || [];
      } catch (parseError) {
        console.warn("[Reject Request] Failed to parse requests as JSON. Defaulting to empty array.");
        requests = [];
      }
  
      // Find the request by email and reject it
      const requestIndex = requests.findIndex(req => req.email === email);
  
      if (requestIndex === -1) {
        return res.status(404).json({ message: "Request not found for the given email" });
      }
  
      // Mark the request as rejected
      requests[requestIndex].status = "rejected";
      console.log("[Reject Request] Request marked as rejected for email:", email);
  
      // Update the event's requests in the database
      const updateQuery = "UPDATE event_details SET requests = ? WHERE event_id = ?";
      await db.promise().execute(updateQuery, [JSON.stringify(requests), event_id]);
  
      return res.status(200).json({ message: "Request rejected successfully" });
    } catch (error) {
      console.error("[Reject Request] Error rejecting request:", error);
      return res.status(500).json({ message: "Server error" });
    }
});
  
router.post("/update-requests", async (req, res) => {
    
    const { event_id, requests } = req.body;
  
    if (!event_id || !requests) {
      return res.status(400).json({ message: "Missing event_id or requests" });
    }
  
    try {
      // Update the requests column in the event_details table
      const updateQuery = "UPDATE event_details SET requests = ? WHERE event_id = ?";
      await db.promise().execute(updateQuery, [JSON.stringify(requests), event_id]);
  
      res.status(200).json({ success: true, message: "Requests updated successfully." });
    } catch (error) {
      console.error("Error updating requests:", error);
      res.status(500).json({ message: "Server error" });
    }
});

router.post("/promote-user", async (req, res) => {
    const { event_id, user_id } = req.body;
  
    console.log("[Promote User] Request received with event_id:", event_id, "user_id:", user_id);
  
    if (!event_id || !user_id) {
      console.log("[Promote User] Missing required fields.");
      return res.status(400).json({ message: "Missing required fields." });
    }
  
    try {
      // Fetch the attendees for the event
      const [eventRows] = await db.promise().execute(
        "SELECT attendees FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (eventRows.length === 0) {
        console.log("[Promote User] Event not found for event_id:", event_id);
        return res.status(404).json({ message: "Event not found." });
      }
  
      const event = eventRows[0];
      let attendees = [];
  
      // Safely parse attendees
      if (event.attendees) {
        try {
          attendees = typeof event.attendees === "string" ? JSON.parse(event.attendees) : event.attendees;
        } catch (parseError) {
          console.error("[Promote User] Failed to parse attendees as JSON:", parseError);
          return res.status(500).json({ message: "Attendees column contains invalid data." });
        }
      }
  
      console.log("[Promote User] Attendees list after parsing:", attendees);
  
      if (!Array.isArray(attendees)) {
        console.error("[Promote User] Attendees is not an array.");
        return res.status(500).json({ message: "Attendees column is not a valid JSON array." });
      }
  
      if (!attendees.includes(user_id)) {
        console.log("[Promote User] User is not an attendee for the event.");
        return res.status(400).json({ message: "User is not an attendee for this event." });
      }
  
      // Update the user's role to admin
      const [updateResult] = await db.promise().execute(
        "UPDATE user_details SET role = 'admin' WHERE user_id = ?",
        [user_id]
      );
  
      if (updateResult.affectedRows === 0) {
        console.log("[Promote User] User not found in user_details:", user_id);
        return res.status(404).json({ message: "User not found." });
      }
  
      console.log("[Promote User] Successfully promoted user:", user_id);
      return res.status(200).json({ message: "User successfully promoted to admin." });
    } catch (error) {
      console.error("[Promote User] Error during promotion:", error);
      return res.status(500).json({ message: "Server error." });
    }
});

router.post("/demote-user", async (req, res) => {
    const { event_id, user_id } = req.body;
  
    console.log("[Demote User] Request received with event_id:", event_id, "user_id:", user_id);
  
    if (!event_id || !user_id) {
      console.log("[Demote User] Missing required fields.");
      return res.status(400).json({ message: "Missing required fields." });
    }
  
    try {
      // Fetch the attendees for the event
      const [eventRows] = await db.promise().execute(
        "SELECT attendees FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (eventRows.length === 0) {
        console.log("[Demote User] Event not found for event_id:", event_id);
        return res.status(404).json({ message: "Event not found." });
      }
  
      const event = eventRows[0];
      let attendees = [];
  
      // Safely parse attendees
      if (event.attendees) {
        try {
          attendees = typeof event.attendees === "string" ? JSON.parse(event.attendees) : event.attendees;
        } catch (parseError) {
          console.error("[Demote User] Failed to parse attendees as JSON:", parseError);
          return res.status(500).json({ message: "Attendees column contains invalid data." });
        }
      }
  
      console.log("[Demote User] Attendees list after parsing:", attendees);
  
      if (!Array.isArray(attendees)) {
        console.error("[Demote User] Attendees is not an array.");
        return res.status(500).json({ message: "Attendees column is not a valid JSON array." });
      }
  
      if (!attendees.includes(user_id)) {
        console.log("[Demote User] User is not an attendee for the event.");
        return res.status(400).json({ message: "User is not an attendee for this event." });
      }
  
      // Update the user's role to attendee
      const [updateResult] = await db.promise().execute(
        "UPDATE user_details SET role = 'attendee' WHERE user_id = ?",
        [user_id]
      );
  
      if (updateResult.affectedRows === 0) {
        console.log("[Demote User] User not found in user_details:", user_id);
        return res.status(404).json({ message: "User not found." });
      }
  
      console.log("[Demote User] Successfully demoted user:", user_id);
      return res.status(200).json({ message: "User successfully demoted to attendee." });
    } catch (error) {
      console.error("[Demote User] Error during demotion:", error);
      return res.status(500).json({ message: "Server error." });
    }
});

router.post("/kick-user", async (req, res) => {
    const { event_id, user_id } = req.body;
  
    console.log("[Kick User] Request received with event_id:", event_id, "user_id:", user_id);
  
    if (!event_id || !user_id) {
      console.log("[Kick User] Missing required fields.");
      return res.status(400).json({ message: "Missing required fields." });
    }
  
    try {
      // Fetch the event details
      const [eventRows] = await db.promise().execute(
        "SELECT attendees FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (eventRows.length === 0) {
        console.log("[Kick User] Event not found for event_id:", event_id);
        return res.status(404).json({ message: "Event not found." });
      }
  
      const event = eventRows[0];
      let attendees = [];
  
      // Parse the attendees column safely
      if (event.attendees) {
        try {
          attendees = typeof event.attendees === "string" ? JSON.parse(event.attendees) : event.attendees;
        } catch (parseError) {
          console.error("[Kick User] Failed to parse attendees:", parseError);
          return res.status(500).json({ message: "Attendees column contains invalid data." });
        }
      }
  
      console.log("[Kick User] Attendees list before removing user:", attendees);
  
      if (!Array.isArray(attendees) || !attendees.includes(user_id)) {
        console.log("[Kick User] User is not an attendee for the event.");
        return res.status(400).json({ message: "User is not an attendee for this event." });
      }
  
      // Remove the user_id from the attendees array
      attendees = attendees.filter((id) => id !== user_id);
  
      // Update the attendees column in the event_details table
      await db.promise().execute(
        "UPDATE event_details SET attendees = ? WHERE event_id = ?",
        [JSON.stringify(attendees), event_id]
      );
  
      console.log("[Kick User] Updated attendees list:", attendees);
  
      // Delete the user from the user_details table
      const [deleteResult] = await db.promise().execute(
        "DELETE FROM user_details WHERE user_id = ?",
        [user_id]
      );
  
      if (deleteResult.affectedRows === 0) {
        console.log("[Kick User] User not found in user_details:", user_id);
        return res.status(404).json({ message: "User not found." });
      }
  
      console.log("[Kick User] Successfully removed user:", user_id);
      return res.status(200).json({ message: "User successfully removed from event and database." });
    } catch (error) {
      console.error("[Kick User] Error during user removal:", error);
      return res.status(500).json({ message: "Server error." });
    }
});

module.exports = router;