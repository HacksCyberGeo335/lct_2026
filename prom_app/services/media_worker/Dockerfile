FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY media_worker ./media_worker
COPY tests ./tests
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "media_worker"]
