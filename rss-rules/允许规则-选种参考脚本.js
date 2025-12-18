(torrent) => {
    // 请打开 RSS 的**副标题**以及**资源分类**显示！！！！！否则无法判断资源类型
    const { name, size, id } = torrent;

    // 较新种子 id，在种子列表中找到一个最新的种子，查看其 id，然后填入这里
    // 请至少一个月更新一次
    const newId = 100000;

    // 拒绝旧种、救活种子
    if (parseInt(id) < newId) {
        return false;
    }

    // 拒绝 30GB 以上的种子
    if (size > 30 * 1000 * 1000 * 1000) {
        return false;
    }

    // 拒绝300MB以下的种子
    // 还没发车就已经完成了
    if (size < 300 * 1000 * 1000) {
        return false;
    }

    // 白名单关键词
    const whitelist = [
        /CancelWEB/i,
        /CancelTV/i,
        /CancelHD/i,
        /CancelBit/i
    ];


    // 允许白名单种子
    if (whitelist.some(pattern => pattern.test(name))) {
        return true;
    }

    // 如果当前时间是0点到9点，则拒绝
    const now = new Date();
    const hour = now.getHours();
    if (hour < 9) {
        return false;
    }

    // 除白名单种子，拒绝其他的含“综艺”内容的种子
    const rejectCategory = [
        /综艺/i,
    ];

    if (rejectCategory.some(pattern => pattern.test(name))) {
        return false;
    }

    // 拒绝 WEB 中添加剂资源，以及难以播放的资源
    const rejectSource = [
        /DV/i,    // 所有杜比视界1
        /DoVi/i,  // 所有杜比视界2
        /fps/i, // 所有特写了fps帧率的资源
        /EDR/i,   // 所有EDR，即高码4K
        /Vivid/i, // 菁彩HDR
        /HDR10+/i,  // HDR10+
    ];

    if (rejectSource.some(pattern => pattern.test(name))) {
        return false;
    }

    if (/\[剧集\]/.test(name)) {
        // 拒绝不是常见地区制作的资源
        if (!isSourceFromCommonRegion(name)) {
            return false;
        }

        // 类似“全30集”、“全集”等
        const collection = [
            /全集/,
            /合集/,
            /全\d+集/,
        ];

        // 合集资源白名单小组
        const collectionGroup = [
            /MSWeb/i, // 没事 web
            /MSTV/i, // 没事 TV
        ];

        if (collection.some(pattern => pattern.test(name))) {
            if (collectionGroup.some(pattern => pattern.test(name))) {
                // 获取当前年份
                const year = new Date().getFullYear();
                // 拒绝非当前年份的合集资源
                if (!new RegExp(year).test(name)) {
                    return false;
                }
                return true;
            }
            return false;
        }

        // 拒绝刷流效率低的 WEB 小组资源
        const rejectGroup = [
            /YSWEB/i,  // 有事 TV，滞后WEB资源
        ];


        if (rejectGroup.some(pattern => pattern.test(name))) {
            return false;
        }

    }

    // 拒绝大于9.5GB的种子
    if (size > 9.5 * 1000 * 1000 * 1000) {
        return false;
    }

    // 电影资源
    if (/\[电影\]/.test(name)) {
        // 拒绝不是常见地区制作的资源
        if (!isSourceFromCommonRegion(name)) {
            return false;
        }

        // 蓝光资源白名单小组
        const blurayGroup = [
            /MSHD/i,  // 没事官组
        ];


        // 蓝光资源
        const bluray = [
            /x265/i,  // 所有x265压制
            /x264/i,  // 所有x264压制
            /blu/i,   // 所有蓝光
        ];


        if (bluray.some(pattern => pattern.test(name))) {
            if (!blurayGroup.some(pattern => pattern.test(name))) {
                return false;
            }
        }

        // 获取当前年份
        const year = new Date().getFullYear();
        // 拒绝非当前年份、去年、前年的蓝光资源
        if (!new RegExp(year - 1).test(name) && !new RegExp(year - 2).test(name) && !new RegExp(year).test(name)) {
            return false;
        }
    }


    // 不匹配任何规则，接受
    return true;
};

// 是否为常见地区制作的资源，拒绝 泼剧、印度剧、韩剧之类的资源
function isSourceFromCommonRegion(name) {
    const commonSource = [
        /大陆/,
        /美剧/,
        /美国/,
        /日本/,
    ];

    return commonSource.some(pattern => pattern.test(name));
}
