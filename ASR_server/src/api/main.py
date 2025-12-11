"""FastAPI Application Entry Point"""
import uuid
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .routes import router
from ..utils.logger import log_api, app_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    log_api("🚀 Starting ASR Service API (lightweight)...")
    log_api("✅ API Service ready to accept requests")
    
    yield
    
    # Shutdown
    log_api("🛑 Shutting down ASR Service")


# Create FastAPI app
app = FastAPI(
    title="ASR Transcription Service",
    description="Speech recognition microservice powered by FunASR",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

# Mount static files
app.mount("/static", StaticFiles(directory="src/static", html=True), name="static")

@app.get("/dashboard")
async def dashboard():
    """Redirect to dashboard"""
    return RedirectResponse(url="/static/index.html")


@app.middleware("http")
async def system_logging_middleware(request: Request, call_next):
    """
    Middleware for centralized logging and request tracing.
    
    CRITICAL: Strict bypass for Health Check paths to ensure zero overhead.
    """
    path = request.url.path
    # 1. Strict Health Check Bypass
    if path in ("/api/v1/health", "/health", "/"):
        # Directly yield control, NO logging, NO context binding
        return await call_next(request)
    
    # 2. Request Tracing & Logging for Business Logic
    request_id = str(uuid.uuid4())
    start_time = time.perf_counter()
    
    # Bind request_id to context
    with app_logger.contextualize(request_id=request_id):
        log_api(f"Incoming request: {request.method} {path}")
        
        try:
            response = await call_next(request)
            
            process_time = (time.perf_counter() - start_time) * 1000
            log_api(f"Request completed: {response.status_code} | Duration: {process_time:.2f}ms")
            
            # Inject Request-ID header for client tracking
            response.headers["X-Request-ID"] = request_id
            return response
            
        except Exception as e:
            process_time = (time.perf_counter() - start_time) * 1000
            app_logger.exception(f"Request failed: {str(e)} | Duration: {process_time:.2f}ms")
            raise


# Register routes
app.include_router(router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "ASR Transcription Service",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health"
    }
