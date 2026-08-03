def task_assigned_template(
    task_title: str,
    board_name: str,
    assigned_by_name: str
) -> str:

    return f"""
Hi there 👋


You have been assigned a new task.


━━━━━━━━━━━━━━━━━━━━━━

📌 Task

{task_title}


📂 Board

{board_name}


👤 Assigned by

{assigned_by_name}

━━━━━━━━━━━━━━━━━━━━━━



It's time to get started.

Open your workspace to view the task details, collaborate with your team, and keep the project moving forward.



👉 Next steps:

• Review the task requirements
• Add updates or comments
• Mark progress as you complete the work



Thanks,

The Team
"""





def task_assignment_changed_template(
    task_title: str,
    assigned_user_name: str
) -> str:

    return f"""
Hi there 👋


A task assignment has been updated.


━━━━━━━━━━━━━━━━━━━━━━

📌 Task

{task_title}


👤 New Assignee

{assigned_user_name}

━━━━━━━━━━━━━━━━━━━━━━



The ownership of this task has changed successfully.



You can open your workspace to see the latest updates and continue collaborating with your team.



Thanks,

The Team
"""





def task_status_changed_template(
    task_title: str,
    old_status: str,
    new_status: str,
    changed_by_name: str
) -> str:

    return f"""
Hi there 👋


A task status update was made.


━━━━━━━━━━━━━━━━━━━━━━

📌 Task

{task_title}


🔄 Status Changed

{old_status}

↓

{new_status}


👤 Updated by

{changed_by_name}

━━━━━━━━━━━━━━━━━━━━━━



Your project activity has been updated.

Visit your workspace to review the latest progress.



Thanks,

The Team
"""





def task_comment_added_template(
    task_title: str,
    commenter_name: str,
    comment: str
) -> str:

    return f"""
Hi there 👋


Someone added a new comment to a task you follow.


━━━━━━━━━━━━━━━━━━━━━━

📌 Task

{task_title}


💬 Comment by

{commenter_name}



"{comment}"

━━━━━━━━━━━━━━━━━━━━━━



Open your workspace to reply and continue the discussion.



Thanks,

The Team
"""


def generate_password_reset_email(first_name: str, reset_url: str) -> tuple[str, str]:
    subject = "Reset your KAIO password"
    body = f"""
Hi {first_name} 👋


You requested a password reset for your KAIO account.


━━━━━━━━━━━━━━━━━━━━━━

🔑 Reset Your Password

Click the link below to set a new password:

{reset_url}

⏰ This link expires in 1 hour.

━━━━━━━━━━━━━━━━━━━━━━



🔒 If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.



Thanks,

The Team
"""
    return subject, body


def generate_email_verification_email(first_name: str, verify_url: str) -> tuple[str, str]:
    subject = "Verify your KAIO email address"
    body = f"""
Hi {first_name} 👋


Please verify your email address to complete your KAIO account setup.


━━━━━━━━━━━━━━━━━━━━━━

✉️ Verify Your Email

Click the link below to verify your email address:

{verify_url}

⏰ This link expires in 24 hours.

━━━━━━━━━━━━━━━━━━━━━━



Thanks,

The Team
"""
    return subject, body


def generate_otp_email(first_name: str, otp_code: str, purpose_title: str = "Verification Code", expiry_minutes: int = 10) -> tuple[str, str]:
    subject = f"[{otp_code}] Your KAIO {purpose_title}"
    greeting = f"Hi {first_name} 👋" if first_name else "Hi there 👋"
    body = f"""
{greeting}


Here is your one-time verification code for KAIO ({purpose_title}):


━━━━━━━━━━━━━━━━━━━━━━

🔐 Verification Code

       {otp_code}

⏰ This code is valid for {expiry_minutes} minutes.

━━━━━━━━━━━━━━━━━━━━━━


🔒 Security Notice: Never share this code with anyone. KAIO support will never ask for your verification code.

If you did not request this code, please secure your account immediately.


Thanks,

The KAIO Team
"""
    return subject, body