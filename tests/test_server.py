import io
import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

TEMP = tempfile.TemporaryDirectory()
os.environ['DB_PATH'] = TEMP.name + '/plan.db'
import server


def call(path='/api/plan', data=None, method=None):
    raw = json.dumps(data).encode() if data is not None else b''
    statuses = []
    body = server.application({'PATH_INFO': path, 'REQUEST_METHOD': method or ('POST' if data is not None else 'GET'), 'CONTENT_TYPE': 'application/json', 'CONTENT_LENGTH': str(len(raw)), 'wsgi.input': io.BytesIO(raw)}, lambda status, headers: statuses.append(status))
    return int(statuses[0][:3]), json.loads(b''.join(body))


def slot(index, version=0, generation=0, code='12345678901234567890', weight='12.3'):
    return call(f'/api/slots/{index}', dict(code=code, weight=weight, version=version, generation=generation))


class StorageTests(unittest.TestCase):
    def setUp(self):
        server.DB_PATH.unlink(missing_ok=True)
        server.initialize()

    def test_parallel_distinct_slots(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(slot, range(33)))
        self.assertTrue(all(status == 200 for status, _ in results))
        plan = call()[1]
        self.assertEqual(plan['revision'], 33)
        self.assertTrue(all(s['code'] for s in plan['slots']))

    def test_same_slot_conflict(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(slot, [0, 0]))
        self.assertEqual(sorted(s for s, _ in results), [200, 409])

    def test_reset_and_old_dialog(self):
        slot(0)
        self.assertEqual(call('/api/transfer', dict(transfer='T1', reset=True, revision=0))[0], 409)
        status, plan = call('/api/transfer', dict(transfer='T1', reset=True, revision=1))
        self.assertEqual(status, 200)
        self.assertTrue(all(not s['code'] for s in plan['slots']))
        self.assertEqual(slot(1)[0], 409)
        self.assertEqual(slot(1, version=1, generation=1)[0], 200)

    def test_restart_keeps_data_and_rename_keeps_slots(self):
        slot(0)
        call('/api/transfer', dict(transfer='T1', reset=False, revision=1))
        before = call()[1]
        server.initialize()
        self.assertEqual(call()[1], before)
        self.assertEqual(before['slots'][0]['weight'], '12.3')

    def test_validation_and_delete(self):
        for code, weight in [('short', '1'), ('x'*20, '-1'), ('x'*20, 'NaN'), ('x'*20, '1.23'), ('', '2')]:
            self.assertEqual(slot(0, code=code, weight=weight)[0], 400)
        self.assertEqual(slot(33)[0], 400)
        slot(0)
        self.assertEqual(slot(0, version=1, code='', weight='')[0], 200)
        self.assertEqual(call()[1]['slots'][0]['code'], '')

    def test_private_files_not_served(self):
        for path in ['/server.py', '/ladeplan.db', '/data/ladeplan.db', '/../server.py']:
            self.assertEqual(call(path)[0], 404)


if __name__ == '__main__':
    unittest.main()
