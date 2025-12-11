"""Pydantic Data Models for API"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class SubmitResponse(BaseModel):
    """Response for task submission"""
    task_id: str
    status: str = "queued"
    position: Optional[int] = None
    estimated_wait: Optional[int] = None  # seconds


class TaskResult(BaseModel):
    """Task result response"""
    task_id: str
    status: str  # queued, processing, done, failed
    text: Optional[str] = None
    duration: Optional[float] = None
    created_at: Optional[str] = None
    audio_url: Optional[str] = None
    error: Optional[str] = None
    retry_url: Optional[str] = None
    progress: Optional[int] = None  # percentage


class HistoryRecord(BaseModel):
    """History record"""
    task_id: str
    filename: str
    text: str
    created_at: str
    duration: float
    status: str
    audio_url: str


class HistoryResponse(BaseModel):
    """History list response"""
    total: int
    records: List[HistoryRecord]


class QueueStatus(BaseModel):
    """Queue status"""
    queued: int = 0
    processing: int = 0
    failed: int = 0
    workers: int = 0
    workers_busy: int = 0


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    redis_connected: bool
    workers_active: int
    uptime: Optional[str] = None
    error: Optional[str] = None


class StatsResponse(BaseModel):
    """System statistics"""
    total_tasks: int
    total_duration: float  # total audio duration processed
    avg_rtf: float  # average real-time factor
    storage_used: str  # disk space used
    

class ErrorResponse(BaseModel):
    """Error response"""
    error: str
    details: Optional[dict] = None
