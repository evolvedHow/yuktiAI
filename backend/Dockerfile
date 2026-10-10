FROM python:3.12-slim

# git is required to install the pinned worker-env dependency from GitHub.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Dependencies are managed with uv (see AGENTS.md); no requirements.txt.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# `-r pyproject.toml` installs the project's dependencies without building it.
COPY pyproject.toml .
RUN uv pip install --system -r pyproject.toml

COPY main.py .

EXPOSE 8080

# Bind 0.0.0.0 inside the container so the compose port mapping can reach it;
# the host-side publish is pinned to loopback in docker-compose.yml.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
