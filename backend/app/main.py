import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware



from app.config.settings import settings

# Configure production logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kaio.main")

from app.database.connection import db
from app.middleware import (
    SecurityHeadersMiddleware,
    RequestSizeLimitMiddleware,
    RateLimitMiddleware,
    ProductionLoggingMiddleware,
    CSRFMiddleware,
)
from app.routers import (
    auth, boards, tasks, users, comments, attachments, activity,
    board_members, admin, invitations, notifications, my_work,
    preferences, organization, ai, task_proposals, dashboard,
    timesheet_admin, timesheets, timesheet_approvals, search, labels, subtasks, columns, notes
)
from app.meeting.api import router as meeting_router
from app.websockets.router import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation & DB pool initialization
    logger.info("Initializing KAIO API backend server...")
    logger.info(f"Environment: {settings.ENVIRONMENT} | Log Level: {settings.LOG_LEVEL}")

    await db.connect()
    if await db.is_healthy():
        logger.info("Database connection verified and ready.")
    else:
        logger.warning("Database connection health check returned unhealthy during startup.")

    # Start Organization Purge Worker
    from app.services.organization_purge_worker import OrganizationPurgeWorker
    app.state.purge_worker = OrganizationPurgeWorker(db.pool)
    app.state.purge_worker.start()

    # Start Task Reminder Worker
    from app.services.task_reminder_worker import TaskReminderWorker
    app.state.task_reminder_worker = TaskReminderWorker(db.pool)
    app.state.task_reminder_worker.start()

    yield

    # Shutdown — cancel all active meeting sessions cleanly before stopping DB connection
    logger.info("Shutting down KAIO API backend server...")
    if hasattr(app.state, "purge_worker"):
        await app.state.purge_worker.stop()
        
    if hasattr(app.state, "task_reminder_worker"):
        await app.state.task_reminder_worker.stop()
        
    from app.meeting.api import meeting_service
    await meeting_service.shutdown_all()
    await db.disconnect()


app = FastAPI(
    title="KAIO API",
    description="Production-hardened Backend API for KAIO",
    version="1.0.0",
    lifespan=lifespan
)

# Ensure uploads directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Add Production Hardening Middleware Stack
app.add_middleware(ProductionLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.MAX_REQUEST_SIZE_BYTES)
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.RATE_LIMIT_PER_MINUTE)

# Configure CORS Validation
origins = [origin.strip() for origin in settings.FRONTEND_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CSRFMiddleware)

# Register API Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(boards.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(comments.router, prefix="/api/v1")
app.include_router(attachments.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(activity.router, prefix="/api/v1")
app.include_router(board_members.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(invitations.router, prefix="/api/v1")
app.include_router(my_work.router, prefix="/api/v1")
app.include_router(preferences.router, prefix="/api/v1")
app.include_router(organization.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(task_proposals.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(timesheet_admin.router, prefix="/api/v1")
app.include_router(timesheet_approvals.router, prefix="/api/v1")
app.include_router(timesheets.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(labels.router, prefix="/api/v1")
app.include_router(subtasks.router, prefix="/api/v1")
app.include_router(columns.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(meeting_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")


# Health Monitoring Probes
@app.get("/health", tags=["Health"])
async def health_check():
    """Overall service health endpoint."""
    return {
        "status": "healthy",
        "service": "KAIO API",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health/liveness", tags=["Health"])
async def liveness_probe():
    """Liveness probe: verifies process is alive."""
    return {"status": "alive"}


@app.get("/health/readiness", tags=["Health"])
async def readiness_probe(response: Response):
    """Readiness probe: verifies database connectivity."""
    db_healthy = await db.is_healthy()
    if db_healthy:
        return {
            "status": "ready",
            "database": "connected",
            "environment": settings.ENVIRONMENT,
        }

    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "not_ready",
        "database": "disconnected",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/", tags=["Root"])
async def root():
    return {"message": "Welcome to KAIO API. Access /docs for API documentation."}

