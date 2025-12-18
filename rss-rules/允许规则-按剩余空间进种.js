// 是否忽略已完成种子的体积；设置为 true 时，务必让自动删种允许完成种子后删掉
const ignoreCompletedTorrents = true;
// 不会被删除的种子类别，这些占固定体积
const noDeleteTorrentCategory = ['keep', 'KEEP', 'up'];
// 默认上传限速95 MiB/s
const defaultUploadLimit = 95 * 1024 * 1024;
// 默认下载限速0 MiB/s
const defaultDownloadLimit = 0;
// 设置目标客户端的 ID 及其对应的硬盘容量，优先选择靠前的客户端
const clientConfig = {
    '82acd2c6': { diskSpace: 450 * 1024 * 1024 * 1024}, // 拥有 450GiB 硬盘
    'e1a4047a': { diskSpace: 200 * 1024 * 1024 * 1024}, // 拥有 200GiB 硬盘
};
// 设置种子分类与允许的下载器
const categoryToDownloader = {
    'SITE1': ['82acd2c6'],
    'SITE2': ['e1a4047a'],
}


// 定义上传和下载限制的配置
const limitsConfig = {
    'SITE1': { uploadLimit: 0 }, // SITE1不限速
    'SITE2': { uploadLimit: 120 * 1024 * 1024 }, // SITE2上传限速120MiB/s
    'SITE3': { uploadLimit: 115 * 1024 * 1024, downloadLimit: 60 * 1024 * 1024 }, // SITE3上传限速115MiB/s，下载限速60MiB/s
};

function addTorrent(vertexRSSContext, torrent) {

    const { size: rssTorrentSize, name: rssTorrentName, hash: rssTorrentHash, url: rssTorrentUrl, link: rssTorrentLink } = torrent;

    // 获取当前 torrent 的上传和下载限制
    let uploadLimit = defaultUploadLimit;
    let downloadLimit = defaultDownloadLimit;

    // 根据 torrent 的 URL 确定上传和下载限制
    for (const keyword in limitsConfig) {
        if (rssTorrentUrl.includes(keyword)) {
            if (limitsConfig[keyword].uploadLimit !== undefined) {
                uploadLimit = limitsConfig[keyword].uploadLimit;
            }
            if (limitsConfig[keyword].downloadLimit !== undefined) {
                downloadLimit = limitsConfig[keyword].downloadLimit;
            }

            logger.debug(`使用 url 关键词 ${keyword} 配置限制: 上传 ${uploadLimit / 1024 / 1024} MiB/s, 下载 ${downloadLimit / 1024 / 1024} MiB/s`);
            break;
        }
    }


    logger.debug(`获取到种子：${rssTorrentName}`);
    logger.debug(`当前种子大小：${(rssTorrentSize / 1024 / 1024 / 1024).toFixed(2)} GiB`);

    // 遍历目标客户端
    for (const clientID in clientConfig) {
        const client = global.runningClient[clientID];
        if (!client || !client.status) {
            logger.debug(`客户端 ${clientID} 无法使用或未找到，跳过...`);
            continue;
        }
        if (vertexRSSContext.category && categoryToDownloader[vertexRSSContext.category]
            && !categoryToDownloader[vertexRSSContext.category].includes(clientID)) {
            logger.debug(`客户端 ${clientID} 不支持种子分类 ${vertexRSSContext.category}，跳过...`);
            continue;
        }


        const diskSpace = clientConfig[clientID].diskSpace;

        // 用于检查种子摘要的集合
        const seenTorrents = new Set();

        let allTorrentSize = 0;

        // 计算已使用的磁盘空间
        for (const existingTorrent of client.maindata.torrents) {
            if (ignoreCompletedTorrents &&
                !noDeleteTorrentCategory.includes(existingTorrent.category)) {
                continue;
            }

            // 创建种子摘要
            const torrentKey = `${existingTorrent.name}_${existingTorrent.size}`;
            if (!seenTorrents.has(torrentKey)) {
                logger.debug(`种子：${existingTorrent.name} 大小：${(existingTorrent.size / 1024 / 1024 / 1024).toFixed(2)} GiB`);
                seenTorrents.add(torrentKey);
                allTorrentSize += existingTorrent.size;
            } else {
                logger.debug(`重复种子：${existingTorrent.name}`);
            }
        }

        const availableDiskSpace = diskSpace - allTorrentSize;

        if (ignoreCompletedTorrents) {
            logger.info(`下载器：${client.alias} 中未完成的种子大小：${(allTorrentSize / 1024 / 1024 / 1024).toFixed(2)} GiB`);
        } else {
            logger.info(`下载器：${client.alias} 中所有种子大小：${(allTorrentSize / 1024 / 1024 / 1024).toFixed(2)} GiB`);
        }

        logger.info(`下载器：${client.alias} 磁盘可用空间：${(availableDiskSpace / 1024 / 1024 / 1024).toFixed(2)} GiB`);

        // 检查剩余空间
        if (availableDiskSpace > rssTorrentSize) {
            logger.info(`剩余${(availableDiskSpace / 1024 / 1024 / 1024).toFixed(2)}GiB空间满足，添加【${rssTorrentName}】种子，占${(rssTorrentSize / 1024 / 1024 / 1024).toFixed(2)} GiB`);
            client.addTorrent(torrent.url, torrent.hash, false, uploadLimit, downloadLimit, _torrent.savePath, vertexRSSContext.category, vertexRSSContext.autoTMM, vertexRSSContext.paused);
            logger.debug("完成执行添加种子操作");

            // 记录种子信息，在 RSS 历史中可以查看
            util.runRecord('INSERT INTO torrents (hash, name, size, rss_id, link, category, record_time, add_time, record_type, record_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [rssTorrentHash, rssTorrentName, rssTorrentSize, vertexRSSContext.id, rssTorrentLink, vertexRSSContext.category, moment().unix(), moment().unix(), 1, '添加种子']);
            logger.debug("完成执行添加到历史记录");
            break;
        } else {
            logger.info(`剩余${(availableDiskSpace / 1024 / 1024 / 1024).toFixed(2)}GiB空间小于${(rssTorrentSize / 1024 / 1024 / 1024).toFixed(2)} GiB，拒绝添加【${rssTorrentName}】种子`);

        }
    }
}

(torrent) => {
    const vertexRSSContext = this
    addTorrent(vertexRSSContext, torrent);
    // 不使用vertex原生进种
    return false;
};