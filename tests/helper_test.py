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


if __name__ == '__main__':
    unittest.main()
