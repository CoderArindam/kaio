import json
import logging
import time
import asyncio
from typing import List, Dict, Any, Type, AsyncGenerator
from app.ai.schemas.planning import (
    ExecutionPlan, ExecutionContext, ExecutionResult, ExecutionStatus, StepStatus, RiskLevel, StepExecutionResult
)
from app.ai.tools.base import BaseTool
from app.ai.orchestration.recovery import RecoveryPolicy, RecoveryAction
from app.ai.orchestration.plan_confirmation_store import plan_confirmation_store, hash_plan_from_model
from app.ai.exceptions import ToolExecutionError, UserCancellationError

logger = logging.getLogger(__name__)

def _get_nested_val(data: Any, path: str) -> Any:
    import re
    normalized = re.sub(r'\[(\d+)\]', r'.\1', path)
    tokens = [t for t in normalized.split('.') if t]
    curr = data
    for t in tokens:
        if curr is None:
            return None
        if isinstance(curr, dict):
            curr = curr.get(t)
        elif isinstance(curr, list):
            try:
                idx = int(t)
                curr = curr[idx] if 0 <= idx < len(curr) else None
            except (ValueError, IndexError):
                return None
        else:
            curr = getattr(curr, t, None)
    return curr


def _resolve_step_variables(args: Any, step_results: List[StepExecutionResult]) -> Any:
    import re
    if not step_results:
        return args

    ctx: Dict[str, Any] = {}
    for i, sr in enumerate(step_results):
        out = sr.output
        step_id = sr.step_id
        step_data: Dict[str, Any] = {"result": out, "output": out}
        if isinstance(out, dict):
            step_data.update(out)
            if "tasks" in out and isinstance(out["tasks"], list) and len(out["tasks"]) > 0:
                first_t = out["tasks"][0]
                if isinstance(first_t, dict) and "id" in first_t:
                    step_data["id"] = first_t["id"]
                    step_data["task_id"] = first_t["id"]
            if "task" in out and isinstance(out["task"], dict) and "id" in out["task"]:
                step_data["id"] = out["task"]["id"]
                step_data["task_id"] = out["task"]["id"]
            if "board" in out and isinstance(out["board"], dict) and "id" in out["board"]:
                step_data["board_id"] = out["board"]["id"]

        ctx[step_id] = step_data
        ctx[f"step_{i+1}"] = step_data

    def _resolve_val(val: Any) -> Any:
        if isinstance(val, str):
            m_exact = re.fullmatch(r'\{\{\s*([\w\.\[\]_]+)\s*\}\}', val.strip())
            if m_exact:
                expr = m_exact.group(1)
                res = _get_nested_val(ctx, expr)
                if res is not None:
                    return res
            def _repl(m):
                expr = m.group(1)
                r = _get_nested_val(ctx, expr)
                return str(r) if r is not None else m.group(0)
            return re.sub(r'\{\{\s*([\w\.\[\]_]+)\s*\}\}', _repl, val)
        elif isinstance(val, dict):
            return {k: _resolve_val(v) for k, v in val.items()}
        elif isinstance(val, list):
            return [_resolve_val(item) for item in val]
        return val

    return _resolve_val(args)


