# Base: NVIDIA CUDA Runtime (includes Drivers support)
# Mimics a user who has installed NVIDIA Drivers on Ubuntu 22.04
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install ONLY the bare minimum tools a standard Ubuntu Desktop user has.
# We intentionally DO NOT install ffmpeg, uv, or even python-is-python3 to test the script.
RUN apt-get update && apt-get install -y \
    sudo \
    python3 \
    python3-pip \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'sim_user' with sudo privileges (passwordless for automation)
# This simulates the user running the script with sudo capabilities
RUN useradd -m -s /bin/bash sim_user && \
    usermod -aG sudo sim_user && \
    echo "sim_user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER sim_user
WORKDIR /home/sim_user

# Usage: We will mount the project source code at runtime to keep this image generic.
CMD ["/bin/bash"]
