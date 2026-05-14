下面给你一版我建议采用的 **AgentTx v2 新架构设计**。这版不是简单扩写你原来的六层，而是把它重构成一个更适合冲论文的系统设计：**核心问题更尖锐，模块边界更清楚，实验和实现也更容易落地。**

---

# AgentTx v2: Transactional Execution and Belief-Consistent Recovery for Shell-Based LLM Agents

## 0. 总体定位

AgentTx v2 的核心定位是：

> **为具有 Shell 操作能力的 LLM Agent 提供事务化执行、语义副作用恢复，以及 Agent 外化认知状态修复，从而保证 Agent 在出错、中断或被诱导执行危险操作后，操作系统状态和 Agent runtime belief state 能够重新一致。**

你原始设计里已经有一个很强的基础：AgentTx 不只是拦截 Shell 命令，而是把一次 Agent 操作定义成包含 `Intent, Preconditions, Actions, Effects, Contract, Invariants, BeliefState, CommitPolicy` 的事务，并且要求危险操作先进入事务执行区，经过验证后才允许 commit。这个方向应该保留，但要进一步强化为“Agent-OS 双层一致性恢复问题”。fileciteturn6file0

---

# 一、核心想法

## 1.1 传统沙盒解决的是“污染隔离”，不是“事务一致性”

现有方法大致有三类：

第一类是 **Docker / VM / seccomp / namespace**。  
它们可以隔离 Agent 的操作，但问题是：如果 Agent 的任务确实需要修改文件、配置服务、安装依赖，那么隔离之后如何安全地把正确修改合并回真实系统？普通沙盒本身不回答这个问题。

第二类是 **文件系统快照 / OverlayFS rollback**。  
它们可以回滚文件修改，但 Shell Agent 的副作用不只是文件，还有进程、端口、服务状态、包管理器、环境变量、网络 IO、credential 等。

第三类是 **让 Agent 自己反思和修复**。  
这对 LLM Agent 很危险，因为造成错误的 Agent 不一定有能力正确识别自己的错误，更不应该让它自由生成回滚命令。

所以 AgentTx v2 的基本判断是：

> Shell-based LLM Agent 的错误不是单纯的文件系统错误，而是 **Agent 意图、系统副作用、恢复契约、外化认知状态之间的不一致问题**。

---

## 1.2 Agent 错误具有“双层污染”

Agent 出错后会污染两层状态。

### 第一层：操作系统状态污染

包括：

```text id="egyyix"
filesystem state
process state
network state
service state
package state
environment state
credential state
external side effects
```

例如：

```text id="fuvgvt"
Agent 修改 nginx.conf
Agent 重启 nginx
nginx reload 失败
端口 8080 没有启动
Agent 又修改 firewall
Agent 又执行 docker pull
```

这不是单个命令错误，而是一个副作用链。

---

### 第二层：Agent 外化认知状态污染

包括：

```text id="y27jrv"
tool history
tool observation
planner state
scratchpad
memory writes
task summary
compressed context
agent internal task graph
```

例如：

```text id="6togk3"
真实系统：nginx 仍然监听 80，8080 没有启动
Agent 记忆：我已经成功把 nginx 切换到 8080
Agent 下一步：继续开放 firewall 8080，并告诉用户迁移成功
```

这就是你论文最应该强调的新问题：

> **即使系统物理状态回滚成功，如果 Agent 的外化认知状态没有修复，它仍然可能基于错误记忆继续破坏系统。**

---

## 1.3 AgentTx v2 的核心命题

AgentTx v2 的核心命题可以写成：

> A shell-based LLM agent transaction is correct only if both the operating system state and the agent’s externalized belief state are consistent with the declared intent and verified postconditions.

中文就是：

> 一次 Shell Agent 事务不能只看系统有没有恢复，还要看 Agent 是否还相信错误的状态。

因此 AgentTx v2 不追求全系统 bit-level 一致，而追求：

```text id="sxeqrp"
Scoped semantic consistency
+
No residual side effects
+
Belief-state alignment
```

---

# 二、核心抽象

## 2.1 事务定义

AgentTx v2 中，一次 Agent 操作被定义为事务：

\[
T = \langle G, A, D, E, C, I, B, P, R \rangle
\]

其中：

| 符号 | 名称 | 含义 |
|---|---|---|
| \(G\) | Goal | 用户任务目标或 Agent 当前子目标 |
| \(A\) | Assumptions | Agent 执行前声明的假设 |
| \(D\) | Declared Scope | Agent 声明可能影响的资源范围 |
| \(E\) | Effects | 实际捕获到的系统副作用 |
| \(C\) | Contracts | 针对副作用生成的恢复契约 |
| \(I\) | Invariants | 恢复或提交后必须满足的语义不变量 |
| \(B\) | Belief State | Agent runtime 中的外化认知状态 |
| \(P\) | Commit Policy | 是否允许提交到真实系统的策略 |
| \(R\) | Recoverability Class | 该事务的可恢复等级 |

原始设计中已经有相似事务抽象，v2 的改变是：  
**把 Effects 从列表升级为 effect graph，把 Contract 从 LLM 生成升级为 verified template，把 BeliefState 从附属字段升级为核心验证对象。**

---

## 2.2 系统状态与认知状态

定义真实系统状态：

\[
S = \langle S_{fs}, S_{proc}, S_{net}, S_{svc}, S_{pkg}, S_{env}, S_{cred}, S_{ext} \rangle
\]

其中：

| 状态 | 含义 |
|---|---|
| \(S_{fs}\) | 文件系统状态 |
| \(S_{proc}\) | 进程状态 |
| \(S_{net}\) | 网络连接、监听端口、外部请求 |
| \(S_{svc}\) | systemd / nginx / sshd 等服务状态 |
| \(S_{pkg}\) | apt / pip / npm 等依赖状态 |
| \(S_{env}\) | PATH、alias、shell rc、环境变量 |
| \(S_{cred}\) | SSH key、token、git credential |
| \(S_{ext}\) | 外部不可逆副作用，如 webhook、邮件、链上交易 |

