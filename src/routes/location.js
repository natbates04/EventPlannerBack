const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");
const authenticateToken = require("../middleware/auth"); 

router.get("/fetch-location", authenticateToken, async (req, res) => {
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

router.put("/update-location", authenticateToken, async (req, res) => {
    const { event_id, address, city, postcode, country, lat, lon } = req.body;

    console.log("Received update location request:", req.body);

    if (!event_id || !lat || !lon) {
        return res.status(400).json({ message: "Missing required fields." });
    }

    // Create a location object to update the location field
    const locationObject = {
        address: address || "",
        city: city || "",
        postcode: postcode || "",
        country: country || "",
        lat,
        lon,
    };

    try {
        // Create a location object
        const locationObject = JSON.stringify({
            address: address || "",
            city: city || "",
            postcode: postcode || "",
            country: country || "",
            lat,
            lon,
        });
    
        // Execute the query and log the result
        const result = await db.execute(
            `
            UPDATE event_details
            SET location = ?
            WHERE event_id = ?
            `,
            [locationObject, event_id]
        );
        
        // Check the result
        if (result[0]?.affectedRows === 0) {
            return res.status(404).json({ message: "Event not found." });
        }
    
        return res.status(200).json({ message: "Location updated successfully." });
    } catch (err) {
        console.error("Error updating location:", err);
        return res.status(500).json({ message: "Internal server error." });
    }
    
});

module.exports = router;
