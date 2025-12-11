import pytest
from unittest.mock import MagicMock, patch, mock_open
import sys
import os
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.asr.recognizer import SpeechRecognizer

@pytest.fixture
def mock_auto_model():
    with patch("src.asr.recognizer.AutoModel") as mock:
        yield mock

@pytest.fixture
def recognizer(mock_auto_model):
    # Reset singleton
    SpeechRecognizer._instance = None
    
    # Mock config to avoid side effects
    with patch("src.asr.recognizer.config") as mock_config:
        mock_config.model_name = "test_model"
        mock_config.vad_model = "test_vad"
        mock_config.punc_model = "test_punc"
        mock_config.use_gpu = False
        mock_config.hotwords_path = "dummy_hotwords.txt"
        mock_config.model_path = None
        
        # Mock open for hotwords
        with patch("builtins.open", mock_open(read_data="hot word")):
            with patch("os.path.exists", return_value=True):
                rec = SpeechRecognizer()
                return rec

def test_singleton(recognizer):
    """Test singleton pattern"""
    rec2 = SpeechRecognizer()
    assert recognizer is rec2

def test_load_hotwords(recognizer):
    """Test hotword loading"""
    # Should have been loaded in __init__
    assert recognizer.hotwords == "hot word"
    
    # Test file missing
    with patch("os.path.exists", return_value=False):
        hw = recognizer._load_hotwords("nonexistent")
        assert hw == ""

def test_recognize_file_not_found(recognizer):
    """Test recognize when file doesn't exist"""
    res = recognizer.recognize("nonexistent.wav")
    assert res["status"] == "failed"
    assert "不存在" in res["error"]

def test_recognize_success(recognizer, mock_auto_model):
    """Test successful recognition"""
    # Mock model generate return
    mock_instance = mock_auto_model.return_value
    mock_instance.generate.return_value = [{
        "text": "Hello World",
        "duration": 1.23
    }]
    
    with patch("os.path.exists", return_value=True):
        res = recognizer.recognize("test.wav")
        
    assert res["status"] == "success"
    assert res["text"] == "Hello World"
    assert res["duration"] == 1.23

def test_recognize_empty_result(recognizer, mock_auto_model):
    """Test recognition returning empty result"""
    mock_instance = mock_auto_model.return_value
    mock_instance.generate.return_value = []
    
    with patch("os.path.exists", return_value=True):
        res = recognizer.recognize("test.wav")
    
    assert res["status"] == "failed"
    assert "为空" in res["error"]

def test_recognize_exception(recognizer, mock_auto_model):
    """Test exception during recognition"""
    mock_instance = mock_auto_model.return_value
    mock_instance.generate.side_effect = Exception("Model Crash")
    
    with patch("os.path.exists", return_value=True):
        res = recognizer.recognize("test.wav")
        
    assert res["status"] == "failed"
    assert "Model Crash" in res["error"]
