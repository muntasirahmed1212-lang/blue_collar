function getOTPEmailHTML({ userName, otpCode, purpose, expiryMinutes }) {
  const title = purpose === 'password-reset' 
    ? 'Reset Your Password' 
    : 'Verify Your Email';
  
  const subtitle = purpose === 'password-reset'
    ? 'We received a request to reset your password.'
    : 'Thanks for signing up! Please verify your email.';

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — BlueCollar Connect</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width: 520px; margin: 0 auto;">
            
            <!-- Logo Header -->
            <tr>
              <td style="text-align: center; padding-bottom: 24px;">
                <span style="font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em;">
                  🔧 BlueCollar<span style="color: #3b82f6;">Connect</span>
                </span>
              </td>
            </tr>
            
            <!-- Main Card -->
            <tr>
              <td style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07); overflow: hidden;">
                
                <!-- Blue accent bar -->
                <div style="height: 4px; background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);"></div>
                
                <!-- Content -->
                <div style="padding: 40px 36px;">
                  <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #0f172a; line-height: 1.2;">${title}</h1>
                  <p style="margin: 0 0 28px 0; font-size: 15px; color: #475569; line-height: 1.6;">${subtitle}</p>
                  
                  <p style="margin: 0 0 12px 0; font-size: 14px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Your verification code</p>
                  
                  <!-- OTP Code Box -->
                  <div style="background-color: #f8fafc; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 28px;">
                    <span style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #0f172a; font-family: 'Courier New', monospace;">${otpCode}</span>
                  </div>
                  
                  <!-- Timer Warning -->
                  <div style="display: flex; align-items: center; background-color: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
                    <span style="font-size: 14px; color: #92400e;">⏱️ This code expires in <strong>${expiryMinutes} minutes</strong></span>
                  </div>
                  
                  <!-- Safety Notice -->
                  <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                    If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
                  </p>
                </div>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="padding-top: 24px; text-align: center;">
                <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">
                  © ${new Date().getFullYear()} BlueCollar Connect. All rights reserved.
                </p>
                <p style="margin: 0; font-size: 12px; color: #cbd5e1;">
                  This is an automated message — please do not reply.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

function getPlainTextEmail({ userName, otpCode, purpose, expiryMinutes }) {
  const title = purpose === 'password-reset' 
    ? 'Password Reset Request' 
    : 'Email Verification';
  
  return `
BlueCollar Connect — ${title}

Hi${userName ? ' ' + userName : ''},

Your verification code is: ${otpCode}

This code will expire in ${expiryMinutes} minutes.

If you didn't request this, please ignore this email.

© ${new Date().getFullYear()} BlueCollar Connect
  `.trim();
}

module.exports = { getOTPEmailHTML, getPlainTextEmail };