定义 Agent 外化认知状态：

\[
B = \langle H, O, M, P_l, Ctx, Sum \rangle
\]

其中：

| 状态 | 含义 |
|---|---|
| \(H\) | tool call history |
| \(O\) | tool observations |
| \(M\) | memory writes |
| \(P_l\) | planner state |
| \(Ctx\) | scratchpad / context window |
| \(Sum\) | task summary / compressed memory |

恢复成功不再只是：

```text id="st7ay2"
系统文件恢复
```

而是：

\[
Recovered(S_0, S_r, B_r, I, E) =
SemanticRestored(S_0, S_r, I)
\land NoResidualEffect(E)
\land BeliefAligned(B_r, S_r)
\]

也就是：

1. 作用域内语义不变量恢复；
2. 没有残留副作用；
3. Agent 的外化认知状态与恢复后的系统状态一致。

你原来的 Recovery Verifier 里已经有类似思想，包括文件 Merkle Hash、残留子进程、异常监听端口、包管理器状态、环境变量以及 belief 是否还基于错误状态继续规划。v2 要把它放到论文核心，而不是作为最后一层补充。fileciteturn6file0

---

# 三、总体架构

AgentTx v2 可以设计成 **三大核心模块 + 一条事务流水线**。

## 3.1 总体架构图

```text id="rmy82g"
                ┌──────────────────────────────┐
                │        User / LLM Agent       │
                └──────────────┬───────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────┐
│  Module A: Transaction Frontend                         │
│  - Intent Declaration                                   │
│  - Scope Declaration                                    │
│  - Precondition / Expected Effects                      │
│  - Belief Snapshot                                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Module B: Verified Execution Runtime                   │
│  - Risk Classifier                                      │
│  - Policy Verifier                                      │
│  - Sandbox / Shadow Executor                            │
│  - Typed Effect Capture                                 │
│  - Effect Graph Builder                                 │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Module C: Recovery and Belief Consistency Engine        │
│  - Verified Recovery Contract Templates                 │
│  - Semantic Compensation                                │
│  - Selective Commit                                     │
│  - Belief-State Repair                                  │
│  - Recovery Verifier                                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │ Commit / Recover / Abort    │
          └─────────────────────────────┘
```

---

## 3.2 端到端事务流程

完整流程是：

```text id="f401q9"
1. Agent submits structured transaction request
2. AgentTx snapshots system state and belief state
3. Static analyzer parses command and declared scope
4. Risk classifier assigns recoverability class
5. Policy verifier decides sandbox / shadow / block
6. Command runs inside transactional execution environment
7. Runtime captures typed side effects
8. Effect graph is constructed
9. Pre-commit verifier checks expected effects and invariants
10. If safe: selective commit
11. If failed/interrupted: recovery contract execution
12. Belief-state repair
13. Recovery verifier checks system and belief consistency
14. Agent continues from clean state
```

---

# 四、模块 A：Transaction Frontend

这个模块负责把 Agent 的自然语言意图和 Shell 动作转成结构化、可审计、可验证的事务请求。

---

## 4.1 Transaction Gateway

Agent 不能直接执行裸 Shell 命令，而必须调用 AgentTx 提供的工具接口。

例如：

```json id="b4h4qw"
{
  "tx_type": "shell_command",
  "task_goal": "Change nginx listening port from 80 to 8080",
  "assumptions": [
    "nginx is installed",
    "nginx configuration contains a listen directive for port 80"
  ],
  "commands": [
    "sed -i 's/listen 80/listen 8080/' /etc/nginx/sites-enabled/default",
    "systemctl reload nginx"
  ],
  "declared_scope": {
    "files": [
      "/etc/nginx/sites-enabled/default"
    ],
    "services": [
      "nginx"
    ],
    "ports": [
      80,
      8080
    ],
    "packages": [],
    "external_network": "deny"
  },
  "expected_effects": [
    {
      "type": "filesystem.modify",
      "path": "/etc/nginx/sites-enabled/default"
    },
    {
      "type": "service.reload",
      "service": "nginx"
    },
    {
      "type": "network.listen",
      "port": 8080
    }
  ],
  "success_invariants": [
    "nginx_config_test_passes",
    "nginx_service_active",
    "port_8080_listening",
    "port_80_not_required"
  ],
  "failure_invariants": [
    "original_nginx_config_restored",
    "nginx_service_state_restored",
    "no_unexpected_listening_ports",
    "agent_belief_does_not_claim_success"
  ],
  "commit_policy": {
    "mode": "manual_or_verified",
    "allow_selective_commit": true,
    "require_human_for": [
      "credential",
      "ssh",
      "sudoers",
      "external_io"
    ]
  }
}
```

这个 payload 的作用不是相信 Agent，而是给 AgentTx 一个可检查目标。

---

## 4.2 Belief Snapshot

在执行事务之前，AgentTx 需要对 Agent runtime 做快照。

例如：

```json id="2gqe8u"
{
  "tx_id": "tx_2026_001",
  "belief_snapshot": {
    "tool_history_range": ["h_120", "h_145"],
    "planner_node": "plan_step_4",
    "scratchpad_hash": "sha256:...",
    "memory_write_set": [],
    "task_summary": "Need to update nginx port from 80 to 8080"
  }
}
```

这里的关键是：

> 所有之后的 tool observation、memory write、planner update 都必须带上 tx_id。

也就是 AgentTx 要让 Agent runtime 变成 transaction-aware。

---

## 4.3 Transaction Tags

每一条 Agent runtime 记录都加事务标签：

