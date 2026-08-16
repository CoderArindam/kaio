import time
import uuid
import logging
from collections import defaultdict
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.config.settings import settings

logger = logging.getLogger("kaio.access")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds standard security headers to all outgoing HTTP responses."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Enforces maximum payload size for incoming requests."""

    def __init__(self, app, max_bytes: int = settings.MAX_REQUEST_SIZE_BYTES):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"detail": f"Payload too large. Maximum allowed size is {self.max_bytes} bytes."}
                    )
            except ValueError:
                pass
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory sliding window rate limiter per client IP address."""

    def __init__(self, app, requests_per_minute: int = settings.RATE_LIMIT_PER_MINUTE):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.window = 60.0  # seconds
        self.client_requests = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Exempt health check endpoints from rate limiting
        if request.url.path.startswith("/health"):
            return await call_next(request)

        now = time.time()

        # Evict IP entries whose most recent timestamp is older than the rate limit window
        stale_ips = [
            ip for ip, timestamps in self.client_requests.items()
            if not timestamps or (now - timestamps[-1]) >= self.window
        ]
        for ip in stale_ips:
            del self.client_requests[ip]

        client_ip = request.client.host if request.client else "127.0.0.1"

        # Clean old requests from window
        timestamps = [ts for ts in self.client_requests[client_ip] if now - ts < self.window]
        self.client_requests[client_ip] = timestamps

        if len(timestamps) >= self.requests_per_minute:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Too many requests."},
                headers={
                    "Retry-After": "60",
                    "X-RateLimit-Limit": str(self.requests_per_minute),
                    "X-RateLimit-Remaining": "0"
                }
            )

        self.client_requests[client_ip].append(now)
        response: Response = await call_next(request)
        remaining = max(0, self.requests_per_minute - len(self.client_requests[client_ip]))
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """Enforces X-Requested-With header check on state-modifying HTTP requests."""

    EXEMPT_PATHS = {
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/register/verify-otp",
        "/api/v1/auth/register/skip-otp",
        "/api/v1/auth/register/direct",
        "/api/v1/auth/refresh",
        "/api/v1/invitations/accept",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/login/verify-otp",
        "/api/v1/auth/otp/resend",
    }

    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            path = request.url.path
            is_exempt = (
                path in self.EXEMPT_PATHS
                or path.startswith("/health")
                or path.startswith("/api/v1/invitations/verify/")
                or path.startswith("/api/v1/meeting/presence/")  # Extension uses Bearer token, not cookies
            )
            if not is_exempt:
                header_val = request.headers.get("x-requested-with")
                if header_val != "XMLHttpRequest":
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"detail": "CSRF validation failed"}
                    )

        return await call_next(request)


class ProductionLoggingMiddleware(BaseHTTPMiddleware):
    """Structured request logging middleware assigning unique request IDs."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        start_time = time.time()

        response: Response = await call_next(request)

        process_time_ms = round((time.time() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id

        # Skip spammy health check logging unless error
        if not request.url.path.startswith("/health") or response.status_code >= 400:
            logger.info(
                f"req_id={request_id} client={request.client.host if request.client else 'unknown'} "
                f"method={request.method} path={request.url.path} status={response.status_code} "
                f"duration_ms={process_time_ms}"
            )

        return response
