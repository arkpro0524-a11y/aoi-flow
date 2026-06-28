# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_COMPILE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/huggingface \
    TRANSFORMERS_CACHE=/models/huggingface \
    CUTOUT_MODELS_DIR=/models \
    CUTOUT_ENGINE_ORDER=birefnet \
    CUTOUT_READY_ON_START=true \
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install --prefer-binary -r requirements.txt

COPY download_models.py .
RUN --mount=type=cache,target=/root/.cache/huggingface \
    python download_models.py

COPY main.py .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