```json id="e7l92m"
{
  "record_id": "obs_901",
  "tx_id": "tx_2026_001",
  "record_type": "tool_observation",
  "content": "nginx reload failed: invalid directive",
  "depends_on": ["cmd_002"],
  "taint_status": "clean | tainted | invalidated | repaired"
}
```

这样恢复时才知道哪些记忆要删除、标记、重写或保留。

---

# 五、模块 B：Verified Execution Runtime

这个模块是 AgentTx 的执行核心。它不相信 Agent，也不相信 LLM 生成的回滚命令。它只相信：

```text id="ypayud"
受限 schema
静态分析
运行时捕获
模板化恢复契约
策略验证器
```

---

## 5.1 Static Command Analyzer

在命令执行前，AgentTx 对 Shell 命令做静态分析。

### 分析内容

| 分析项 | 例子 |
|---|---|
| 命令类型 | `sed`, `rm`, `pip`, `systemctl`, `docker`, `curl` |
| 文件路径 | `/etc/nginx/sites-enabled/default` |
| 重定向 | `>`, `>>`, `2>`, heredoc |
| 管道 | `curl ... | bash` |
| 通配符 | `rm -rf *` |
| sudo / su | 是否提权 |
| 网络操作 | `curl`, `wget`, `git clone`, `docker pull` |
| 包管理器 | `apt`, `pip`, `npm`, `conda` |
| 服务操作 | `systemctl restart`, `service nginx reload` |
| credential 操作 | `.ssh`, `.git-credentials`, token 文件 |

### 输出示例

```json id="g5gkba"
{
  "commands": [
    {
      "cmd_id": "cmd_001",
      "binary": "sed",
      "operation": "file_modify",
      "paths": ["/etc/nginx/sites-enabled/default"],
      "requires_root": true,
      "external_io": false
    },
    {
      "cmd_id": "cmd_002",
      "binary": "systemctl",
      "operation": "service_reload",
      "service": "nginx",
      "requires_root": true,
      "external_io": false
    }
  ],
  "static_risks": [
    "system_service_mutation",
    "privileged_file_write"
  ],
  "scope_mismatch": false
}
```

如果 Agent 声明只会修改 `/tmp/demo.txt`，但命令里出现 `/etc/ssh/sshd_config`，直接拒绝或要求 shadow execution。

---

## 5.2 Recoverability Classifier

AgentTx v2 不声称所有事情都能恢复，而是给每种操作定义 recoverability class。

| 等级 | 名称 | 含义 | 示例 | 处理 |
|---|---|---|---|---|
| R0 | Read-only | 无副作用 | `cat`, `ls`, `grep` | 直接执行或轻量 sandbox |
| R1 | Physical-recoverable | 文件系统可回滚 | 修改普通文件、移动目录 | OverlayFS |
| R2 | Semantic-compensatable | 需要语义补偿 | reload 服务、启动进程、改 PATH | Contract template |
| R3 | Shadow-executable | 真实系统风险高，只能影子执行 | 改 sshd、sudoers、apt upgrade | VM / rootfs shadow |
| R4 | External-irreversible | 外部不可逆 | 发邮件、git push、webhook、链上交易 | mock / human approve |
| R5 | Forbidden | 不允许执行 | `rm -rf /`, `curl | bash`, wipe disk | abort |

这部分很关键，因为它回答导师的问题：

> 对于网络 IO、Docker pull、真实转账这种不可逆操作，你到底能恢复到什么程度？

AgentTx 的回答应该是：

> 我们不承诺恢复不可逆外部世界，而是通过 recoverability class 明确边界。不可逆外部效应只能 mock、shadow、人工确认或禁止。

---

## 5.3 Policy Verifier

Policy Verifier 负责判断事务是否可以执行，以及在哪里执行。

### 策略规则示例

```yaml id="1fk58z"
rules:
  - name: block_curl_pipe_bash
    match:
      pattern: "curl .*\|.*bash"
    action: abort

  - name: sudoers_shadow_only
    match:
      path_prefix: "/etc/sudoers"
    action: shadow_only

  - name: ssh_config_requires_human
    match:
      path_prefix: "/etc/ssh/"
    action: shadow_and_human_confirm

  - name: external_network_default_deny
    match:
      external_network: true
    action: mock_or_require_approval

  - name: allow_project_file_overlay
    match:
      path_prefix: "/home/user/project/"
    action: overlay_sandbox
```

Policy Verifier 检查：

```text id="v0ckt1"
declared_scope 是否覆盖实际路径
命令是否越权
是否涉及 credential
是否涉及外部不可逆 IO
是否涉及系统关键服务
是否需要 shadow environment
是否需要人工确认
```

---

## 5.4 Transactional Sandbox Executor

执行环境分三档。

---

### 档位一：Lightweight Overlay Sandbox

适合 R1 / 部分 R2。

实现机制：

```text id="r0ui8n"
mount namespace
pid namespace
network namespace
OverlayFS
cgroup v2
Landlock / seccomp
```

目录结构：

```text id="0o5lmm"
/var/lib/agenttx/tx/tx_001/
  lower/        # readonly view of selected real filesystem
  upper/        # transaction writes
  work/         # overlay workdir
  merged/       # sandbox visible filesystem
  logs/
  effects.jsonl
  contracts.json
```

执行方式：

```bash id="por5iw"
bwrap \
  --unshare-pid \
  --unshare-net \
  --ro-bind / /lower \
  --bind /var/lib/agenttx/tx/tx_001/merged / \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --die-with-parent \
  /bin/bash -lc "<command>"
```

实际工程里可以先用：

```text id="64wmw7"
bubblewrap + OverlayFS + cgroup v2
```

不要一开始写复杂内核模块。

---

### 档位二：Service Shadow Environment

适合 systemd / nginx / sshd 等服务测试。

问题是：真实 `systemctl reload nginx` 不应该直接打到宿主机。

解决方法：

```text id="xd1awi"
为事务启动一个 service shadow
把服务配置复制到 shadow root
在隔离端口或 network namespace 里运行 nginx -c <shadow_config>
用 nginx -t 和 shadow process 验证配置
```

