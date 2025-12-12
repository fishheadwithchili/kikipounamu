"""Redis Client for Task Queue and Caching"""
import redis
from typing import Optional, List, Dict, Any
import json
from pydantic_settings import BaseSettings, SettingsConfigDict


class RedisConfig(BaseSettings):
    """Redis Configuration"""
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    
    model_config = SettingsConfigDict(env_prefix="REDIS_", env_file=".env", extra="ignore")


class RedisClient:
    """Redis client with namespace management"""
    
    _instance: Optional['RedisClient'] = None
    _client: Optional[redis.Redis] = None
    
    def __new__(cls):
        """Singleton pattern"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize Redis connection"""
        if self._client is not None:
            return
            
        config = RedisConfig()
        self._client = redis.Redis(
            host=config.host,
            port=config.port,
            db=config.db,
            decode_responses=True
        )
    
    @property
    def client(self) -> redis.Redis:
        """Get Redis client (decoded)"""
        return self._client
        
    @property
    def raw_client(self) -> redis.Redis:
        """Get raw Redis client (bytes)"""
        config = RedisConfig()
        return redis.Redis(
            host=config.host,
            port=config.port,
            db=config.db,
            decode_responses=False
        )
    
    def ping(self) -> bool:
        """Check Redis connection"""
        try:
            return self._client.ping()
        except:
            return False
    
    # Task-related operations
    def save_task_result(self, task_id: str, result: Dict[str, Any], ttl: int = 3600):
        """Save task result with TTL"""
        key = f"asr:task:{task_id}"
        self._client.setex(key, ttl, json.dumps(result))
    
    def get_task_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task result"""
        key = f"asr:task:{task_id}"
        data = self._client.get(key)
        return json.loads(data) if data else None
    
    def delete_task(self, task_id: str):
        """Delete task result"""
        self._client.delete(f"asr:task:{task_id}")
    
    def cache_stream_result(self, session_id: str, result: Dict[str, Any], ttl: int = 60):
        """
        Cache stream result in a Redis List for reliability.
        Used to recover results if client disconnects.
        """
        key = f"asr:results:{session_id}"
        # RPUSH to append to list
        self._client.rpush(key, json.dumps(result))
        # Set TTL to expire the whole list after inactivity
        self._client.expire(key, ttl)
    
    # History operations
    def add_to_history(self, record: Dict[str, Any], max_records: int = 10):
        """Add record to history (keep latest N)"""
        key = "asr:history:latest"
        self._client.lpush(key, json.dumps(record))
        self._client.ltrim(key, 0, max_records - 1)
    
    def get_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get history records"""
        key = "asr:history:latest"
        records = self._client.lrange(key, 0, limit - 1)
        return [json.loads(r) for r in records]
    
    # Audio file index operations
    def add_audio_index(self, filename: str, timestamp: float):
        """Add audio file to index (sorted by timestamp)"""
        key = "asr:audio:index"
        self._client.zadd(key, {filename: timestamp})
    
    def get_oldest_audios(self, keep_count: int = 10) -> List[str]:
        """Get oldest audio files to delete"""
        key = "asr:audio:index"
        total = self._client.zcard(key)
        if total <= keep_count:
            return []
        
        # Get files to delete (oldest ones)
        to_delete = self._client.zrange(key, 0, total - keep_count - 1)
        return to_delete
    
    def remove_audio_index(self, filenames: List[str]):
        """Remove audio files from index"""
        if not filenames:
            return
        key = "asr:audio:index"
        self._client.zrem(key, *filenames)


# Global Redis client instance
redis_client = RedisClient()
