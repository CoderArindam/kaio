"""
Plan confirmation store — prevents confirmed_plan tampering.

When the Executor emits a `confirmation_required` SSE event, it stores
a canonical hash of the plan here, keyed by conversation_id (stable
across request turns), with a short TTL.

On the next request that carries `confirmed_plan`, chat_service derives
the hash of the resubmitted plan and calls `consume()`.  On mismatch or
expiry the request is rejected before any tool is executed.
"""
import hashlib
import json
import threading
import time
from typing import Optional


_DEFAULT_TTL_SECONDS = 300  # 5 minutes


def _hash_plan(plan_steps: list) -> str:
    """Stable SHA-256 over the steps list (sorted-key JSON)."""
    canonical = json.dumps(plan_steps, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def hash_plan_from_dict(plan_dict: dict) -> str:
    """Compute hash from a raw plan dict (as received from client)."""
    steps = plan_dict.get("steps", [])
    return _hash_plan(steps)


def hash_plan_from_model(plan) -> str:
    """Compute hash from an ExecutionPlan pydantic model."""
    steps = [step.model_dump() for step in plan.steps]
    return _hash_plan(steps)


class PlanConfirmationStore:
    """
    Thread-safe in-memory store of (plan_hash, expiry_ts) keyed by
    conversation_id.  One pending slot per conversation at a time.
    """

    def __init__(self, ttl_seconds: int = _DEFAULT_TTL_SECONDS):
        self._ttl = ttl_seconds
        self._store: dict[str, tuple[str, float]] = {}  # key -> (hash, expiry)
        self._lock = threading.Lock()

    def store(self, conversation_id: str, plan_hash: str) -> None:
        """Store or overwrite the pending hash for this conversation."""
        with self._lock:
            self._store[conversation_id] = (plan_hash, time.monotonic() + self._ttl)

    def consume(self, conversation_id: str) -> Optional[str]:
        """
        Remove and return the stored hash for this conversation.
        Returns None if not found or expired.
        """
        with self._lock:
            entry = self._store.pop(conversation_id, None)
            if entry is None:
                return None
            plan_hash, expiry = entry
            if time.monotonic() > expiry:
                return None
            return plan_hash

    def clear_expired(self) -> None:
        """Prune all expired entries (called lazily — not required for correctness)."""
        now = time.monotonic()
        with self._lock:
            expired = [k for k, (_, exp) in self._store.items() if now > exp]
            for k in expired:
                del self._store[k]


# Singleton used by executor.py and chat_service.py
plan_confirmation_store = PlanConfirmationStore()
