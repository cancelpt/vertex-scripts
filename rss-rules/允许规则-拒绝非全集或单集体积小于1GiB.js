(torrent) => {
    const { name, size, id } = torrent;

    // 匹配全\d+集，获取到全集的数字
    const episodeMatch = name.match(/全(\d+)集/);
    const edrMatch = name.match(/高码/);
    let minSize = 1024 * 1024 * 1024;
    if (episodeMatch) {
        const episodeNum = parseInt(episodeMatch[1]);
        // 单集是否大于1G或者高码的3G
        const oneEpisodeSize = size / episodeNum;
        logger.info(`种子${id}，单集大小为${oneEpisodeSize / 1024 / 1024}MB`);
        if (edrMatch) {
            minSize = 3 * 1024 * 1024 * 1024
        }
        if (oneEpisodeSize > minSize) {
            return false;
        } else {
            return true;
        }
    }

    // 不匹配任何规则
    return true;
};