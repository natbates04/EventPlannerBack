const nodemailer = require("nodemailer");
require("dotenv").config(); // Load environment variables
const fs = require("fs");
const path = require('path');

// Create a transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const fonts = {
  bodyFont: `'Arial', sans-serif`,
  headerFont: `'Arial', sans-serif`,
  footerFont: `'Arial', sans-serif`,
};


// Function to send email
const sendEmail = async (to, firstName, subject, innerHtmlContent, link) => {
  try {
    // Read image as buffer
    const logoPath =  "src/services/mail-attachments/logo.svg";
    const tosPath = "src/services/mail-attachments/Terms_of_Service.pdf"; // Your Terms of Service file
    const privacyPolicyPath = "src/services/mail-attachments/Privacy_Policy.pdf";
    
    const logoBuffer = fs.readFileSync(logoPath);
    const tosBuffer = fs.readFileSync(tosPath); // Read TOS document
    const privacyPolicyBuffer = fs.readFileSync(privacyPolicyPath); // Read Privacy Policy document

    // Mail options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html: `
        <table role="presentation" style="width: 100%; max-width: 600px; margin: auto; padding: 20px; background-color: #f9f9f9; border: 3px solid black;">
          <tr>
            <td style="text-align: center; padding-bottom: 20px;">
              <img src="cid:logo" alt="Event Planner Logo" style="max-width: 120px; margin-bottom: 20px;" />
            </td>
          </tr>
          <tr>
            <td style="font-family: 'Arial', sans-serif; text-align: center; padding-bottom: 20px;">
              <strong>Hi ${firstName},</strong>
            </td>
          </tr>
          <tr>
            <td style="font-family: 'Arial', sans-serif; text-align: center; padding-bottom: 10px;">
              ${innerHtmlContent}
            </td>
          </tr>
          ${link ? `
            <tr>
              <td style="text-align: center;">
                <a href="${link.url}" style="display: inline-block; padding: 10px 20px; margin-top: 20px; background-color: rgb(0, 0, 0); color: white; font-size: 16px; text-decoration: none;">
                  ${link.label}
                </a>
              </td>
            </tr>
          ` : ''}
          <tr>
            <td style="font-family: 'Arial', sans-serif; text-align: center; padding-top: 20px;">
              <strong>Best regards,</strong><br/>
              Easy Trip Planner Team
            </td>
          </tr>
          <tr>
            <td style="font-family: 'Arial', sans-serif; font-size: 12px; text-align: center; color: rgb(0, 0, 0); padding-top: 20px;">
              This is an automated email. Please do not reply.<br/>
              &copy; ${new Date().getFullYear()} Easy Trip Planner.
            </td>
          </tr>
        </table>
      `,
      attachments: [
        {
          filename: "logo.svg", // Logo file
          path: logoPath, // Path to the logo image on your system
          cid: "logo" // This is the Content-ID for embedding the logo
        },
        {
          filename: "Terms_Of_Service.pdf", // TOS file
          path: tosPath, // Path to the TOS PDF file
        },
        {
          filename: "Privacy_Policy.pdf", // Privacy Policy file
          path: privacyPolicyPath, // Path to the Privacy Policy PDF file
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// sendEmail("nathaniel.christopher.bates@gmail.com", "Nat", "Test Email", "This is a test email with embedded logo and attachments.", { url: "https://example.com", label: "Click Here" })

module.exports = sendEmail;
