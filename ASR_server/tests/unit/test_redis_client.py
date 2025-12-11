import pytest
from unittest.mock import MagicMock, patch
import json

from src.utils.redis_client import RedisClient

@pytest.fixture
def mock_redis():
    with patch("redis.Redis") as mock:
        yield mock

@pytest.fixture
def client(mock_redis):
    # Reset singleton
    RedisClient._instance = None
    RedisClient._client = None
    return RedisClient()

def test_singleton(client):
    c2 = RedisClient()
    assert client is c2

def test_save_task_result(client, mock_redis):
    """Test saving result"""
    mock_inst = mock_redis.return_value
    client.save_task_result("t1", {"status": "ok"})
    
    mock_inst.setex.assert_called_once()
    args = mock_inst.setex.call_args[0]
    assert args[0] == "asr:task:t1"
    assert "ok" in args[2]

def test_get_task_result(client, mock_redis):
    """Test getting result"""
    mock_inst = mock_redis.return_value
    mock_inst.get.return_value = json.dumps({"status": "ok"})
    
    res = client.get_task_result("t1")
    assert res["status"] == "ok"

def test_add_to_history(client, mock_redis):
    """Test adding history"""
    mock_inst = mock_redis.return_value
    client.add_to_history({"id": 1})
    
    mock_inst.lpush.assert_called_once()
    mock_inst.ltrim.assert_called_once()