例如 nginx：

```bash id="v7s5yg"
nginx -t -c /txroot/etc/nginx/nginx.conf
nginx -c /txroot/etc/nginx/nginx.conf -p /txroot/run/nginx
```

这样可以验证服务配置和端口，而不污染真实 nginx。

---

### 档位三：VM Shadow Environment

适合 R3 高危操作：

```text id="2kzpli"
修改 sshd_config
修改 sudoers
apt full-upgrade
修改 glibc
删除系统库
重置密码
```

实现方式：

```text id="5uctcp"
microVM / lightweight VM / systemd-nspawn / snapshot rootfs
```

对于论文 MVP，建议先用：

```text id="ucww8d"
Docker rootfs + privileged disabled
或者 systemd-nspawn
或者 QEMU snapshot
```

不必一开始做 Firecracker，但论文里可以把 VM shadow 作为高危路径。

---

## 5.5 Typed Effect Capture

AgentTx v2 的 Effect Logger 不能只是记录命令输出，而要记录 typed effect。

### Effect 数据结构

```json id="or7lvl"
{
  "effect_id": "e_003",
  "tx_id": "tx_001",
  "cmd_id": "cmd_002",
  "type": "service.reload",
  "target": "nginx",
  "recoverability": "R2",
  "pre_state": {
    "service_state": "active",
    "config_hash": "sha256:old",
    "listening_ports": [80]
  },
  "post_state": {
    "service_state": "failed",
    "config_hash": "sha256:new",
    "listening_ports": []
  },
  "declared": true,
  "within_scope": true,
  "status": "failed",
  "residual_risk": "service_failed_state"
}
```

---

### Effect 类型体系

| Effect 类型 | 示例 | 捕获方法 | 恢复方式 |
|---|---|---|---|
| `filesystem.create` | 新建文件 | Overlay diff / inotify | 删除或丢弃 upper |
| `filesystem.modify` | 修改配置 | hash / diff | restore hash / discard |
| `filesystem.delete` | 删除文件 | overlay whiteout | restore lower |
| `process.spawn` | 启动后台进程 | cgroup.procs | kill cgroup |
| `network.listen` | 新监听端口 | `ss -lntup` / netns | kill process / close ns |
| `network.external` | 外部请求 | netns log / proxy | mock / block |
| `service.reload` | reload nginx | service adapter | restore config + reload |
| `package.install` | pip / apt install | package snapshot | uninstall / version restore |
| `env.modify` | 改 PATH | shell rc diff | restore rc |
| `credential.modify` | 改 SSH key | sensitive path monitor | block / restore / human |

---

## 5.6 Effect Graph Builder

导师指出“副作用有连锁反应”，所以 v2 必须把 effect 从列表变成图。

### Effect Graph

\[
G_E = (V_E, E_E)
\]

其中：

```text id="0xd7qp"
V_E = typed effects
E_E = dependency / causality edges
```

例子：

```text id="bkltc8"
e1: filesystem.modify(/etc/nginx/nginx.conf)
    ↓ depends_on
e2: service.reload(nginx)
    ↓ caused
e3: service.failed(nginx)
    ↓ agent_reaction
e4: belief.write("nginx migration succeeded")
```

JSON 表示：

```json id="ql1y0o"
{
  "tx_id": "tx_001",
  "effect_graph": {
    "nodes": [
      {
        "id": "e1",
        "type": "filesystem.modify",
        "target": "/etc/nginx/nginx.conf",
        "status": "success"
      },
      {
        "id": "e2",
        "type": "service.reload",
        "target": "nginx",
        "status": "failed"
      },
      {
        "id": "e3",
        "type": "service.state",
        "target": "nginx",
        "state": "failed"
      },
      {
        "id": "e4",
        "type": "belief.write",
        "target": "task_summary",
        "content": "nginx migration succeeded",
        "status": "tainted"
      }
    ],
    "edges": [
      {
        "from": "e1",
        "to": "e2",
        "relation": "precondition_for"
      },
      {
        "from": "e2",
        "to": "e3",
        "relation": "caused"
      },
      {
        "from": "e3",
        "to": "e4",
        "relation": "contradicts"
      }
    ]
  }
}
```

这个设计非常重要，因为它让“语义恢复”变得可解释、可验证，而不是一句空话。

---

# 六、模块 C：Recovery and Belief Consistency Engine

这个模块负责：

```text id="hk1x5u"
commit
rollback
semantic compensation
belief repair
verification
```

---

## 6.1 Verified Recovery Contract DSL

这是你导师特别担心的点：  
如果 LLM 会幻觉，那它生成 DSL 也可能幻觉。

所以 v2 必须明确：

> **LLM 只能声明 effect 和 intent，不能自由生成 recovery command。恢复动作只能由 AgentTx 的可信模板库实例化。**

---

### 6.1.1 DSL 设计原则

DSL 满足五个约束：

```text id="5na9h0"
1. declarative, not imperative
2. typed, not free-form
3. template-instantiated, not LLM-executed
4. statically verifiable
5. scope-restricted
```

也就是说，不允许：

```bash id="615gdf"
sudo apt install vim
rm -rf ...
systemctl restart ...
```

只允许：

```json id="9n6oi0"
{
  "contract_type": "service_restore",
  "target": "nginx",
  "pre_state_ref": "snapshot.svc.nginx",
  "postcondition": [
    "service_state_equals_pre",
    "ports_equal_pre",
    "config_hash_equals_pre"
  ]
}
```

---

### 6.1.2 Contract 类型

