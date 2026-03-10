# Vertex 的一些小脚本

_这里的 Vertex 是 [Vertex - 适用于 PT 玩家的追剧刷流一体化综合管理工具](https://github.com/vertex-app/vertex)_

本仓库的内容不歧视任何站点/小组/个人，本仓库作者不对这些脚本产生的任何影响（限速失败/超频访问导致警告/封号、违反站点规则、硬盘损坏等）负责，请自行判断使用这些脚本的风险。

无论使用哪些脚本，请关注 vertex 的 系统信息-系统日志并切换日志级别，以此来调试和确认脚本是否正常工作。

作者精力有限，可能长期不会对脚本进行维护更新，也很难解答使用过程中的问题，但仍然欢迎反馈，如果项目对你有帮助，那作者会很高兴。

作者仅在 qbittorrent（4.3.9、4.5.5、4.6.7, Linux） 下测试过脚本，其他版本（5.x）可能不兼容；Transmission 与 Deluge 不会支持。

## rss-rules（RSS 规则）

这些脚本放在 vertex-规则组件-RSS 规则 中

**拒绝规则**需要在 RSS 任务中的**拒绝规则中选择**，**允许规则**需要在 RSS 任务中的**允许规则中选择**，别搞反了。

**注意：** 当使用**按剩余空间进种**的脚本，**请勿**在不知道会发生什么的情况下点击“**试运行**”，这可能导致一次批量进种。

## task-scripts（定时脚本）

这些脚本放在 vertex-任务配置-定时脚本 中

### 标记异常的种子

标记异常的种子的脚本**可能删除那些重新发种且同名**的种子，例如下载器中含一个进度 25%的种子，站点发现这个种子发错了准备删种重发，没有增加“REPACK”之类的名字，而是**完全一样的名字**；对于这种情况，下载器会**覆盖旧种**的内容，如果执行旧的错误种子删除操作，则会**将重发的种子一起删除**。

有些措施可以缓解这个问题，例如移动旧的错误种子到一个临时目录，删掉之后立马重新校验同名的新种，但会导致新种的实际所需下载量大于种子体积。或者比较旧种和新种的内容，删除仅旧种有的部分文件，之后删除旧种但不删文件，最后对新种进行一次重新校验；无论怎样，对 Vertex 的定时脚本来说还是太麻烦了。

### 完成种子后移动种子

通常来说可以用在固态硬盘（SSD）和机械硬盘（HDD）之间移动种子。允许配置完成多久后移动种子，以及针对某些分类的种子进行移动。

### 完成种子后打上标签

这一般用在 Vertex 工具和早期的 qBittorrent 不能设置标签的场景，例如想要对 RSS 进种的种子打上“MOVIEPOILT”标签，以此来触发 MoviePilot 的入库整理。

### 为种子限速

> *作者最推荐的脚本之一*
> 
> 实际上 Vertex 的 RSS 无法保证种子进种——RSS 更新间隔太久、下载器任务太多、下载器速度太快都可能拒绝进种。对于那些一定需要下载种子情形，例如订阅的资源、新种少的站点，可以转回用 qBittorrent 的 RSS 下载；但 qBittorrent 的 RSS 下载无法设置限速，在盒子上不限速肯定超速。

这个脚本通常用在 RSS 任务中，配合 qBittorrent RSS 的“添加后不开始下载”功能、Vertex 的进种暂停（尬黑了，Vertex 进种有限速功能）、MoviePilot 的自动订阅功能使用（**MoviePilot 进种后会直接下载，脚本可能来不及限速**）。脚本会遍历指定下载器中的所有种子（如果设置为 ONLY_PAUSED=true，则只遍历暂停下载的种子，即 qBittorrent 的 state=pausedDL），根据种子的 tracker URL 关键词（从 magnet url 中提取的）配置来设置上传和下载限速。

## netcup 限流情况同步方案


### 直接从 SCP 读取服务器限流情况的方案

额外 netcup 支持可以使用定时脚本 `task-scripts/获取NC限速情况.js`（需在环境变量或脚本内编辑配置登录账号和服务器映射等信息）来检测 netcup 服务器的限流情况：

```js
    // 配置
    const LOGINNAME = process.env.NC_LOGINNAME || '你的nc scp登录名';
    const PASSWORD = process.env.NC_PASSWORD || '你的nc scp密码';
    const VSERVER_MAP = {
        '你的nc vserver名，v开头的，例如v220250***': '82acd2c6（其在vt中对应的id）'
    };
```

**警告！！！**：将 [netcup SCP](https://www.servercontrolpanel.de/SCP/Home) 登录名和密码写入脚本或者 vertex 容器的环境变量有安全风险，因此带来的风险需要你自己负责。

该脚本会在本地创建一个 `json` 文件含有 下载器 ID 和限流情况：

```json
{
    "82acd2c6": {
        "has_high_speed": true // “有”高速 直译
    }
}
```

然后使用 vertex 的定时脚本 `task-scripts/更新NC服务器流量状态.js` 将更新到 vertex 的 redis 中，在 `rss-rules/允许规则-按剩余空间进种-额外netcup支持.js` 中进行从 redis 中读取数据进行限流判断。

### 根据下载器流量计算的方案

当然，我还提供了一个没那么准确的脚本 `task-scripts/自动计算NC流量.js`，它会计算以 24 小时为窗口的下载器所用流量，并输出到日志和 `json` 文件中。netcup 的实际限流并不以此为标准，但是，使用这个脚本控制进种的情况下，不会触发限流，如果你出于安全考虑或者受限实在不愿意使用前面的 `task-scripts/更新NC服务器流量状态.js`，也可以使用这个脚本。


## FAQ

### Vertex 信息级别的日志输出弹出错误： `spawnSync /bin/sh ENOBUFS`

疑似是日志文件过大，导致输出错误。

对于 Docker 部署的 vertex，进入 vertex 容器：

```
docker exec -it vertex /bin/bash
```

然后清空`/app/vertex/logs/app-info.log`日志文件

```
truncate -s 0 /app/vertex/logs/app-info.log
```