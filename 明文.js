const express = require("express");
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);
const { execSync } = require("child_process");

// ==================== 配置管理 ====================
class Config {
  constructor() {
    this.UPLOAD_URL = process.env.UPLOAD_URL || "";                             // 需要上传订阅或保活时需填写上传接口url,例如：https://api.example.com
    this.PROJECT_URL = process.env.PROJECT_URL || "";                           // 需要上传订阅或保活时需填写项目分配的url,例如：https://google.com
    this.AUTO_ACCESS = process.env.AUTO_ACCESS === "false";                     // false关闭自动保活，true开启,需同时填写PROJECT_URL变量
    this.FILE_PATH = process.env.FILE_PATH || "./tmp";                          // 节点文件保存路径
    this.SUB_PATH = process.env.SUB_PATH || "sub";                              // 订阅路径
    this.PORT = process.env.SERVER_PORT || process.env.PORT || 3000;            // http服务订阅端口
    this.UUID = process.env.UUID || "aca19852-0a9b-452c-ab61-b1a4c8ea806b";     // 使用哪吒v1,在不同的平台运行需修改UUID,否则会覆盖
    this.NEZHA_SERVER = process.env.NEZHA_SERVER || "";                         // 哪吒v1填写形式: nz.abc.com:8008  哪吒v0填写形式：nz.abc.com
    this.NEZHA_PORT = process.env.NEZHA_PORT || "";                             // 使用哪吒v1请留空，哪吒v0需填写
    this.NEZHA_KEY = process.env.NEZHA_KEY || "";                               // 哪吒v1的NZ_CLIENT_SECRET或哪吒v0的agent密钥
    this.ARGO_DOMAIN = process.env.ARGO_DOMAIN || "";                           // 固定隧道域名,留空即启用临时隧道
    this.ARGO_AUTH = process.env.ARGO_AUTH || "";                               // 固定隧道密钥json或token,留空即启用临时隧道,json获取地址：https://json.zone.id
    this.ARGO_PORT = process.env.ARGO_PORT || 8001;                             // 固定隧道端口,使用token需在cloudflare后台设置和这里一致
    this.CFIP = process.env.CFIP || "cdns.doon.eu.org";                         // 节点优选域名或优选ip 
    this.CFPORT = process.env.CFPORT || 443;                                    // 节点优选域名或优选ip对应的端口
    this.NAME = process.env.NAME || "";                                         // 节点名称
    // ===== 隐藏配置 =====
    this.ENABLE_OBFUSCATION = process.env.ENABLE_OBFUSCATION !== "false";       // 启用流量混淆
    this.HIDE_PROTOCOL = process.env.HIDE_PROTOCOL === "true";                  // 隐藏协议特征
    this.USE_LEGITIMATE_IP = process.env.USE_LEGITIMATE_IP === "true";          // 使用合法运营商IP
  }
}

// ==================== 隐藏管理器 ====================
class ObfuscationManager {
  // 获取合法运营商IP列表
  static getLegitimateIPs() {
    return [
      "162.125.27.133",      // Cloudflare IP
      "104.16.132.229",      // Cloudflare IP
      "45.85.119.1",         // Cloudflare IP
      "104.27.0.0",          // Cloudflare范围
    ];
  }

  // 生成HTTP头部伪装
  static generateFakeHeaders() {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    ];
    
    return {
      "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };
  }

  // 启用WebSocket混淆路径
  static getObfuscatedPaths() {
    return [
      "/api/v1/users",
      "/cdn/js/app.js",
      "/static/images/banner.jpg",
      "/downloads/software.exe",
      "/updates/latest",
    ];
  }
}