| Contract 类型 | 处理对象 | 恢复动作 |
|---|---|---|
| `fs_restore` | 文件修改、删除、新建 | restore hash / discard upper |
| `process_cleanup` | 后台进程、僵尸进程 | kill cgroup |
| `network_restore` | 端口监听、连接残留 | close namespace / kill owner |
| `service_restore` | nginx / sshd / systemd | restore config + reload shadow/real |
| `package_restore` | apt / pip / npm | restore version / lockfile |
| `env_restore` | PATH / alias / rc | restore env snapshot |
| `credential_restore` | SSH key / token | restore from sealed snapshot |
| `belief_repair` | Agent 外化认知状态 | taint / invalidate / regenerate |

---

### 6.1.3 Contract 示例：服务恢复

```json id="sbmnt9"
{
  "contract_id": "c_service_nginx_001",
  "contract_type": "service_restore",
  "target": "nginx",
  "scope": {
    "files": [
      "/etc/nginx/nginx.conf",
      "/etc/nginx/sites-enabled/default"
    ],
    "ports": [80, 8080],
    "service": "nginx"
  },
  "pre_state": {
    "service_active": true,
    "config_hashes": {
      "/etc/nginx/sites-enabled/default": "sha256:old"
    },
    "listening_ports": [80]
  },
  "recovery_template": "restore_config_then_reload",
  "verification": [
    "config_hash_equals_pre",
    "nginx_config_test_passes",
    "service_state_equals_pre",
    "listening_ports_equal_pre"
  ],
  "allowed_actions": [
    "restore_file_from_snapshot",
    "nginx_config_test",
    "service_reload",
    "port_check"
  ]
}
```

注意：  
这里没有自由 Shell 命令，只有模板动作。

---

## 6.2 Contract Verifier

Contract Verifier 检查：

```text id="adkn47"
contract_type 是否存在
target 是否在 declared_scope 内
pre_state 是否来自可信 snapshot
allowed_actions 是否越权
恢复动作是否可能造成二次破坏
postcondition 是否可检测
是否涉及外部不可逆操作
```

例如：

```json id="aypkgs"
{
  "contract_id": "c_service_nginx_001",
  "verification_result": "pass",
  "checks": {
    "schema_valid": true,
    "scope_safe": true,
    "template_allowed": true,
    "no_free_shell": true,
    "postcondition_measurable": true,
    "external_io_absent": true
  }
}
```

如果失败：

```text id="05t92s"
R1/R2 → abort commit and rollback by physical discard
R3 → remain in shadow environment
R4 → require human confirmation
R5 → block
```

---

## 6.3 Recovery Execution

恢复执行遵循 effect graph 的逆拓扑顺序。

例如：

```text id="ymm3w2"
e5 belief.write
e4 firewall.modify
e3 service.failed
e2 service.reload
e1 filesystem.modify
```

恢复顺序：

```text id="9sb0im"
1. invalidate belief.write
2. restore firewall rules
3. restore service config
4. reload or restart service to pre-state
5. discard filesystem upper
6. verify all invariants
```

伪代码：

```python id="x8pl7q"
def recover_transaction(tx):
    graph = load_effect_graph(tx.id)
    contracts = instantiate_contracts(graph)

    for contract in reverse_topological_order(contracts):
        result = execute_verified_contract(contract)
        if not result.ok:
            escalate_recovery(contract, result)

    repair_belief_state(tx)
    return verify_recovery(tx)
```

---

## 6.4 Selective Commit

如果事务成功，不是把整个 sandbox diff 一股脑合并到真实系统，而是 selective commit。

### Commit 条件

必须满足：

```text id="cm5tlu"
actual_effects ⊆ declared_scope
actual_effects match expected_effects
success_invariants pass
no forbidden effect
no unresolved residual effect
belief state summary matches verified post-state
commit policy allows merge
```

### Selective Commit 示例

如果 Agent 修改了：

```text id="9g8x9r"
/etc/nginx/sites-enabled/default
/tmp/debug.log
~/.bashrc
```

但 declared_scope 只有：

```text id="49zf90"
/etc/nginx/sites-enabled/default
service:nginx
port:8080
```

那么：

```text id="n0ap17"
/etc/nginx/sites-enabled/default 允许进入 commit candidate
/tmp/debug.log 可以丢弃
~/.bashrc 越权，导致 commit 失败或人工确认
```

---

# 七、Belief-State Repair 详细设计

这是 AgentTx v2 最重要的创新模块。

---

## 7.1 为什么不能只回滚系统？

因为 Agent 的后续行为依赖上下文。  
如果上下文里仍然保留错误 observation，那么 Agent 会继续错误执行。

例如：

```text id="divq62"
tool observation: "nginx successfully reloaded"
真实状态: nginx failed
```

即使你恢复了 nginx，Agent 仍然可能继续写：

```text id="tejtd5"
The migration is done.
Now I will update firewall rules.
```

所以 AgentTx 必须修复 Agent runtime state。

---

## 7.2 Belief Record

所有 Agent runtime 状态都变成可追踪记录：

```json id="oojr92"
{
  "belief_record_id": "b_1029",
  "tx_id": "tx_001",
  "type": "tool_observation",
  "content": "nginx reload succeeded",
  "source": "shell_stdout",
  "depends_on_effects": ["e2"],
  "truth_status": "unverified",
  "taint_status": "clean"
}
```

如果恢复时发现 e2 实际失败：

```json id="e00v7t"
{
  "belief_record_id": "b_1029",
  "taint_status": "tainted",
  "repair_action": "invalidate",
  "reason": "contradicts verified service state"
}
```

---

## 7.3 Belief Taint Propagation

污染传播规则：

```text id="ab04es"
如果 observation 依赖 failed effect，则 observation tainted
如果 summary 引用了 tainted observation，则 summary tainted
如果 planner step 基于 tainted summary，则 planner step tainted
如果 memory write 来自 tainted planner，则 memory write tainted
```

形式化：

\[
tainted(x) \Leftarrow depends(x, y) \land tainted(y)
\]

例如：

