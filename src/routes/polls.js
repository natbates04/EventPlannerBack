const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");
const authenticateToken = require("../middleware/auth"); 

router.get("/fetch-polls", authenticateToken, async (req, res) => {
    const { event_id } = req.query;

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" });
    }

    try {
        // Retrieve the event details from the database
    const [rows] = await db.execute(
            "SELECT polls FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        const polls = rows[0].polls || {};
        res.status(200).json({ polls });
    } catch (error) {
        console.error("Error fetching polls:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/create-poll", authenticateToken, async (req, res) => {
    const { event_id, poll_id, title, description, options, user_id, name, priority } = req.body;

    if (!event_id || !poll_id || !title || !description || !options || !Array.isArray(options) || !user_id || !priority) {
        return res.status(400).json({ message: "Invalid request parameters" });
    }

    // Validate priority to make sure it's one of the expected levels
    const validPriorities = ["level-1", "level-2", "level-3"];
    if (!validPriorities.includes(priority)) {
        console.log("INVALID LEVEL");
        return res.status(400).json({ message: "Invalid priority level" });
    }

    try {
    const [rows] = await db.execute(
        "SELECT polls FROM event_details WHERE event_id = ?",
        [event_id]
        );

        let polls = {};
        if (rows.length > 0 && rows[0].polls) {
        try {
            polls = rows[0].polls;
        } catch (error) {
            console.error("Error parsing polls JSON:", error);
        }
        }

        // Create a new poll with title, description, creator info, timestamp, priority, and empty vote arrays for each option
        polls[poll_id] = {
        title,
        description,
        created_by: user_id,   // User ID of creator
        created_at: new Date().toISOString(),
        priority,              // Priority level (level-1, level-2, level-3)
        options: {},
        };

        options.forEach(option => {
        polls[poll_id].options[option] = [];
        });

        // Save the updated polls JSON
    await db.execute(
        "UPDATE event_details SET polls = ? WHERE event_id = ?",
        [JSON.stringify(polls), event_id]
        );

        res.status(200).json({ message: "Poll created successfully" });
    } catch (error) {
        console.error("Error creating poll:", error);
        res.status(500).json({ message: "Server error" });
    }
});
  
router.post("/cast-vote", authenticateToken, async (req, res) => {
    const { event_id, poll_id, user_id, selected_option } = req.body;

    if (!event_id || !poll_id || !user_id || !selected_option) {
        return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
    const [rows] = await db.execute(
        "SELECT polls FROM event_details WHERE event_id = ?",
        [event_id]
        );

        if (rows.length === 0 || !rows[0].polls) {
        return res.status(404).json({ message: "Poll not found" });
        }

        let polls;
        try {
        polls = rows[0].polls;
        } catch (error) {
        console.error("Error parsing polls JSON:", error);
        return res.status(500).json({ message: "Error processing poll data" });
        }

        const poll = polls[poll_id];

        if (!poll || !poll.options[selected_option]) {
        return res.status(404).json({ message: "Poll or option not found" });
        }

        let userAlreadyVoted = false;

        // Check if the user already voted for the selected option
        if (poll.options[selected_option].includes(user_id)) {
        // Remove the user from the selected option (unvote)
        poll.options[selected_option] = poll.options[selected_option].filter(voter => voter !== user_id);
        userAlreadyVoted = true;
        } else {
        // Remove user from any other options (switch vote)
        Object.keys(poll.options).forEach(option => {
            poll.options[option] = poll.options[option].filter(voter => voter !== user_id);
        });

        // Add user to the selected option if they weren't already voting for it
        poll.options[selected_option].push(user_id);
        }

        // Update poll data in the database
    await db.execute(
        "UPDATE event_details SET polls = ? WHERE event_id = ?",
        [JSON.stringify(polls), event_id]
        );

        res.status(200).json({ 
        message: userAlreadyVoted ? "Vote removed" : "Vote cast successfully", 
        updatedPoll: poll 
        });

    } catch (error) {
        console.error("Error casting vote:", error);
        res.status(500).json({ message: "Server error" });
    }
});
  
router.post("/delete-poll", authenticateToken, async (req, res) => {
    const { event_id, poll_id, user_id } = req.body;

    if (!event_id || !poll_id || !user_id) {
        return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
    const [rows] = await db.execute(
        "SELECT polls FROM event_details WHERE event_id = ?",
        [event_id]
        );

        if (rows.length === 0 || !rows[0].polls) {
        return res.status(404).json({ message: "Poll not found" });
        }

        let polls = rows[0].polls;

        if (!polls[poll_id]) {
        return res.status(404).json({ message: "Poll does not exist" });
        }

        // Ensure only the creator can delete the poll
        if (polls[poll_id].created_by !== user_id) {
        return res.status(403).json({ message: "Unauthorized to delete this poll" });
        }

        // Delete the poll
        delete polls[poll_id];

        // Update the database
    await db.execute(
        "UPDATE event_details SET polls = ? WHERE event_id = ?",
        [JSON.stringify(polls), event_id]
        );

        res.status(200).json({ message: "Poll deleted successfully" });
    } catch (error) {
        console.error("Error deleting poll:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/remove-vote", authenticateToken, async (req, res) => {
    const { event_id, poll_id, user_id, selected_option } = req.body;

    if (!event_id || !poll_id || !user_id || !selected_option) {
        console.log("Invalid request parameters:", req.body);
        return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
    const [rows] = await db.execute(
            "SELECT polls FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (rows.length === 0 || !rows[0].polls) {
            return res.status(404).json({ message: "Poll not found" });
        }

        let polls;
        try {
            polls = rows[0].polls;
        } catch (error) {
            console.error("Error parsing polls JSON:", error);
            return res.status(500).json({ message: "Error processing poll data" });
        }

        const poll = polls[poll_id];

        if (!poll || !poll.options[selected_option]) {
            return res.status(404).json({ message: "Poll or option not found" });
        }

        // Check if the user voted for the selected option
        if (!poll.options[selected_option].includes(user_id)) {
            return res.status(400).json({ message: "User has not voted for this option" });
        }

        // Remove the user from the selected option (unvote)
        poll.options[selected_option] = poll.options[selected_option].filter(voter => voter !== user_id);

        // Update poll data in the database
    await db.execute(
            "UPDATE event_details SET polls = ? WHERE event_id = ?",
            [JSON.stringify(polls), event_id]
        );

        res.status(200).json({ message: "Vote removed successfully", updatedPoll: poll });

    } catch (error) {
        console.error("Error removing vote:", error);
        res.status(500).json({ message: "Server error" });
    }
});


module.exports = router;