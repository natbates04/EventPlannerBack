// src/services/emailService.js

const sgMail = require("@sendgrid/mail");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// ✅ Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ✅ Fonts for styling
const fonts = {
  bodyFont: `'Arial', sans-serif`,
  headerFont: `'Arial', sans-serif`,
  footerFont: `'Arial', sans-serif`,
};

/**
 * Send an email with optional button and attachments using SendGrid API
 * 
 * @param {string} to - recipient email
 * @param {string} firstName - recipient first name
 * @param {string} subject - subject line
 * @param {string} innerHtmlContent - email body text (HTML allowed)
 * @param {Object} [link] - optional link button { url, label }
 */
async function sendEmail(to, firstName, subject, innerHtmlContent, link) {
  console.log("ATTEMPTING TO SEND MAIL...");

  try {
    // File attachments
    const logoPath = path.resolve("src/services/mail-attachments/logo.png");
    const tosPath = path.resolve("src/services/mail-attachments/Terms_Of_Service.pdf");
    const privacyPolicyPath = path.resolve("src/services/mail-attachments/Privacy_Policy.pdf");

    // Convert attachments to base64
    const attachments = [
      {
        content: fs.readFileSync(logoPath).toString("base64"),
        filename: "logo.png",
        type: "image/png",
        disposition: "inline",
        content_id: "logo",
      },
      {
        content: fs.readFileSync(tosPath).toString("base64"),
        filename: "Terms_Of_Service.pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
      {
        content: fs.readFileSync(privacyPolicyPath).toString("base64"),
        filename: "Privacy_Policy.pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
    ];

    // Build email HTML
    const html = `
      <table role="presentation" style="width: 100%; max-width: 600px; margin: auto; padding: 20px; background-color: #f9f9f9; border: 3px solid black; font-family: ${fonts.bodyFont};">
        <tr>
          <td style="text-align: center; padding-bottom: 20px;">
            <img src="cid:logo" alt="Event Planner Logo" style="max-width: 120px; margin-bottom: 20px;" />
          </td>
        </tr>
        <tr>
          <td style="font-family: ${fonts.headerFont}; text-align: center; padding-bottom: 20px;">
            <strong>Hi ${firstName},</strong>
          </td>
        </tr>
        <tr>
          <td style="font-family: ${fonts.bodyFont}; text-align: center; padding-bottom: 10px;">
            ${innerHtmlContent}
          </td>
        </tr>
        ${link ? `
          <tr>
            <td style="text-align: center;">
              <a href="${link.url}" 
                style="display: inline-block; padding: 10px 20px; margin-top: 20px; background-color: rgb(0, 0, 0); color: white; font-size: 16px; text-decoration: none; border-radius: 4px;">
                ${link.label}
              </a>
            </td>
          </tr>` 
        : ""}
        <tr>
          <td style="font-family: ${fonts.footerFont}; text-align: center; padding-top: 20px;">
            <strong>Best regards,</strong><br/>
            Easy Trip Planner Team
          </td>
        </tr>
        <tr>
          <td style="font-family: ${fonts.footerFont}; font-size: 12px; text-align: center; color: rgb(0, 0, 0); padding-top: 20px;">
            This is an automated email. Please do not reply.<br/>
            &copy; ${new Date().getFullYear()} Easy Trip Planner.
          </td>
        </tr>
      </table>
    `;

    // Build SendGrid message
    const msg = {
      to,
      from: process.env.SENDGRID_VERIFIED_SENDER, // must match your verified sender
      subject,
      html,
      attachments,
    };

    // Send email
    await sgMail.send(msg);
    console.log(`✅ Email sent successfully to ${to}`);

  } catch (error) {
    console.error("❌ Error sending email:", error);

    if (error.response && error.response.body) {
      console.error("SendGrid Response Error:", JSON.stringify(error.response.body, null, 2));
    }

    throw error;
  }
}

// ✅ Export CommonJS style
module.exports = sendEmail;
