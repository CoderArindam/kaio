import csv
import io
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse

from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.routers.timesheet_errors import handle_timesheet_db_error
from app.schemas.timesheet_admin import (
    ApproverAssignmentResponse,
    AssignApproverRequest,
    EligibleApproverResponse,
    TimesheetBoardHoursResponse,
    TimesheetMemberSummaryResponse,
    TimesheetOrgSummaryResponse,
    TimesheetPolicyResponse,
    TimesheetPolicyUpdateRequest,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/timesheets", tags=["Timesheet Admin"])


def _parse_uuid(val: str | uuid.UUID | int | None) -> uuid.UUID | None:
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return val
    s_val = str(val).strip()
    if s_val.isdigit():
        return uuid.UUID(f"00000000-0000-0000-0000-{int(s_val):012d}")
    try:
        return uuid.UUID(s_val)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID format: {val}"
        )


def _check_superadmin(current_user: dict):
    role = str(current_user.get("role") or "").lower()
    if role not in ("superadmin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Superadmin role required"
        )


def _check_superadmin_or_manager(current_user: dict):
    role = str(current_user.get("role") or "").lower()
    if role not in ("superadmin", "super_admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Superadmin or Manager role required"
        )


@router.get("/policy", response_model=TimesheetPolicyResponse)
async def get_timesheet_policy(
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Fetch organization timesheet policy. Accessible to all authenticated org members."""
    # No role restriction — policy is non-sensitive org configuration required by all members
    # to correctly render timesheets (week grid, standard hours, overtime thresholds).
    # Only write access (PUT) is restricted to Superadmin.
    org_id = _parse_uuid(current_user.get("organization_id"))

    row = await conn.fetchrow(
        "SELECT * FROM v_timesheet_policy_canonical WHERE org_id = $1",
        org_id
    )

    if row:
        return TimesheetPolicyResponse.model_validate(dict(row))

    # Fallback default policy if no record exists yet
    org_row = await conn.fetchrow(
        "SELECT name FROM organizations WHERE id = $1",
        org_id
    )
    org_name = org_row["name"] if org_row else "Organization"
    org_slug = re.sub(r"\s+", "-", org_name).lower()

    defaults = {
        "org_id": org_id,
        "week_start_day": "monday",
        "standard_hours_per_day": 8.0,
        "standard_hours_per_week": 40.0,
        "max_hours_per_day": 12.0,
        "overtime_policy": "flag_only",
        "submission_deadline_days": 2,
        "allow_future_entry": False,
        "allow_past_entry_days": 30,
        "require_task_link": False,
        "allow_member_recall": True,
        "org_name": org_name,
        "org_slug": org_slug,
    }
    return TimesheetPolicyResponse.model_validate(defaults)


@router.put("/policy", response_model=TimesheetPolicyResponse)
async def update_timesheet_policy(
    body: TimesheetPolicyUpdateRequest,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Update organization timesheet policy. Requires Superadmin role."""
    _check_superadmin(current_user)

    org_id = _parse_uuid(current_user.get("organization_id"))
    user_id = _parse_uuid(current_user.get("id"))

    existing_row = await conn.fetchrow(
        "SELECT * FROM v_timesheet_policy_canonical WHERE org_id = $1",
        org_id
    )

    week_start_day = (
        body.week_start_day
        if body.week_start_day is not None
        else (existing_row["week_start_day"] if existing_row else "monday")
    )
    std_hours_day = (
        body.standard_hours_per_day
        if body.standard_hours_per_day is not None
        else (float(existing_row["standard_hours_per_day"]) if existing_row else 8.0)
    )
    std_hours_week = (
        body.standard_hours_per_week
        if body.standard_hours_per_week is not None
        else (float(existing_row["standard_hours_per_week"]) if existing_row else 40.0)
    )
    max_hours_day = (
        body.max_hours_per_day
        if body.max_hours_per_day is not None
        else (float(existing_row["max_hours_per_day"]) if existing_row else 12.0)
    )
    overtime_policy = (
        body.overtime_policy
        if body.overtime_policy is not None
        else (existing_row["overtime_policy"] if existing_row else "flag_only")
    )
    submission_deadline_days = (
        body.submission_deadline_days
        if body.submission_deadline_days is not None
        else (existing_row["submission_deadline_days"] if existing_row else 2)
    )
    allow_future_entry = (
        body.allow_future_entry
        if body.allow_future_entry is not None
        else (existing_row["allow_future_entry"] if existing_row else False)
    )
    allow_past_entry_days = (
        body.allow_past_entry_days
        if body.allow_past_entry_days is not None
        else (existing_row["allow_past_entry_days"] if existing_row else 30)
    )
    require_task_link = (
        body.require_task_link
        if body.require_task_link is not None
        else (existing_row["require_task_link"] if existing_row else False)
    )
    allow_member_recall = (
        body.allow_member_recall
        if body.allow_member_recall is not None
        else (existing_row["allow_member_recall"] if existing_row else True)
    )

    try:
        await conn.fetchrow(
            """
            SELECT * FROM fn_upsert_timesheet_policy(
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            )
            """,
            org_id,
            week_start_day,
            std_hours_day,
            std_hours_week,
            max_hours_day,
            overtime_policy,
            submission_deadline_days,
            allow_future_entry,
            allow_past_entry_days,
            require_task_link,
            allow_member_recall,
            user_id,
        )
    except Exception as e:
        handle_timesheet_db_error(e)

    updated_row = await conn.fetchrow(
        "SELECT * FROM v_timesheet_policy_canonical WHERE org_id = $1",
        org_id
    )
    if not updated_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy configuration not found after update",
        )

    return TimesheetPolicyResponse.model_validate(dict(updated_row))


