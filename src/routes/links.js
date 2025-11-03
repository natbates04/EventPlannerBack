const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateToken = require("../middleware/auth"); 

router.get("/fetch-links", authenticateToken, async (req, res) => {
  const { event_id } = req.query;

  if (!event_id) {
      return res.status(400).json({ message: "Event ID is required" });
  }

  try {
      // Retrieve the event details from the database
  const [rows] = await db.execute(
          "SELECT links FROM event_details WHERE event_id = ?",
          [event_id]
      );

      if (rows.length === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      const links = rows[0].links || [];
      res.status(200).json({ links });
  } catch (error) {
      console.error("Error fetching links:", error);
      res.status(500).json({ message: "Server error" });
  }
});

router.post("/add-link", authenticateToken, async (req, res) => {
    const { link, added_by, event_id} = req.body;
  
    // Validate required fields
    if (!link || !added_by || !event_id) {
      return res.status(400).json({ message: "Link, name, and event_id are required" });
    }
  
    try {
      // Check if the event exists in the event_details table
  const [rows] = await db.execute(
        "SELECT links FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      let links = [];
      if (rows.length > 0 && rows[0].links) {
        try {
          // Parse the existing links, if any
          links = rows[0].links;
        } catch (error) {
          console.error("Error parsing links JSON:", error);
        }
      }
  
      // Create a new link object
      const newLinkObject = {
        link,
        added_by,
        created_at: new Date().toISOString(),
      };
  
      // Add the new link to the links array
      links.push(newLinkObject);
  
      // Save the updated links JSON back into the database
  await db.execute(
        "UPDATE event_details SET links = ? WHERE event_id = ?",
        [JSON.stringify(links), event_id]
      );
  
      res.status(200).json({ message: "Link added successfully" });
    } catch (error) {
      console.error("Error adding link:", error);
      res.status(500).json({ message: "Server error" });
    }
});
  
router.delete("/delete-link", authenticateToken, async (req, res) => {
    const { link, event_id } = req.body;
  
    // Validate required fields
    if (!link || !event_id) {
      return res.status(400).json({ message: "Link and event_id are required" });
    }
  
    try {
      // Retrieve the event details from the database
  const [rows] = await db.execute(
        "SELECT links FROM event_details WHERE event_id = ?",
        [event_id]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "Event not found" });
      }
  
      let links = rows[0].links || [];
  
      // Find and remove the link from the links array
      const updatedLinks = links.filter((linkItem) => linkItem.link !== link);
  
      // If no link was removed, return an error
      if (links.length === updatedLinks.length) {
        return res.status(404).json({ message: "Link not found" });
      }
  
      // Update the links array in the database
  await db.execute(
        "UPDATE event_details SET links = ? WHERE event_id = ?",
        [JSON.stringify(updatedLinks), event_id]
      );
  
      res.status(200).json({ message: "Link deleted successfully" });
    } catch (error) {
      console.error("Error deleting link:", error);
      res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;