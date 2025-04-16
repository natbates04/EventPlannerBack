const cron = require('node-cron');
const moment = require('moment');
const db = require('../db');
const sendEmail = require('../services/emailService');
const e = require('express');
const { link } = require('../routes/events');

cron.schedule('0 0 * * *', () => {
    console.log(`[${new Date().toISOString()}] Running reminder email and delete old events check...`);
    sendReminderEmails();
    DeleteOldEvents();
  });

function sendReminderEmails() {

    console.log("------------------------------");

    db.query(
      `SELECT event_id, title, chosen_dates, reminder_time, location, attendees, organiser_id, reminder_sent, daily_reminder_sent, updated_at
       FROM event_details 
       WHERE status = 'confirmed' AND reminder_time IS NOT NULL`,
      async (err, events) => {
        if (err) {
          console.error("🚨 Error fetching events:", err);
          return;
        }
  
        const now = moment();
        const today = now.format('YYYY-MM-DD');

  
        for (const event of events) {

            try {
                const dates = event.chosen_dates || [];
        
                if (dates.length > 0) {
                    earliestDate = dates
                    .map(dateStr => new Date(dateStr))
                    .sort((a, b) => a - b)[0] // get earliest
                    .toISOString()
                    .split("T")[0]; // format as YYYY-MM-DD
                }
            } catch (e) {
                console.error("❌ Failed parsing chosen_dates:", event.chosen_dates);
            }
    
            let locationString = "TBA"; // Default value if location is empty
    
            if (event.location && typeof event.location === "object") {
                const { city, address, country, postcode } = event.location;
    
                const locationParts = [];
    
                // Only add fields that are not null or empty
                if (city) locationParts.push(city);
                if (address) locationParts.push(address);
                if (country) locationParts.push(country);
                if (postcode) locationParts.push(postcode);
    
                if (locationParts.length > 0) {
                    locationString = locationParts.join(", ");
                }
         }

          const reminderTime = moment(event.reminder_time);
          const reminderDate = reminderTime.format('YYYY-MM-DD');

          let attendees = [];
  
          try {
            attendees = event.attendees || '[]';
            if (!Array.isArray(attendees)) attendees = [];
          } catch (e) {
            console.warn(`⚠️ Invalid attendees format for event ${event.event_id}, skipping.`);
            continue;
          }

          // Include organiser, avoid duplicate
          if (event.organiser_id && !attendees.includes(event.organiser_id)) {
            attendees.unshift(event.organiser_id);
          }

          if (attendees.length === 0) {
            console.log(`⚠️ No attendees for "${event.title}", skipping email send.`);
            continue;
          }
  
          console.log(`Checking "${event.title}" reminder: ${reminderDate}`);
  
          if (today === reminderDate && event.reminder_sent != 1) {
            console.log(`📅 Reminder date matches for "${event.title}"`);
  
            let allEmailsSent = true;
  
            console.log("📨 Final attendees list:", attendees);
  
            for (const userId of attendees) {
              try {
                const [results] = await new Promise((resolve, reject) => {
                  db.query(`SELECT username, email FROM user_details WHERE user_id = ?`, [userId], (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                  });
                });
  
                if (results) {

                  console.log("📧 User found:", results);  
                  const user = results;
                
                    console.log(`Sending reminder to ${user.username} (${user.email})`);
                    const firstName =  user.username.split(" ")[0] || user.username;
                    await sendEmail(
                        user.email, 
                        firstName,
                        `Reminder: ${event.title} is coming up!`,
                        `Just a reminder that the event "${event.title}" is happening soon on ${earliestDate} at ${locationString || 'TBA'}!`,
                        {
                        url: `${process.env.FRONT_END_URL}event/${event.event_id}`,
                        label: "View Event"
                        }
                    );
  
                  console.log(`✅ Reminder sent to ${user.email}`);
                }
              } catch (error) {
                console.error(`❌ Failed sending to user ${userId}:`, error);
                allEmailsSent = false;
              }
            }
  
            if (allEmailsSent) {
              db.query(`UPDATE event_details SET reminder_sent = 1 WHERE event_id = ?`, [event.event_id], (err) => {
                if (err) console.error("⚠️ Error updating reminder_sent:", err);
                else console.log(`✅ Updated reminder_sent for "${event.title}"`);
              });
            }
          } else {
            // console.log(`⏳ Not time for "${event.title}" yet or already sent.`);
          }

          if (today === earliestDate && event.daily_reminder_sent != 1) 
          {
            console.log(`📅 Todays date matches for "${event.title}"`);
  
            let allEmailsSent = true;
  
            console.log("📨 Final attendees list:", attendees);
  
            for (const userId of attendees) {
              try {
                const [results] = await new Promise((resolve, reject) => {
                  db.query(`SELECT username, email FROM user_details WHERE user_id = ?`, [userId], (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                  });
                });
  
                if (results) {

                  console.log("📧 User found:", results);  
                  const user = results;
                
                    console.log(`Sending reminder to ${user.username} (${user.email})`);
                    const firstName =  user.username.split(" ")[0] || user.username;
                    await sendEmail(
                        user.email, 
                        firstName,
                        `Reminder: ${event.title} is Today!`,
                        `Just a reminder that the event "${event.title}" is happening Today at ${locationString || 'TBA'}!`,
                        {
                        url: `${process.env.FRONT_END_URL}event/${event.event_id}`,
                        label: "View Event"
                        }
                    );
  
                  console.log(`✅ Reminder sent to ${user.email}`);
                }
              } catch (error) {
                console.error(`❌ Failed sending to user ${userId}:`, error);
                allEmailsSent = false;
              }
            }
  
            if (allEmailsSent) {
              db.query(`UPDATE event_details SET daily_reminder_sent = 1 WHERE event_id = ?`, [event.event_id], (err) => {
                if (err) console.error("⚠️ Error updating daily_reminder_sent:", err);
                else console.log(`✅ Updated daily_reminder_sent for "${event.title}"`);
              });
            }
          }
        }
      }
    );
}
  

