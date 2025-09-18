FROM python:3.11-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY controller_api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . /workspace

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "controller_api.server:app", "--host", "0.0.0.0", "--port", "5055"]
