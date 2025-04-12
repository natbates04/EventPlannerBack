const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");

router.get('/fetch-comments', async (req, res) => {
    const { event_id } = req.query;  // Retrieving event_id from query parameters

    if (!event_id) {
        return res.status(400).json({ message: 'Event ID is required' });
    }

    try {
        // Retrieve the existing comments for the event from the database
        const [rows] = await db.promise().execute(
            'SELECT comments FROM event_details WHERE event_id = ?',
            [event_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const comments = typeof rows[0].comments === 'string'
            ? JSON.parse(rows[0].comments)
            : rows[0].comments || [];

        // Return the comments
        res.status(200).json({ comments });
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/add-comment', async (req, res) => {
    const { event_id, user_id, username, message, reply_to, profile_pic } = req.body;
  
    // Validate that all necessary fields are provided
    if (!event_id || !user_id  || !message) {
      console.log("missing fields");
      console.log(event_id);
      console.log(user_id);
      console.log(message);
      return res.status(400).json({ message: 'Missing required fields' });
    }
  
    // Prepare the comment object
    const comment = {
      user_id,
      message,
      reply_to: reply_to || null, // Null if no reply
      uuid: uuidv4(), // Assuming you have a function to generate a UUID for each comment
      created_at: new Date().toISOString(),
    };
  
    try {
      // Retrieve the existing comments for the event from the database
      const [rows] = await db.promise().execute(
        'SELECT comments FROM event_details WHERE event_id = ?',
        [event_id]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Event not found' });
      }
  
      const existingComments = typeof rows[0].comments === 'string'
      ? JSON.parse(rows[0].comments)
      : rows[0].comments || [];
    
      // Add the new comment to the list of comments
      existingComments.push(comment);
  
      // Update the comments column in the database
      const updateQuery = 'UPDATE event_details SET comments = ? WHERE event_id = ?';
      await db.promise().execute(updateQuery, [JSON.stringify(existingComments), event_id]);
  
      // Return success response
      res.status(200).json({ message: 'Comment added successfully', comment });
  
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({ message: 'Server error' });
    }
});
  
router.post("/delete-comment", async (req, res) => {
    const { event_id, commentIds } = req.body;
    console.log("Received delete request for event_id:", event_id);
    console.log("Comments to delete:", commentIds);
  
    try {
      // Fetch existing comments from MySQL
      const [rows] = await db.promise().execute(
        "SELECT comments FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (rows.length === 0) {
        console.log("Event not found:", event_id);
        return res.status(404).json({ message: "Event not found" });
      }
  
      let existingComments = typeof rows[0].comments === "string"
        ? JSON.parse(rows[0].comments)
        : rows[0].comments || [];
  
      console.log("Existing comments before deletion:", existingComments);
  
      // Filter out comments and their replies
      const shouldDelete = new Set(commentIds);
      const filteredComments = existingComments.filter(c => !shouldDelete.has(c.uuid));
  
      console.log("Filtered comments after deletion:", filteredComments);
  
      // Update the JSON column in MySQL
      await db.promise().execute(
        "UPDATE event_details SET comments = ? WHERE event_id = ?",
        [JSON.stringify(filteredComments), event_id]
      );
  
      console.log("Successfully deleted comments:", commentIds);
      res.status(200).json({ message: "Comments deleted successfully" });
  
    } catch (error) {
      console.error("Error deleting comments:", error);
      res.status(500).json({ message: "Server error" });
    }
});
  

module.exports = router;