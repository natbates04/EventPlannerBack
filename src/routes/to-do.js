const express = require("express");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require('uuid');  // Importing uuid
const sendEmail = require("../services/emailService");

router.get("/fetch-to-do", async (req, res) => {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ message: "Event ID is required" });

    try {
        const [rows] = await db.promise().execute(
            "SELECT to_do FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Event not found" });

        const toDoList = rows[0].to_do ? rows[0].to_do : { to_do: [], done: [] };
        res.status(200).json(toDoList);
    } catch (error) {
        console.error("Error fetching To-Do list:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/add-to-do", async (req, res) => {
    const { event_id, creator_id, task } = req.body;

    // Validate required fields
    if (!event_id || !creator_id || !task) {
        return res.status(400).json({ message: "Event ID, Creator ID, and Task are required" });
    }

    try {
        // Fetch the current to_do list from the database
        const [rows] = await db.promise().execute(
            "SELECT to_do FROM event_details WHERE event_id = ?",
            [event_id]
        );

        // Check if to_do exists, if not, initialize it
        const toDoList = rows.length && rows[0].to_do ? rows[0].to_do : { to_do: [], done: [] };

        // Create the new task
        const newTask = {
            task_id: uuidv4(),
            creator_id,
            task,
            created_at: new Date().toISOString().split("T")[0]
        };

        // Add the new task to the to_do list
        toDoList.to_do.push(newTask);

        // Update the to_do list in the database
        await db.promise().execute(
            "UPDATE event_details SET to_do = ? WHERE event_id = ?",
            [JSON.stringify(toDoList), event_id]
        );

        // Respond with the new task added
        res.status(201).json({ message: "Task added", task: newTask });
    } catch (error) {
        console.error("Error adding To-Do:", error);
        res.status(500).json({ message: "Server error" });
    }
});


router.post("/move-to-done", async (req, res) => {
    const { event_id, task_id } = req.body;
    if (!event_id || !task_id) {
        return res.status(400).json({ message: "Event ID and Task ID are required" });
    }

    try {
        const [rows] = await db.promise().execute(
            "SELECT to_do FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Event not found" });

        const toDoList = rows.length ? rows[0].to_do : { to_do: [], done: [] };

        const taskIndex = toDoList.to_do.findIndex(task => task.task_id === task_id);
        if (taskIndex === -1) return res.status(404).json({ message: "Task not found" });

        const completedTask = toDoList.to_do.splice(taskIndex, 1)[0];
        toDoList.done.push(completedTask);

        await db.promise().execute(
            "UPDATE event_details SET to_do = ? WHERE event_id = ?",
            [JSON.stringify(toDoList), event_id]
        );

        res.status(200).json({ message: "Task moved to Done", task: completedTask });
    } catch (error) {
        console.error("Error moving task:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/move-to-do", async (req, res) => {
    const { event_id, task_id } = req.body;
    if (!event_id || !task_id) {
        return res.status(400).json({ message: "Event ID and Task ID are required" });
    }

    try {
        const [rows] = await db.promise().execute(
            "SELECT to_do FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Event not found" });

        const toDoList = rows.length ? rows[0].to_do : { to_do: [], done: [] };

        const taskIndex = toDoList.done.findIndex(task => task.task_id === task_id);
        if (taskIndex === -1) return res.status(404).json({ message: "Task not found" });

        const movedTask = toDoList.done.splice(taskIndex, 1)[0];
        toDoList.to_do.push(movedTask);

        await db.promise().execute(
            "UPDATE event_details SET to_do = ? WHERE event_id = ?",
            [JSON.stringify(toDoList), event_id]
        );

        res.status(200).json({ message: "Task moved back to To-Do", task: movedTask });
    } catch (error) {
        console.error("Error moving task:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/delete-to-do", async (req, res) => {
    const { event_id, task_id } = req.body;
    if (!event_id || !task_id) {
        return res.status(400).json({ message: "Event ID and Task ID are required" });
    }

    try {
        const [rows] = await db.promise().execute(
            "SELECT to_do FROM event_details WHERE event_id = ?",
            [event_id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Event not found" });

        const toDoList = rows.length ? rows[0].to_do : { to_do: [], done: [] };

        // Remove task from both lists
        toDoList.to_do = toDoList.to_do.filter(task => task.task_id !== task_id);
        toDoList.done = toDoList.done.filter(task => task.task_id !== task_id);

        await db.promise().execute(
            "UPDATE event_details SET to_do = ? WHERE event_id = ?",
            [JSON.stringify(toDoList), event_id]
        );

        res.status(200).json({ message: "Task deleted" });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: "Server error" });
    }
});



module.exports = router;