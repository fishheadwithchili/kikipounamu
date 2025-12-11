"""Redis Streams Helper Module for ASR Task Queue

This module provides Redis Streams functions for publishing and consuming
ASR tasks using Consumer Groups for high-concurrency processing.

Stream: asr_tasks
Consumer Group: asr_workers
"""
import json
import os
import time
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
import redis

# Configuration from environment
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
STREAM_NAME = os.getenv("STREAM_NAME", "asr_tasks")
CONSUMER_GROUP = os.getenv("CONSUMER_GROUP", "asr_workers")


@dataclass
class StreamMessage:
    """Represents a message from the stream"""
    msg_id: str
    task_type: str  # "batch" or "stream"
    task_id: str
    payload: Dict[str, Any]
    timestamp: int
    origin: str


class StreamsClient:
    """Redis Streams client for task queue operations"""
    
    _instance: Optional['StreamsClient'] = None
    _redis: Optional[redis.Redis] = None
    
    def __new__(cls):
        """Singleton pattern"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._redis is not None:
            return
        
        self._redis = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            decode_responses=True
        )
    
    @property
    def redis(self) -> redis.Redis:
        return self._redis

    # ========================================================================
    # Producer Methods
    # ========================================================================
    
    def publish_task(
        self,
        task_type: str,
        task_id: str,
        payload: Dict[str, Any],
        origin: str = "fastapi"
    ) -> str:
        """
        Publish a task to the stream via XADD.
        
        Args:
            task_type: "batch" or "stream"
            task_id: UUID or session ID
            payload: Task-specific data (audio_path, chunk_data, etc.)
            origin: Source of the task ("fastapi" or "go-backend")
            
        Returns:
            Message ID from XADD
        """
        message = {
            "type": task_type,
            "task_id": task_id,
            "payload": json.dumps(payload),
            "timestamp": int(time.time() * 1000),
            "origin": origin
        }
        
        msg_id = self._redis.xadd(STREAM_NAME, message)
        return msg_id
    
    # ========================================================================
    # Consumer Methods (for unified_worker)
    # ========================================================================
    
    def ensure_consumer_group(self) -> bool:
        """
        Create consumer group if it doesn't exist.
        
        Returns:
            True if group was created or already exists
        """
        try:
            self._redis.xgroup_create(
                STREAM_NAME,
                CONSUMER_GROUP,
                id="0",  # Read from beginning
                mkstream=True  # Create stream if it doesn't exist
            )
            return True
        except redis.ResponseError as e:
            if "BUSYGROUP" in str(e):
                # Consumer group already exists
                return True
            raise
    
    def consume_tasks(
        self,
        worker_name: str,
        batch_size: int = 10,
        block_ms: int = 1000
    ) -> List[StreamMessage]:
        """
        Read tasks from stream using XREADGROUP.
        
        Args:
            worker_name: Unique worker identifier
            batch_size: Max messages to read
            block_ms: Blocking timeout in milliseconds
            
        Returns:
            List of StreamMessage objects
        """
        result = self._redis.xreadgroup(
            groupname=CONSUMER_GROUP,
            consumername=worker_name,
            streams={STREAM_NAME: ">"},  # Only new messages
            count=batch_size,
            block=block_ms
        )
        
        if not result:
            return []
        
        messages = []
        for stream_name, entries in result:
            for msg_id, data in entries:
                try:
                    msg = StreamMessage(
                        msg_id=msg_id,
                        task_type=data.get("type", "batch"),
                        task_id=data.get("task_id", ""),
                        payload=json.loads(data.get("payload", "{}")),
                        timestamp=int(data.get("timestamp", 0)),
                        origin=data.get("origin", "unknown")
                    )
                    messages.append(msg)
                except (json.JSONDecodeError, ValueError) as e:
                    # Log error but continue processing
                    print(f"Error parsing message {msg_id}: {e}")
        
        return messages
    
    def ack_task(self, msg_id: str) -> int:
        """
        Acknowledge a processed message via XACK.
        
        Args:
            msg_id: Message ID to acknowledge
            
        Returns:
            Number of messages acknowledged (0 or 1)
        """
        return self._redis.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)
    
    # ========================================================================
    # Monitoring Methods
    # ========================================================================
    
    def get_pending_count(self) -> int:
        """
        Get count of pending (unacknowledged) messages via XPENDING.
        
        Returns:
            Number of pending messages
        """
        try:
            info = self._redis.xpending(STREAM_NAME, CONSUMER_GROUP)
            return info.get("pending", 0) if isinstance(info, dict) else info[0]
        except redis.ResponseError:
            return 0
    
    def get_stream_info(self) -> Dict[str, Any]:
        """
        Get stream information via XINFO STREAM.
        
        Returns:
            Dict with stream length, groups, etc.
        """
        try:
            info = self._redis.xinfo_stream(STREAM_NAME)
            return {
                "length": info.get("length", 0),
                "first_entry": info.get("first-entry"),
                "last_entry": info.get("last-entry"),
                "groups": info.get("groups", 0)
            }
        except redis.ResponseError:
            return {"length": 0, "groups": 0}
    
    def get_consumer_info(self) -> List[Dict[str, Any]]:
        """
        Get consumer group information via XINFO GROUPS.
        
        Returns:
            List of consumer group info dicts
        """
        try:
            groups = self._redis.xinfo_groups(STREAM_NAME)
            return [
                {
                    "name": g.get("name"),
                    "consumers": g.get("consumers", 0),
                    "pending": g.get("pending", 0),
                    "last_delivered_id": g.get("last-delivered-id")
                }
                for g in groups
            ]
        except redis.ResponseError:
            return []
    
    def claim_stale_messages(
        self,
        worker_name: str,
        min_idle_ms: int = 60000,
        count: int = 10
    ) -> List[StreamMessage]:
        """
        Claim stale pending messages from dead workers via XAUTOCLAIM.
        
        Args:
            worker_name: Worker that will claim the messages
            min_idle_ms: Minimum idle time before claiming (default 60s)
            count: Max messages to claim
            
        Returns:
            List of claimed StreamMessage objects
        """
        try:
            result = self._redis.xautoclaim(
                STREAM_NAME,
                CONSUMER_GROUP,
                worker_name,
                min_idle_time=min_idle_ms,
                start_id="0-0",
                count=count
            )
            
            if not result or len(result) < 2:
                return []
            
            messages = []
            for msg_id, data in result[1]:
                if data is None:
                    continue
                try:
                    msg = StreamMessage(
                        msg_id=msg_id,
                        task_type=data.get("type", "batch"),
                        task_id=data.get("task_id", ""),
                        payload=json.loads(data.get("payload", "{}")),
                        timestamp=int(data.get("timestamp", 0)),
                        origin=data.get("origin", "unknown")
                    )
                    messages.append(msg)
                except (json.JSONDecodeError, ValueError):
                    pass
            
            return messages
        except redis.ResponseError:
            return []


# Global singleton instance
streams_client = StreamsClient()


# ============================================================================
# Convenience Functions (module-level API)
# ============================================================================

def publish_task(
    task_type: str,
    task_id: str,
    payload: Dict[str, Any],
    origin: str = "fastapi"
) -> str:
    """Publish a task to the Redis Stream."""
    return streams_client.publish_task(task_type, task_id, payload, origin)


def consume_tasks(
    worker_name: str,
    batch_size: int = 10,
    block_ms: int = 1000
) -> List[StreamMessage]:
    """Consume tasks from the Redis Stream."""
    return streams_client.consume_tasks(worker_name, batch_size, block_ms)


def ack_task(msg_id: str) -> int:
    """Acknowledge a task."""
    return streams_client.ack_task(msg_id)


def get_pending_count() -> int:
    """Get pending message count."""
    return streams_client.get_pending_count()


def ensure_consumer_group() -> bool:
    """Ensure consumer group exists."""
    return streams_client.ensure_consumer_group()
