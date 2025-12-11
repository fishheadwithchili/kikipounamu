import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
import os

from src.utils.file_handler import FileHandler

@pytest.fixture
def mock_redis_client():
    with patch("src.utils.file_handler.redis_client") as mock:
        yield mock

@pytest.fixture
def file_handler(tmp_path):
    return FileHandler(storage_path=str(tmp_path))

def test_generate_filename(file_handler):
    """Test filename generation"""
    name = file_handler.generate_filename("task123", "wav")
    assert "task123.wav" in name
    assert len(name.split("_")) >= 3  # date_seq_taskid

def test_save_upload(file_handler, mock_redis_client):
    """Test saving uploaded file"""
    content = b"test content"
    path, filename = file_handler.save_upload(content, "task1", "orig.wav")
    
    assert os.path.exists(path)
    with open(path, "rb") as f:
        assert f.read() == content
    
    assert filename in path
    mock_redis_client.add_audio_index.assert_called_once()

def test_cleanup_old_files(file_handler, mock_redis_client):
    """Test cleanup logic"""
    # Create some dummy files
    f1 = file_handler.storage_path / "old1.wav"
    f1.touch()
    f2 = file_handler.storage_path / "old2.wav"
    f2.touch()
    
    # Mock redis returning file to delete
    mock_redis_client.get_oldest_audios.return_value = ["old1.wav"]
    
    deleted = file_handler.cleanup_old_files(max_files=1)
    
    assert "old1.wav" in deleted
    assert not f1.exists()
    assert f2.exists()
    mock_redis_client.remove_audio_index.assert_called_with(["old1.wav"])

def test_get_file_path(file_handler):
    """Test getting file path by task id"""
    # Create file
    f = file_handler.storage_path / "2023-01-01_001_mytask.wav"
    f.touch()
    
    path = file_handler.get_file_path("mytask")
    assert path == str(f)
    
    path = file_handler.get_file_path("nonexistent")
    assert path == ""
