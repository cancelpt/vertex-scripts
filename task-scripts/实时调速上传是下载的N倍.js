const axios = require('axios');
const querystring = require('querystring');

// 种子完成且超出分享率的分类（一般可以删除）
// 这里设置为 D 并让 Vertex 删种规则删除分类为 D 的种子
const defaultOverUploadCategory = 'D';

// 最小的上传限速，默认1MiB/s，过低的上传速度会影响下载速度
const minUploadLimit = 1 * 1024 * 1024;

// 种子在下载过程中的平滑上传限速：
// 1. 高于目标分享率时的上传限速，过多会溢出上传量
// 2. 低于目标分享率但只差0.1时的上传限速，过少将更迟达到目标分享率
// 默认3MiB/s，过低或过高都会导致分享率振荡
const smoothUploadLimit = 3 * 1024 * 1024;

// 各个站点的上传限速和实时分享率限制
const TRACKER_UPLOAD_LIMIT_MAP = {
    'SITE1': {
        upLimit: 95 * 1024 * 1024,  // 上传限速 95 MiB/s
        ratioLimit: 3.2             // 只统计实时下载量是上传量的 3.2 倍的上传量
    },
    'SITE2': {
        upLimit: 115 * 1024 * 1024, // 上传限速 115 MiB/s
        ratioLimit: 4.3             // 只统计实时下载量是上传量的 4.3 倍的上传量
    },
    'SITE3': {
        upLimit: 95 * 1024 * 1024,  // 上传限速 95 MiB/s
        ratioLimit: 2.9,            // 只统计实时下载量是上传量的 2.9 倍的上传量
    },

};

const RATIO_LIMIT_CATEGORYS = [];

for (const key in TRACKER_UPLOAD_LIMIT_MAP) {
    RATIO_LIMIT_CATEGORYS.push(key);
}

logger.debug('RATIO_LIMIT_CATEGORYS:', RATIO_LIMIT_CATEGORYS);

async function makeRatio() {
    Object.entries(global.runningClient).forEach(async ([key, client]) => {
        if (!client.maindata || !client.maindata.torrents) {
            // logger.warn(`限速程序：下载器：${client.alias} 中没有找到种子信息`);
            return; // 如果没有torrents，跳过这个客户端
        }

        // 获取当前下载器中的所有种子
        const torrents = client.maindata.torrents;

        // 过滤得到RATIO_LIMIT_CATEGORYS分类的种子
        const ratioLimitTorrents = torrents.filter(torrent => RATIO_LIMIT_CATEGORYS.includes(torrent.category));

        // 如果没有RATIO_LIMIT_CATEGORYS分类的种子，跳过
        if (ratioLimitTorrents.length === 0) {
            logger.debug(`限速程序：下载器：${client.alias} 中没有找到RATIO_LIMIT_CATEGORYS分类的种子`);
            return;
        }
        logger.debug(`限速程序：下载器：${client.alias} 中找到${ratioLimitTorrents.length}个RATIO_LIMIT_CATEGORYS分类的种子`);

        // 遍历RATIO_LIMIT_CATEGORYS分类的种子
        for (const torrent of ratioLimitTorrents) {
            const uploadLimit = TRACKER_UPLOAD_LIMIT_MAP[torrent.category].upLimit;
            const ratioLimit = TRACKER_UPLOAD_LIMIT_MAP[torrent.category].ratioLimit;

            logger.debug(`种子：${JSON.stringify(torrent.originProp)} 上传量：${torrent.uploaded} 下载量：${torrent.size} 上传速度：${torrent.uploadSpeed} 状态：${torrent.state} 分类：${torrent.category} 上传限速：${uploadLimit} 上传比例：${ratioLimit}`);

            // 如果这个种子已经完成，并且上传量是完成的限制分享率以上
            if (torrent.state === 'stalledUP' || torrent.state === 'uploading' || torrent.state === 'forcedUP') {
                if (torrent.uploaded > torrent.size * ratioLimit) {
                    // if (torrent.category != "SITE3") {
                    // 设置种子分类为 defaultOverUploadCategory
                    await setTorrentsCategory(client.clientUrl, client.cookie, [torrent.hash], defaultOverUploadCategory);
                    logger.info(`种子：${torrent.name} 上传量已经是下载量的限制分享率以上，设置分类为${defaultOverUploadCategory}`);
                    // } else {
                    //     await setTorrentsUploadLimit(client.clientUrl, client.cookie, [torrent.hash], 1024);
                    //     logger.info(`种子：${torrent.name} 上传量已经是下载量的限制分享率以上，但因为是 SITE3 的种子所以不自动设置成${defaultOverUploadCategory}分类，限速1KiB/s`);
                    // }

                } else {
                    // 如果当前速度上限不是原始上限，则设置为原始上限
                    if (torrent.uploadSpeed !== uploadLimit) {
                        await setTorrentsUploadLimit(client.clientUrl, client.cookie, [torrent.hash], uploadLimit);
                        logger.debug(`种子：${torrent.name} 上传量未达到下载量的限制分享率，设置上传限速为原始上限`);
                    }
                }
            }
            // 对于正在下载的种子，如果当前的上传量已经是下载量的限制分享率以上，则将上传限速设置为平滑上传限速
            if (torrent.state === 'downloading') {
                if (torrent.uploadSpeed > 0 && torrent.uploaded > torrent.downloaded * ratioLimit) {
                    logger.debug(`种子：${torrent.name} 上传量：${torrent.uploaded}，下载量：${torrent.downloaded}，上传速度：${torrent.uploadSpeed}`);

                    await setTorrentsUploadLimit(client.clientUrl, client.cookie, [torrent.hash], smoothUploadLimit);
                    logger.debug(`种子：${torrent.name} 上传量已经是下载量的限制分享率以上，设置上传限速为 ${smoothUploadLimit / 1024 / 1024} MiB/s`);
                } else {
                    // 如果上传量不到下载量的限制分享率
                    // 估测在完成时的上传量正好是下载量的限制分享率时，上传速度的限制

                    // 当前分享率，使用上传量除以下载量
                    const runTimeRatio = torrent.uploaded / torrent.downloaded;

                    // 与目标分享率的差值
                    const ratioDiff = ratioLimit - runTimeRatio;

                    logger.debug(`种子：${torrent.name} runTimeRatio：${runTimeRatio}`);
                    var expectedUploadSpeed = smoothUploadLimit;

                    logger.debug(`种子：${torrent.name} 差值：${ratioDiff}`);
                    
                    if (ratioDiff < 0.1) {
                        // 差距小于0.1，设置为平滑限速
                        expectedUploadSpeed = smoothUploadLimit;
                    } else {
                        const step = Math.ceil(uploadLimit * ratioDiff / ratioLimit)
                        logger.debug(`种子：${torrent.name} 当前限速：${torrent.originProp.up_limit} 当前上传速度：${torrent.uploadSpeed} 增加限速：${step}`);
                        expectedUploadSpeed = torrent.originProp.up_limit + Math.ceil(uploadLimit * ratioDiff / ratioLimit);
                        // logger.debug(`种子：${torrent.name} 预计上传速度：${expectedUploadSpeed}`);
                    }

                    // 如果上传速度小于最小限速，则设置为最小限速
                    if (expectedUploadSpeed < minUploadLimit) {
                        expectedUploadSpeed = minUploadLimit;
                    }


                    // 如果预计上传速度大于原始上限，则设置上传限速为原始上限
                    if (expectedUploadSpeed > uploadLimit) {
                        await setTorrentsUploadLimit(client.clientUrl, client.cookie, [torrent.hash], uploadLimit);
                        logger.debug(`种子：${torrent.name} 上传量未达到下载量的限制分享率，设置上传限速为原始上限`);
                    } else {
                        // 如果预计上传速度小于原始上限，则设置上传限速为预计上传速度
                        await setTorrentsUploadLimit(client.clientUrl, client.cookie, [torrent.hash], expectedUploadSpeed);
                        logger.debug(`种子：${torrent.name} 上传量未达到下载量的限制分享率，设置上传限速为预计上传速度`);
                    }
                }
            }

        }
    });

}


