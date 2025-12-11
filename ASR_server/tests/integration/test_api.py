"""
Unit tests for ASR Service APIs

Run all tests: pytest tests/integration/test_api.py -v
"""
import pytest
from unittest.mock import MagicMock, patch

# Note: Client fixture is provided by conftest.py

# ============================================================================
# Test Root and Health Endpoints
# ============================================================================

def test_root(client):
    """Test root endpoint returns service info"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "version" in data

@patch("src.api.routes.redis_client")
@patch("rq.Worker") 
def test_health_check(mock_worker, mock_redis_client, client):
    """Test health check endpoint"""
    mock_redis_client.ping.return_value = True
    
    # Mock Worker.all
    mock_worker_instance = MagicMock()
    mock_worker.all.return_value = [mock_worker_instance]
    
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["model_loaded"] is True
    assert data["redis_connected"] is True
    assert data["workers_active"] == 1

# ============================================================================
# Test ASR Submit Endpoint
# ============================================================================

def test_submit_no_file(client):
    """Test submit without file returns 422"""
    response = client.post("/api/v1/asr/submit")
    assert response.status_code == 422

def test_submit_invalid_format(client):
    """Test submit with invalid file format"""
    files = {"audio": ("test.txt", b"dummy content", "text/plain")}
    response = client.post("/api/v1/asr/submit", files=files)
    assert response.status_code == 400
    assert "Invalid file format" in response.json()["detail"]

@patch("src.api.routes.file_handler")
@patch("src.api.routes.Queue")
@patch("src.api.routes.redis_client")
def test_submit_valid_file(mock_redis_client, mock_queue, mock_file_handler, client):
    """Test submit with valid audio file"""
    # Mock file handler
    mock_file_handler.save_upload.return_value = ("/tmp/test.wav", "test.wav")
    mock_file_handler.cleanup_old_files.return_value = []
    
    # Mock Queue
    mock_queue_instance = MagicMock()
    mock_queue.return_value = mock_queue_instance
    mock_queue_instance.enqueue.return_value = MagicMock() # job
    mock_queue_instance.__len__.return_value = 0
    
    # Mock WAV content
    wav_header = b'RIFF' + b'\x00' * 4 + b'WAVE' + b'fmt ' + b'\x10\x00\x00\x00' + b'\x00' * 16 + b'data' + b'\x00' * 4
    files = {"audio": ("test.wav", wav_header, "audio/wav")}
    
    response = client.post("/api/v1/asr/submit", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert "task_id" in data
    assert data["status"] == "queued"
    
    # Verify processing
    mock_file_handler.save_upload.assert_called_once()
    mock_redis_client.save_task_result.assert_called_once()
    mock_queue_instance.enqueue.assert_called_once()

# ============================================================================
# Test Result Endpoint
# ============================================================================

@patch("src.api.routes.redis_client")
def test_get_result_not_found(mock_redis_client, client):
    """Test getting result for non-existent task"""
    mock_redis_client.get_task_result.return_value = None
    response = client.get("/api/v1/asr/result/nonexistent")
    assert response.status_code == 404

@patch("src.api.routes.redis_client")
def test_get_result_done(mock_redis_client, client):
    """Test getting completed result"""
    mock_redis_client.get_task_result.return_value = {
        "task_id": "test_id",
        "status": "done",
        "text": "Hello World",
        "duration": 1.5
    }
    response = client.get("/api/v1/asr/result/test_id")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "done"
    assert data["text"] == "Hello World"
    assert "audio_url" in data

# ============================================================================
# Test History Endpoint
# ============================================================================

@patch("src.api.routes.redis_client")
def test_get_history(mock_redis_client, client):
    """Test getting history"""
    mock_redis_client.get_history.return_value = [
        {
            "task_id": "1",
            "filename": "test.wav",
            "text": "text",
            "created_at": "now",
            "duration": 1.0,
            "status": "done"
        }
    ]
    response = client.get("/api/v1/asr/history")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["records"]) == 1

def test_get_history_limit_too_large(client):
    """Test history with limit exceeding maximum"""
    response = client.get("/api/v1/asr/history?limit=200")
    assert response.status_code == 422

# ============================================================================
# Test Queue Status Endpoint
# ============================================================================

@patch("src.api.routes.redis_client")
def test_queue_status(mock_redis_client, client):
    """Test queue status endpoint"""
    # We need to mock sys.modules for rq classes used inside the function
    with patch("rq.Queue") as MockQueue, \
         patch("rq.registry.StartedJobRegistry") as MockStarted, \
         patch("rq.registry.FailedJobRegistry") as MockFailed, \
         patch("rq.Worker") as MockWorker:
        
        # Setup mocks
        MockQueue.return_value.__len__.return_value = 2
        MockStarted.return_value.__len__.return_value = 1
        MockFailed.return_value.__len__.return_value = 0
        MockWorker.all.return_value = [MagicMock(), MagicMock()] # 2 workers
        
        response = client.get("/api/v1/asr/queue/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data["queued"] == 2
        assert data["processing"] == 1
        assert data["workers"] == 2

# ============================================================================
# Test Audio Download Endpoint
# ============================================================================

@patch("src.api.routes.file_handler")
def test_download_audio_not_found(mock_file_handler, client):
    """Test downloading non-existent audio"""
    mock_file_handler.get_file_path.return_value = None
    response = client.get("/api/v1/asr/audio/nonexistent")
    assert response.status_code == 404