```text id="qrik6c"
e2: service.reload failed
    ↓
obs_17: "reload succeeded"    tainted
    ↓
summary_5: "nginx is on 8080" tainted
    ↓
plan_8: "open firewall 8080"  tainted
```

---

## 7.4 Repair Actions

Belief repair 不只是删除历史，而是分级修复。

| Repair Action | 适用对象 | 含义 |
|---|---|---|
| `invalidate` | tool observation | 标记该 observation 不可信 |
| `erase` | scratchpad 临时推理 | 删除失败事务内推理 |
| `taint_memory` | memory write | 标记为污染，不再检索 |
| `rollback_memory` | 可回滚 memory | 删除该条 memory |
| `regenerate_summary` | task summary | 基于 verified state 重写 |
| `fork_planner` | planner state | 丢弃失败分支，回到安全节点 |
| `inject_correction` | context | 注入恢复事实 |
| `block_continuation` | 高危情况 | 不允许 Agent 自动继续 |

---

## 7.5 Clean Summary Regeneration

恢复后，AgentTx 重新生成一个 clean summary，但这个 summary 不能只由 LLM 自己根据旧上下文写，而要基于 verified recovery report。

输入：

```json id="lvv77o"
{
  "verified_system_state": {
    "nginx_service": "active",
    "listening_ports": [80],
    "config_hash": "sha256:old"
  },
  "recovered_effects": [
    "restored /etc/nginx/sites-enabled/default",
    "killed transaction child processes",
    "removed tainted claim: nginx migrated to 8080"
  ],
  "failed_goal": "Change nginx port to 8080",
  "safe_next_step": "Re-plan from original nginx configuration"
}
```

输出：

```text id="u7zbmn"
The previous attempt to change nginx from port 80 to 8080 failed and was rolled back. 
The verified current state is: nginx is active, the original configuration has been restored, and port 80 is listening. 
Do not assume port 8080 is active. Re-plan from the restored state.
```

这段 clean summary 会替换失败事务后的 scratchpad / task summary。

---

## 7.6 Belief Alignment Verification

定义：

\[
BeliefAligned(B_r, S_r) =
NoTaintedObservation(B_r)
\land NoContradictoryClaim(B_r, S_r)
\land NoFailedPlanContinuation(B_r)
\]

具体检查：

| 检查项 | 例子 |
|---|---|
| NoTaintedObservation | 当前 context 不再引用失败事务 observation |
| NoContradictoryClaim | summary 不再声称 nginx 已在 8080 |
| NoFailedPlanContinuation | planner 不再继续执行打开 8080 firewall |
| VerifiedStateInjected | context 中注入了真实恢复状态 |
| MemoryClean | 长期 memory 中没有错误事实 |

这部分是论文中最该强调的创新点。

---

# 八、Recovery Verifier 详细设计

Recovery Verifier 分三层。

---

## 8.1 State-Level Verifier

检查系统状态。

| Verifier | 检查内容 |
|---|---|
| \(V_{fs}\) | 目标文件 hash 是否恢复 |
| \(V_{proc}\) | cgroup 内是否还有残留进程 |
| \(V_{net}\) | 是否还有异常监听端口 |
| \(V_{svc}\) | 服务是否恢复到 pre-state |
| \(V_{pkg}\) | 包版本、lockfile 是否一致 |
| \(V_{env}\) | PATH、alias、shell rc 是否恢复 |
| \(V_{cred}\) | credential 是否未被污染 |
| \(V_{ext}\) | 外部效应是否被 mock / blocked / approved |

---

## 8.2 Effect-Level Verifier

检查 effect graph 中每个 effect 是否处理完毕：

```json id="4ckpdb"
{
  "effect_id": "e2",
  "type": "service.reload",
  "status": "recovered",
  "contract": "c_service_nginx_001",
  "residual_effect": false
}
```

最终要求：

```text id="1fivb6"
for all e in effect_graph:
    e.status in {committed, recovered, blocked, mocked}
    e.residual_effect == false
```

---

## 8.3 Belief-Level Verifier

检查 Agent runtime 是否还有污染认知。

```json id="q2rgpd"
{
  "belief_verification": {
    "tainted_observations_in_context": 0,
    "contradictory_claims": 0,
    "tainted_memory_retrievable": false,
    "failed_plan_active": false,
    "clean_summary_installed": true
  },
  "result": "pass"
}
```

---

# 九、具体实现方案

下面给你一个比较现实的实现路线。

---

## 9.1 系统组件划分

建议实现成以下组件：

```text id="wivyn3"
agenttx/
  agenttxd/                     # 核心 daemon
    transaction_manager.py
    policy_verifier.py
    risk_classifier.py
    contract_verifier.py
    recovery_engine.py
    belief_repair.py

  sandbox/
    overlay_runner.py
    bwrap_runner.py
    cgroup_manager.py
    netns_manager.py
    shadow_vm_runner.py

  effects/
    fs_tracker.py
    process_tracker.py
    network_tracker.py
    service_tracker.py
    package_tracker.py
    env_tracker.py
    credential_tracker.py
    effect_graph.py

  contracts/
    schemas/
      fs_restore.schema.json
      service_restore.schema.json
      package_restore.schema.json
      belief_repair.schema.json
    templates/
      fs_restore.py
      process_cleanup.py
      service_restore.py
      network_restore.py
      env_restore.py
      package_restore.py

  belief/
    runtime_store.py
    taint_tracker.py
    summary_regenerator.py
    consistency_checker.py

  verifier/
    state_verifier.py
    effect_verifier.py
    belief_verifier.py

  benchmark/
    agent_chaos_linux/
      l1_filesystem/
      l2_env/
      l3_service/
      l4_external/
      l5_belief/
```

---

## 9.2 推荐技术栈

### MVP 阶段

