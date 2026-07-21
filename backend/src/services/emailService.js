const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail({ to, subject, html }) {
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  });
}

async function sendVerificationEmail(to, code) {
  await sendEmail({
    to,
    subject: 'GavelPro — Verify Your Email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Email Verification</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing:8px;color:#4f46e5">${code}</h1>
        <p>This code expires in 15 minutes.</p>
      </div>
    `,
  });
}

async function sendOtpEmail(to, code) {
  await sendEmail({
    to,
    subject: 'GavelPro — Your Login OTP',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Two-Factor Authentication</h2>
        <p>Your one-time password is:</p>
        <h1 style="letter-spacing:8px;color:#4f46e5">${code}</h1>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendVerificationEmail, sendOtpEmail };
