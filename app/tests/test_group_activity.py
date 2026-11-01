import json,tempfile,unittest
from pathlib import Path
import control_settings as config

class GroupActivityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.project=Path(self.tmp.name);self.path=self.project/'data/companion/groups/registry.json';self.path.parent.mkdir(parents=True);self.key='qq-'+'a'*64
        self.row=dict(enabled=True,frequency='正常',controller='trusted-owner',allMessages=123,replyAttempts=[123456])
        self.write(self.row)
    def tearDown(self):self.tmp.cleanup()
    def write(self,row):self.path.write_text(json.dumps(dict(rooms={self.key:row})),encoding='utf-8')
    def payload(self,**extra):return dict(key=self.key,enabled=True,frequency='正常',alias='测试群',version=config.group_version(self.row),**extra)
    def test_legacy_payload_keeps_existing_custom_values(self):
        self.row['activity']=config.group_activity(dict(enabled=True,perMinute=2));self.write(self.row);config.save_group(self.project,self.payload());self.assertEqual(json.loads(self.path.read_text(encoding='utf-8'))['rooms'][self.key]['activity']['perMinute'],2)
    def test_save_custom_policy_preserves_binding_mode_and_runtime_counters(self):
        policy=config.group_activity(dict(enabled=True,perMinute=4,minIntervalSeconds=7));config.save_group(self.project,self.payload(activity=policy));saved=json.loads(self.path.read_text(encoding='utf-8'))['rooms'][self.key];self.assertEqual(saved['activity'],policy);self.assertEqual(saved['frequency'],'正常');self.assertEqual(saved['controller'],'trusted-owner');self.assertEqual(saved['allMessages'],123);self.assertEqual(saved['replyAttempts'],[123456])
    def test_limits_validate_before_any_file_write(self):
        original=self.path.read_bytes()
        for value in [dict(perMinute=0),dict(perMinute=True),dict(perMinute=2.5),dict(enabled='true'),dict(perHour=3601),dict(minIntervalSeconds=-1),dict(minMessages=31),dict(extra=1)]:
            with self.assertRaises(ValueError):config.save_group(self.project,self.payload(activity=value))
            self.assertEqual(self.path.read_bytes(),original)
    def test_stale_policy_edit_cannot_overwrite_a_new_qq_command(self):
        old=self.payload(activity=config.group_activity(dict(enabled=True)));self.row['activity']=config.group_activity(dict(perMinute=3));self.write(self.row)
        with self.assertRaises(config.ConfigConflict):config.save_group(self.project,old)
    def test_runtime_updates_do_not_make_policy_version_stale(self):
        version=config.group_version(self.row);self.row.update(lastSeenAt=10,replyAttempts=[22,33],normalTurnsRouted=55);self.assertEqual(config.group_version(self.row),version)
    def test_unbound_group_cannot_be_enabled_with_custom_settings(self):
        del self.row['controller'];self.write(self.row)
        with self.assertRaises(ValueError):config.save_group(self.project,self.payload(activity=config.group_activity(dict(enabled=True))))
    def test_disabled_custom_values_are_saved_without_switching_the_frequency(self):
        config.save_group(self.project,self.payload(activity=config.group_activity(dict(enabled=False,perMinute=9))));saved=json.loads(self.path.read_text(encoding='utf-8'))['rooms'][self.key];self.assertFalse(saved['activity']['enabled']);self.assertEqual(saved['frequency'],'正常')

if __name__=='__main__':unittest.main()
