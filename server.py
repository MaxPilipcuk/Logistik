"""Shared loading plan. SQLite is included in Python; The Python standard library serves WSGI."""
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

DB_PATH = Path(os.environ.get('DB_PATH', '/data/ladeplan.db'))
ROOT = Path(__file__).resolve().parent
STATIC = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
          '/app.js': ('app.js', 'text/javascript'), '/styles.css': ('styles.css', 'text/css'),
          '/TESA-Logo.svg': ('TESA-Logo.svg', 'image/svg+xml')}


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS plan (id INTEGER PRIMARY KEY CHECK(id=1), transfer TEXT NOT NULL, revision INTEGER NOT NULL, generation INTEGER NOT NULL, updated TEXT NOT NULL)')
        db.execute("INSERT OR IGNORE INTO plan VALUES (1, '', 0, 0, '')")
        db.execute('CREATE TABLE IF NOT EXISTS slots (id INTEGER PRIMARY KEY, code TEXT NOT NULL, weight TEXT NOT NULL, version INTEGER NOT NULL)')
        db.executemany("INSERT OR IGNORE INTO slots VALUES (?, '', '', 0)", [(i,) for i in range(33)])


def snapshot(db):
    plan = dict(db.execute('SELECT transfer, revision, generation, updated FROM plan').fetchone())
    plan['slots'] = [dict(row) for row in db.execute('SELECT code, weight, version FROM slots ORDER BY id')]
    return plan


def validate_slot(data):
    code, weight = data.get('code'), data.get('weight')
    if not isinstance(code, str) or (code and len(code.strip()) != 20):
        raise ValueError('Die Sendungsnummer muss genau 20 Zeichen enthalten.')
    if not isinstance(weight, str):
        raise ValueError('Ungültiges Gewicht.')
    code = code.strip()
    if weight:
        try:
            number = Decimal(weight.replace(',', '.'))
            if not number.is_finite() or not 0 <= number <= 1000000 or number != number.quantize(Decimal('0.1')):
                raise ValueError('Gewicht: 0 bis 1.000.000 kg mit höchstens einer Nachkommastelle.')
            weight = format(number, '.1f')
        except InvalidOperation:
            raise ValueError('Ungültiges Gewicht.')
    if not code and weight:
        raise ValueError('Gewicht benötigt eine Sendungsnummer.')
    return code, weight


def application(environ, start_response):
    def respond(status, data, mime='application/json'):
        payload = json.dumps(data, ensure_ascii=False).encode() if mime == 'application/json' else data
        start_response(status, [('Content-Type', mime + '; charset=utf-8'), ('Content-Length', str(len(payload))), ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff')])
        return [payload]

    path, method = environ.get('PATH_INFO', '/'), environ['REQUEST_METHOD']
    try:
        if method == 'GET' and path in STATIC:
            name, mime = STATIC[path]
            return respond('200 OK', (ROOT / name).read_bytes(), mime)
        if method == 'GET' and path in ('/api/plan', '/api/health'):
            with closing(connect()) as db, db:
                db.execute('BEGIN')
                result = snapshot(db)
            return respond('200 OK', result if path == '/api/plan' else {'ok': True})
        slot_match = re.fullmatch(r'/api/slots/(\d+)', path)
        if method != 'POST' or not (slot_match or path == '/api/transfer'):
            return respond('404 Not Found', {'error': 'Nicht gefunden.'})
        if environ.get('CONTENT_TYPE', '').split(';')[0] != 'application/json':
            return respond('415 Unsupported Media Type', {'error': 'JSON erforderlich.'})
        size = int(environ.get('CONTENT_LENGTH') or 0)
        if not 0 < size <= 4096:
            raise ValueError('Ungültige Anfragegröße.')
        data = json.loads(environ['wsgi.input'].read(size))
        if not isinstance(data, dict):
            raise ValueError('Ungültige Anfrage.')
        with closing(connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            current = snapshot(db)
            if slot_match:
                index = int(slot_match[1])
                if not 0 <= index < 33:
                    raise ValueError('Ungültiger Ladeplatz.')
                code, weight = validate_slot(data)
                if data.get('generation') != current['generation'] or data.get('version') != current['slots'][index]['version']:
                    return respond('409 Conflict', {'error': 'Der Platz oder der Ladeplan wurde inzwischen geändert. Bitte Dialog schließen, aktuellen Stand prüfen und erneut öffnen.', 'plan': current})
                db.execute('UPDATE slots SET code=?, weight=?, version=version+1 WHERE id=?', (code, weight, index))
            else:
                transfer = data.get('transfer')
                if not isinstance(transfer, str) or not 1 <= len(transfer.strip()) <= 100 or type(data.get('reset')) is not bool:
                    raise ValueError('Transfernummer erforderlich (maximal 100 Zeichen).')
                if data.get('revision') != current['revision']:
                    return respond('409 Conflict', {'error': 'Der Ladeplan wurde inzwischen geändert. Bitte Dialog schließen, aktuellen Stand prüfen und erneut öffnen.', 'plan': current})
                db.execute('UPDATE plan SET transfer=?, generation=generation+1 WHERE id=1', (transfer.strip(),))
                if data['reset']:
                    db.execute("UPDATE slots SET code='', weight='', version=version+1")
            db.execute('UPDATE plan SET revision=revision+1, updated=? WHERE id=1', (datetime.now(timezone.utc).isoformat(),))
            result = snapshot(db)
        return respond('200 OK', result)
    except (ValueError, TypeError, UnicodeError) as error:
        return respond('400 Bad Request', {'error': str(error)})
    except sqlite3.Error:
        return respond('503 Service Unavailable', {'error': 'Speichern derzeit nicht möglich. Bitte erneut versuchen.'})


initialize()


if __name__ == '__main__':
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIServer, make_server

    class ThreadedServer(ThreadingMixIn, WSGIServer):
        daemon_threads = True
        request_queue_size = 32

        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(15)
            return connection, address

    port = int(os.environ.get('PORT', '80'))
    with make_server('0.0.0.0', port, application, server_class=ThreadedServer) as httpd:
        print(f'LKW Beladung listening on port {port}', flush=True)
        httpd.serve_forever()
