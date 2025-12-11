"""
Unit tests for Redis Streams helper module.

Run: pytest tests/unit/test_streams.py -v
"""
import json
import pytest
from unittest.mock import MagicMock, patch


class TestStreamMessage:
    """Test StreamMessage dataclass."""
    
    def test_stream_message_creation(self):
        """Test creating a StreamMessage."""
        from src.utils.streams import StreamMessage
        
        msg = StreamMessage(
            msg_id="1702345678000-0",
            task_type="batch",
            task_id="abc123",
            payload={"audio_path": "/path/to/file.wav"},
            timestamp=1702345678000,
            origin="fastapi"
        )
        
        assert msg.msg_id == "1702345678000-0"
        assert msg.task_type == "batch"
        assert msg.task_id == "abc123"
        assert msg.payload["audio_path"] == "/path/to/file.wav"


class TestStreamsClient:
    """Test StreamsClient methods."""
    
    @patch("src.utils.streams.redis.Redis")
    def test_publish_task(self, mock_redis_class):
        """Test publishing a task to the stream."""
        # Setup mock
        mock_redis = MagicMock()
        mock_redis.xadd.return_value = "1702345678000-0"
        mock_redis_class.return_value = mock_redis
        
        # Reset singleton for testing
        from src.utils import streams
        streams.StreamsClient._instance = None
        streams.StreamsClient._redis = None
        
        # Create client and publish
        client = streams.StreamsClient()
        msg_id = client.publish_task(
            task_type="batch",
            task_id="test-123",
            payload={"audio_path": "/test.wav"}
        )
        
        # Verify
        assert msg_id == "1702345678000-0"
        mock_redis.xadd.assert_called_once()
        
        # Check message structure
        call_args = mock_redis.xadd.call_args
        assert call_args[0][0] == "asr_tasks"  # Stream name
        message = call_args[0][1]
        assert message["type"] == "batch"
        assert message["task_id"] == "test-123"
        assert "timestamp" in message
        assert message["origin"] == "fastapi"
    
    @patch("src.utils.streams.redis.Redis")
    def test_ensure_consumer_group_new(self, mock_redis_class):
        """Test creating a new consumer group."""
        mock_redis = MagicMock()
        mock_redis.xgroup_create.return_value = True
        mock_redis_class.return_value = mock_redis
        
        from src.utils import streams
        streams.StreamsClient._instance = None
        streams.StreamsClient._redis = None
        
        client = streams.StreamsClient()
        result = client.ensure_consumer_group()
        
        assert result is True
        mock_redis.xgroup_create.assert_called_once()
    
    @patch("src.utils.streams.redis.Redis")
    def test_ensure_consumer_group_exists(self, mock_redis_class):
        """Test handling existing consumer group."""
        import redis as redis_pkg
        
        mock_redis = MagicMock()
        mock_redis.xgroup_create.side_effect = redis_pkg.ResponseError("BUSYGROUP Consumer Group name already exists")
        mock_redis_class.return_value = mock_redis
        
        from src.utils import streams
        streams.StreamsClient._instance = None
        streams.StreamsClient._redis = None
        
        client = streams.StreamsClient()
        result = client.ensure_consumer_group()
        
        assert result is True
    
    @patch("src.utils.streams.redis.Redis")
    def test_ack_task(self, mock_redis_class):
        """Test acknowledging a task."""
        mock_redis = MagicMock()
        mock_redis.xack.return_value = 1
        mock_redis_class.return_value = mock_redis
        
        from src.utils import streams
        streams.StreamsClient._instance = None
        streams.StreamsClient._redis = None
        
        client = streams.StreamsClient()
        result = client.ack_task("1702345678000-0")
        
        assert result == 1
        mock_redis.xack.assert_called_once_with("asr_tasks", "asr_workers", "1702345678000-0")


class TestConvenienceFunctions:
    """Test module-level convenience functions."""
    
    @patch("src.utils.streams.streams_client")
    def test_publish_task_function(self, mock_client):
        """Test publish_task convenience function."""
        mock_client.publish_task.return_value = "msg-id"
        
        from src.utils.streams import publish_task
        result = publish_task("stream", "sess-1", {"chunk": 0})
        
        assert result == "msg-id"
        mock_client.publish_task.assert_called_once_with("stream", "sess-1", {"chunk": 0}, "fastapi")
    
    @patch("src.utils.streams.streams_client")
    def test_ack_task_function(self, mock_client):
        """Test ack_task convenience function."""
        mock_client.ack_task.return_value = 1
        
        from src.utils.streams import ack_task
        result = ack_task("msg-123")
        
        assert result == 1
