import pytest
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.api.main import app
from src.api.dependencies import get_redis, get_recognizer
from src.utils.file_handler import FileHandler

@pytest.fixture
def mock_redis():
    mock = MagicMock()
    mock.ping.return_value = True
    return mock

@pytest.fixture
def mock_recognizer():
    mock = MagicMock()
    mock._initialized = True
    return mock

@pytest.fixture
def mock_file_handler(tmp_path):
    mock = MagicMock(spec=FileHandler)
    # Default behavior for save_upload: return a temp path
    def side_effect_save(file, filename):
        p = tmp_path / filename
        p.touch()
        return str(p), filename
    mock.save_upload.side_effect = side_effect_save
    mock.cleanup_old_files.return_value = []
    # Default to returning None or path for get_file_path
    mock.get_file_path.return_value = None 
    return mock

@pytest.fixture
def client(mock_redis, mock_recognizer):
    """
    TestClient with dependencies overridden.
    """
    from fastapi.testclient import TestClient
    
    def override_get_redis():
        yield mock_redis

    def override_get_recognizer():
        return mock_recognizer

    app.dependency_overrides[get_redis] = override_get_redis
    app.dependency_overrides[get_recognizer] = override_get_recognizer
    
    with TestClient(app) as c:
        yield c
    
    app.dependency_overrides.clear()
