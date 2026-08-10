import asyncpg
from typing import Optional
from fastapi import HTTPException
from app.schemas.board import ProjectSettingsResponse, ProjectSettingsUpdate, CanonicalBoardResponse, ProjectStatistics

class ProjectSettingsService:
    @staticmethod
    async def get_settings(conn: asyncpg.Connection, board_id: int) -> ProjectSettingsResponse:
        board_row = await conn.fetchrow("SELECT * FROM fn_get_project_settings($1)", board_id)
        if not board_row:
            raise HTTPException(status_code=404, detail="Project not found")
        
        stats_row = await conn.fetchrow("SELECT * FROM fn_get_project_statistics($1)", board_id)
        
        return ProjectSettingsResponse(
            settings=CanonicalBoardResponse(**dict(board_row)),
            statistics=ProjectStatistics(**dict(stats_row)) if stats_row else ProjectStatistics(
                total_tasks=0, completed_tasks=0, overdue_tasks=0, members_count=0, columns_count=0, last_activity=None
            )
        )

    @staticmethod
    async def update_settings(conn: asyncpg.Connection, board_id: int, updates: ProjectSettingsUpdate) -> ProjectSettingsResponse:
        set_fields = updates.model_fields_set
        
        p_default_assignee_id = updates.default_assignee_id if 'default_assignee_id' in set_fields else -1
        p_project_lead_id = updates.project_lead_id if 'project_lead_id' in set_fields else -1

        row = await conn.fetchrow(
            """
            SELECT * FROM fn_update_project_settings(
                $1, $2, $3, $4, $5, $6, $7, $8
            )
            """,
            board_id,
            updates.name,
            updates.description,
            updates.icon,
            updates.color,
            updates.cover_gradient,
            p_default_assignee_id,
            p_project_lead_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Project not found or update failed")
            
        stats_row = await conn.fetchrow("SELECT * FROM fn_get_project_statistics($1)", board_id)
        return ProjectSettingsResponse(
            settings=CanonicalBoardResponse(**dict(row)),
            statistics=ProjectStatistics(**dict(stats_row)) if stats_row else ProjectStatistics(
                total_tasks=0, completed_tasks=0, overdue_tasks=0, members_count=0, columns_count=0, last_activity=None
            )
        )

    @staticmethod
    async def archive_project(conn: asyncpg.Connection, board_id: int) -> ProjectSettingsResponse:
        row = await conn.fetchrow("SELECT * FROM fn_archive_project($1)", board_id)
        if not row:
            raise HTTPException(status_code=404, detail="Project not found or already archived")
            
        stats_row = await conn.fetchrow("SELECT * FROM fn_get_project_statistics($1)", board_id)
        return ProjectSettingsResponse(
            settings=CanonicalBoardResponse(**dict(row)),
            statistics=ProjectStatistics(**dict(stats_row)) if stats_row else ProjectStatistics(
                total_tasks=0, completed_tasks=0, overdue_tasks=0, members_count=0, columns_count=0, last_activity=None
            )
        )
