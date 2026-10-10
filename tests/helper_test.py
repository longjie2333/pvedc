import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pvedc_helper', pathlib.Path(__file__).resolve().parents[1] / 'deploy/pvedc-helper.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class GostRestartTests(unittest.TestCase):
    def test_helper_shebang_uses_unix_line_endings(self):
        source = pathlib.Path(__file__).resolve().parents[1] / 'deploy/pvedc-helper.py'
        self.assertTrue(source.read_bytes().startswith(b'#!/usr/bin/python3\n'))

    def test_only_restarts_the_fixed_platform_service(self):
        request = {'operation': 'gost-restart', 'instanceId': 'installation', 'service': 'unrelated.service', 'command': 'untrusted'}
        with patch('sys.stdin', io.StringIO(json.dumps(request))), patch.object(pathlib.Path, 'read_text', return_value='installation\n'), patch.object(helper, 'execute') as execute:
            self.assertEqual(helper.main(), {'ok': True})
            execute.assert_called_once_with(['/usr/bin/systemctl', 'restart', 'pvedc-gost.service'], timeout=20)

    def test_rejects_another_installation_before_running_commands(self):
        with patch('sys.stdin', io.StringIO(json.dumps({'operation': 'gost-restart', 'instanceId': 'other'}))), patch.object(pathlib.Path, 'read_text', return_value='installation'), patch.object(helper, 'execute') as execute:
            with self.assertRaises(ValueError):
                helper.main()
            execute.assert_not_called()

    def test_rejects_a_missing_identity(self):
        with patch('sys.stdin', io.StringIO('{"operation":"gost-restart"}')), patch.object(pathlib.Path, 'read_text', return_value='installation'), patch.object(helper, 'execute') as execute:
            with self.assertRaises(ValueError):
                helper.main()
            execute.assert_not_called()


class ListeningPortTests(unittest.TestCase):
    def test_normalizes_addresses_and_preserves_only_names_and_pids(self):
        rows = '''tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=42,fd=3),("systemd",pid=1,fd=9))
udp UNCONN 0 0 127.0.0.53%lo:53 0.0.0.0:* users:(("systemd-resolve",pid=87,fd=12))
tcp LISTEN 0 128 [::1]:631 [::]:* users:(("cupsd",pid=99,fd=7))
tcp LISTEN 0 128 [fe80::1%eth0]:8080 [::]:*
'''
        ports = helper.listening_ports(rows)
        self.assertEqual(ports[0]['processes'], [{'name': 'sshd', 'pid': 42}, {'name': 'systemd', 'pid': 1}])
        self.assertEqual({port['address'] for port in ports}, {'0.0.0.0', '127.0.0.53', '::1', 'fe80::1'})
        self.assertNotIn('fd=', json.dumps(ports))
        self.assertNotIn('users:', json.dumps(ports))

    def test_merges_duplicate_socket_rows_and_ignores_malformed_ports(self):
        rows = '''tcp LISTEN 0 128 *:80 *:* users:(("nginx",pid=1,fd=3))
tcp LISTEN 0 128 *:80 *:* users:(("nginx",pid=2,fd=3),("nginx",pid=1,fd=4))
tcp LISTEN 0 128 0.0.0.0:99999 *:*
invalid
'''
        ports = helper.listening_ports(rows)
        self.assertEqual(len(ports), 1)
        self.assertEqual(ports[0]['processes'], [{'name': 'nginx', 'pid': 1}, {'name': 'nginx', 'pid': 2}])


if __name__ == '__main__':
    unittest.main()