// ==================== 文件管理器 ====================
class FileManager {
  constructor(basePath) {
    this.basePath = basePath;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      console.log(`✓ 创建目录: ${this.basePath}`);
    }
  }

  generateRandomName(length = 6) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    return Array.from({ length }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  }

  getFilePath(name) {
    return path.join(this.basePath, name);
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  readFile(filePath, encoding = "utf-8") {
    try {
      return fs.readFileSync(filePath, encoding);
    } catch (err) {
      console.error(`读取文件失败 ${filePath}:`, err.message);
      return null;
    }
  }

  writeFile(filePath, content) {
    try {
      fs.writeFileSync(filePath, content);
      console.log(`✓ 文件已保存: ${path.basename(filePath)}`);
    } catch (err) {
      console.error(`写入文件失败 ${filePath}:`, err.message);
    }
  }

  deleteFiles(filePaths) {
    filePaths.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // 忽略删除错误
      }
    });
  }

  cleanupDirectory() {
    try {
      const files = fs.readdirSync(this.basePath);
      files.forEach((file) => {
        const filePath = path.join(this.basePath, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      });
      console.log("✓ 旧文件已清理");
    } catch (err) {
      console.error("清理文件失败:", err.message);
    }
  }
}

// ==================== 配置生成器 ====================
class ConfigGenerator {
  static generateXrayConfig(uuid, argoPort) {
    return {
      log: { access: "/dev/null", error: "/dev/null", loglevel: "none" },
      inbounds: [
        {
          port: argoPort,
          protocol: "vless",
          settings: {
            clients: [{ id: uuid, flow: "xtls-rprx-vision" }],
            decryption: "none",
            fallbacks: [
              { dest: 3001 },
              { path: "/vless-argo", dest: 3002 },
              { path: "/vmess-argo", dest: 3003 },
              { path: "/trojan-argo", dest: 3004 },
            ],
          },
          streamSettings: { 
            network: "tcp",
            tcpSettings: {
              header: {
                type: "http",
                request: {
                  version: "1.1",
                  method: "GET",
                  path: ["/", "/api", "/download"],
                  headers: {
                    Host: ["www.microsoft.com", "www.google.com"],
                    "User-Agent": ["Mozilla/5.0"],
                    "Accept-Encoding": ["gzip, deflate"],
                    "Connection": ["keep-alive"],
                    "Pragma": ["no-cache"],
                  },
                },
              },
            },
          },
        },
        {
          port: 3001,
          listen: "127.0.0.1",
          protocol: "vless",
          settings: { clients: [{ id: uuid }], decryption: "none" },
          streamSettings: { network: "tcp", security: "none" },
        },
        {
          port: 3002,
          listen: "127.0.0.1",
          protocol: "vless",
          settings: { clients: [{ id: uuid, level: 0 }], decryption: "none" },
          streamSettings: {
            network: "ws",
            security: "none",
            wsSettings: { path: "/vless-argo" },
          },
          sniffing: {
            enabled: true,
            destOverride: ["http", "tls", "quic"],
            metadataOnly: false,
          },
        },
        {
          port: 3003,
          listen: "127.0.0.1",
          protocol: "vmess",
          settings: { clients: [{ id: uuid, alterId: 0 }] },
          streamSettings: {
            network: "ws",
            wsSettings: { path: "/vmess-argo" },
          },
          sniffing: {
            enabled: true,
            destOverride: ["http", "tls", "quic"],
            metadataOnly: false,
          },
        },
        {
          port: 3004,
          listen: "127.0.0.1",
          protocol: "trojan",
          settings: { clients: [{ password: uuid }] },
          streamSettings: {
            network: "ws",
            security: "none",
            wsSettings: { path: "/trojan-argo" },
          },
          sniffing: {
            enabled: true,
            destOverride: ["http", "tls", "quic"],
            metadataOnly: false,
          },
        },
      ],
      dns: { servers: ["https+local://8.8.8.8/dns-query"] },
      outbounds: [
        { protocol: "freedom", tag: "direct" },
        { protocol: "blackhole", tag: "block" },
      ],
    };
  }

  static generateNezhaV1Config(key, server, uuid) {
    const port = server.includes(":") ? server.split(":").pop() : "";
    const tlsPorts = new Set(["443", "8443", "2096", "2087", "2083", "2053"]);
    const tls = tlsPorts.has(port) ? "true" : "false";

    return `client_secret: ${key}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${server}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${tls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${uuid}`;
  }

