"""Apply the editable QQ personality to the dedicated profile."""
import argparse
from datetime import datetime
from pathlib import Path
import os
import re
import shutil
import yaml

GROUP_STYLE = '\n\n## 群聊方式\n保持同样的人格，照顾群内所有成员，以群内当前话题为准，回复简洁得体。只使用该群自己的记忆；私人称呼和私聊信息留在各自的私聊中。\n'


class PromptDumper(yaml.SafeDumper):
    pass


class PromptLoader(yaml.SafeLoader):
    pass


# DSH uses YAML 1.2: off/on are strings, not YAML 1.1 booleans.
PromptLoader.yaml_implicit_resolvers = {
    key: [(tag, regex) for tag, regex in values if tag != 'tag:yaml.org,2002:bool']
    for key, values in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
PromptLoader.add_implicit_resolver(
    'tag:yaml.org,2002:bool', re.compile(r'^(?:true|True|TRUE|false|False|FALSE)$'), list('tTfF'))


def represent_text(dumper, value):
    return dumper.represent_scalar('tag:yaml.org,2002:str', value, style='|' if '\n' in value else None)


PromptDumper.add_representer(str, represent_text)


def apply_personality(project, profile, backup=True):
    project, profile = Path(project).resolve(), Path(profile).resolve()
    if profile.name != 'qqbot':
        raise ValueError('Only the dedicated qqbot profile can be configured')
    prompt = (project / 'personality.md').read_text(encoding='utf-8-sig').strip() + '\n'
    if len(prompt.strip()) < 10:
        raise ValueError('Personality prompt is empty or too short')
    target = profile / 'cordis.patch.yml'
    rows = yaml.load(target.read_text(encoding='utf-8-sig'), Loader=PromptLoader)
    matches = [row for row in rows if row.get('id') == 'im-qqbot']
    if len(matches) != 1:
        raise ValueError('Expected exactly one im-qqbot configuration entry')
    config = matches[0].setdefault('config', {})
    config['directPrompt'] = prompt
    config['groupPrompt'] = prompt + GROUP_STYLE
    text = yaml.dump(rows, Dumper=PromptDumper, sort_keys=False, allow_unicode=True, width=1000)
    if backup:
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        shutil.copy2(target, profile / ('cordis.patch.before-personality-' + stamp + '.yml.bak'))
    target.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default=str(Path(__file__).resolve().parent))
    parser.add_argument('--profile', default=str(Path(os.environ.get('DSH_HOME', 'D:/DeepSeekHarnessData/home')) / 'profiles/qqbot'))
    args = parser.parse_args()
    apply_personality(args.project, args.profile)
    print('QQ personality applied to private and group prompts; previous configuration backed up.')
