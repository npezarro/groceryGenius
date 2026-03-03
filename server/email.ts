import nodemailer from "nodemailer";
import { randomInt } from "crypto";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export function generateVerificationCode(): string {
  return String(randomInt(100000, 999999));
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.error("SMTP not configured, cannot send verification email");
    return false;
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@grocerygenius.app";

  try {
    await mailer.sendMail({
      from: `"Grocery Genius" <${fromAddress}>`,
      to,
      subject: "Verify your email - Grocery Genius",
      text: [
        "Welcome to Grocery Genius!",
        "",
        `Your verification code is: ${code}`,
        "",
        "This code expires in 15 minutes.",
        "",
        "If you didn't create this account, you can safely ignore this email.",
        "",
        "- Grocery Genius",
      ].join("\n"),
      html: [
        `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">`,
        `<div style="text-align: center; margin-bottom: 32px;">`,
        `<div style="display: inline-block; background: linear-gradient(135deg, #2d8a5e, #059669); border-radius: 16px; padding: 12px; margin-bottom: 12px;">`,
        `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
        `</div>`,
        `<h2 style="color: #1a1a1a; margin: 0 0 4px 0; font-size: 22px;">Grocery Genius</h2>`,
        `<p style="color: #666; margin: 0; font-size: 14px;">Verify your email address</p>`,
        `</div>`,
        `<p style="color: #333; font-size: 15px; line-height: 1.5;">Enter this code to verify your account:</p>`,
        `<div style="background: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">`,
        `<span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #166534; font-family: monospace;">${code}</span>`,
        `</div>`,
        `<p style="color: #999; font-size: 13px; text-align: center;">This code expires in 15 minutes.</p>`,
        `<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">`,
        `<p style="color: #999; font-size: 12px; text-align: center;">If you didn't create this account, you can safely ignore this email.</p>`,
        `</div>`,
      ].join("\n"),
    });

    console.log(`Verification email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return false;
  }
}
