import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

INSTITUTIONAL_DOMAINS = {
    "ac.in", "edu", "edu.in", "org", "gov.in", "nic.in",
    "res.in", "ac.uk", "edu.au", "ac.nz",
    "gmail.com",  # temp for testing only — remove before demo
}


def is_institutional_email(email: str) -> bool:
    """Return True if the email belongs to an institutional domain."""
    try:
        domain = email.strip().lower().split("@")[1]
        # Check top-level and second-level domain combinations
        parts = domain.split(".")
        for i in range(len(parts) - 1):
            if ".".join(parts[i:]) in INSTITUTIONAL_DOMAINS:
                return True
        return False
    except (IndexError, AttributeError):
        return False


def send_otp_email(to_email: str, otp: str, purpose: str):
    """
    Send OTP email via Gmail SMTP.
    Falls back to console print in dev mode (when MAIL_USERNAME not set).
    """
    mail_username = os.environ.get("MAIL_USERNAME", "")
    mail_password = os.environ.get("MAIL_PASSWORD", "")

    subjects = {
        "login": "Your E-Voting Login OTP",
        "org_register": "Verify Your Organisation Email — E-Voting Platform",
        "voter_register": "Verify Your Email — E-Voting Platform",
    }
    subject = subjects.get(purpose, "Your OTP — E-Voting Platform")

    body = f"""Hello,

Your one-time password (OTP) is:

    {otp}

This OTP is valid for 10 minutes. Do not share it with anyone.

If you did not request this, please ignore this email.

— E-Voting Platform
"""

    if not mail_username or not mail_password:
        print(f"[DEV EMAIL] To: {to_email} | Subject: {subject} | OTP: {otp}")
        return

    msg = MIMEMultipart()
    msg["From"] = mail_username
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(mail_username, mail_password)
        server.sendmail(mail_username, to_email, msg.as_string())