class Executor:
    """
    Executes an ExecutionPlan step-by-step.
    Handles partial failures, cancellations, and state machine boundaries safely.
    """
    def __init__(self, services: Dict[str, Any], available_tools: List[Type[BaseTool]]):
        self.services = services
        self.available_tools = available_tools
        self.action_to_tool = {}
        for tool_cls in available_tools:
            if hasattr(tool_cls, 'action') and tool_cls.action:
                self.action_to_tool[tool_cls.action] = tool_cls
            if hasattr(tool_cls, 'name') and tool_cls.name:
                self.action_to_tool[tool_cls.name] = tool_cls

    def _create_event(self, context: ExecutionContext, event_type: str, payload: Dict[str, Any]) -> str:
        event = {
            "v": "1.0",
            "execution_id": context.execution_id,
            "type": event_type,
            "timestamp": int(time.time() * 1000),
            **payload
        }
        return f"data: {json.dumps(event)}\n\n"

    async def execute(self, plan: ExecutionPlan, context: ExecutionContext, skip_confirmation: bool = False) -> AsyncGenerator[str, ExecutionResult]:
        start_time = time.time()
        
        from app.ai.telemetry.context import Span, TraceContext
        from app.ai.telemetry.events import EventType
        from app.ai.telemetry.bus import telemetry_bus
        
        with Span("Execute Plan", "Executor") as exec_span:
            exec_span.metadata["goal"] = plan.goal
            exec_span.metadata["total_steps"] = len(plan.steps)
            
            result = ExecutionResult(
                execution_id=context.execution_id,
                status=ExecutionStatus.EXECUTING,
                summary=f"Executing goal: {plan.goal}"
            )
            
            yield self._create_event(context, "execution_started", {"goal": plan.goal, "total_steps": len(plan.steps), "plan": plan.model_dump()})
            
            skip_remaining = False
            
            for i, step in enumerate(plan.steps):
                if context.is_cancelled:
                    result.status = ExecutionStatus.CANCELLED
                    break
                    
                if skip_remaining:
                    result.status = ExecutionStatus.PARTIALLY_COMPLETED
                    yield self._create_event(context, "step_skipped", {"step_id": step.id, "reason": "Previous step failed."})
                    continue

                with Span(f"Step: {step.action}", "ToolExecution") as tool_span:
                    tool_span.metadata["step_id"] = step.id
                    
                    tool_cls = self.action_to_tool.get(step.action)
                    if not tool_cls:
                        yield self._create_event(context, "error", {"step_id": step.id, "message": f"Action {step.action} not found."})
                        result.status = ExecutionStatus.PARTIALLY_COMPLETED if i > 0 else ExecutionStatus.FAILED
                        result.failed_steps.append(step.id)
                        tool_span.metadata["status"] = "failed"
                        tool_span.metadata["error"] = "Action not found"
                        skip_remaining = True
                        continue
                        
                    risk = tool_cls.risk_level
                    # NOTE (Phase 4): RiskLevel.MEDIUM is handled by this condition
                    # but no tool currently sets it — the MEDIUM branch is structurally
                    # present but functionally untested.  Phase 4 must add a smoke test
                    # asserting MEDIUM behaves identically to HIGH for confirmation-gating.
                    if risk in [RiskLevel.MEDIUM, RiskLevel.HIGH] and not skip_confirmation:
                        plan_hash = hash_plan_from_model(plan)
                        plan_confirmation_store.store(context.conversation_id, plan_hash)
                        yield self._create_event(context, "confirmation_required", {
                            "step_id": step.id,
                            "plan": plan.model_dump(),
                            "reason": f"Action '{step.action}' requires confirmation."
                        })
                        result.status = ExecutionStatus.WAITING_FOR_CONFIRMATION
                        yield self._create_event(context, "execution_result", {"result": result.model_dump()})
                        tool_span.metadata["status"] = "confirmation_required"
                        return
                        
                    yield self._create_event(context, "step_started", {"step_id": step.id, "description": step.description})
                    
                    tool_instance = tool_cls()
                    try:
                        resolved_args = _resolve_step_variables(step.arguments, result.step_results)
                        validated_args = tool_instance.input_schema(**resolved_args)
                        
                        cache_key = f"{step.action}_{json.dumps(resolved_args, sort_keys=True)}"
                        if cache_key in context.tool_cache:
                            tool_output = context.tool_cache[cache_key]
                        else:
                            # Apply tool timeout if defined
                            tool_timeout = context.timeout_metadata.get('tool_timeout_sec', 30.0)
                            
                            tool_output = await asyncio.wait_for(
                                tool_instance.run(validated_args, context.current_user, self.services),
                                timeout=tool_timeout
                            )
                            context.tool_cache[cache_key] = tool_output
                        
                        step_result = StepExecutionResult(
                            step_id=step.id,
                            tool_name=tool_cls.name,
                            action=step.action,
                            status=StepStatus.COMPLETED,
                            output=tool_output
                        )
                        result.step_results.append(step_result)

                        
                        yield self._create_event(context, "step_completed", {"step_id": step.id, "result": "Success"})
                        result.completed_steps.append(step.id)
                        
                        result.tool_metrics[tool_cls.name] = result.tool_metrics.get(tool_cls.name, 0) + 1
                        TraceContext.increment_metric("tools_executed")
                        
                        yield self._create_event(context, "content", {"content": f"\n\n*(Completed: {step.description})*\n"})
                        
                    except asyncio.TimeoutError:
                        logger.error(f"Execution timed out at step {step.id}")
                        yield self._create_event(context, "execution_failed", {"step_id": step.id, "error": "Step timed out."})
                        result.status = ExecutionStatus.PARTIALLY_COMPLETED if i > 0 else ExecutionStatus.FAILED
                        result.failed_steps.append(step.id)
                        
                        step_result = StepExecutionResult(
                            step_id=step.id,
                            tool_name=tool_cls.name,
                            action=step.action,
                            status=StepStatus.FAILED,
                            error="Step timed out."
                        )
                        result.step_results.append(step_result)
                        
                        # Create compensation hook metadata
                        context.recovery_metadata["compensation_hooks"] = context.recovery_metadata.get("compensation_hooks", [])
                        context.recovery_metadata["compensation_hooks"].append({"step_id": step.id, "action": step.action, "reason": "timeout"})
                        
                        skip_remaining = True
                    except asyncio.CancelledError:
                        result.status = ExecutionStatus.CANCELLED
                        raise
                    except Exception as e:
                        logger.error(f"Execution failed at step {step.id}: {e}")
                        
                        # Determine recovery via policy
                        action = RecoveryPolicy.determine_action_for_error(e)
                        
                        yield self._create_event(context, "execution_failed", {"step_id": step.id, "error": str(e)})
                        
                        if i > 0:
                            result.status = ExecutionStatus.PARTIALLY_COMPLETED
                        else:
                            result.status = ExecutionStatus.FAILED
                            
                        result.failed_steps.append(step.id)
                        tool_span.metadata["status"] = "failed"
                        tool_span.metadata["error"] = str(e)
                        
                        step_result = StepExecutionResult(
                            step_id=step.id,
                            tool_name=tool_cls.name,
                            action=step.action,
                            status=StepStatus.FAILED,
                            error=str(e)
                        )
                        result.step_results.append(step_result)
                        
                        context.recovery_metadata["compensation_hooks"] = context.recovery_metadata.get("compensation_hooks", [])
                        context.recovery_metadata["compensation_hooks"].append({"step_id": step.id, "action": step.action, "reason": "failure", "error": str(e)})
                        
                        if action == RecoveryAction.FAIL or action == RecoveryAction.PARTIAL:
                            skip_remaining = True
                        else:
                            raise e
                    
            if result.status == ExecutionStatus.EXECUTING:
                result.status = ExecutionStatus.COMPLETED
                yield self._create_event(context, "execution_completed", {"summary": result.summary})
                
            result.duration_ms = int((time.time() - start_time) * 1000)
            yield self._create_event(context, "execution_result", {"result": result.model_dump()})
