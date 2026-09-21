FROM python:3.12-slim
WORKDIR /app

# Create data directory for persistence
RUN mkdir -p /app/data && chmod 777 /app/data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

ENV UHRES_JWT_SECRET=change-me-before-any-shared-deploy
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