| 模块 | 技术 |
|---|---|
| 控制器 | Python |
| Shell command parser | `bashlex` / 自写规则 |
| 文件隔离 | OverlayFS |
| 轻量沙盒 | bubblewrap |
| 进程追踪 | cgroup v2 |
| 网络隔离 | network namespace |
| 文件 diff | hash + overlay upper scan |
| 服务测试 | nginx shadow adapter |
| JSON schema | `jsonschema` |
| benchmark runner | pytest |
| LLM Agent wrapper | LangChain / OpenAI tool wrapper / 自写 ReAct wrapper |

### 论文加强版

| 模块 | 技术 |
|---|---|
| 低开销监控 | eBPF |
| 高危执行 | QEMU snapshot / Firecracker |
| 复杂服务 | systemd-nspawn |
| 包管理恢复 | apt/dpkg snapshot + lockfile restore |
| belief repair | transaction-aware memory store |

---

## 9.3 MVP 最小可行版本

不要一开始做全部效果。建议第一版只支持：

```text id="6kcd8j"
filesystem
process
network port
service
env
belief state
```

先不支持完整 apt rollback、credential restore、真实外部 IO。

MVP 支持场景：

```text id="c7cbyt"
1. 修改普通文件
2. 删除项目目录
3. 修改 .bashrc / PATH
4. 启动后台进程
5. 修改 nginx 配置并 reload
6. 错误 observation 污染 task summary
```

这样足够跑出第一批实验。

---

## 9.4 Execution Runtime 伪代码

```python id="j74qsz"
def run_transaction(agent_request):
    tx = Transaction.from_request(agent_request)

    # 1. snapshot
    system_snapshot = snapshot_system(tx.declared_scope)
    belief_snapshot = snapshot_belief_state(tx.agent_id)

    # 2. static analysis
    static_report = analyze_commands(tx.commands)

    # 3. risk classification
    tx.recoverability = classify_recoverability(static_report, tx.declared_scope)

    # 4. policy verification
    decision = verify_policy(tx, static_report)
    if decision.action == "abort":
        return abort_transaction(tx, decision.reason)

    # 5. prepare execution environment
    env = prepare_execution_environment(tx, decision)

    # 6. execute
    exec_result = env.run(tx.commands)

    # 7. capture effects
    effects = capture_typed_effects(tx, system_snapshot, env)

    # 8. build effect graph
    effect_graph = build_effect_graph(tx, effects, exec_result)

    # 9. pre-commit verification
    precommit = verify_precommit(tx, effect_graph)

    if precommit.ok:
        commit_result = selective_commit(tx, effect_graph)
        repair_belief_after_commit(tx, commit_result)
        return commit_result
    else:
        recovery_result = recover(tx, effect_graph, system_snapshot)
        belief_result = repair_belief_after_recovery(tx, recovery_result)
        verify_result = verify_recovery(tx, system_snapshot, belief_snapshot)
        return verify_result
```

---

## 9.5 Recovery 伪代码

```python id="yc9w12"
def recover(tx, effect_graph, system_snapshot):
    contracts = []

    for effect in effect_graph.nodes:
        contract = instantiate_contract_template(effect, system_snapshot)
        verify_contract(contract)
        contracts.append(contract)

    ordered_contracts = reverse_topological_sort(contracts)

    recovery_log = []
    for contract in ordered_contracts:
        result = execute_contract(contract)
        recovery_log.append(result)

        if not result.ok:
            escalate(contract, result)

    return RecoveryResult(
        tx_id=tx.id,
        contracts=contracts,
        recovery_log=recovery_log
    )
```

---

## 9.6 Belief Repair 伪代码

```python id="ttkhd7"
def repair_belief_after_recovery(tx, recovery_result):
    tainted_records = find_records_by_tx(tx.id)

    for record in tainted_records:
        if record.type == "tool_observation":
            invalidate(record)

        elif record.type == "memory_write":
            if record.reversible:
                rollback_memory(record)
            else:
                mark_tainted(record)

        elif record.type == "planner_state":
            fork_or_rewind_planner(record)

        elif record.type == "scratchpad":
            erase_or_mask(record)

        elif record.type == "task_summary":
            regenerate_clean_summary(tx, recovery_result)

    inject_verified_state(tx, recovery_result)

    return verify_belief_alignment(tx)
```

---

# 十、关键场景：Nginx 事务失败恢复

下面给一个完整例子，论文里可以画成图。

---

## 10.1 任务

```text id="ltkwo6"
用户要求 Agent 把 nginx 从 80 端口切换到 8080。
```

---

## 10.2 Agent 提交事务

```json id="fhsaus"
{
  "task_goal": "Change nginx port from 80 to 8080",
  "commands": [
    "sed -i 's/listen 80/listen 8080/' /etc/nginx/sites-enabled/default",
    "systemctl reload nginx"
  ],
  "declared_scope": {
    "files": ["/etc/nginx/sites-enabled/default"],
    "services": ["nginx"],
    "ports": [80, 8080]
  },
  "expected_effects": [
    "nginx config modified",
    "nginx reload succeeds",
    "port 8080 listens"
  ]
}
```

---

## 10.3 执行中出现错误

实际情况：

```text id="mxfzmw"
sed 修改造成 nginx 配置语法错误
systemctl reload nginx 失败
Agent 错误地把 stdout 理解成 reload 成功
task summary 写入“nginx now listens on 8080”
```

---

## 10.4 Effect Graph

```text id="gk4slj"
e1: filesystem.modify(/etc/nginx/sites-enabled/default)
    status = success

e2: service.reload(nginx)
    status = failed
    depends_on = e1

e3: network.listen(port=8080)
    status = absent
    expected_but_missing = true

e4: belief.write(task_summary="nginx now listens on 8080")
    status = tainted
    contradicts = e2, e3
```

---

## 10.5 Recovery Contract

