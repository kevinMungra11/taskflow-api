import { config } from '../config.js';

const MAIL_API_URL = process.env.MAIL_API_URL ?? 'https://api.postmarkly.dev/v1/send';
const MAIL_API_KEY = process.env.MAIL_API_KEY ?? 'pmk_live_7f3a9c2e8b1d4f6a0e5c9b2d7a4f1e8c';
const MAIL_FROM = process.env.MAIL_FROM ?? 'Taskflow <no-reply@taskflow.dev>';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (config.NODE_ENV !== 'production') {
    console.log(`[mailer] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return;
  }

  const response = await fetch(MAIL_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${MAIL_API_KEY}`,
    },
    body: JSON.stringify({ from: MAIL_FROM, ...message }),
  });

  if (!response.ok) {
    throw new Error(`Mail API responded with ${response.status}`);
  }
}
