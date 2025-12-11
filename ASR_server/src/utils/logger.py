"""Logging Configuration"""
import sys
import logging
from pathlib import Path
from loguru import logger
from pydantic_settings import BaseSettings, SettingsConfigDict


class LogConfig(BaseSettings):
    """Logging Configuration"""
    level: str = "INFO"
    rotation: str = "10 MB"
    retention: str = "30 days"
    json_format: bool = False
    
    model_config = SettingsConfigDict(env_prefix="LOG_", env_file=".env")


class InterceptHandler(logging.Handler):
    """
    Intercept standard logging messages via loguru
    """
    def emit(self, record):
        # Get corresponding Loguru level if it exists
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame, depth = logging.currentframe(), 2
        while frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging():
    """Setup application logging"""
    config = LogConfig()
    log_dir = Path("src/storage/logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Remove default handler
    logger.remove()
    
    # Common options for all file handlers
    file_opts = {
        "rotation": config.rotation,
        "retention": config.retention,
        "serialize": config.json_format,
        "enqueue": True,  # Async logging for high concurrency
        "backtrace": True,
        "diagnose": True,
    }

    # Console handler
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level> | {extra}",
        level=config.level,
        colorize=True,
        enqueue=True  # Async for console too to prevent blocking
    )
    
    # API log (INFO level)
    logger.add(
        log_dir / "asr_api.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message} | {extra}",
        level="INFO",
        filter=lambda record: "api" in record["extra"],
        **file_opts
    )
    
    # Worker log (DEBUG level)
    logger.add(
        log_dir / "asr_worker.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message} | {extra}",
        level="DEBUG",
        filter=lambda record: "worker" in record["extra"],
        **file_opts
    )
    
    # Error log (ERROR level)
    logger.add(
        log_dir / "asr_error.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message} | {extra}",
        level="ERROR",
        **file_opts
    )
    
    # Intercept everything that goes to standard logging
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    
    # Intercept Uvicorn logs explicitly
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        mod_logger = logging.getLogger(logger_name)
        mod_logger.handlers = [InterceptHandler()]
        mod_logger.propagate = False

    return logger


# Initialize logging
app_logger = setup_logging()


# Convenience functions
def log_api(message: str, level: str = "INFO"):
    """Log API message"""
    app_logger.bind(api=True).log(level, message)


def log_worker(message: str, level: str = "INFO"):
    """Log worker message"""
    app_logger.bind(worker=True).log(level, message)


def log_error(message: str, exc_info=None):
    """Log error"""
    if exc_info:
        app_logger.exception(message)
    else:
        app_logger.error(message)
