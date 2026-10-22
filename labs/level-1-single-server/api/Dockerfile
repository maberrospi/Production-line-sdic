# Production image for the API.
# Build:  docker build -t app-api:<git-sha> api/
# Broken build for the rollback exercise:  docker build --build-arg BREAK=1 -t app-api:v3 api/
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py migrate.py ./
COPY migrations ./migrations

ARG BREAK=0
ARG APP_VERSION=dev
ENV CRASH_ON_START=${BREAK} APP_VERSION=${APP_VERSION}

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"

# --proxy-headers: trust X-Forwarded-For / -Proto from nginx so request.client is the real user
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
