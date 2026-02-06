async () => {
    const axios = require('axios');
    const querystring = require('querystring');

    // 是否仅对暂停下载状态的种子生效，通常是 qBittorrent RSS 设置了"添加后不开始下载"
    // 如果设置为 true，则只有暂停状态的种子才会被处理
    // 如果一定要对所有种子进行限速检查，则设置为 false
    const ONLY_PAUSED = true;
    // 限速后自动开始下载
    const START_AFTER_LIMIT = true;

    // 启用的下载器 id
    const ENABLED_CLIENT_IDS = ["82acd2c6", "e1a4047a"];

    // Tracker URL 关键词和其对应的限速
    const LIMIT_RULES = {
        'site1.com': { uploadLimit: 85 * 1024 * 1024, downloadLimit: 0 }, // 上传限速50MiB/s，无下载限速
        'tracker.site2': { uploadLimit: 85 * 1024 * 1024, downloadLimit: 0 }, // 上传限速85MiB/s，无下载限速
        'hd.site3': { uploadLimit: 115 * 1024 * 1024, downloadLimit: 60 * 1024 * 1024 }, // 上传限速115MiB/s，下载限速60MiB/s
    };

    async function setTorrentsLimitAndStart(clientUrl, cookie, hashes, uploadLimit, downloadLimit) {
        const headers = {
            'Cookie': cookie,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        };

        const uploadPath = "/api/v2/torrents/setUploadLimit";
        const downloadPath = "/api/v2/torrents/setDownloadLimit";

        try {
            // 设置上传限速
            if (uploadLimit !== undefined) {
                await axios.post(clientUrl + uploadPath, querystring.stringify({
                    hashes: hashes.join('|'),
                    limit: uploadLimit
                }), { headers });
            }

            // 设置下载限速
            if (downloadLimit !== undefined) {
                await axios.post(clientUrl + downloadPath, querystring.stringify({
                    hashes: hashes.join('|'),
                    limit: downloadLimit
                }), { headers });
            }

            logger.info(`设置限速成功，种子数量: ${hashes.length}, 上传: ${uploadLimit}, 下载: ${downloadLimit}`);

            if (START_AFTER_LIMIT) {
                logger.info(`开始运行种子，种子数量: ${hashes.length}`);
                await axios.post(clientUrl + "/api/v2/torrents/resume", querystring.stringify({
                    hashes: hashes.join('|')
                }), { headers });
            }
        } catch (error) {
            logger.error(`设置限速错误: ${error.message}`, error);
        }
    }

    try {
        // 遍历所有正在运行的客户端
        for (const [key, client] of Object.entries(global.runningClient)) {
            // 检查客户端是否启用
            if (ENABLED_CLIENT_IDS && ENABLED_CLIENT_IDS.length > 0 && !ENABLED_CLIENT_IDS.includes(key)) {
                continue;
            }

            if (!client.maindata || !client.maindata.torrents) {
                continue;
            }

            const clientUrl = client.clientUrl;
            const clientCookie = client.cookie;
            const torrents = client.maindata.torrents;

            // 按规则关键词分组存储需要设置限速的种子
            // { "tracker_keyword": [hash1, hash2, ...] }
            const torrentsToLimit = {};

            for (const torrent of torrents) {

                // 1. 检查 ONLY_PAUSED
                if (ONLY_PAUSED) {
                    const state = torrent.state || "";
                    if (state !== "pausedDL") {
                        continue;
                    }
                }

                // 2. 寻找匹配的规则
                // 获取magnet中的tracker
                const magnetUri = torrent.originProp.magnet_uri || "";
                // 从magnet中提取tracker
                let trackersTemp = magnetUri.match(/tr=([^&]+)/g) || [];
                // 去掉tr=
                trackersTemp = trackersTemp.map(t => t.replace("tr=", ""));
                // 转义url编码
                trackersTemp = trackersTemp.map(t => decodeURIComponent(t));
                let matchedKeyword = null;

                for (const keyword of Object.keys(LIMIT_RULES)) {
                    for (const tracker of trackersTemp) {
                        if (tracker.includes(keyword)) {
                            matchedKeyword = keyword;
                            break;
                        }
                    }
                    if (matchedKeyword) {
                        break;
                    }
                }

                if (!matchedKeyword) {
                    continue;
                }

                // logger.debug(`找到种子：${torrent.name}，Tracker: ${tracker}，匹配规则: ${matchedKeyword}`);


                // 3. 检查是否需要更新限速
                const rule = LIMIT_RULES[matchedKeyword];

                if (torrent.uploadLimit !== rule.uploadLimit || torrent.downloadLimit !== rule.downloadLimit) {
                    if (!torrentsToLimit[matchedKeyword]) {
                        torrentsToLimit[matchedKeyword] = [];
                    }
                    torrentsToLimit[matchedKeyword].push(torrent.hash);
                }

            }

            // 执行限速设置
            for (const [keyword, hashes] of Object.entries(torrentsToLimit)) {
                const rule = LIMIT_RULES[keyword];
                if (hashes.length > 0) {
                    logger.info(`正在为匹配 Tracker ${keyword} 的 ${hashes.length} 个种子设置限速...`);
                    await setTorrentsLimitAndStart(clientUrl, clientCookie, hashes, rule.uploadLimit, rule.downloadLimit);
                }
            }
        }
    } catch (e) {
        logger.error(`【为种子限速】脚本执行出错: ${e.message}`, e);
    }
}