async () => {
    const axios = require('axios');
    const fs = require('fs');

    const RECORD_PATH = '/vertex/data/nc_record_24h.json'; // 存储下载器记录的路径
    const NETCUP_SERVER_LIST = [
        // id, 高速流量每24小时上限 (2TB)
        { id: '82acd2c6', highSpeedLimit: 2 * 1024 * 1024 * 1024 * 1024 },
    ];

    /**
     * 获取 qBittorrent 下载器的 server state，并处理记录
     */
    async function updateClientStatus(clientUrl, cookie, id, highSpeedLimit) {
        // 读取记录文件
        let record = {};
        try {
            if (fs.existsSync(RECORD_PATH)) {
                const data = fs.readFileSync(RECORD_PATH, 'utf8');
                record = JSON.parse(data);
            }
        } catch (error) {
            logger.warn(`读取或解析 ${RECORD_PATH} 失败: ${error.message}`);
        }

        // 初始化该客户端的记录
        if (!record[id]) {
            record[id] = {
                has_high_speed: true,
                history: []
            };
        }

        try {
            // 调用 qBittorrent 的 API 接口获取 server state
            const response = await axios.get(`${clientUrl}/api/v2/sync/maindata`, { headers: { 'Cookie': cookie } });
            const serverState = response.data.server_state;

            // 获取当前总流量 (下载 + 上传)，total_wasted_session 丢弃的已经算入 alltime_dl
            const currentTotal = serverState.alltime_dl + serverState.alltime_ul;
            const now = Date.now();

            // 1. 添加当前记录到历史
            record[id].history.push({
                ts: now,
                total: currentTotal
            });

            // 2. 清理超过 25 小时的历史记录
            const retentionWindow = 25 * 60 * 60 * 1000;
            record[id].history = record[id].history.filter(item => item.ts > now - retentionWindow);

            // 确保历史记录按时间排序
            record[id].history.sort((a, b) => a.ts - b.ts);

            // 3. 寻找 24 小时前的基准点
            // 我们希望计算过去 24 小时的增量：Traffic(Now) - Traffic(Now - 24h)
            // 寻找最接近且小于等于 (Now - 24h) 的记录。
            // 如果所有记录都大于 (Now - 24h)（即记录时间不足 24 小时），使用最早的一条记录。
            const window24h = 24 * 60 * 60 * 1000;
            const targetTs = now - window24h;

            let baselineRecord = null;

            // 倒序查找，找到第一个小于等于 targetTs 的记录
            for (let i = record[id].history.length - 1; i >= 0; i--) {
                if (record[id].history[i].ts <= targetTs) {
                    baselineRecord = record[id].history[i];
                    break;
                }
            }

            // 如果没找到（说明历史不够长），就用最早的一条
            if (!baselineRecord && record[id].history.length > 0) {
                baselineRecord = record[id].history[0];
            }

            // 计算 24 小时内流量
            let used24h = 0;
            if (baselineRecord) {
                used24h = currentTotal - baselineRecord.total;
                // 防止计数器重置导致的负数 (虽然 qb alltime 不太可能重置，除非重装/清空)
                if (used24h < 0) {
                    used24h = currentTotal;
                    logger.warn(`下载器 ${id} 流量计数器似乎重置了，使用当前总值作为 24h 流量`);
                }
            }

            logger.info(`下载器 ${id} 状态: 当前总流量 ${(currentTotal / 1024 / 1024 / 1024).toFixed(2)} GB, 基准流量(${(new Date(baselineRecord?.ts)).toLocaleString()}) ${(baselineRecord?.total / 1024 / 1024 / 1024).toFixed(2)} GB`);
            logger.info(`下载器 ${id} 过去 24h 使用流量: ${(used24h / 1024 / 1024 / 1024).toFixed(2)} GB, 上限: ${(highSpeedLimit / 1024 / 1024 / 1024).toFixed(2)} GB`);

            // 4. 判断是否超过限额
            const hasHighSpeed = used24h < highSpeedLimit;

            // 更新状态
            record[id].has_high_speed = hasHighSpeed;
            record[id].last_update = now;
            record[id].traffic_24h = used24h;

            // 写入文件
            fs.writeFileSync(RECORD_PATH, JSON.stringify(record), 'utf8');
            logger.info(`记录已更新 ${RECORD_PATH}, 高速状态: ${hasHighSpeed}`);

        } catch (error) {
            logger.error(`处理下载器 ${id} 失败: ${error.message}`, error);
        }
    }

    async function monitorDownloaders() {
        for (const server of NETCUP_SERVER_LIST) {
            const clientKey = server.id;
            const client = global.runningClient[clientKey];

            if (!client || !client.maindata) {
                logger.info(`下载器：${server.id} 未运行或无数据`);
                continue;
            }

            const clientUrl = client.clientUrl;
            const clientCookie = client.cookie;
            await updateClientStatus(clientUrl, clientCookie, client.id, server.highSpeedLimit);
        }
    }

    // 启动监控
    (async () => {
        await monitorDownloaders();
    })();
}