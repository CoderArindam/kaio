from typing import Dict
from pydantic import BaseModel

class TimeoutPolicy(BaseModel):
    planner_timeout_sec: float = 60.0
    tool_timeout_sec: float = 30.0
    provider_timeout_sec: float = 55.0
    overall_execution_timeout_sec: float = 120.0

# Singleton policy
timeout_policy = TimeoutPolicy()
