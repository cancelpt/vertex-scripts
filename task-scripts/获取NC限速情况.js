async () => {
    const https = require('https');
    const fs = require('fs');
    const path = require('path');

    const RECORD_PATH = '/vertex/data/nc_record.json'; // 存储下载器记录的路径

    // 配置
    const LOGINNAME = process.env.NC_LOGINNAME || '你的nc scp登录名';
    const PASSWORD = process.env.NC_PASSWORD || '你的nc scp密码';
    const VSERVER_MAP = {
        '你的nc vserver名，v开头的，例如v220250***': '82acd2c6（其在vt中对应的id）'
    };

    // SOAP Endpoint
    const HOSTNAME = 'www.servercontrolpanel.de';
    const PATH = '/WSEndUser';
    const NAMESPACE = 'http://enduser.service.web.vcp.netcup.de/';

    /**
     * Helper to send SOAP requests
     */
    function sendSoapRequest(action, bodyStr) {
        return new Promise((resolve, reject) => {
            const envelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${NAMESPACE}">
   <soapenv:Header/>
   <soapenv:Body>
      ${bodyStr}
   </soapenv:Body>
</soapenv:Envelope>`;

            const options = {
                hostname: HOSTNAME,
                port: 443,
                path: PATH,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(envelope),
                    'SOAPAction': '' // Sometimes required to be empty or specific
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`SOAP Request failed with status ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (e) => {
                reject(e);
            });

            req.write(envelope);
            req.end();
        });
    }

    /**
     * Simple XML tag extractor helper
     */
    function extractTag(xml, tagName) {
        const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'g');
        const matches = [];
        let match;
        while ((match = regex.exec(xml)) !== null) {
            matches.push(match[1]);
        }
        return matches;
    }

    function extractTagSingle(xml, tagName) {
        const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`);
        const match = regex.exec(xml);
        return match ? match[1] : null;
    }

    /**
     * Get all vServers
     */
    async function getVServers() {
        const body = `
      <ns:getVServers>
         <loginName>${LOGINNAME}</loginName>
         <password>${PASSWORD}</password>
      </ns:getVServers>
    `;
        const response = await sendSoapRequest('getVServers', body);
        const vservers = extractTag(response, 'return');
        return vservers;
    }

    /**
     * Get vServer Information
     */
    async function getVServerInformation(vserverName) {
        const body = `
      <ns:getVServerInformation>
         <loginName>${LOGINNAME}</loginName>
         <password>${PASSWORD}</password>
         <vservername>${vserverName}</vservername>
      </ns:getVServerInformation>
    `;

        const response = await sendSoapRequest('getVServerInformation', body);

        // Let's find the first <serverInterfaces> block
        const serverInterfacesMatch = /<serverInterfaces>(.*?)<\/serverInterfaces>/s.exec(response);
        if (!serverInterfacesMatch) {
            return null;
        }

        const interfaceXml = serverInterfacesMatch[1];
        const trafficThrottled = extractTagSingle(interfaceXml, 'trafficThrottled');

        return {
            vServerName: vserverName,
            trafficThrottled: trafficThrottled === 'true'
        };
    }

    async function checkThrottling() {
        logger.info(`Starting Netcup Traffic Check...`);

        // 读取记录文件
        let record = {};
        try {
            if (fs.existsSync(RECORD_PATH)) {
                const data = fs.readFileSync(RECORD_PATH, 'utf8');
                record = JSON.parse(data);
            }
        } catch (error) {
            logger.warn(`读取或解析 ${RECORD_PATH} 失败: ${error.message}`);
        }

        try {
            const vServers = await getVServers();
            logger.info(`Found vServers: ${JSON.stringify(vServers)}`);

            let updated = false;

            for (const vServer of vServers) {
                if (!VSERVER_MAP[vServer]) {
                    // logger.info(`Skipping vserver ${vServer}, not in config map.`);
                    continue;
                }

                const dlId = VSERVER_MAP[vServer];

                // 初始化该客户端的记录 (if not exists)
                if (!record[dlId]) {
                    record[dlId] = {
                        has_high_speed: true,
                        history: []
                    };
                }

                logger.info(`Checking ${vServer}...`);
                const info = await getVServerInformation(vServer);

                if (!info) {
                    logger.warn(`Could not get info for ${vServer}`);
                    continue;
                }

                if (info.trafficThrottled) {
                    logger.info(`${vServer}: 该机器触发流量限制!!!`);
                    if (record[dlId].has_high_speed !== false) {
                        record[dlId].has_high_speed = false;
                        updated = true;
                    }
                } else {
                    logger.info(`${vServer}: 该机器未触发流量限制`);
                    if (record[dlId].has_high_speed !== true) {
                        record[dlId].has_high_speed = true;
                        updated = true;
                    }
                }
            }

            if (updated) {
                fs.writeFileSync(RECORD_PATH, JSON.stringify(record, null, 2), 'utf8');
                logger.info(`记录已更新 ${RECORD_PATH}`);
            } else {
                logger.info(`记录未发生变更`);
            }

            logger.info('Script finished successfully.');

        } catch (error) {
            logger.error('Error during check:', error);
        }
    }

    // 启动检查
    await checkThrottling();
}
