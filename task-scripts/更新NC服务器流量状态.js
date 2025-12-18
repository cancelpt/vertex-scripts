const redis = require('../libs/redis');
const fs = require('fs');

// json 格式的 NC 下载器记录：{"下载器ID": {"has_high_speed": true}}
// {"82acd2c6": {"has_high_speed": false}}
const NC_RECORD_PATH = '/vertex/data/nc_record.json'; // 存储NC下载器记录的路径

logger.debug('尝试从文件中读取');

try {
    const ncRecordStr = fs.readFileSync(NC_RECORD_PATH, 'utf-8');
    logger.debug(`从文件读取 ncRecordStr: ${ncRecordStr}`);

    redis.set(`vertex:nc_record`, ncRecordStr)
        .then(() => logger.debug('更新 Redis 成功'))
        .catch (err => logger.error(`更新 Redis 时出错: ${err.message}`));
} catch (err) {
    logger.error(`无法读取 ${NC_RECORD_PATH} 文件: ${err.message}`);
}