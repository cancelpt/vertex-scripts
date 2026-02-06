async () => {
    const axios = require('axios');
    const querystring = require('querystring');

    // 目标分类，如果不设置，则移动所有需要移动的种子
    const TARGET_CATEGORIES = ["SITE1", "SITE2"];

    // 启用的下载器 id
    const ENABLED_CLIENT_IDS = ["82acd2c6", "e1a4047a"];

    // 完成后多久（秒）后移动种子，这里设置为 24 小时
    const DELAY_SECONDS = 60 * 60 * 24;

    // 移动规则列表：source 为源目录（精确匹配），target 为目标目录
    const MOVE_RULES = [
        {
            source: "/ssd1/downloads",
            target: "/mnt/hdd1/downloads"
        },
        {
            source: "/ssd2/downloads",
            target: "/mnt/hdd1/downloads"
        },
        {
            source: "/Disk1/downloads/movie",
            target: "/Disk1/downloads/movie1"
        }
    ];

    async function moveTorrents(clientUrl, cookie, hashes, location) {
        const path = "/api/v2/torrents/setLocation";
        const apiUrl = clientUrl + path;
        const headers = {
            'Cookie': cookie,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        };

        logger.info(`移动种子到 ${location}，种子：${hashes.join('|')}`);

        try {
            await axios.post(apiUrl, querystring.stringify({
                hashes: hashes.join('|'),
                location: location
            }), { headers });
        } catch (error) {
            logger.info(`移动种子错误: ${error.message}`, error);
        }
    }

    try {
        // 遍历所有正在运行的客户端
        for (const [key, client] of Object.entries(global.runningClient)) {
            if (!ENABLED_CLIENT_IDS.includes(key)) {
                continue;
            }

            if (!client.maindata || !client.maindata.torrents) {
                continue;
            }

            const clientUrl = client.clientUrl;
            const clientCookie = client.cookie;
            const torrents = client.maindata.torrents;

            // 按目标路径分组存储需要移动的种子： { "/target/path": [hash1, hash2] }
            const moves = {};

            for (const torrent of torrents) {
                // 1. Check category
                if (TARGET_CATEGORIES && TARGET_CATEGORIES.length > 0 && !TARGET_CATEGORIES.includes(torrent.category)) {
                    continue;
                }

                // 2. Check complete
                if (torrent.progress !== 1) {
                    continue;
                }

                // 3. Find matching rule
                const savePath = torrent.save_path || "";
                const normalizePath = (p) => p.endsWith('/') ? p.slice(0, -1) : p;
                const normalizedSavePath = normalizePath(savePath);

                const matchedRule = MOVE_RULES.find(rule =>
                    normalizePath(rule.source) === normalizedSavePath
                );

                if (!matchedRule) {
                    continue;
                }

                // Skip if already in target dir (just in case rule is misconfigured or already moved)
                if (normalizedSavePath === normalizePath(matchedRule.target)) {
                    continue;
                }

                logger.debug(`处理移动种子：${torrent.hash}，当前路径：${savePath}，目标路径：${matchedRule.target}`);

                // 4. Check time
                if (!torrent.completedTime || torrent.completedTime <= 0) {
                    continue;
                }

                const completedTime = torrent.completedTime;
                const currentTime = Math.floor(Date.now() / 1000);

                if (currentTime - completedTime > DELAY_SECONDS) {
                    if (!moves[matchedRule.target]) {
                        moves[matchedRule.target] = [];
                    }
                    moves[matchedRule.target].push(torrent.hash);
                }
            }

            // 执行移动操作
            for (const [targetDir, hashes] of Object.entries(moves)) {
                if (hashes.length > 0) {
                    await moveTorrents(clientUrl, clientCookie, hashes, targetDir);
                }
            }
        }
    } catch (e) {
        logger.error(`【完成种子后移动种子】脚本执行出错: ${e.message}`, e);
    }
}