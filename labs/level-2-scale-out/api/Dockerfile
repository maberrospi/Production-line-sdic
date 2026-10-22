FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
RUN useradd --create-home --uid 10001 appuser
USER appuser
EXPOSE 8000
# One worker per replica: in this lab we scale by adding replicas, not workers.
# On SIGTERM (docker stop) uvicorn stops accepting connections and finishes in-flight requests.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
