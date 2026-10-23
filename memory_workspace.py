"""Configure the QQ Agent's readable memory workspace without touching its DB."""
import argparse
import hashlib
from pathlib import Path
import yaml
from control_settings import commit,qq_config
from personality_config import PromptDumper

INSTRUCTIONS='''# 柚柚的记忆工作区

这是柚柚的角色资料与用户授权任务的工作目录。
保持当前对话里提供的人设与称呼，普通聊天直接自然回应，不主动扫描目录。
真实用户事实、偏好和群聊记忆，以当前QQ身份自动提供的Hy Memory资料为准。
只使用当前身份允许的资料；不扫描相邻数据库、其他身份记录、凭证或登录目录。
不要把私聊事实写成所有群共享的文件，也不要直接修改SQLite、向量库文件。
记忆查询、保存和删除使用现有QQ记忆接口；模型不能伪称记忆已保存。
persona.snapshot.md是创建此目录时的人设快照，当前会话/控制台人设更新优先。
用户明确要求文件或代码任务时，在授权范围内操作；不要让角色日常冒充现实经历。
'''

def configure(project,profile):
    project=Path(project).resolve();profile=Path(profile).resolve()
    path,raw,rows,bot=qq_config(profile)
    workspace=project/'data/memory-workspace'
    workspace.mkdir(parents=True,exist_ok=True)
    for name,text in [('AGENTS.md',INSTRUCTIONS),('README.md','# 记忆工作区\n\n此处放可读角色资料与授权任务文件。原有Hy Memory数据库和DSH会话保留在各自数据目录，按QQ身份自动召回。此文件夹不会把所有人的记忆合并到一起。\n')]:
        target=workspace/name
        if not target.exists():target.write_text(text,encoding='utf-8')
    snapshot=workspace/'persona.snapshot.md'
    if not snapshot.exists():snapshot.write_bytes((project/'personality.md').read_bytes())
    destination=workspace.as_posix()
    if bot.get('cwd')!=destination:
        bot['cwd']=destination
        serialized=yaml.dump(rows,Dumper=PromptDumper,sort_keys=False,allow_unicode=True,width=1000).encode()
        commit(path,serialized,hashlib.sha256(raw).hexdigest(),project/'.run/control-console/backups')
    return {'workspace':destination,'existingSessionsPreserved':True,'newSessionsUseWorkspace':True}

if __name__=='__main__':
    import json
    parser=argparse.ArgumentParser()
    parser.add_argument('--project',required=True);parser.add_argument('--profile',required=True)
    args=parser.parse_args();print(json.dumps(configure(args.project,args.profile)))