// 设置上传限速
async function setTorrentsUploadLimit(clientUrl, cookie, hashes, limit) {
    const path = "/api/v2/torrents/setUploadLimit";
    const apiUrl = clientUrl + path;
    const headers = { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'text/javascript, text/html, application/xml, text/xml, */*' };

    const getRequest = async (url) => {
        return axios.get(url, { headers }).then(response => response.data);
    };

    logger.debug(`设置上传限速：${limit} 到种子：${hashes.join('|')}`);

    const setUploadLimit = async () => {
        try {
            const hashesStr = hashes.join('|');
            await axios.post(apiUrl, querystring.stringify({
                hashes: hashesStr,
                limit: limit
            }), { headers });

        } catch (error) {
            logger.debug('设置上传限速错误:', error.message);
        }
    };

    // 执行设置上传限速的流程
    await setUploadLimit();
}


// 设置分类
async function setTorrentsCategory(clientUrl, cookie, hashes, category) {
    const path = "/api/v2/torrents/setCategory";
    const apiUrl = clientUrl + path;
    const headers = { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'text/javascript, text/html, application/xml, text/xml, */*' };

    const getRequest = async (url) => {
        return axios.get(url, { headers }).then(response => response.data);
    };

    logger.debug(`设置分类：${category} 到种子：${hashes.join('|')}`);

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
        logger.error('设置分类错误:', error.message, error);

        // 检查错误代码是否是 409 - 分类不存在
        if (error.response && (error.response.status === 409 || error.response.status === 400)) {
            try {
                const categories = await getRequest(`${clientUrl}/api/v2/torrents/categories`);
                logger.debug('分类列表:', categories);

                if (!categories[category]) {
                    logger.debug(`分类 "${category}" 不存在，创建中...`);

                    await axios.post(`${clientUrl}/api/v2/torrents/createCategory`, querystring.stringify({
                        category: category
                    }), { headers });

                    logger.debug('分类创建成功.');

                    // 重试设置分类
                    await setCategory();
                } else {
                    logger.debug('分类存在，但其他问题导致设置错误:', error.message);
                }
            } catch (catError) {
                logger.debug('分类列表或创建过程出错:', catError.message);
            }
        }
    };

    // 执行设置分类的流程
    await setCategory();
}


(async () => {

    await makeRatio();


})();