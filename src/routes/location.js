const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");

router.get("/fetch-location", async (req, res) => {
    const { event_id } = req.query;

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" });
    }

    try {
        const [eventRows] = await db.promise().execute(
            "SELECT location FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (eventRows.length === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        return res.status(200).json({ location: eventRows[0].location });
    } catch (error) {
        console.error("Error fetching event location:", error);
        return res.status(500).json({ message: "Server error" });
    }
});


module.exports = router;