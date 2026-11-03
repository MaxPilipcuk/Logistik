FROM python:3.13-alpine
WORKDIR /app
RUN adduser -D -u 10001 app && mkdir /data && chown app:app /data
COPY server.py index.html styles.css app.js TESA-Logo.svg ./
ENV DB_PATH=/data/ladeplan.db PYTHONUNBUFFERED=1
USER app
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1/api/health', timeout=2)" || exit 1
CMD ["python", "server.py"]
