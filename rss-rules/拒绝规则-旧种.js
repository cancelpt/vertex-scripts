(torrent) => {
    const { id } = torrent;

    // 较新种子 id，在种子列表中找到一个最新的种子，查看其 id，然后填入这里
    // 请至少一个月更新一次
    const newId = 100000;

    // 拒绝 id 小于 newId 的种子
    if (parseInt(id) < newId) {
        return true;
    }

    return false;
};