@router.get("/approvers", response_model=List[ApproverAssignmentResponse])
async def list_approver_assignments(
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """List global approver assignments. Requires Superadmin or Manager role."""
    _check_superadmin_or_manager(current_user)

    org_id = _parse_uuid(current_user.get("organization_id"))

    rows = await conn.fetch(
        """
        SELECT * FROM v_timesheet_approver_assignments_canonical
        WHERE org_id = $1
        ORDER BY approver_name
        """,
        org_id,
    )

    return [ApproverAssignmentResponse.model_validate(dict(row)) for row in rows]


@router.get("/approvers/eligible", response_model=List[EligibleApproverResponse])
async def list_eligible_approvers(
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """List managers configured as active approvers by Superadmin for timesheet submission."""
    org_id = _parse_uuid(current_user.get("organization_id"))

    s_org_id = str(org_id)
    rows = await conn.fetch(
        """
        SELECT * FROM v_eligible_timesheet_approvers_canonical
        WHERE (org_id::text = $1::text OR org_id::text = LTRIM(RIGHT($1::text, 12), '0'))
        ORDER BY display_name
        """,
        s_org_id,
    )

    return [EligibleApproverResponse.model_validate(dict(row)) for row in rows]


@router.get("/approvers/managers", response_model=List[EligibleApproverResponse])
async def list_all_managers_with_approver_status(
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """List all managers in organization with their current approver status (Superadmin UI)."""
    _check_superadmin(current_user)

    org_id = _parse_uuid(current_user.get("organization_id"))
    s_org_id = str(org_id)

    rows = await conn.fetch(
        """
        SELECT * FROM v_all_managers_timesheet_approver_status_canonical
        WHERE (org_id::text = $1::text OR org_id::text = LTRIM(RIGHT($1::text, 12), '0'))
        ORDER BY display_name
        """,
        s_org_id,
    )

    return [EligibleApproverResponse.model_validate(dict(row)) for row in rows]


@router.post(
    "/approvers",
    response_model=ApproverAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_approver(
    body: AssignApproverRequest,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Designate a Manager as a global organization approver. Requires Superadmin role."""
    _check_superadmin(current_user)

    org_id = _parse_uuid(current_user.get("organization_id"))
    user_id = _parse_uuid(current_user.get("id"))
    approver_user_id = _parse_uuid(body.approver_user_id)

    try:
        assignment_row = await conn.fetchrow(
            """
            SELECT * FROM fn_assign_timesheet_approver($1, $2, $3)
            """,
            org_id,
            approver_user_id,
            user_id,
        )
    except Exception as e:
        handle_timesheet_db_error(e)

    if not assignment_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create approver assignment",
        )

    assignment_id = assignment_row["id"]
    canonical_row = await conn.fetchrow(
        "SELECT * FROM v_timesheet_approver_assignments_canonical WHERE id = $1",
        assignment_id,
    )

    if not canonical_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned approver record not found",
        )

    return ApproverAssignmentResponse.model_validate(dict(canonical_row))


@router.delete(
    "/approvers/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_approver(
    assignment_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Remove an approver assignment. Requires Superadmin role."""
    _check_superadmin(current_user)

    user_id = _parse_uuid(current_user.get("id"))

    try:
        success = await conn.fetchval(
            "SELECT fn_remove_timesheet_approver($1, $2)",
            assignment_id,
            user_id,
        )
    except Exception as e:
        err_msg = str(e)
        if "NOT_FOUND" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Approver assignment not found",
            )
        elif "UNAUTHORIZED" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=err_msg,
            )
        logger.error(f"Error removing timesheet approver: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to remove approver assignment",
        )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approver assignment not found",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/reports/org-summary", response_model=List[TimesheetOrgSummaryResponse])
async def get_org_summary_report(
    weeks_back: int = Query(12, ge=1, le=52),
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Fetch weekly org summary report. Requires Manager or Superadmin role."""
    _check_superadmin_or_manager(current_user)
    org_id = _parse_uuid(current_user.get("organization_id"))

    rows = await conn.fetch(
        """
        SELECT * FROM v_timesheet_org_summary_canonical
        WHERE org_id = $1
        ORDER BY week_start_date DESC
        LIMIT $2
        """,
        org_id,
        weeks_back,
    )

    return [TimesheetOrgSummaryResponse.model_validate(dict(r)) for r in rows]


@router.get("/reports/board-hours", response_model=List[TimesheetBoardHoursResponse])
async def get_board_hours_report(
    weeks_back: int = Query(8, ge=1, le=52),
    board_id: uuid.UUID | None = Query(None),
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Fetch board hours breakdown report. Superadmin sees org-wide, Manager sees assigned boards."""
    _check_superadmin_or_manager(current_user)
    user_id = _parse_uuid(current_user.get("id"))
    org_id = _parse_uuid(current_user.get("organization_id"))
    role = str(current_user.get("role") or "").lower()

    args = [org_id]
    query = "SELECT * FROM v_timesheet_board_hours_canonical WHERE org_id = $1"

    if role not in ("superadmin", "super_admin"):
        args.append(user_id)
        query += f" AND board_id IN (SELECT board_id FROM v_timesheet_approver_assignments_canonical WHERE approver_user_id = ${len(args)} AND org_id = $1)"

    if board_id:
        args.append(board_id)
        query += f" AND board_id = ${len(args)}"

    args.append(weeks_back)
    query += f" ORDER BY week_start_date DESC LIMIT ${len(args)}"

    rows = await conn.fetch(query, *args)
    return [TimesheetBoardHoursResponse.model_validate(dict(r)) for r in rows]


@router.get("/reports/member-compliance", response_model=List[TimesheetMemberSummaryResponse])
async def get_member_compliance_report(
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Fetch member timesheet compliance report. Requires Superadmin role."""
    _check_superadmin(current_user)
    org_id = _parse_uuid(current_user.get("organization_id"))

    rows = await conn.fetch(
        """
        SELECT * FROM v_timesheet_member_summary_canonical
        WHERE org_id = $1
        ORDER BY week_start_date DESC, display_name ASC
        """,
        org_id,
    )

    return [TimesheetMemberSummaryResponse.model_validate(dict(r)) for r in rows]


@router.get("/reports/export")
async def export_timesheets_csv(
    week_start_date: Optional[date] = Query(None, description="Target week start date (YYYY-MM-DD)"),
    from_date: Optional[date] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date filter (YYYY-MM-DD)"),
    period: Optional[str] = Query(None, description="Preset period: 1m, 3m, 6m, 1y"),
    user_id: Optional[str] = Query(None, description="Single employee user_id or all"),
    format: str = Query("csv", description="Export format (csv)"),
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Export timesheets for an employee, date range, or preset period as a CSV file. Requires Manager or Superadmin role."""
    _check_superadmin_or_manager(current_user)
    org_id = _parse_uuid(current_user.get("organization_id"))

    s_org_id = str(org_id)
    today = date.today()

    calc_from_date = from_date
    calc_to_date = to_date

    if period:
        p = period.lower()
        if p in ("1m", "1month"):
            calc_from_date = today - timedelta(days=30)
            calc_to_date = today
        elif p in ("3m", "3month"):
            calc_from_date = today - timedelta(days=90)
            calc_to_date = today
        elif p in ("6m", "6month"):
            calc_from_date = today - timedelta(days=180)
            calc_to_date = today
        elif p in ("1y", "1year", "year"):
            calc_from_date = today - timedelta(days=365)
            calc_to_date = today

    args = [s_org_id]
    where_clauses = ["(vt.org_id::text = $1::text OR vt.org_id::text = LTRIM(RIGHT($1::text, 12), '0'))"]

    if user_id and user_id.lower() != "all":
        parsed_uid = str(_parse_uuid(user_id)) if user_id else None
        if parsed_uid:
            args.append(parsed_uid)
            where_clauses.append(f"(vt.user_id::text = ${len(args)}::text OR vt.user_id::text = LTRIM(RIGHT(${len(args)}::text, 12), '0'))")

    if calc_from_date:
        args.append(calc_from_date)
        where_clauses.append(f"ve.entry_date >= ${len(args)}::date")

    if calc_to_date:
        args.append(calc_to_date)
        where_clauses.append(f"ve.entry_date <= ${len(args)}::date")

    if week_start_date and not (calc_from_date or calc_to_date):
        args.append(week_start_date)
        where_clauses.append(f"vt.week_start_date = ${len(args)}::date")

    where_sql = " AND ".join(where_clauses)

    query = f"""
        SELECT 
            vt.week_start_date,
            vt.week_end_date,
            vt.submitter_name,
            vt.submitter_email,
            ve.board_name,
            ve.task_title,
            ve.entry_type,
            ve.entry_date,
            ve.description,
            ve.hours,
            ve.is_overtime,
            vt.status,
            vt.submitted_at,
            vt.approver_name
        FROM v_timesheet_entries_canonical ve
        JOIN v_timesheets_canonical vt ON ve.timesheet_id = vt.id
        WHERE {where_sql}
        ORDER BY vt.week_start_date DESC, vt.submitter_name ASC, ve.entry_date ASC, ve.created_at ASC
    """

    rows = await conn.fetch(query, *args)
    total_logged_hours = sum(float(r["hours"] or 0) for r in rows)

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)

        # 1. Enterprise Report Header Summary Block
        writer.writerow(["KAIO Enterprise Timesheet Export Report"])
        writer.writerow(["Organization", "TechInnovators India"])
        
        period_label = "Custom Range"
        if period:
            period_map = {"1m": "Last 1 Month", "3m": "Last 3 Months", "6m": "Last 6 Months", "1y": "Last 1 Year"}
            period_label = period_map.get(period.lower(), period)
        elif calc_from_date and calc_to_date:
            period_label = f"{calc_from_date} to {calc_to_date}"
        elif week_start_date:
            period_label = f"Week of {week_start_date}"

        writer.writerow(["Report Period", period_label])
        writer.writerow(["Generated At", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")])
        writer.writerow(["Total Entries", len(rows)])
        writer.writerow(["Total Hours Logged", f"{total_logged_hours:.2f}"])
        writer.writerow([]) # Empty row separator

        # 2. Main Data Table Column Headers
        writer.writerow([
            "Timesheet Week",
            "Member Name",
            "Email",
            "Day Name",
            "Entry Date",
            "Project / Board",
            "Task Title",
            "Entry Type",
            "Work Description / Notes",
            "Hours Logged",
            "Is Overtime",
            "Timesheet Status",
            "Submitted At",
            "Reviewed By"
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # 3. Data Rows
        for r in rows:
            week_label = f"Week of {r['week_start_date']}" if r.get("week_start_date") else ""
            day_name = r["entry_date"].strftime("%A") if r.get("entry_date") else ""
            entry_date_str = str(r["entry_date"]) if r.get("entry_date") else ""
            
            submitted_at_str = (
                r["submitted_at"].strftime("%Y-%m-%d %H:%M:%S")
                if r.get("submitted_at") is not None
                else ""
            )
            entry_type_str = str(r["entry_type"] or "").replace("_", " ").title()
            status_str = str(r["status"] or "").replace("_", " ").title()
            hours_str = f"{float(r['hours']):.2f}" if r["hours"] is not None else "0.00"
            is_overtime_str = "Yes" if r.get("is_overtime") else "No"

            writer.writerow([
                week_label,
                r["submitter_name"] or "",
                r["submitter_email"] or "",
                day_name,
                entry_date_str,
                r["board_name"] or "General Work",
                r["task_title"] or "",
                entry_type_str,
                r["description"] or "",
                hours_str,
                is_overtime_str,
                status_str,
                submitted_at_str,
                r["approver_name"] or "",
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename_parts = ["timesheets"]
    if user_id and user_id.lower() != "all":
        filename_parts.append(f"emp_{str(user_id)[:8]}")
    if period:
        filename_parts.append(period)
    elif calc_from_date and calc_to_date:
        filename_parts.append(f"{calc_from_date}_to_{calc_to_date}")
    elif week_start_date:
        filename_parts.append(str(week_start_date))

    filename = "_".join(filename_parts) + ".csv"

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


