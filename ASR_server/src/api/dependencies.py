"""Dependency Injection for FastAPI"""
from typing import Generator
from redis import Redis
from ..utils.redis_client import redis_client
from ..asr.recognizer import SpeechRecognizer


def get_redis() -> Generator[Redis, None, None]:
    """Get Redis client dependency"""
    yield redis_client.client


def get_recognizer() -> SpeechRecognizer:
    """Get speech recognizer (singleton)"""
    return SpeechRecognizer()