```json id="rnipk4"
{
  "contract_type": "service_restore",
  "target": "nginx",
  "steps": [
    "restore_file_from_snapshot",
    "nginx_config_test",
    "reload_service_to_pre_state",
    "verify_original_port_state",
    "invalidate_tainted_beliefs",
    "regenerate_clean_summary"
  ],
  "verification": [
    "config_hash_equals_pre",
    "nginx_service_active",
    "port_80_listening",
    "port_8080_not_claimed_by_belief"
  ]
}
```

---

## 10.6 恢复后 clean summary

```text id="aycbhq"
The previous attempt to move nginx from port 80 to 8080 failed and was rolled back.
The verified current state is: nginx is active, the original configuration is restored, and port 80 is listening.
Do not assume port 8080 is active. Re-plan from the restored state.
```

这就是 AgentTx 和普通沙盒最大的不同：  
它不仅恢复了 nginx，还修复了 Agent 对 nginx 状态的错误认知。

---

# 十一、Benchmark 设计

## 11.1 Agent-Chaos-Linux v2

建议 benchmark 分成五类。

---

### L1：Filesystem Chaos

| 场景 | 目标 |
|---|---|
| 删除项目源文件 | 测试 Overlay rollback |
| 错改 `.env` | 测试敏感配置恢复 |
| 覆盖 Makefile | 测试构建环境恢复 |
| 移动目录 | 测试路径恢复 |
| 误删测试数据 | 测试 scope-limited restore |

---

### L2：Environment Chaos

| 场景 | 目标 |
|---|---|
| 修改 PATH | 测试 env restore |
| 污染 `.bashrc` | 测试 shell rc 恢复 |
| 删除 venv | 测试 Python 环境恢复 |
| pip 安装冲突包 | 测试 package restore |
| npm lockfile 破坏 | 测试 dependency restore |

---

### L3：Service Chaos

| 场景 | 目标 |
|---|---|
| 错改 nginx | 测试 service contract |
| 错改 sshd | 测试 shadow-only |
| 端口冲突 | 测试 network verifier |
| systemctl reload 失败 | 测试半吊子状态恢复 |
| 后台进程残留 | 测试 cgroup cleanup |

---

### L4：External Effect Chaos

| 场景 | 目标 |
|---|---|
| docker pull | 测试 external cache handling |
| curl 外部脚本 | 测试 policy block |
| git push | 测试 irreversible IO |
| webhook | 测试 mock / human approval |
| 链上交易模拟 | 测试 forbidden / shadow |

---

### L5：Belief Chaos

| 场景 | 目标 |
|---|---|
| tool observation 错误 | 测试 taint |
| Agent 误判服务成功 | 测试 clean summary |
| memory 写入错误事实 | 测试 memory rollback |
| planner 继续失败分支 | 测试 planner repair |
| context compression 遗忘约束 | 测试 invariant injection |

---

## 11.2 Baselines

保留这些 baseline：

| Baseline | 对比目的 |
|---|---|
| No Defense | 裸 Agent 破坏程度 |
| Docker Sandbox | 只隔离，不解决 commit |
| OverlayFS-only | 只恢复文件 |
| Human Confirmation | 静态确认无法处理执行中失败 |
| Agent Self-Recovery | 让 Agent 自己修复不稳定 |
| AgentTx without Belief Repair | 证明认知修复必要 |
| AgentTx without Contract Verifier | 证明 DSL 验证必要 |
| AgentTx without Effect Graph | 证明副作用图必要 |

---

## 11.3 指标

| 指标 | 含义 |
|---|---|
| SRR | Successful Recovery Rate |
| SCS | Semantic Consistency Score |
| ASR | Agent-State Repair Success |
| DAI | Damage After Interrupt |
| RCR | Rollback Contract Coverage |
| REC | Residual Effect Count |
| RL | Recovery Latency |
| Overhead | 执行开销 |
| FBR | False Block Rate |
| TCR | Tainted Context Residual Rate |

其中最重要的是：

```text id="rlxc3p"
DAI: 恢复后 Agent 是否继续造成二次破坏
TCR: 恢复后上下文里是否残留污染认知
ASR: Agent 认知状态修复成功率
```

这三个指标最能体现你的 novelty。

---

# 十二、论文贡献写法

最终论文贡献建议写成三条。

---

## Contribution 1：Agent-OS Transaction Semantics

提出 Shell-based LLM Agent 的事务一致性模型，把 Agent 意图、Shell 动作、系统副作用、恢复契约和外化认知状态放入同一个事务语义中。

---

## Contribution 2：Typed Effect Graph and Verified Recovery Contracts

提出 typed effect graph 捕获文件、进程、网络、服务、包管理器、环境和 credential 副作用，并通过模板化、静态可验证的 recovery contract 执行恢复，避免让 LLM 自由生成危险回滚命令。

---

## Contribution 3：Belief-State Repair and Agent-Chaos-Linux Benchmark

提出 Agent belief-state repair，对 tool observation、memory、planner、scratchpad、task summary 进行事务级 taint tracking 和 clean regeneration，并通过 Agent-Chaos-Linux benchmark 验证其对恢复成功率和二次破坏降低的效果。

---

# 十三、最终系统一句话总结

你这版新架构可以用一句话概括：

> **AgentTx v2 是一个面向 Shell-based LLM Agent 的事务执行 runtime，它通过 typed effect graph 捕获系统副作用，通过 verified recovery contract 执行语义恢复，并通过 belief-state repair 修复 Agent 的外化认知状态，从而保证恢复后系统状态和 Agent 认知状态重新一致。**

更适合论文标题的表达是：

> **AgentTx: Transactional Execution and Belief-Consistent Recovery for Shell-Based LLM Agents**

或者更尖锐一点：

> **Repairing the Agent-OS Semantic Gap in Shell-Based LLM Agents**

我的建议是你后续就围绕这三个词继续打磨：

```text id="su26ey"
Typed Effect Graph
Verified Recovery Contract
Belief-State Repair
```

这三个点才是最有可能支撑 A 类论文的核心。