function DeleteOldEvents() {
    db.query(
      `SELECT event_id, title, attendees, organiser_id, updated_at, deleted_warning_sent
       FROM event_details`,
      async (err, events) => {
        if (err) {
          console.error("🚨 Error fetching events:", err);
          return;
        }


        const time_until_waring = 3 * 30 * 24 * 60 * 60 * 1000; // 3 months in milliseconds
        const time_until_delete = 7 * 24 * 60 * 60 * 1000; // 1 weeks in milliseconds
        
        for (const event of events) {

            const now = new Date();
            const updatedAt = new Date(event.updated_at);
            const diffMs = now - updatedAt;
        
            // Convert the difference into days, hours, minutes, and seconds
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); // Days
            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)); // Hours
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)); // Minutes
            const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000); // Seconds
        
            console.log(`It has been ${diffDays} days, ${diffHours} hours, ${diffMinutes} minutes, and ${diffSeconds} seconds since "${event.title}" was last updated.`);
        
            // Check if the event is within the last 1 minute and has not sent the warning yet
            if (diffMs > time_until_delete && event.deleted_warning_sent === 1) {
                console.log(`🗑️ Deleting "${event.title}"...`);
                try {
                // Step 1: Get organiser_id, attendees list, and event title
                const [eventRows] = await db.promise().execute(
                    "SELECT organiser_id, attendees, title FROM event_details WHERE event_id = ?",
                    [event.event_id]
                );
            
                if (eventRows.length === 0) {
                    console.warn(`Event not found for event_id ${event.event_id}`);
                    return;
                }
            
                const { organiser_id, attendees, title } = eventRows[0];
            
                // Step 2: Gather all user IDs (organiser + attendees)
                const userIdsToDelete = [];
            
                if (organiser_id) userIdsToDelete.push(organiser_id);
            
                let attendeeList = [];
            
                try {
                    attendeeList = typeof attendees === 'string' ? JSON.parse(attendees) : attendees;
                } catch (e) {
                    console.error("❌ Failed to parse attendees:", e);
                }
            
                if (Array.isArray(attendeeList)) {
                    userIdsToDelete.push(...attendeeList);
                }
            
                // Step 3: Send deletion confirmation email to organiser
                const [emailRows] = await db.promise().execute(
                    "SELECT email, username FROM user_details WHERE user_id = ?",
                    [organiser_id]
                );
            
                if (emailRows.length > 0) {
                    const { email, username } = emailRows[0];
                    const firstName = username?.split(" ")[0] || username;
                    const emailMessage = `Your event "${title}" has been automatically deleted due to inactivity.`;
            
                    await sendEmail(email, firstName, "Event Deleted", emailMessage);
                }
            
                // Step 4: Delete the event
                await db.promise().execute(
                    "DELETE FROM event_details WHERE event_id = ?",
                    [event.event_id]
                );
            
                // Step 5: Delete users from user_details
                if (userIdsToDelete.length > 0) {
                    await db.promise().execute(
                    `DELETE FROM user_details WHERE user_id IN (${userIdsToDelete.map(() => '?').join(',')})`,
                    userIdsToDelete
                    );
                }
            
                console.log(`🗑️ Deleted event "${title}", its organiser, and attendees.`);
                } catch (err) {
                console.error(`❌ Error deleting event "${event.title}":`, err);
            }
          }
            else if (diffMs > time_until_waring && event.deleted_warning_sent === 0) {
            console.log(`🗑️ Sending warning email for "${event.title}"...`);
            // Send warning email
                try {
                    // Fetch organiser info
                    const [organiserResult] = await db.promise().query(
                        `SELECT email, username FROM user_details WHERE user_id = ?`,
                        [event.organiser_id]
                    );
                
                    const organiser = organiserResult[0];
                    const deletionDate = new Date(); 

                    // Set the deletion date to 1 week from today
                    deletionDate.setDate(deletionDate.getDate() + 7);
                    
                    // Format the deletion date as a string (e.g., "April 23, 2025")
                    const deletionDateStr = deletionDate.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                
                    const message = `Your event "${event.title}" is scheduled to be deleted on ${deletionDateStr} due to inactivity. Please Log In to the event to stop this from happening. Click below to review or update it.`;
                
                    if (organiser) {
                        const firstName = organiser.username.split(" ")[0] || organiser.username;
                        await sendEmail(
                            organiser.email, 
                            firstName,
                            `Reminder: ${event.title} is going to be Deleted!`,
                            message,
                            {
                                url: `${process.env.FRONT_END_URL}event/${event.event_id}`,
                                label: "Save Event"
                            }
                        );
                    }
                
                    // Update event details to mark that the deletion warning has been sent
                    await db.promise().query(
                        `UPDATE event_details SET deleted_warning_sent = true WHERE event_id = ?`,
                        [event.event_id]
                    );
                
                    console.log(`📧 Warning email sent for "${event.title}".`);
                } catch (emailErr) {
                    console.error(`❌ Failed to send warning for "${event.title}":`, emailErr);
                }
            }
          }
        }
    );
}