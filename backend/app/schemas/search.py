from typing import Optional, List
from pydantic import BaseModel

class SearchResult(BaseModel):
    id: int
    title: str
    type: str  # 'task', 'board', 'comment'
    board_id: Optional[int] = None
    task_id: Optional[int] = None
    org_id: int

class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int