  static generateArgoConfig(tunnelSecret, argoPort, argoDomain, tunnelPath) {
    if (!tunnelSecret.includes("TunnelSecret")) {
      return null;
    }

    const tunnelId = tunnelSecret.split('"')[11];
    return `tunnel: ${tunnelId}
credentials-file: ${tunnelPath}/tunnel.json
protocol: http2

ingress:
  - hostname: ${argoDomain}
    service: http://localhost:${argoPort}
    originRequest:
      noTLSVerify: true
  - service: http_status:404`;
  }
}

// ==================== 下载管理器 ====================
class DownloadManager {
  static getSystemArchitecture() {
    const arch = os.arch();
    return ["arm", "arm64", "aarch64"].includes(arch) ? "arm" : "amd";
  }

  static getDownloadUrls(architecture, nezhaEnabled, nezhaPort) {
    const baseUrl =
      architecture === "arm" ? "https://arm64.ssss.nyc.mn" : "https://amd64.ssss.nyc.mn";

    const files = [
      { name: "web", url: `${baseUrl}/web` },
      { name: "bot", url: `${baseUrl}/bot` },
    ];

    if (nezhaEnabled) {
      const fileType = nezhaPort ? "agent" : "v1";
      files.unshift({ name: fileType, url: `${baseUrl}/${fileType}` });
    }

    return files;
  }

  static async downloadFile(fileUrl, filePath) {
    try {
      const response = await axios({
        method: "get",
        url: fileUrl,
        responseType: "stream",
        timeout: 30000,
      });

      return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        writer.on("finish", () => {
          console.log(`✓ 下载成功: ${path.basename(filePath)}`);
          resolve(filePath);
        });

        writer.on("error", (err) => {
          fs.unlink(filePath, () => {});
          reject(new Error(`下载失败 ${path.basename(filePath)}: ${err.message}`));
        });
      });
    } catch (err) {
      throw new Error(`下载失败 ${fileUrl}: ${err.message}`);
    }
  }

  static async downloadFilesParallel(files) {
    return Promise.all(
      files.map((file) =>
        this.downloadFile(file.url, file.path).catch((err) => {
          console.error(err.message);
          return null;
        })
      )
    );
  }

  static setFilePermissions(filePaths) {
    filePaths.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.chmod(filePath, 0o775, (err) => {
          if (err) {
            console.error(`权限设置失败 ${filePath}:`, err.message);
          } else {
            console.log(`✓ 权限设置成功: ${path.basename(filePath)}`);
          }
        });
      }
    });
  }
}

