async () => {
    const axios = require('axios');
    const querystring = require('querystring');

    // 配置目标的种子分类列表
    const TARGET_CATEGORIES = ["SITE1", "SITE2"];

    // 启用的下载器 id
    const ENABLED_CLIENT_IDS = ["82acd2c6", "e1a4047a"];

    // 完成后多久（秒）后打上标签
    const DELAY_SECONDS = 60 * 10;

    // 标签，以 MOVIEPOILT 为例
    const TARGET_TAG = "MOVIEPOILT";

    async function addTorrentsTags(clientUrl, cookie, hashes, tag) {
        const path = "/api/v2/torrents/addTags";
        const apiUrl = clientUrl + path;
        const headers = {
            'Cookie': cookie,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        };

        logger.info(`添加标签：${tag} 到种子：${hashes.join('|')}`);

        try {
            await axios.post(apiUrl, querystring.stringify({
                hashes: hashes.join('|'),
                tags: tag
            }), { headers });
        } catch (error) {
            logger.info(`添加标签错误: ${error.message}`, error);
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
            const hashesToTag = [];

            for (const torrent of torrents) {
                // 1. Check category
                if (!TARGET_CATEGORIES.includes(torrent.category)) {
                    continue;
                }

                // 2. Check complete
                if (torrent.progress !== 1) {
                    continue;
                }

                // 3. Check exist tag
                const currentTags = torrent.tags ? torrent.tags.split(',').map(tag => tag.trim()) : [];
                if (currentTags.includes(TARGET_TAG)) {
                    continue;
                }
                logger.debug(`处理种子：${torrent.hash}，标签：${torrent.tags}, dump: ${JSON.stringify(torrent)}`);

                // 4. Check time
                // torrent.completion
                if (!torrent.completedTime || torrent.completedTime <= 0) {
                    continue;
                }

                const completedTime = torrent.completedTime;
                const currentTime = Math.floor(Date.now() / 1000);

                if (currentTime - completedTime > DELAY_SECONDS) {
                    hashesToTag.push(torrent.hash);
                }
            }

            if (hashesToTag.length > 0) {
                await addTorrentsTags(clientUrl, clientCookie, hashesToTag, TARGET_TAG);
            }
        }
    } catch (e) {
        logger.error(`【完成种子后打上标签】脚本执行出错: ${e.message}`, e);
    }
}