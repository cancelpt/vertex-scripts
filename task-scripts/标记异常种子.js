
const axios = require('axios');
const querystring = require('querystring');

// tracker 异常种子分类
const TRACKER_ERROR_TORRENT_CATEGORY = "D";
// 忽略的种子分类
const IGNORE_CATEGORYS = ["keep", "D"];

// tracker 错误关键词
const badKeywords = [
    "banned",
    "not register",
    "not exists",
    "Unregistered",
    "not found",
    "删除"
]

async function getTrackerStatus(torrentHash, clientUrl, cookie) {
    const path = "/api/v2/torrents/trackers";
    const apiUrl = clientUrl + path;
    const headers = { 'Cookie': cookie };

    const getRequest = async (url) => {
        return axios.get(url, { headers }).then(response => response.data);
    };

    const trackers = await getRequest(`${apiUrl}?hash=${torrentHash}`);
    return trackers;
}


async function setTorrentsCategory(clientUrl, cookie, hashes, category) {
    const path = "/api/v2/torrents/setCategory";
    const apiUrl = clientUrl + path;
    const headers = { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'text/javascript, text/html, application/xml, text/xml, */*' };

    const getRequest = async (url) => {
        return axios.get(url, { headers }).then(response => response.data);
    };

    logger.info(`设置分类：${category} 到种子：${hashes.join('|')}`);

    const setCategory = async () => {
        try {
            const hashesStr = hashes.join('|');
            await axios.post(apiUrl, querystring.stringify({
                hashes: hashesStr,
                category: category
            }), { headers });


        } catch (error) {
            handleSetCategoryError(error);
        }
    };

    const handleSetCategoryError = async (error) => {
        logger.info('设置分类错误:', error.message, error);

        // 检查错误代码是否是 409 - 分类不存在
        if (error.response && (error.response.status === 409 || error.response.status === 400)) {
            try {
                const categories = await getRequest(`${clientUrl}/api/v2/torrents/categories`);
                logger.info('分类列表:', categories);

                if (!categories[category]) {
                    logger.info(`分类 "${category}" 不存在，创建中...`);

                    await axios.post(`${clientUrl}/api/v2/torrents/createCategory`, querystring.stringify({
                        category: category
                    }), { headers });

                    logger.info('分类创建成功.');

                    // 重试设置分类
                    await setCategory();
                } else {
                    logger.info('分类存在，但其他问题导致设置错误:', error.message);
                }
            } catch (catError) {
                logger.info('分类列表或创建过程出错:', catError.message);
            }
        }
    };

    // 执行设置分类的流程
    await setCategory();
}


async function findTrackerErrorTorrents() {
    // 遍历所有正在运行的客户端
    for (const [key, client] of Object.entries(global.runningClient)) {
        if (!client.maindata || !client.maindata.torrents) {
            logger.debug(`下载器：${client.alias} 中没有找到种子信息`);
            continue; // 如果没有 torrents，跳过这个客户端
        }

        logger.debug(`下载器：${client.alias} 处理异常种子中`);
        const clientUrl = client.clientUrl;
        const clientCookie = client.cookie;

        // 获取种子的 tracker 返回的信息
        const torrents = client.maindata.torrents;

        // 遍历种子
        for (const torrent of torrents) {
            logger.debug(`处理种子：${torrent.hash}`);
            try {
                // 获取 tracker 返回的信息
                const trackers = await getTrackerStatus(torrent.hash, clientUrl, clientCookie);

                // 忽略分类
                if (IGNORE_CATEGORYS.includes(torrent.category)) {
                    continue;
                }

                for (const tracker of trackers) {
                    // 忽略 url 不含http/https的tracker url
                    if (!/https?:\/\//.test(tracker.url) || !tracker.msg || tracker.msg === "") {
                        continue;
                    }

                    // 检查 tracker 返回的信息是否包含错误关键词
                    for (const keyword of badKeywords) {
                        if (tracker.msg.includes(keyword)) {
                            logger.info(`种子 ${torrent.hash} 在下载器 ${client.alias} 中的 tracker url： ${tracker.url} 返回了错误信息：${tracker.msg}`);

                            // 设置种子分类为 异常种子分类
                            await setTorrentsCategory(clientUrl, clientCookie, [torrent.hash], TRACKER_ERROR_TORRENT_CATEGORY);

                            break;
                        }
                    }
                }
            } catch (error) {
                logger.info(`标记异常种子：处理种子 ${torrent.hash} 时出错：`, error);
            }
        }
    }
}

(async () => {
    await findTrackerErrorTorrents();
})();
