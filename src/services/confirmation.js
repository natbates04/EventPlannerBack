const express = require("express");
const router = express.Router();
const uuid = require("uuid");
const { sendConfirmationEmail } = require("../services/emailService");
const db = require("../db");

// Request confirmation code
router.post("/request-confirmation", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    try {
        // Generate unique confirmation code
        const confirmationCode = uuid.v4();

        // Send confirmation email with the code
        await sendConfirmationEmail(email, confirmationCode);

        // Store the confirmation code temporarily (using a simple in-memory object or database)
        // You could use Redis, a database, or an in-memory object for this
        // For simplicity, we are using a simple in-memory object here
        // Store email and code temporarily (set an expiration time if necessary)
        db.confirmationCodes = db.confirmationCodes || {};
        db.confirmationCodes[email] = confirmationCode;

        console.log(`Sent confirmation email to ${email} with code: ${confirmationCode}`);

        res.status(200).json({ message: "Confirmation email sent. Please check your inbox for the code." });
    } catch (error) {
        console.error("Error sending confirmation email:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// Confirm email with code
router.post("/confirm-email", async (req, res) => {
    const { email, confirmationCode } = req.body;

    if (!email || !confirmationCode) {
        return res.status(400).json({ message: "Email and confirmation code are required" });
    }

    try {
        // Check if the email and code match
        const storedCode = db.confirmationCodes[email];

        if (storedCode === confirmationCode) {
            // Code matches, confirmation success
            // You can now proceed with the action (e.g., creating the event)
            console.log(`Email confirmed for ${email}`);
            res.status(200).json({ message: "Email confirmed successfully. Proceeding with your request." });
        } else {
            // Code mismatch
            res.status(400).json({ message: "Invalid confirmation code" });
        }
    } catch (error) {
        console.error("Error confirming email:", error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