// ==================== 进程管理器 ====================
class ProcessManager {
  static async executeCommand(command) {
    try {
      const { stdout, stderr } = await exec(command);
      if (stderr) {
        console.warn(`命令警告: ${stderr}`);
      }
      return { success: true, output: stdout };
    } catch (error) {
      console.error(`命令执行失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  static async runNezhaV0(agentPath, server, port, key, isWindows) {
    const tlsPorts = ["443", "8443", "2096", "2087", "2083", "2053"];
    const tlsFlag = tlsPorts.includes(port) ? "--tls" : "";
    const command = `nohup ${agentPath} -s ${server}:${port} -p ${key} ${tlsFlag} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
    
    return this.executeCommand(command);
  }

  static async runNezhaV1(agentPath, configPath, isWindows) {
    const command = `nohup ${agentPath} -c "${configPath}" >/dev/null 2>&1 &`;
    return this.executeCommand(command);
  }

  static async runXray(webPath, configPath, isWindows) {
    const command = `nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`;
    return this.executeCommand(command);
  }

  static async runCloudflare(botPath, args, isWindows) {
    const command = `nohup ${botPath} ${args} >/dev/null 2>&1 &`;
    return this.executeCommand(command);
  }

  static async killProcess(processName, isWindows) {
    const command = isWindows
      ? `taskkill /f /im ${processName}.exe > nul 2>&1`
      : `pkill -f "[${processName.charAt(0)}]${processName.substring(1)}" > /dev/null 2>&1`;
    
    return this.executeCommand(command);
  }
}

// ==================== 节点管理器 ====================
class NodeManager {
  static async deleteNodes(uploadUrl, subPath, fileManager) {
    try {
      if (!uploadUrl || !fileManager.fileExists(subPath)) {
        return;
      }

      const content = fileManager.readFile(subPath);
      if (!content) return;

      const decoded = Buffer.from(content, "base64").toString("utf-8");
      const nodes = decoded
        .split("\n")
        .filter((line) => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

      if (nodes.length === 0) return;

      await axios.post(`${uploadUrl}/api/delete-nodes`, JSON.stringify({ nodes }), {
        headers: { "Content-Type": "application/json" },
      });
      console.log("✓ 旧节点已删除");
    } catch (err) {
      console.error("删除节点失败:", err.message);
    }
  }

  static async uploadNodes(uploadUrl, projectUrl, subPath, fileManager, subPathRoute) {
    try {
      if (uploadUrl && projectUrl) {
        const subscriptionUrl = `${projectUrl}/${subPathRoute}`;
        const response = await axios.post(
          `${uploadUrl}/api/add-subscriptions`,
          { subscription: [subscriptionUrl] },
          { headers: { "Content-Type": "application/json" } }
        );

        if (response.status === 200) {
          console.log("✓ 订阅已上传");
          return;
        }
      }

      if (uploadUrl && fileManager.fileExists(subPath)) {
        const content = fileManager.readFile(subPath);
        const nodes = content
          .split("\n")
          .filter((line) => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

        if (nodes.length > 0) {
          await axios.post(
            `${uploadUrl}/api/add-nodes`,
            JSON.stringify({ nodes }),
            { headers: { "Content-Type": "application/json" } }
          );
          console.log("✓ 节点已上传");
        }
      }
    } catch (err) {
      if (err.response?.status !== 400) {
        console.error("上传节点失败:", err.message);
      }
    }
  }
}

// ==================== 订阅生成器 ====================
class SubscriptionGenerator {
  static getMetaInfo() {
    try {
      const command =
        'curl -sm 5 https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'';
      return execSync(command, { encoding: "utf-8" }).trim();
    } catch (err) {
      console.error("获取元信息失败:", err.message);
      return "Unknown";
    }
  }

  static generateSubscription(config, argoDomain, isp) {
    const nodeName = config.NAME ? `${config.NAME}-${isp}` : isp;

    const vmess = {
      v: "2",
      ps: nodeName,
      add: config.CFIP,
      port: config.CFPORT,
      id: config.UUID,
      aid: "0",
      scy: "none",
      net: "ws",
      type: "none",
      host: argoDomain,
      path: "/vmess-argo?ed=2560",
      tls: "tls",
      sni: argoDomain,
      alpn: "h2,http/1.1",        // 添加ALPN协议协商，增加合法性
      fp: "chrome",                // 改为chrome指纹，更常见
      obfs: "http",                // 添加混淆
    };

    const subscription = `vless://${config.UUID}@${config.CFIP}:${config.CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=chrome&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560&headerType=http#${nodeName}

vmess://${Buffer.from(JSON.stringify(vmess)).toString("base64")}

trojan://${config.UUID}@${config.CFIP}:${config.CFPORT}?security=tls&sni=${argoDomain}&fp=chrome&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560&headerType=http#${nodeName}`;

    return { subscription, nodeName };
  }

  static extractArgoDomain(bootLogPath, fileManager) {
    try {
      const content = fileManager.readFile(bootLogPath);
      if (!content) return null;

      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (match) {
          return match[1];
        }
      }
      return null;
    } catch (err) {
      console.error("提取Argo域名失败:", err.message);
      return null;
    }
  }
}

// ==================== 应用主程序 ====================
class Application {
  constructor() {
    this.config = new Config();
    this.fileManager = new FileManager(this.config.FILE_PATH);
    this.app = express();
    this.isWindows = process.platform === "win32";
    this.setupPaths();
  }

  setupPaths() {
    this.files = {
      npm: this.fileManager.getFilePath(this.fileManager.generateRandomName()),
      web: this.fileManager.getFilePath(this.fileManager.generateRandomName()),
      bot: this.fileManager.getFilePath(this.fileManager.generateRandomName()),
      php: this.fileManager.getFilePath(this.fileManager.generateRandomName()),
      sub: this.fileManager.getFilePath("sub.txt"),
      config: this.fileManager.getFilePath("config.json"),
      bootLog: this.fileManager.getFilePath("boot.log"),
      nezhaConfig: this.fileManager.getFilePath("config.yaml"),
      tunnelJson: this.fileManager.getFilePath("tunnel.json"),
      tunnelYml: this.fileManager.getFilePath("tunnel.yml"),
    };
  }

  setupRoutes() {
    this.app.get("/", (req, res) => {
      res.send("Hello world!");
    });
  }

  async initialize() {
    console.log("🚀 启动应用初始化...\n");

    try {
      await NodeManager.deleteNodes(this.config.UPLOAD_URL, this.files.sub, this.fileManager);
      this.fileManager.cleanupDirectory();

      // 生成配置
      const xrayConfig = ConfigGenerator.generateXrayConfig(this.config.UUID, this.config.ARGO_PORT);
      this.fileManager.writeFile(this.files.config, JSON.stringify(xrayConfig, null, 2));

      // 下载文件
      await this.downloadDependencies();

      // 运行服务
      await this.runServices();

      // 提取域名并生成订阅
      await this.setupSubscription();

      // 上传节点
      await NodeManager.uploadNodes(
        this.config.UPLOAD_URL,
        this.config.PROJECT_URL,
        this.files.sub,
        this.fileManager,
        this.config.SUB_PATH
      );

      // 自动访问
      await this.addVisitTask();

      // 清理文件
      this.scheduleFileCleanup();

      // 启动HTTP服务
      this.startServer();
    } catch (err) {
      console.error("初始化失败:", err.message);
    }
  }

  async downloadDependencies() {
    console.log("📥 下载依赖文件...");

    const architecture = DownloadManager.getSystemArchitecture();
    const hasNezha = this.config.NEZHA_SERVER && this.config.NEZHA_KEY;
    const nezhaType = this.config.NEZHA_PORT ? "agent" : "v1";

    const filesList = DownloadManager.getDownloadUrls(architecture, hasNezha, this.config.NEZHA_PORT);
    const filesToDownload = filesList.map((file) => {
      const pathKey = file.name === "agent" ? "npm" : file.name === "v1" ? "php" : file.name;
      return { url: file.url, path: this.files[pathKey] };
    });

    await DownloadManager.downloadFilesParallel(filesToDownload);

    const filesToAuthorize = this.config.NEZHA_PORT
      ? [this.files.npm, this.files.web, this.files.bot]
      : [this.files.php, this.files.web, this.files.bot];

    DownloadManager.setFilePermissions(filesToAuthorize);
  }

  async runServices() {
    console.log("▶️ 启动服务...\n");

    // 运行Nezha
    if (this.config.NEZHA_SERVER && this.config.NEZHA_KEY) {
      if (this.config.NEZHA_PORT) {
        // V0
        const result = await ProcessManager.runNezhaV0(
          this.files.npm,
          this.config.NEZHA_SERVER,
          this.config.NEZHA_PORT,
          this.config.NEZHA_KEY,
          this.isWindows
        );
        if (result.success) console.log("✓ Nezha V0 已启动");
      } else {
        // V1
        const nezhaConfig = ConfigGenerator.generateNezhaV1Config(
          this.config.NEZHA_KEY,
          this.config.NEZHA_SERVER,
          this.config.UUID
        );
        this.fileManager.writeFile(this.files.nezhaConfig, nezhaConfig);

        const result = await ProcessManager.runNezhaV1(
          this.files.php,
          this.files.nezhaConfig,
          this.isWindows
        );
        if (result.success) console.log("✓ Nezha V1 已启动");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 运行Xray
    const result = await ProcessManager.runXray(this.files.web, this.files.config, this.isWindows);
    if (result.success) console.log("✓ Xray 已启动");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 运行Cloudflare
    await this.runCloudflare();
  }

  async runCloudflare() {
    if (!this.fileManager.fileExists(this.files.bot)) {
      return;
    }

    let args;
    if (this.config.ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${this.config.ARGO_AUTH}`;
    } else if (this.config.ARGO_AUTH.match(/TunnelSecret/)) {
      // 生成Argo配置
      this.fileManager.writeFile(this.files.tunnelJson, this.config.ARGO_AUTH);
      const tunnelYml = ConfigGenerator.generateArgoConfig(
        this.config.ARGO_AUTH,
        this.config.ARGO_PORT,
        this.config.ARGO_DOMAIN,
        this.config.FILE_PATH
      );
      if (tunnelYml) {
        this.fileManager.writeFile(this.files.tunnelYml, tunnelYml);
        args = `tunnel --edge-ip-version auto --config ${this.files.tunnelYml} run`;
      }
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${this.files.bootLog} --loglevel info --url http://localhost:${this.config.ARGO_PORT}`;
    }

    const result = await ProcessManager.runCloudflare(this.files.bot, args, this.isWindows);
    if (result.success) console.log("✓ Cloudflare 已启动");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  async setupSubscription() {
    console.log("🔗 设置订阅...\n");

    let argoDomain = this.config.ARGO_DOMAIN;

    if (!argoDomain) {
      // 等待临时隧道
      argoDomain = await this.waitForArgoDomain();
    }

    if (!argoDomain) {
      console.error("❌ 无法获取Argo域名");
      return;
    }

    console.log(`✓ Argo域名: ${argoDomain}`);

    // 生成订阅
    const isp = SubscriptionGenerator.getMetaInfo();
    const { subscription, nodeName } = SubscriptionGenerator.generateSubscription(
      this.config,
      argoDomain,
      isp
    );

    // 保存订阅
    const encoded = Buffer.from(subscription).toString("base64");
    this.fileManager.writeFile(this.files.sub, encoded);
    console.log(`✓ 订阅已生成: ${nodeName}\n`);
    console.log("订阅内容 (Base64):");
    console.log(encoded);

    // 设置订阅路由
    this.app.get(`/${this.config.SUB_PATH}`, (req, res) => {
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.send(encoded);
    });
  }

  async waitForArgoDomain(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const domain = SubscriptionGenerator.extractArgoDomain(this.files.bootLog, this.fileManager);
      if (domain) {
        return domain;
      }

      console.log(`⏳ 等待Argo域名... (${i + 1}/${maxRetries})`);
    }

    // 重启Cloudflare以重新生成域名
    console.log("🔄 重启Cloudflare获取新域名...");
    await ProcessManager.killProcess(path.parse(this.files.bot).name, this.isWindows);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (this.fileManager.fileExists(this.files.bootLog)) {
      this.fileManager.deleteFiles([this.files.bootLog]);
    }

    await this.runCloudflare();
    return this.waitForArgoDomain(3);
  }

  async addVisitTask() {
    if (!this.config.AUTO_ACCESS || !this.config.PROJECT_URL) {
      return;
    }

    try {
      await axios.post(
        "https://oooo.serv00.net/add-url",
        { url: this.config.PROJECT_URL },
        { headers: { "Content-Type": "application/json" } }
      );
      console.log("✓ 自动访问任务已添加\n");
    } catch (err) {
      console.error("添加自动访问任务失败:", err.message);
    }
  }

  scheduleFileCleanup() {
    setTimeout(() => {
      const filesToDelete = [this.files.bootLog, this.files.config, this.files.web, this.files.bot];

      if (this.config.NEZHA_PORT) {
        filesToDelete.push(this.files.npm);
      } else if (this.config.NEZHA_SERVER && this.config.NEZHA_KEY) {
        filesToDelete.push(this.files.php);
      }

      this.fileManager.deleteFiles(filesToDelete);
      console.clear();
      console.log("✨ 应用正在运行");
      console.log("感谢使用此脚本，祝您使用愉快！");
    }, 90000);
  }

  startServer() {
    this.setupRoutes();
    this.app.listen(this.config.PORT, () => {
      console.log(`\n🌐 HTTP服务运行在端口: ${this.config.PORT}`);
    });
  }

  async run() {
    await this.initialize();
  }
}

// ==================== 启动应用 ====================
const app = new Application();
app.run().catch((err) => {
  console.error("致命错误:", err);
  process.exit(1);
});




