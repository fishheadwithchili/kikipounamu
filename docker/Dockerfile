# Base image with CUDA support (matching your system driver potential)
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# 1. Install System Dependencies
# - python3.10 & venv: Core language
# - ffmpeg: Audio processing
# - git: For version control
# - curl/wget: For downloading tools
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3.10-venv \
    python3.10-dev \
    ffmpeg \
    git \
    curl \
    wget \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Go (1.24.5 match)
RUN wget https://go.dev/dl/go1.24.5.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.24.5.linux-amd64.tar.gz && \
    rm go1.24.5.linux-amd64.tar.gz

# Add Go to PATH
ENV PATH=$PATH:/usr/local/go/bin

# 3. Install uv (Fast Python Package Installer)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# 4. Set Workspace
WORKDIR /app

# 5. Pre-copy dependency files to leverage Docker caching
WORKDIR /app
COPY ASR_server/pyproject.toml ASR_server/
# Copy lock file if it exists
# COPY ASR_server/uv.lock ASR_server/

# 6. Create Virtual Environment & Install Dependencies
# We use a single venv for simplicity in the container
ENV VIRTUAL_ENV=/app/.venv
WORKDIR /app/ASR_server
RUN uv venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install dependencies into the venv
RUN uv sync || true

# Restore workspace
WORKDIR /app


# 7. Copy Project Code
COPY . .

# 8. Default Command (can be overridden by docker-compose)
CMD ["/bin/bash"]
